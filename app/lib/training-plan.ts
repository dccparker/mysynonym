import type { AthleteProfile } from "./athlete-profile";
import { normalizeAvailableTrainingDays, weekDays } from "./athlete-profile";
export {
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  notifyTrainingPlanUpdated,
} from "./workout-storage";

export type PlannedActivityType = "Run" | "Ride" | "Swim" | "Strength" | "Other";
export type PlannedIntensity = "Recovery" | "Easy" | "Moderate" | "Hard" | "Rest";
export type PlannedStatus = "Planned" | "Completed" | "Missed" | "Skipped";

export type PlannedActivity = {
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
};

export type CompletedSession = {
  id: string;
  date: string;
  title: string;
  activities: Array<{ activityType: string; durationMinutes: number }>;
};

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  return {
    id: value.id,
    activityType,
    durationMinutes: value.durationMinutes,
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

function availableTypes(profile: AthleteProfile): PlannedActivityType[] {
  const equipment = new Set(profile.equipment);
  const available: PlannedActivityType[] = [];
  if (equipment.has("Running access") || equipment.has("Treadmill")) available.push("Run");
  if (equipment.has("Road bike") || equipment.has("Indoor bike trainer")) available.push("Ride");
  if (equipment.has("Pool access") || equipment.has("Open-water swimming access")) available.push("Swim");
  if (equipment.has("Gym access") || equipment.has("Strength equipment")) available.push("Strength");
  return available;
}

function goalTypes(profile: AthleteProfile, available: PlannedActivityType[]): PlannedActivityType[] {
  const preferredMap: Record<string, PlannedActivityType> = {
    Running: "Run",
    Cycling: "Ride",
    Swimming: "Swim",
    "Strength training": "Strength",
  };
  const preferred = profile.preferredActivities
    .map((activity) => preferredMap[activity])
    .filter((activity): activity is PlannedActivityType => Boolean(activity));
  const goal = profile.primaryGoal;
  const isTriathlonGoal = ["Ironman", "Half Ironman", "Triathlon"].includes(goal);
  const target =
    isTriathlonGoal
      ? ["Swim", "Ride", "Run", "Strength"]
      : goal === "Cycling Event"
        ? ["Ride", "Strength", "Run"]
        : ["Marathon", "Half Marathon"].includes(goal)
          ? ["Run", "Strength", "Ride"]
          : goal === "Strength"
            ? ["Strength", "Run", "Ride"]
            : goal === "HYROX"
              ? ["Run", "Strength", "Ride"]
              : preferred.length
                ? preferred
                : ["Run", "Ride", "Strength"];
  const dislikedMap: Record<string, PlannedActivityType> = {
    Running: "Run",
    Cycling: "Ride",
    Swimming: "Swim",
    "Strength training": "Strength",
  };
  const disliked = new Set(profile.dislikedActivities.map((activity) => dislikedMap[activity]));
  const supported = target.filter(
    (activity): activity is PlannedActivityType =>
      available.includes(activity as PlannedActivityType) &&
      (isTriathlonGoal && ["Swim", "Ride", "Run"].includes(activity)
        ? true
        : !disliked.has(activity as PlannedActivityType)),
  );
  const preferredOrder = new Map(preferred.map((activity, index) => [activity, index]));
  return [...new Set(supported)].sort((left, right) => {
        if (isTriathlonGoal && left === "Strength") return 1;
        if (isTriathlonGoal && right === "Strength") return -1;
        return (
          (preferredOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (preferredOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        );
      });
}

function activityPrescription(
  type: PlannedActivityType,
  durationMinutes: number,
  intensity: PlannedIntensity,
  experience: AthleteProfile["trainingExperience"],
  hasCurrentLimitations: boolean,
): PlannedActivity {
  const instructionsByType: Record<PlannedActivityType, string> = {
    Run:
      intensity === "Hard"
        ? "After an easy warm-up, use short faster efforts while staying in control, then cool down."
        : "Run at a comfortable effort where you can speak in full sentences.",
    Ride:
      intensity === "Hard"
        ? "After an easy warm-up, use short stronger efforts with easy spinning between them."
        : "Ride at a comfortable effort where conversation remains easy.",
    Swim:
      intensity === "Hard"
        ? "After an easy warm-up, swim short faster repeats with relaxed recovery between them."
        : "Swim relaxed lengths and pause as needed to keep your technique comfortable.",
    Strength:
      intensity === "Hard"
        ? "Use familiar strength movements with controlled repetitions and stop before form breaks down."
        : "Practice familiar strength movements with controlled, comfortable repetitions.",
    Other:
      intensity === "Recovery"
        ? "Take an easy walk or do gentle mobility. Finish feeling as comfortable as when you started."
        : "Choose familiar movement that fits the planned effort and duration.",
  };
  const easyPurpose =
    type === "Strength"
      ? "Maintain strength with manageable effort."
      : "Build consistency without making the next session harder.";
  const purpose =
    intensity === "Hard"
      ? "Practice brief, faster efforts while keeping the total session controlled."
      : type === "Swim"
        ? "Practice relaxed movement and comfortable technique."
        : easyPurpose;
  return {
    id: window.crypto.randomUUID(),
    activityType: type,
    durationMinutes,
    intensity: experience === "Beginner" && intensity === "Hard" ? "Moderate" : intensity,
    instructions: hasCurrentLimitations
      ? `${instructionsByType[type]} Keep within your comfortable range and stop if symptoms worsen.`
      : instructionsByType[type],
    purpose,
  };
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
    if (lastInvalidDays.length === 0) return proposal;
  }
  throw new Error(
    `Generated training plan includes unavailable days after repeated attempts: ${lastInvalidDays.join(", ")}.`,
  );
}
