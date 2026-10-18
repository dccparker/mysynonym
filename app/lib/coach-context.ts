import type { SupabaseClient } from "@supabase/supabase-js";
import { CoachRequestError } from "./coach-conversations";

type RecordValue = Record<string, unknown>;

const trainingDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const activityTypes = ["Run", "Ride", "Swim", "Strength", "Other"] as const;
const intensities = ["Recovery", "Easy", "Moderate", "Hard", "Rest"] as const;
const statuses = ["Planned", "Completed", "Missed", "Skipped"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function text(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mondayForDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function parsePlanner(value: unknown): RecordValue[] {
  if (!Array.isArray(value) || value.length > 60) {
    throw new CoachRequestError("The current planner data is invalid. Refresh the page and try again.", 400);
  }
  return value.map((rawSession) => {
    if (!isRecord(rawSession)) {
      throw new CoachRequestError("The current planner data is invalid. Refresh the page and try again.", 400);
    }
    const day = trainingDays.find((item) => item === rawSession.day);
    const status = statuses.find((item) => item === rawSession.status);
    if (
      !day ||
      !status ||
      typeof rawSession.date !== "string" ||
      !isValidDate(rawSession.date) ||
      !Array.isArray(rawSession.activities) ||
      rawSession.activities.length === 0 ||
      rawSession.activities.length > 6
    ) {
      throw new CoachRequestError("The current planner data is invalid. Refresh the page and try again.", 400);
    }
    const activities = rawSession.activities.map((rawActivity) => {
      if (!isRecord(rawActivity)) {
        throw new CoachRequestError("The current planner data is invalid. Refresh the page and try again.", 400);
      }
      const activityType = activityTypes.find((item) => item === rawActivity.activityType);
      const intensity = intensities.find((item) => item === rawActivity.intensity);
      const durationMinutes = finiteNumber(rawActivity.durationMinutes);
      if (!activityType || !intensity || durationMinutes === undefined || durationMinutes < 0) {
        throw new CoachRequestError("The current planner data is invalid. Refresh the page and try again.", 400);
      }
      return {
        id: text(rawActivity.id, 80),
        activityType,
        ...(typeof rawActivity.workoutType === "string" ? { workoutType: text(rawActivity.workoutType, 40) } : {}),
        durationMinutes,
        ...(finiteNumber(rawActivity.distance) === undefined
          ? {}
          : { distance: finiteNumber(rawActivity.distance) }),
        intensity,
        instructions: text(rawActivity.instructions, 300),
        purpose: text(rawActivity.purpose, 300),
      };
    });
    return {
      id: text(rawSession.id, 80),
      day,
      date: rawSession.date,
      title: text(rawSession.title, 120) ?? "Training session",
      notes: text(rawSession.notes, 300),
      reason: text(rawSession.reason, 300),
      status,
      activities,
    };
  });
}

function formatProfile(value: unknown): RecordValue | null {
  if (!isRecord(value)) return null;
  const profile: RecordValue = {};
  for (const key of [
    "preferredName",
    "sex",
    "heightCm",
    "weightKg",
    "units",
    "primaryGoal",
    "customGoalName",
    "targetEventName",
    "targetEventDate",
    "goalDescription",
    "trainingExperience",
    "weeklyTrainingHours",
    "availableTrainingDays",
    "longWorkoutDay",
    "equipment",
    "otherEquipment",
    "preferredActivities",
    "dislikedActivities",
    "preferredRestDay",
    "maxWeekdayWorkoutMinutes",
    "maxWeekendWorkoutMinutes",
    "currentLimitations",
    "previousInjuries",
    "recurringSoreness",
    "healthConsiderations",
  ]) {
    const field = value[key];
    if (typeof field === "string") {
      const maxLength = [
        "goalDescription",
        "currentLimitations",
        "previousInjuries",
        "recurringSoreness",
        "healthConsiderations",
      ].includes(key)
        ? 600
        : 200;
      profile[key] = field.slice(0, maxLength);
    } else if (typeof field === "number" && Number.isFinite(field)) {
      profile[key] = field;
    } else if (Array.isArray(field)) {
      profile[key] = field.filter((item): item is string => typeof item === "string").slice(0, 20);
    }
  }
  const birthDate = value.dateOfBirth;
  if (typeof birthDate === "string" && datePattern.test(birthDate)) {
    const [year, month, day] = birthDate.split("-").map(Number);
    const birth = new Date(Date.UTC(year, month - 1, day));
    const now = new Date();
    let age = now.getUTCFullYear() - year;
    if (
      now.getUTCMonth() < month - 1 ||
      (now.getUTCMonth() === month - 1 && now.getUTCDate() < day)
    ) {
      age -= 1;
    }
    if (
      birth.getUTCFullYear() === year &&
      birth.getUTCMonth() === month - 1 &&
      birth.getUTCDate() === day &&
      age >= 0
    ) {
      profile.age = age;
    }
  }
  return profile;
}

function summarizeWorkouts(value: unknown): RecordValue {
  if (!Array.isArray(value)) {
    throw new CoachRequestError("Your workout history could not be read.", 500);
  }
  const workouts = value
    .filter((item): item is RecordValue => isRecord(item))
    .map((workout): RecordValue & { coachDate: string } => ({
      ...workout,
      coachDate:
        typeof workout.workoutDate === "string" && isValidDate(workout.workoutDate)
          ? workout.workoutDate
          : typeof workout.savedAt === "string" && !Number.isNaN(Date.parse(workout.savedAt))
            ? workout.savedAt.slice(0, 10)
            : "",
    }))
    .filter(
      (item) =>
        isValidDate(item.coachDate) &&
        activityTypes.some((type) => type === item.activityType) &&
        typeof item.duration === "number" &&
        Number.isFinite(item.duration),
    )
    .sort((left, right) => right.coachDate.localeCompare(left.coachDate));
  const activityTotals: Record<string, { workouts: number; minutes: number }> = {};
  const weeklyTotals = new Map<
    string,
    { sessions: Set<string>; minutes: number; activities: Record<string, number> }
  >();
  for (const workout of workouts) {
    const type = workout.activityType as string;
    const total = activityTotals[type] ?? { workouts: 0, minutes: 0 };
    total.workouts += 1;
    total.minutes += workout.duration as number;
    activityTotals[type] = total;

    const weekStarting = mondayForDate(workout.coachDate);
    const weekly = weeklyTotals.get(weekStarting) ?? {
      sessions: new Set<string>(),
      minutes: 0,
      activities: {},
    };
    weekly.sessions.add(
      typeof workout.sessionId === "string"
        ? workout.sessionId
        : typeof workout.id === "string"
          ? workout.id
          : `${workout.coachDate}-${type}`,
    );
    weekly.minutes += workout.duration as number;
    weekly.activities[type] =
      (weekly.activities[type] ?? 0) + (workout.duration as number);
    weeklyTotals.set(weekStarting, weekly);
  }
  return {
    totalSessions: new Set(
      workouts.map((workout, index) =>
        typeof workout.sessionId === "string"
          ? workout.sessionId
          : typeof workout.id === "string"
            ? workout.id
            : `${workout.coachDate}-${index}`,
      ),
    ).size,
    totalMinutes: workouts.reduce((total, workout) => total + (workout.duration as number), 0),
    activityTotals,
    recentWeeklyTotals: [...weeklyTotals.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 8)
      .map(([weekStarting, weekly]) => ({
        weekStarting,
        sessions: weekly.sessions.size,
        minutes: weekly.minutes,
        activityMinutes: weekly.activities,
      })),
    recentWorkouts: workouts.slice(0, 25).map((workout) => ({
      date: workout.coachDate,
      activity: workout.activityType,
      title: text(workout.workoutTitle) ?? text(workout.sessionTitle) ?? undefined,
      durationMinutes: workout.duration,
      distance: finiteNumber(workout.distance),
      distanceUnit: text(workout.distanceUnit, 10),
      notes: text(workout.sessionNotes) ?? text(workout.notes, 300),
      averageHeartRate: finiteNumber(workout.averageHeartRate),
      averagePace: text(workout.averagePace, 40),
      averagePower: finiteNumber(workout.averagePower),
      trainingLoad: finiteNumber(workout.trainingLoad),
    })),
  };
}

function summarizeRecovery(value: unknown): RecordValue {
  if (!Array.isArray(value)) {
    throw new CoachRequestError("Your recovery history could not be read.", 500);
  }
  if (
    value.some(
      (item) =>
        !isRecord(item) ||
        typeof item.date !== "string" ||
        !isValidDate(item.date) ||
        !["energy", "soreness", "stress", "motivation", "sleepQuality"].every(
          (key) =>
            typeof item[key] === "number" &&
            Number.isInteger(item[key]) &&
            item[key] >= 1 &&
            item[key] <= 5,
        ),
    )
  ) {
    throw new CoachRequestError("Your saved recovery history has an invalid format.", 500);
  }
  const checkIns = value
    .filter((item): item is RecordValue => isRecord(item))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const ratingFields = ["energy", "soreness", "stress", "motivation", "sleepQuality"] as const;
  const averages = (entries: RecordValue[]) =>
    Object.fromEntries(
      ratingFields.map((key) => [
        key,
        entries.length
          ? Math.round(
              (entries.reduce((total, item) => total + (item[key] as number), 0) / entries.length) *
                10,
            ) / 10
          : null,
      ]),
    );
  return {
    checkInCount: checkIns.length,
    recentAverage: averages(checkIns.slice(0, 7)),
    priorAverage: averages(checkIns.slice(7, 14)),
    recentCheckIns: checkIns.slice(0, 30).map((checkIn) => ({
      date: checkIn.date,
      source: text(checkIn.source, 40),
      energy: checkIn.energy,
      soreness: checkIn.soreness,
      stress: checkIn.stress,
      motivation: checkIn.motivation,
      sleepQuality: checkIn.sleepQuality,
      sleepDurationHours: finiteNumber(checkIn.sleepDurationHours),
      restingHeartRate: finiteNumber(checkIn.restingHeartRate),
      hrv: finiteNumber(checkIn.hrv),
      availableTrainingMinutes: finiteNumber(checkIn.availableTrainingMinutes),
      readinessScore: finiteNumber(checkIn.readinessScore),
      readinessCategory: text(checkIn.readinessCategory, 20),
      painNotes: text(checkIn.painNotes, 300),
      recoveryNotes: text(checkIn.recoveryNotes, 300),
    })),
  };
}

export async function loadCoachContext(
  supabase: SupabaseClient,
  userId: string,
  plannerValue: unknown,
  plannerToday: unknown,
): Promise<string> {
  const planner = parsePlanner(plannerValue);
  if (plannerToday !== undefined && plannerToday !== null &&
      (typeof plannerToday !== "string" || !isValidDate(plannerToday))) {
    throw new CoachRequestError("The current date is invalid. Refresh the page and try again.", 400);
  }
  const today = typeof plannerToday === "string"
    ? plannerToday
    : new Date().toISOString().slice(0, 10);
  const [profileResult, workoutResult, recoveryResult, memoryResult] = await Promise.all([
    supabase.from("profiles").select("profile_data").eq("user_id", userId).maybeSingle(),
    supabase.from("workout_histories").select("workouts").eq("user_id", userId).maybeSingle(),
    supabase
      .from("recovery_checkins")
      .select("check_in")
      .eq("user_id", userId)
      .order("check_in_date", { ascending: false })
      .limit(60),
    supabase
      .from("coach_memories")
      .select("category,detail,created_at")
      .eq("user_id", userId)
      .neq("category", "athlete_pattern")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  // Derived athlete patterns need the Phase 6 migration; coaching still works without it.
  const patternResult = await supabase
    .from("coach_memories")
    .select("memory_type,signal,detail,confidence,evidence_count,updated_at")
    .eq("user_id", userId)
    .eq("category", "athlete_pattern")
    .order("updated_at", { ascending: false })
    .limit(40);
  const athletePatterns = patternResult.error
    ? []
    : patternResult.data.map((pattern) => ({
        type: pattern.memory_type,
        signal: pattern.signal,
        pattern: pattern.detail,
        confidence: pattern.confidence,
        evidenceCount: pattern.evidence_count,
      }));
  if (
    profileResult.error ||
    workoutResult.error ||
    recoveryResult.error ||
    memoryResult.error
  ) {
    throw new CoachRequestError("Your athlete data could not be loaded for the Coach.", 500);
  }
  if (profileResult.data && !isRecord(profileResult.data.profile_data)) {
    throw new CoachRequestError("Your saved athlete profile has an invalid format.", 500);
  }
  const workoutData = workoutResult.data?.workouts ?? [];
  const recoveryData = recoveryResult.data.map((row) => row.check_in);
  const athleteProfile = profileResult.data
    ? formatProfile(profileResult.data.profile_data)
    : null;
  return JSON.stringify(
    {
      currentDate: today,
      athleteProfile,
      goal: athleteProfile?.primaryGoal ?? null,
      experienceLevel: athleteProfile?.trainingExperience ?? null,
      workoutHistory: summarizeWorkouts(workoutData),
      recoveryHistory: summarizeRecovery(recoveryData),
      currentPlanner: planner,
      athletePatterns,
      savedCoachMemories: memoryResult.data.map((memory) => ({
        category: memory.category,
        detail: memory.detail,
        savedAt: memory.created_at,
      })),
    },
    null,
    2,
  );
}
