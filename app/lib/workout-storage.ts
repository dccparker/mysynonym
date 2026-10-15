import type { PlannedSession } from "./training-plan";
import type { PreferredUnits } from "./athlete-profile";
import { supabase } from "./supabase";

export const WORKOUTS_UPDATED_EVENT = "mysynonym-workouts-updated";
export const TRAINING_PLAN_STORAGE_KEY = "mysynonym-weekly-training-plan";
export const TRAINING_PLAN_UPDATED_EVENT = "mysynonym-weekly-training-plan-updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function notifyWorkoutHistoryUpdated(): void {
  window.dispatchEvent(new Event(WORKOUTS_UPDATED_EVENT));
}

export function notifyTrainingPlanUpdated(): void {
  window.dispatchEvent(new Event(TRAINING_PLAN_UPDATED_EVENT));
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

async function readWorkoutHistory(userId: string): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("workout_histories")
    .select("workouts")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return [];
  if (!Array.isArray(data.workouts)) {
    throw new Error("Saved workout history has an invalid format.");
  }
  return data.workouts;
}

async function writeWorkoutHistory(userId: string, workouts: unknown[]): Promise<void> {
  const { error } = await supabase
    .from("workout_histories")
    .upsert(
      { user_id: userId, workouts, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function loadWorkoutHistory(userId?: string | null): Promise<unknown[]> {
  const resolvedUserId = userId === undefined ? await getAuthenticatedUserId() : userId;
  if (resolvedUserId === null) return [];
  return readWorkoutHistory(resolvedUserId);
}

export async function saveWorkoutHistory(workouts: unknown[]): Promise<void> {
  const userId = await getAuthenticatedUserId();
  if (userId === null) throw new Error("Sign in to save your workout history.");
  await writeWorkoutHistory(userId, workouts);
  notifyWorkoutHistoryUpdated();
}

export type CompletedSessionChanges = {
  durationMinutes: number;
  distanceByActivity?: Record<string, number>;
  notes: string;
  completedActivityIds: string[];
  averageHeartRate?: number;
  maximumHeartRate?: number;
  averagePace?: string;
  averagePower?: number;
  calories?: number;
};

export function updatePlannedSession(
  sessionId: string,
  updates: Partial<PlannedSession>,
): void {
  const storedPlan = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
  if (storedPlan === null) throw new Error("The saved training plan could not be found.");
  const parsedPlan: unknown = JSON.parse(storedPlan);
  if (!Array.isArray(parsedPlan) || parsedPlan.some((item) => !isRecord(item))) {
    throw new Error("The saved training plan has an invalid format.");
  }
  const planItems = parsedPlan.filter(isRecord);
  const existing = planItems.find((item) => item.id === sessionId);
  if (!existing) throw new Error("This planned workout is no longer available.");
  if (existing.status === "Completed") {
    throw new Error("Completed workouts cannot be modified. Training history is unchanged.");
  }
  const updatedPlan = planItems.map((item) =>
    item.id === sessionId
      ? { ...item, ...updates, updatedAt: new Date().toISOString() }
      : item,
  );
  window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, JSON.stringify(updatedPlan));
  notifyTrainingPlanUpdated();
}

export async function completePlannedSession(
  session: PlannedSession,
  changes?: CompletedSessionChanges,
  preferredUnits: PreferredUnits = "Metric",
): Promise<void> {
  const storedPlan = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
  if (storedPlan === null) throw new Error("The saved training plan could not be found.");
  const parsedPlan: unknown = JSON.parse(storedPlan);
  if (!Array.isArray(parsedPlan) || parsedPlan.some((item) => !isRecord(item))) {
    throw new Error("The saved training plan has an invalid format.");
  }
  const planItems = parsedPlan.filter(isRecord);
  const savedSession = planItems.find((item) => item.id === session.id);
  if (!savedSession || savedSession.status === "Skipped") {
    throw new Error("This planned workout is no longer available to complete.");
  }

  const userId = await getAuthenticatedUserId();
  if (userId === null) throw new Error("Sign in to save your completed workout.");
  const parsedWorkouts = await readWorkoutHistory(userId);
  if (parsedWorkouts.some((item) => !isRecord(item))) {
    throw new Error("Saved workout history has an invalid format.");
  }
  const workouts = parsedWorkouts.filter(isRecord);
  const matchingSessionIds = [
    ...new Set(
      workouts
        .filter((workout) => workout.workoutDate === session.date && typeof workout.sessionId === "string")
        .map((workout) => workout.sessionId)
        .filter((sessionId): sessionId is string => typeof sessionId === "string"),
    ),
  ].filter((sessionId) => {
    const candidate = workouts.filter((workout) => workout.sessionId === sessionId);
    const plannedTypes = session.activities.map((activity) => activity.activityType).sort();
    const completedTypes = candidate
      .map((workout) => workout.activityType)
      .filter((activityType): activityType is string => typeof activityType === "string")
      .sort();
    const plannedDuration = session.activities.reduce(
      (total, activity) => total + activity.durationMinutes,
      0,
    );
    const completedDuration = candidate.reduce(
      (total, workout) =>
        total + (typeof workout.duration === "number" && Number.isFinite(workout.duration) ? workout.duration : 0),
      0,
    );
    return (
      plannedTypes.length === completedTypes.length &&
      plannedTypes.every((activityType, index) => activityType === completedTypes[index]) &&
      Math.abs(plannedDuration - completedDuration) <= Math.max(10, plannedDuration * 0.2)
    );
  });
  if (typeof savedSession.matchedSessionId !== "string" && matchingSessionIds.length > 1) {
    throw new Error(
      "More than one completed session matches this workout. Review your Training Sessions before linking it.",
    );
  }
  const completedSessionId =
    typeof savedSession.matchedSessionId === "string"
      ? savedSession.matchedSessionId
      : matchingSessionIds.length === 1
        ? matchingSessionIds[0]
        : window.crypto.randomUUID();
  const sessionAlreadyLogged = workouts.some((workout) => workout.sessionId === completedSessionId);
  if (savedSession.status === "Completed" && sessionAlreadyLogged) return;

  const selectedActivities = changes
    ? session.activities.filter((activity) =>
        changes.completedActivityIds.includes(activity.id),
      )
    : session.activities;
  if (selectedActivities.length === 0) {
    throw new Error("Select at least one activity completed in this session.");
  }
  const plannedDuration = selectedActivities.reduce(
    (total, activity) => total + activity.durationMinutes,
    0,
  );
  const actualDuration = changes?.durationMinutes ?? plannedDuration;
  if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
    throw new Error("Enter an actual workout duration greater than zero.");
  }
  const durationShares = selectedActivities.map(
    (activity) => (actualDuration * activity.durationMinutes) / Math.max(plannedDuration, 1),
  );
  const actualMinutesByActivity = durationShares.map((share, index) =>
    index === durationShares.length - 1
      ? actualDuration -
        durationShares.slice(0, index).reduce((total, minutes) => total + minutes, 0)
      : share,
  );
  const now = new Date().toISOString();
  const completedWorkouts = [
    ...workouts.filter((workout) => workout.sessionId !== completedSessionId),
    ...selectedActivities.map((activity, index) => {
      const sameTypeOccurrence = selectedActivities
        .slice(0, index)
        .filter((prior) => prior.activityType === activity.activityType).length;
      const previousWorkout = workouts
        .filter(
          (workout) =>
            workout.sessionId === completedSessionId &&
            workout.activityType === activity.activityType,
        )[sameTypeOccurrence];
      const workout: Record<string, unknown> = {
          ...(previousWorkout ?? {}),
          id:
            typeof previousWorkout?.id === "string"
              ? previousWorkout.id
              : `${completedSessionId}-${index + 1}`,
          sessionId: completedSessionId,
          sessionTitle: session.title,
          sessionNotes: changes?.notes.trim() || session.reason,
          activityType: activity.activityType,
          workoutTitle: session.title,
          workoutDate: session.date,
          duration: actualMinutesByActivity[index],
          ...(changes?.distanceByActivity?.[activity.id] === undefined && activity.distance === undefined
            ? {}
            : {
                distance:
                  (changes?.distanceByActivity?.[activity.id] ?? activity.distance ?? 0) *
                  (preferredUnits === "Imperial"
                    ? activity.activityType === "Swim"
                      ? 0.9144
                      : 1.60934
                    : 1),
              }),
          distanceUnit: activity.activityType === "Swim" ? "m" : "km",
          source:
            typeof previousWorkout?.source === "string"
              ? previousWorkout.source
              : "Other",
          savedAt:
            typeof previousWorkout?.savedAt === "string"
              ? previousWorkout.savedAt
              : now,
          createdAt:
            typeof previousWorkout?.createdAt === "string"
              ? previousWorkout.createdAt
              : now,
          updatedAt: now,
        };
      if (index === 0 && changes?.averageHeartRate !== undefined) {
        workout.averageHeartRate = changes.averageHeartRate;
      }
      if (index === 0 && changes?.maximumHeartRate !== undefined) {
        workout.maximumHeartRate = changes.maximumHeartRate;
      }
      if (index === 0 && changes?.averagePace?.trim()) {
        workout.averagePace = changes.averagePace.trim();
      }
      if (index === 0 && changes?.averagePower !== undefined) {
        workout.averagePower = changes.averagePower;
      }
      if (index === 0 && changes?.calories !== undefined) {
        workout.calories = changes.calories;
      }
      return workout;
    }),
  ];
  const updatedPlan = planItems.map((item) =>
    item.id === session.id
      ? {
          ...item,
          status: "Completed",
          matchedSessionId: completedSessionId,
          updatedAt: now,
        }
      : item,
  );
  const nextPlan = JSON.stringify(updatedPlan);
  await writeWorkoutHistory(userId, completedWorkouts);
  try {
    window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, nextPlan);
  } catch (error) {
    try {
      await writeWorkoutHistory(userId, workouts);
    } catch (rollbackError) {
      throw new Error(
        `Workout completion could not be saved, and the prior history could not be restored: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        { cause: error },
      );
    }
    throw error;
  }

  notifyWorkoutHistoryUpdated();
  notifyTrainingPlanUpdated();
}
