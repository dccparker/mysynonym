import type { AthleteProfile } from "./athlete-profile";
import { normalizeAvailableTrainingDays, weekDays } from "./athlete-profile";
import { localDateString } from "./week-days";
import { activityPrescription, availableTypes, goalTypes } from "./training-activities";
import { horizonForWeek } from "./training-horizon";
import { enrichActivities } from "./workout-selection";
import { normalizeWorkoutStructure, catalogEntry, type WorkoutStructure } from "./workout-catalog";
export { activityPrescription, availableTypes, goalTypes };
export type { WorkoutExercise } from "./workout-catalog";
export {
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  notifyTrainingPlanUpdated,
} from "./workout-storage";

export type PlannedActivityType = "Run" | "Ride" | "Swim" | "Strength" | "Other";
export type PlannedIntensity = "Recovery" | "Easy" | "Moderate" | "Hard" | "Rest";
export type PlannedStatus = "Planned" | "Completed" | "Missed" | "Skipped";

export type PlannedActivity = WorkoutStructure & {
  id: string;
  activityType: PlannedActivityType;
  durationMinutes: number;
  distance?: number;
  intensity: PlannedIntensity;
  instructions: string;
  purpose: string;
};

export type PlannedSession = {
  id: string;
  day: (typeof weekDays)[number];
  date: string;
  title: string;
  notes: string;
  reason: string;
  activities: PlannedActivity[];
  status: PlannedStatus;
  rescheduledFromDay?: (typeof weekDays)[number];
  modified?: boolean;
  matchedSessionId?: string;
  autoMatchDisabled?: boolean;
  createdAt: string;
  updatedAt: string;
  generated?: boolean;
  weekType?: "Load" | "Recovery";
};

export type CompletedSession = {
  id: string;
  date: string;
  title: string;
  activities: Array<{ activityType: string; durationMinutes: number }>;
};

export type CoachPlannerAction = import("./coach-chat-types").CoachPlannerAction;

export { localDateString };

export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export function dateForPlanDay(weekStart: string, day: PlannedSession["day"]): string {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + weekDays.indexOf(day));
  return localDateString(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const activityTypes: readonly PlannedActivityType[] = ["Run", "Ride", "Swim", "Strength", "Other"];
const intensities: readonly PlannedIntensity[] = ["Recovery", "Easy", "Moderate", "Hard", "Rest"];
const statuses: readonly PlannedStatus[] = ["Planned", "Completed", "Missed", "Skipped"];

function normalizeActivity(value: unknown): PlannedActivity | null {
  if (!isRecord(value)) return null;
  const activityType = activityTypes.find((item) => item === value.activityType);
  const intensity = intensities.find((item) => item === value.intensity);
  if (
    typeof value.id !== "string" ||
    !activityType ||
    typeof value.durationMinutes !== "number" ||
    !Number.isFinite(value.durationMinutes) ||
    value.durationMinutes < 0 ||
    !intensity
  ) {
    return null;
  }
  const structure = normalizeWorkoutStructure(value);
  const catalogType = catalogEntry(structure.workoutType)?.activityType;
  return {
    id: value.id,
    activityType: catalogType ?? activityType,
    durationMinutes: value.durationMinutes,
    ...structure,
    ...(typeof value.distance === "number" && Number.isFinite(value.distance)
      ? { distance: value.distance }
      : {}),
    intensity,
    instructions:
      typeof value.instructions === "string" && value.instructions.trim()
        ? value.instructions
        : "Keep the effort controlled and adjust the session to stay comfortable.",
    purpose:
      typeof value.purpose === "string" && value.purpose.trim()
        ? value.purpose
        : "Support consistent progress toward the training goal.",
  };
}

export function normalizePlannedSession(value: unknown): PlannedSession | null {
  if (!isRecord(value)) return null;
  const day = weekDays.find((item) => item === value.day);
  if (typeof value.id !== "string" || !day) return null;
  const createdAt =
    typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : new Date().toISOString();
  const activities = Array.isArray(value.activities)
    ? value.activities.map(normalizeActivity)
    : typeof value.workoutType === "string" &&
        activityTypes.some((activity) => activity === value.workoutType) &&
        typeof value.durationMinutes === "number" &&
        Number.isFinite(value.durationMinutes)
      ? [
          {
            id: `${value.id}-activity`,
            activityType: value.workoutType as PlannedActivityType,
            durationMinutes: value.durationMinutes,
            intensity: "Easy" as const,
            instructions: "Keep the effort controlled and adjust the session to stay comfortable.",
            purpose: "Support consistent progress toward the training goal.",
          },
        ]
      : null;
  if (!activities || activities.some((activity) => activity === null) || activities.length === 0) {
    return null;
  }
  const date =
    typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
      ? value.date
      : dateForPlanDay(localDateString(startOfWeek(new Date())), day);
  const rescheduledFromDay = weekDays.find((item) => item === value.rescheduledFromDay);
  return {
    id: value.id,
    day,
    date,
    title:
      typeof value.title === "string"
        ? value.title
        : typeof value.workoutType === "string"
          ? value.workoutType
          : "Training session",
    notes: typeof value.notes === "string" ? value.notes : "",
    reason:
      typeof value.reason === "string" && value.reason.trim()
        ? value.reason
        : "Supports the athlete's training goal within the available training time.",
    activities: activities as PlannedActivity[],
    status: statuses.find((status) => status === value.status) ?? "Planned",
    ...(rescheduledFromDay ? { rescheduledFromDay } : {}),
    ...(value.modified === true ? { modified: true } : {}),
    ...(typeof value.matchedSessionId === "string"
      ? { matchedSessionId: value.matchedSessionId }
      : {}),
    ...(value.autoMatchDisabled === true ? { autoMatchDisabled: true } : {}),
    createdAt,
    updatedAt:
      typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt))
        ? value.updatedAt
        : createdAt,
    ...(value.generated === true ? { generated: true } : {}),
    ...(value.weekType === "Recovery" || value.weekType === "Load" ? { weekType: value.weekType } : {}),
  };
}

export function normalizeTrainingPlan(value: unknown): PlannedSession[] | null {
  if (!Array.isArray(value)) return null;
  const sessions = value.map(normalizePlannedSession);
  if (sessions.some((session) => session === null)) return null;
  const normalized = sessions as PlannedSession[];
  return new Set(normalized.map((session) => session.id)).size === normalized.length
    ? normalized
    : null;
}

export function applyCoachPlannerAction(
  action: CoachPlannerAction,
  currentPlan: PlannedSession[],
  profile: AthleteProfile,
  history: HistorySession[],
  today = localDateString(new Date()),
): PlannedSession[] {
  const nextPlan = structuredClone(currentPlan);
  if (action.type === "regenerate_rest_of_week") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.weekStarting)) {
      throw new Error("The Coach proposal has an invalid week start date.");
    }
    const weekStartDate = new Date(`${action.weekStarting}T00:00:00`);
    if (
      Number.isNaN(weekStartDate.getTime()) ||
      localDateString(startOfWeek(weekStartDate)) !== action.weekStarting
    ) {
      throw new Error("The Coach proposal does not start on a Monday.");
    }
    const weekEnd = dateForPlanDay(action.weekStarting, "Sunday");
    const generated = generateTrainingWeek(
      profile,
      history,
      currentPlan,
      weekStartDate,
    ).sessions;
    const windowStart = today > action.weekStarting ? today : action.weekStarting;
    const inWindow = (session: PlannedSession) =>
      session.date >= windowStart && session.date <= weekEnd;
    const keptIds = new Set(
      currentPlan
        .filter(
          (session) =>
            !inWindow(session) ||
            session.status === "Completed" ||
            session.status === "Skipped",
        )
        .map((session) => session.id),
    );
    const regenerated = [
      ...currentPlan.filter((session) => keptIds.has(session.id)),
      ...generated.filter(
        (session) => inWindow(session) && !keptIds.has(session.id),
      ),
    ].filter(
      (session, index, all) =>
        all.findIndex((other) => other.id === session.id) === index,
    );
    for (const day of weekDays) {
      const daySessions = regenerated.filter(
        (session) =>
          session.date >= action.weekStarting &&
          session.date <= weekEnd &&
          session.day === day &&
          session.status !== "Skipped",
      );
      const dailyLimit =
        day === "Saturday" || day === "Sunday"
          ? profile.maxWeekendWorkoutMinutes ?? 180
          : profile.maxWeekdayWorkoutMinutes ?? 120;
      if (
        daySessions.reduce((total, session) => total + plannedSessionDuration(session), 0) >
        dailyLimit
      ) {
        throw new Error(`Regeneration would exceed your ${day} training-time limit.`);
      }
    }
    return regenerated;
  }

  const sessionIndex = nextPlan.findIndex((session) => session.id === action.sessionId);
  if (sessionIndex < 0) {
    throw new Error("The planned session in this Coach proposal no longer exists.");
  }
  const session = nextPlan[sessionIndex];
  if (session.status === "Completed") {
    throw new Error("Completed workouts cannot be changed. Training history remains unchanged.");
  }
  if (session.status === "Skipped") {
    throw new Error("Skipped sessions must be restored in the planner before the Coach can change them.");
  }
  if (session.date < today) {
    throw new Error("Past planned sessions cannot be changed by the Coach.");
  }

  if (action.type === "move_session") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.targetDate)) {
      throw new Error("The Coach proposal has an invalid target date.");
    }
    const target = new Date(`${action.targetDate}T00:00:00`);
    if (
      Number.isNaN(target.getTime()) ||
      localDateString(target) !== action.targetDate ||
      action.targetDate < today
    ) {
      throw new Error("The workout can only be moved to a valid date from today onward.");
    }
    const day = weekDays[(target.getDay() + 6) % 7];
    if (!profile.availableTrainingDays.includes(day)) {
      throw new Error(`${day} is not an available training day in your athlete profile.`);
    }
    const sameDateMinutes = nextPlan
      .filter(
        (item) =>
          item.id !== session.id &&
          item.date === action.targetDate &&
          item.status !== "Skipped",
      )
      .reduce((total, item) => total + plannedSessionDuration(item), 0);
    const dailyLimit =
      day === "Saturday" || day === "Sunday"
        ? profile.maxWeekendWorkoutMinutes ?? 180
        : profile.maxWeekdayWorkoutMinutes ?? 120;
    if (sameDateMinutes + plannedSessionDuration(session) > dailyLimit) {
      throw new Error("Moving this session would exceed your daily training-time limit.");
    }
    nextPlan[sessionIndex] = {
      ...session,
      day,
      date: action.targetDate,
      rescheduledFromDay: session.day,
      modified: true,
      updatedAt: new Date().toISOString(),
    };
  } else if (action.type === "adjust_activity") {
    const activityIndex = session.activities.findIndex(
      (activity) => activity.id === action.activityId,
    );
    if (activityIndex < 0) {
      throw new Error("The activity in this Coach proposal no longer exists.");
    }
    if (
      action.durationMinutes === undefined &&
      action.intensity === undefined
    ) {
      throw new Error("The Coach proposal does not include an activity adjustment.");
    }
    if (
      action.durationMinutes !== undefined &&
      (!Number.isFinite(action.durationMinutes) ||
        action.durationMinutes < 5 ||
        action.durationMinutes > 600)
    ) {
      throw new Error("The proposed activity duration must be between 5 and 600 minutes.");
    }
    nextPlan[sessionIndex] = {
      ...session,
      activities: session.activities.map((activity, index) =>
        index === activityIndex
          ? {
              ...activity,
              ...(action.durationMinutes === undefined
                ? {}
                : { durationMinutes: action.durationMinutes }),
              ...(action.intensity === undefined
                ? {}
                : { intensity: action.intensity }),
            }
          : activity,
      ),
      modified: true,
      updatedAt: new Date().toISOString(),
    };
  } else {
    if (
      !action.title.trim() ||
      action.title.length > 120 ||
      !action.reason.trim() ||
      action.reason.length > 240 ||
      action.activities.length === 0 ||
      action.activities.length > 6
    ) {
      throw new Error("The replacement workout in this Coach proposal is invalid.");
    }
    nextPlan[sessionIndex] = {
      ...session,
      title: action.title.trim(),
      reason: action.reason.trim(),
      activities: action.activities.map((activity) => ({
        ...activity,
        id: crypto.randomUUID(),
      })),
      modified: true,
      updatedAt: new Date().toISOString(),
    };
  }
  return nextPlan;
}

export function plannedSessionDuration(session: PlannedSession): number {
  return session.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
}

export function matchesPlannedDuration(plannedMinutes: number, completedMinutes: number): boolean {
  return Math.abs(plannedMinutes - completedMinutes) <= Math.max(10, plannedMinutes * 0.2);
}

function sameActivityCombination(
  planned: PlannedSession,
  completed: CompletedSession,
): boolean {
  const plannedTypes = planned.activities.map((activity) => activity.activityType).sort();
  const completedTypes = completed.activities.map((activity) => activity.activityType).sort();
  return (
    plannedTypes.length === completedTypes.length &&
    plannedTypes.every((activity, index) => activity === completedTypes[index])
  );
}

export function matchPlannedSessions(
  planned: PlannedSession[],
  completed: CompletedSession[],
  today = localDateString(new Date()),
): PlannedSession[] {
  const matches = new Map<string, string>();
  const manuallyMatchedCompleted = new Set(
    planned
      .filter(
        (session) =>
          session.status === "Completed" &&
          session.matchedSessionId &&
          completed.some((item) => item.id === session.matchedSessionId),
      )
      .map((session) => session.matchedSessionId!),
  );
  for (const session of planned) {
    if (
      session.status === "Completed" &&
      session.matchedSessionId &&
      completed.some((item) => item.id === session.matchedSessionId)
    ) {
      matches.set(session.id, session.matchedSessionId);
    }
  }
  const candidates = planned
    .filter(
      (session) =>
        session.status !== "Skipped" &&
        !session.autoMatchDisabled &&
        !matches.has(session.id),
    )
    .map((session) => ({
      planned: session,
      completed: completed.filter(
        (candidate) =>
          !manuallyMatchedCompleted.has(candidate.id) &&
          candidate.date === session.date &&
          sameActivityCombination(session, candidate) &&
          matchesPlannedDuration(
            plannedSessionDuration(session),
            candidate.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0),
          ),
      ),
    }));
  for (const entry of candidates) {
    if (entry.completed.length !== 1) continue;
    const candidate = entry.completed[0];
    const competingPlans = candidates.filter((other) =>
      other.completed.some((item) => item.id === candidate.id),
    );
    if (competingPlans.length === 1) matches.set(entry.planned.id, candidate.id);
  }
  return planned.map((session) => {
    if (session.status === "Skipped") return session;
    const matchedSessionId = matches.get(session.id);
    if (matchedSessionId) {
      return { ...session, status: "Completed", matchedSessionId };
    }
    if (session.status === "Completed" && session.matchedSessionId) {
      return { ...session, status: "Planned", matchedSessionId: undefined };
    }
    return {
      ...session,
      status: session.date < today ? "Missed" : "Planned",
      matchedSessionId: undefined,
    };
  });
}

export type HistoryActivity = { activityType: string; duration: number };
export type HistorySession = {
  date: string;
  title: string;
  activities: HistoryActivity[];
};

export function findUnavailablePlanDays(
  sessions: PlannedSession[],
  availableTrainingDays: readonly string[],
  weekStart: string,
): string[] {
  const available = new Set(normalizeAvailableTrainingDays(availableTrainingDays));
  const weekEnd = dateForPlanDay(weekStart, "Sunday");
  return [
    ...new Set(
      sessions
        .filter(
          (session) =>
            session.date >= weekStart &&
            session.date <= weekEnd &&
            session.status !== "Completed" &&
            session.status !== "Skipped" &&
            !available.has(session.day),
        )
        .map((session) => session.day),
    ),
  ];
}

function generateTrainingWeekProposal(
  profile: AthleteProfile,
  history: HistorySession[],
  existing: PlannedSession[],
  now = new Date(),
  variationIndex = 0,
): { sessions: PlannedSession[]; starterWeek: boolean; explanation: string } {
  const weekStart = localDateString(startOfWeek(now));
  const weekEnd = dateForPlanDay(weekStart, "Sunday");
  const today = localDateString(now);
  const recentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const recentStartString = localDateString(recentStart);
  const recentHistory = history.filter(
    (session) => session.date >= recentStartString && session.date <= today,
  );
  const previousWeekStart = new Date(startOfWeek(now));
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekStartString = localDateString(previousWeekStart);
  const previousWeekEnd = dateForPlanDay(
    previousWeekStartString,
    "Sunday",
  );
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.targetEventDate)
    ? new Date(`${profile.targetEventDate}T00:00:00`)
    : null;
  const daysToTarget = targetDate
    ? Math.ceil((targetDate.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
    : null;
  const eventIsNear = daysToTarget !== null && daysToTarget >= 0 && daysToTarget <= 14;
  const recentMinutes = recentHistory.reduce(
    (sum, session) => sum + session.activities.reduce((total, activity) => total + activity.duration, 0),
    0,
  );
  const previousWeekMinutes = history
    .filter(
      (session) =>
        session.date >= previousWeekStartString && session.date <= previousWeekEnd,
    )
    .reduce(
      (sum, session) =>
        sum + session.activities.reduce((total, activity) => total + activity.duration, 0),
      0,
    );
  const starterWeek = recentHistory.length === 0 && previousWeekMinutes === 0;
  const weekLimit = (profile.weeklyTrainingHours ?? 0) * 60;
  const minimumDuration = profile.trainingExperience === "Beginner" ? 20 : 30;
  const recentBaseline = Math.max(recentMinutes, previousWeekMinutes);
  const desiredWeeklyMinutes = Math.max(
    0,
    Math.min(
      weekLimit,
      (starterWeek
        ? weekLimit * 0.65
        : Math.min(weekLimit, Math.max(minimumDuration, recentBaseline * 1.1))) *
        (eventIsNear ? 0.7 : 1),
    ),
  );
  const missedThisWeek = existing.filter(
    (session) => session.status === "Missed" && session.date >= weekStart && session.date <= weekEnd,
  ).length;
  const completedThisWeekMinutes = history
    .filter((session) => session.date >= weekStart && session.date <= today)
    .reduce((sum, session) =>
      sum + session.activities.reduce((total, activity) => total + activity.duration, 0), 0);
  const targetMinutes = Math.max(
    0,
    Math.min(
      weekLimit - completedThisWeekMinutes,
      desiredWeeklyMinutes * (1 - Math.min(0.4, missedThisWeek * 0.15)) - completedThisWeekMinutes,
    ),
  );
  const availableDays = normalizeAvailableTrainingDays(profile.availableTrainingDays);
  const types = goalTypes(profile, availableTypes(profile));
  const usedMinutesByType = new Map<PlannedActivityType, number>();
  const lastDateByType = new Map<PlannedActivityType, string>();
  for (const session of recentHistory) {
    for (const activity of session.activities) {
      const type = activity.activityType as PlannedActivityType;
      usedMinutesByType.set(type, (usedMinutesByType.get(type) ?? 0) + activity.duration);
      lastDateByType.set(type, session.date);
    }
  }
  const longestRecent = recentHistory
    .flatMap((session) => session.activities.map((activity) => ({ ...activity, date: session.date })))
    .sort((left, right) => right.duration - left.duration)[0];
  const remaining = existing.filter((session) => session.status === "Completed");
  if (targetMinutes < 20 || availableDays.length === 0 || types.length === 0) {
    return {
      sessions: remaining,
      starterWeek,
      explanation:
        targetMinutes < 20
          ? "There is not enough remaining weekly training time for another useful session."
          : "No supported training activity fits the current profile and weekly availability.",
    };
  }

  const eligibleDays = availableDays.filter(
    (day) => {
      const date = dateForPlanDay(weekStart, day);
      return (
        day !== profile.preferredRestDay &&
        date >= today &&
        !existing.some(
          (session) =>
            session.day === day &&
            session.date >= weekStart &&
            session.date <= weekEnd &&
            session.status === "Completed",
        ) &&
        !history.some((session) => session.date === date)
      );
    },
  );
  const historyTypeSequence = [...types].sort(
    (left, right) =>
      (usedMinutesByType.get(left) ?? 0) - (usedMinutesByType.get(right) ?? 0) ||
      (lastDateByType.get(left) ?? "").localeCompare(lastDateByType.get(right) ?? ""),
  );
  const isTriathlonGoal = ["Ironman", "Half Ironman", "Triathlon"].includes(profile.primaryGoal);
  const triathlonCore = historyTypeSequence.filter((type) =>
    ["Swim", "Ride", "Run"].includes(type),
  );
  if (isTriathlonGoal && triathlonCore.length === 0) {
    return {
      sessions: remaining,
      starterWeek,
      explanation:
        "A swim, ride, or run activity is needed for a triathlon-focused week; current equipment does not support any of these sessions, so strength is not scheduled as a substitute.",
    };
  }
  const includeSupportingStrength =
    isTriathlonGoal &&
    triathlonCore.length > 0 &&
    types.includes("Strength") &&
    eligibleDays.length > triathlonCore.length &&
    targetMinutes >= minimumDuration * (triathlonCore.length + 1);
  const includeRecoverySession =
    isTriathlonGoal &&
    eligibleDays.length >= 5 &&
    targetMinutes >=
      minimumDuration *
        (triathlonCore.length + (includeSupportingStrength ? 1 : 0) + 1);
  const desiredTriathlonSessions = isTriathlonGoal
    ? Math.min(
        eligibleDays.length,
        triathlonCore.length +
          (includeSupportingStrength ? 1 : 0) +
          (includeRecoverySession ? 1 : 0),
      )
    : 0;
  const sessionCount = Math.min(
    eligibleDays.length,
    Math.max(
      1,
      Math.min(
        isTriathlonGoal ? desiredTriathlonSessions : 4,
        isTriathlonGoal ? desiredTriathlonSessions : Math.ceil(targetMinutes / 90),
      ),
    ),
    Math.max(1, Math.floor(targetMinutes / minimumDuration)),
  );
  const preferredLongDay = weekDays.find((day) => day === profile.longWorkoutDay);
  const preferredDayIsEligible = preferredLongDay && eligibleDays.includes(preferredLongDay);
  const longDay =
    preferredDayIsEligible
      ? preferredLongDay
      : [...eligibleDays].sort((left, right) => {
          const leftWeekend = left === "Saturday" || left === "Sunday" ? 1 : 0;
          const rightWeekend = right === "Saturday" || right === "Sunday" ? 1 : 0;
          const leftCap = leftWeekend
            ? profile.maxWeekendWorkoutMinutes ?? 180
            : profile.maxWeekdayWorkoutMinutes ?? 120;
          const rightCap = rightWeekend
            ? profile.maxWeekendWorkoutMinutes ?? 180
            : profile.maxWeekdayWorkoutMinutes ?? 120;
          return rightCap - leftCap || rightWeekend - leftWeekend;
        })[0];
  const otherDays = eligibleDays.filter((day) => day !== longDay);
  const dayRotation = otherDays.length ? variationIndex % otherDays.length : 0;
  const rotatedOtherDays = [
    ...otherDays.slice(dayRotation),
    ...otherDays.slice(0, dayRotation),
  ];
  const orderedDays = longDay ? [longDay, ...rotatedOtherDays] : rotatedOtherDays;
  const days = orderedDays.slice(0, sessionCount);
  const weeklyVariation = [0.9, 1, 0.85, 0.95][variationIndex % 4];
  const variantTargetMinutes = Math.min(
    targetMinutes,
    Math.round((targetMinutes * weeklyVariation) / 5) * 5,
  );
  const totalWeight = days.reduce((sum, day) => sum + (day === longDay ? 1.8 : 1), 0);
  const baseMinutes = variantTargetMinutes / Math.max(1, totalWeight);
  const longDayActivityType =
    (isTriathlonGoal || profile.primaryGoal === "Cycling Event") && types.includes("Ride")
      ? "Ride"
      : ["Marathon", "Half Marathon"].includes(profile.primaryGoal) && types.includes("Run")
        ? "Run"
        : historyTypeSequence[0];
  const nonLongTriathlonTypes = triathlonCore.filter(
    (type) => type !== longDayActivityType,
  );
  const triathlonRotation = nonLongTriathlonTypes.length
    ? variationIndex % nonLongTriathlonTypes.length
    : 0;
  const rotatedTriathlonTypes = [
    ...nonLongTriathlonTypes.slice(triathlonRotation),
    ...nonLongTriathlonTypes.slice(0, triathlonRotation),
  ];
  const nonLongTypes = isTriathlonGoal ? rotatedTriathlonTypes : historyTypeSequence;
  const strengthSessionIndex =
    includeSupportingStrength && days.length > triathlonCore.length
      ? includeRecoverySession
        ? days.length - 2
        : days.length - 1
      : -1;
  const recoverySessionIndex =
    includeRecoverySession && days.length > triathlonCore.length
      ? days.length - 1
      : !includeSupportingStrength && isTriathlonGoal && days.length > triathlonCore.length
        ? days.length - 1
        : -1;
  let nonLongActivityIndex = 0;
  const longDayIsWeekend = longDay === "Saturday" || longDay === "Sunday";
  const longSessionCap = Math.min(
    longDayIsWeekend
      ? profile.maxWeekendWorkoutMinutes ?? 180
      : profile.maxWeekdayWorkoutMinutes ?? 120,
    weekLimit,
  );
  const longSessionTarget = Math.min(
    longSessionCap,
    Math.floor((baseMinutes * 1.8) / 5) * 5,
  );
  const generatedSessions = days.map((day, index) => {
    const isLongDay = day === longDay;
    const isRecoverySession = index === recoverySessionIndex;
    const weekend = day === "Saturday" || day === "Sunday";
    const durationCap =
      weekend
        ? profile.maxWeekendWorkoutMinutes ?? 180
        : profile.maxWeekdayWorkoutMinutes ?? 120;
    const dayCap = Math.min(durationCap, weekLimit);
    const maxDuration =
      isLongDay || days.length === 1
        ? dayCap
        : Math.min(dayCap, Math.max(1, longSessionTarget - 5));
    if (maxDuration <= 0) return null;
    const weightedMinutes = baseMinutes * (isLongDay ? 1.8 : 1);
    const sessionDurationLimit = isRecoverySession ? Math.min(maxDuration, 30) : maxDuration;
    const durationMinutes = Math.max(
      1,
      Math.min(sessionDurationLimit, Math.floor(weightedMinutes / 5) * 5),
    );
    let activityType: PlannedActivityType;
    if (
      isLongDay &&
      (isTriathlonGoal || profile.primaryGoal === "Cycling Event") &&
      types.includes("Ride")
    ) {
      activityType = "Ride";
    } else if (
      isLongDay &&
      ["Marathon", "Half Marathon"].includes(profile.primaryGoal) &&
      types.includes("Run")
    ) {
      activityType = "Run";
    } else if (
      isTriathlonGoal &&
      index === strengthSessionIndex
    ) {
      activityType = "Strength";
    } else if (isRecoverySession) {
      activityType = "Other";
    } else {
      const candidates = isLongDay ? historyTypeSequence : nonLongTypes;
      activityType = candidates[nonLongActivityIndex % candidates.length];
      if (!isLongDay) nonLongActivityIndex += 1;
    }
    const shouldAddBrick =
      isTriathlonGoal &&
      isLongDay &&
      activityType === "Ride" &&
      types.includes("Run") &&
      variationIndex % 3 === 0;
    const recentSameActivityCount = recentHistory.filter((session) =>
      session.activities.some((activity) => activity.activityType === activityType),
    ).length;
    const intensity: PlannedIntensity = isRecoverySession
      ? "Recovery"
      : eventIsNear
        ? "Easy"
        : recentSameActivityCount >= 3 && !isLongDay
          ? "Recovery"
          : isLongDay
            ? profile.trainingExperience === "Beginner"
              ? "Easy"
              : "Moderate"
            : "Easy";
    const mainDuration = shouldAddBrick
      ? Math.max(1, Math.floor((durationMinutes * 0.8) / 5) * 5)
      : durationMinutes;
    const mainActivity = activityPrescription(
      activityType,
      mainDuration,
      intensity,
      profile.trainingExperience,
      Boolean(profile.currentLimitations.trim()),
    );
    const activities = [mainActivity];
    if (shouldAddBrick) {
      const runDuration = Math.max(1, durationMinutes - mainDuration);
      activities.push(
        activityPrescription(
          "Run",
          runDuration,
          "Easy",
          profile.trainingExperience,
          Boolean(profile.currentLimitations.trim()),
        ),
      );
    }
    const reason = isTriathlonGoal
      ? isRecoverySession
        ? "Allow recovery while keeping gentle movement in the training week."
        : shouldAddBrick
          ? "Practice cycling followed by running, the key transition in a triathlon."
          : isLongDay && activityType === "Ride"
            ? `Build endurance for ${profile.primaryGoal === "Half Ironman" ? "Half Ironman" : "triathlon"} cycling demands.`
            : activityType === "Swim"
              ? "Improve swim efficiency while keeping the effort controlled."
              : activityType === "Run"
                ? "Develop sustainable running endurance for the event."
                : activityType === "Strength"
                  ? "Support swimming, cycling, and running with balanced strength work."
                  : "Support training consistency with a low-effort recovery session."
      : isLongDay
        ? "Develop endurance needed for race-day performance."
        : activityType === "Strength"
          ? "Support your primary training goal with manageable strength work."
          : activityType === "Swim"
            ? "Improve swim efficiency while maintaining low fatigue."
            : `Build steady ${activityType.toLowerCase()} endurance in support of your ${profile.primaryGoal} goal.`;
    const nowIso = now.toISOString();
    const sessionTitle = isRecoverySession
      ? "Recovery Session"
      : shouldAddBrick
      ? "Long Brick Session"
      : isLongDay && activityType === "Ride"
        ? "Long Ride"
        : isLongDay && activityType === "Run"
          ? "Long Run"
          : activityType === "Swim"
            ? "Swim Technique Session"
            : activityType === "Run"
              ? "Easy Run"
              : activityType === "Ride"
                ? "Easy Ride"
                : activityType === "Strength"
                  ? "Strength Session"
                  : "Recovery Session";
    return {
      id: window.crypto.randomUUID(),
      day,
      date: dateForPlanDay(weekStart, day),
      title: sessionTitle,
      notes:
        isLongDay && longestRecent
          ? `Recent longest logged activity: ${longestRecent.activityType}, ${longestRecent.duration} minutes.`
          : "",
      reason,
      activities,
      status: "Planned" as const,
      createdAt: nowIso,
      updatedAt: nowIso,
      generated: true,
    };
  }).filter((session): session is NonNullable<typeof session> => session !== null);
  let plannedMinutes = generatedSessions.reduce(
    (sum, session) => sum + plannedSessionDuration(session),
    0,
  );
  while (plannedMinutes > targetMinutes && generatedSessions.length > 0) {
    const lastSession =
      generatedSessions.find((session) => session.day !== longDay) ??
      generatedSessions[generatedSessions.length - 1];
    if (lastSession.activities.length > 1) {
      lastSession.activities.pop();
    } else {
      const activity = lastSession.activities[0];
      activity.durationMinutes = Math.max(
        0,
        activity.durationMinutes - (plannedMinutes - targetMinutes),
      );
      if (activity.durationMinutes <= 0) {
        const removeIndex = generatedSessions.indexOf(lastSession);
        generatedSessions.splice(removeIndex, 1);
      }
    }
    plannedMinutes = generatedSessions.reduce(
      (sum, session) => sum + plannedSessionDuration(session),
      0,
    );
  }
  const longSession = generatedSessions.find((session) => session.day === longDay);
  if (longSession && generatedSessions.length > 1) {
    const longestOtherDuration = Math.max(
      ...generatedSessions
        .filter((session) => session.id !== longSession.id)
        .map(plannedSessionDuration),
    );
    const longDuration = plannedSessionDuration(longSession);
    if (longDuration <= longestOtherDuration) {
      const increment = longestOtherDuration + 5 - longDuration;
      const remainingBudget = targetMinutes - plannedMinutes;
      if (increment <= remainingBudget) {
        const mainActivity = longSession.activities[0];
        mainActivity.durationMinutes += increment;
        plannedMinutes += increment;
      }
    }
  }
  return {
    sessions: [...remaining, ...generatedSessions],
    starterWeek,
    explanation:
      `Plan uses ${recentHistory.length} completed sessions from the previous seven days (${(recentMinutes / 60).toFixed(1)} hours), ` +
      `${(previousWeekMinutes / 60).toFixed(1)} hours completed in the previous calendar week, ` +
      `${completedThisWeekMinutes} minutes already completed this week, ${profile.weeklyTrainingHours ?? 0} available weekly hours, ` +
      `${missedThisWeek} missed planned session${missedThisWeek === 1 ? "" : "s"} this week, ` +
      `the stated goal, selected training days, equipment, experience, and activity preferences` +
      `${daysToTarget === null ? "" : `; ${profile.targetEventName || "the target event"} is ${daysToTarget} days away${eventIsNear ? " so volume is reduced and sessions stay easy" : ""}`}` +
      `${profile.currentLimitations.trim() ? ". Current limitations are recorded; keep effort comfortable and adapt or stop if symptoms worsen" : ""}.`,
  };
}

function logPlanner(label: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  console.info(`[planner] ${label}`, JSON.stringify(details));
}

function buildFallbackBaseWeek(
  profile: AthleteProfile,
  history: HistorySession[],
  existing: PlannedSession[],
  now: Date,
  budgetMinutes: number,
): PlannedSession[] {
  const weekStart = localDateString(startOfWeek(now));
  const weekEnd = dateForPlanDay(weekStart, "Sunday");
  const today = localDateString(now);
  const available = availableTypes(profile);
  if (available.length === 0 || budgetMinutes < 20) return [];
  // Rest-day preference and a workout already done today are relaxed here:
  // a minimal week is better than an empty one.
  const days = normalizeAvailableTrainingDays(profile.availableTrainingDays).filter(
    (day) =>
      dateForPlanDay(weekStart, day) >= today &&
      !existing.some(
        (session) =>
          session.day === day &&
          session.date >= weekStart &&
          session.date <= weekEnd &&
          session.status === "Completed",
      ),
  );
  if (days.length === 0) return [];
  const primary: PlannedActivityType = available.includes("Ride") ? "Ride" : available[0];
  const run: PlannedActivityType = available.includes("Run") ? "Run" : available[0];
  const secondary: PlannedActivityType =
    available.find((type) => type !== primary && type !== run) ?? primary;
  const name = (type: PlannedActivityType) => (type === "Ride" ? "Bike" : type);
  type Candidate = {
    title: string;
    type: PlannedActivityType;
    minutes: number;
    intensity: PlannedIntensity;
    reason: string;
  };
  const candidates = ([
    { title: `Long ${name(primary)}`, type: primary, minutes: 90, intensity: "Easy", reason: "Base endurance session." },
    { title: `Easy ${name(run)}`, type: run, minutes: 40, intensity: "Easy", reason: "Easy aerobic base." },
    { title: `Easy ${name(secondary)}`, type: secondary, minutes: 45, intensity: "Easy", reason: "Easy aerobic base in a second discipline." },
    { title: "Recovery Session", type: "Other", minutes: 30, intensity: "Recovery", reason: "Gentle movement to support recovery." },
  ] satisfies Candidate[]).slice(0, days.length) as Candidate[];
  const total = candidates.reduce((sum, item) => sum + item.minutes, 0);
  const scale = Math.min(1, budgetMinutes / total);
  const preferredLong = days.find((day) => day === profile.longWorkoutDay);
  const longDay =
    preferredLong ??
    [...days].reverse().find((day) => day === "Saturday" || day === "Sunday") ??
    days[days.length - 1];
  const otherDays = days.filter((day) => day !== longDay);
  const nowIso = now.toISOString();
  const limitations = Boolean(profile.currentLimitations.trim());
  const sessions: PlannedSession[] = [];
  candidates.forEach((item, index) => {
    const minutes = Math.floor((item.minutes * scale) / 5) * 5;
    if (minutes < 20) return;
    const day = index === 0 ? longDay : otherDays[index - 1];
    if (!day) return;
    sessions.push({
      id: window.crypto.randomUUID(),
      day,
      date: dateForPlanDay(weekStart, day),
      title: item.title,
      notes: "",
      reason: item.reason,
      activities: [
        activityPrescription(item.type, minutes, item.intensity, profile.trainingExperience, limitations),
      ],
      status: "Planned",
      createdAt: nowIso,
      updatedAt: nowIso,
      generated: true,
    });
  });
  return sessions.sort((left, right) => left.date.localeCompare(right.date));
}

function isGeneratedInWeek(session: PlannedSession, weekStart: string, weekEnd: string) {
  return session.status !== "Completed" && session.date >= weekStart && session.date <= weekEnd;
}

function withFallbackWeek(
  profile: AthleteProfile,
  history: HistorySession[],
  existing: PlannedSession[],
  now: Date,
  weekStart: string,
  proposal: { sessions: PlannedSession[]; starterWeek: boolean; explanation: string },
): { sessions: PlannedSession[]; starterWeek: boolean; explanation: string } {
  const weekEnd = dateForPlanDay(weekStart, "Sunday");
  const today = localDateString(now);
  const generated = proposal.sessions.filter((session) => isGeneratedInWeek(session, weekStart, weekEnd));
  const availableDays = normalizeAvailableTrainingDays(profile.availableTrainingDays);
  const completedMinutes = history
    .filter((session) => session.date >= weekStart && session.date <= today)
    .reduce((sum, session) => sum + session.activities.reduce((t, a) => t + a.duration, 0), 0);
  const budget = (profile.weeklyTrainingHours ?? 0) * 60 - completedMinutes;
  logPlanner("generation result", {
    today,
    weekStart,
    experience: profile.trainingExperience,
    goal: profile.primaryGoal,
    weeklyHours: profile.weeklyTrainingHours,
    availableDays,
    preferredRestDay: profile.preferredRestDay,
    equipment: profile.equipment,
    supportedTypes: availableTypes(profile),
    goalTypes: goalTypes(profile, availableTypes(profile)),
    eligibleDaysFromToday: availableDays.filter((day) => dateForPlanDay(weekStart, day) >= today),
    historyDatesThisWeek: history.filter((s) => s.date >= weekStart).map((s) => s.date),
    candidates: generated.map((session) => `${session.day}: ${session.title}`),
    explanation: proposal.explanation,
  });
  if (generated.length > 0 || !profile.primaryGoal || !profile.trainingExperience) return proposal;
  const fallback = buildFallbackBaseWeek(profile, history, existing, now, budget);
  logPlanner("fallback base week", {
    reason: "primary generator produced zero sessions",
    sessions: fallback.map((session) => `${session.day}: ${session.title}`),
  });
  if (fallback.length === 0) return proposal;
  return {
    sessions: [...proposal.sessions, ...fallback],
    starterWeek: proposal.starterWeek,
    explanation: `${proposal.explanation} A minimal base week was created because the full generator produced no sessions.`,
  };
}

// Gives generated coarse activities a sport-specific workout type and structure.
function enrichGeneratedSessions(
  sessions: PlannedSession[],
  profile: AthleteProfile,
  weekStart: string,
  variation: number,
): PlannedSession[] {
  const phase = horizonForWeek(profile, weekStart)?.phase ?? "Base";
  let strengthIndex = 0;
  return sessions.map((session) => {
    if (!session.generated || session.activities.every((activity) => activity.workoutType)) return session;
    const result = enrichActivities(session.activities, session.title, { profile, phase, variation }, strengthIndex);
    strengthIndex += session.activities.filter((activity) => activity.activityType === "Strength").length;
    return { ...session, title: result.title, activities: result.activities };
  });
}

export function generateTrainingWeek(
  profile: AthleteProfile,
  history: HistorySession[],
  existing: PlannedSession[],
  now = new Date(),
  variationIndex = 0,
): { sessions: PlannedSession[]; starterWeek: boolean; explanation: string } {
  const weekStart = localDateString(startOfWeek(now));
  let lastInvalidDays: string[] = [];
  for (let attempt = 0; attempt < weekDays.length; attempt += 1) {
    const proposal = generateTrainingWeekProposal(
      profile,
      history,
      existing,
      now,
      variationIndex + attempt,
    );
    lastInvalidDays = findUnavailablePlanDays(
      proposal.sessions,
      profile.availableTrainingDays,
      weekStart,
    );
    if (lastInvalidDays.length === 0) {
      const week = withFallbackWeek(profile, history, existing, now, weekStart, proposal);
      return { ...week, sessions: enrichGeneratedSessions(week.sessions, profile, weekStart, variationIndex) };
    }
  }
  throw new Error(
    `Generated training plan includes unavailable days after repeated attempts: ${lastInvalidDays.join(", ")}.`,
  );
}
