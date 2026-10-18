// Pure Daily Coach briefing generator. No I/O: every input is passed in so the
// logic can be unit-tested and reused (dashboard today, notifications later).
import type { AthleteProfile } from "./athlete-profile";
import type { RecoveryCheckIn } from "./recovery-checkin";
import type { PlannedActivityType, PlannedIntensity, PlannedSession } from "./training-plan";

export type BriefingConfidence = "High" | "Medium" | "Low";
export type PlanStatusLabel = "On Track" | "Slightly Behind" | "Ahead Of Plan";

export type BriefingMemory = { category: string; detail: string };
export type BriefingRecommendation = {
  recommendation: string;
  approvedAt: string | null;
  targetWorkoutDate: string | null;
};
export type BriefingHistoryEntry = {
  workoutDate: string;
  activityType: string;
  duration: number;
};

export type BriefingInput = {
  today: string; // YYYY-MM-DD, local
  hour: number; // 0-23, local
  profile: AthleteProfile | null;
  plan: PlannedSession[];
  history: BriefingHistoryEntry[];
  recovery: RecoveryCheckIn[];
  memories: BriefingMemory[];
  approvedRecommendations: BriefingRecommendation[];
};

export type BriefingWorkout =
  | {
      kind: "planned" | "suggested";
      headline: string;
      subtitle: string;
      sessionId: string | null;
      minutes: number;
      intensity: PlannedIntensity;
      completed: boolean;
    }
  | { kind: "rest"; headline: string; subtitle: string; sessionId: string | null; completed: false };

export type DailyBriefing =
  | {
      ready: false;
      greeting: string;
      missingData: string[];
      message: string;
    }
  | {
      ready: true;
      greeting: string;
      workout: BriefingWorkout;
      /** Stable text used to detect that an approval no longer matches the plan. */
      approvalKey: string;
      why: string[];
      recoveryFocus: string[];
      nutritionFocus: string[];
      confidence: { level: BriefingConfidence; explanation: string };
      planStatus: { label: PlanStatusLabel; explanation: string };
      insight: string | null;
      phase: TrainingPhase | null;
      approvedChange: string | null;
    };

export type TrainingPhase = "Base" | "Build" | "Peak" | "Taper" | "Race week";

const DAY_MS = 86_400_000;

export function greetingFor(hour: number, name: string): string {
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${part}, ${name.trim()}` : part;
}

function dateOnly(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(date: string, days: number): string {
  const next = new Date(dateOnly(date) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function mondayOf(date: string): string {
  const day = new Date(dateOnly(date)).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function trainingPhase(profile: AthleteProfile | null, today: string): TrainingPhase | null {
  if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(profile.targetEventDate)) return null;
  const days = Math.round((dateOnly(profile.targetEventDate) - dateOnly(today)) / DAY_MS);
  if (days < 0) return null;
  if (days <= 7) return "Race week";
  if (days <= 21) return "Taper";
  if (days <= 56) return "Peak";
  if (days <= 112) return "Build";
  return "Base";
}

const NOUNS: Record<PlannedActivityType, string> = {
  Run: "Run",
  Ride: "Bike",
  Swim: "Swim",
  Strength: "Strength",
  Other: "Session",
};

const PREFERRED: Record<string, { type: PlannedActivityType; noun: string }> = {
  Running: { type: "Run", noun: "Run" },
  Cycling: { type: "Ride", noun: "Bike" },
  Swimming: { type: "Swim", noun: "Swim" },
  "Strength training": { type: "Strength", noun: "Strength" },
  Other: { type: "Other", noun: "Walk" },
};

export function sessionMinutes(session: PlannedSession): number {
  return session.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
}

function isRestSession(session: PlannedSession): boolean {
  return session.activities.length > 0 && session.activities.every((a) => a.intensity === "Rest");
}

const INTENSITY_ORDER: PlannedIntensity[] = ["Rest", "Recovery", "Easy", "Moderate", "Hard"];

function topIntensity(session: PlannedSession): PlannedIntensity {
  return session.activities.reduce<PlannedIntensity>(
    (top, a) => (INTENSITY_ORDER.indexOf(a.intensity) > INTENSITY_ORDER.indexOf(top) ? a.intensity : top),
    "Rest",
  );
}

function describeSession(session: PlannedSession): { headline: string; minutes: number; intensity: PlannedIntensity } {
  const minutes = sessionMinutes(session);
  const intensity = topIntensity(session);
  if (session.activities.length === 1) {
    const activity = session.activities[0];
    return {
      headline: `${minutes} Minute ${intensity} ${NOUNS[activity.activityType]}`,
      minutes,
      intensity,
    };
  }
  return { headline: `${minutes} Minute ${session.title}`, minutes, intensity };
}

function todaysCheckIn(recovery: RecoveryCheckIn[], today: string): RecoveryCheckIn | null {
  return recovery.find((checkIn) => checkIn.date === today) ?? null;
}

function latestCheckIn(recovery: RecoveryCheckIn[]): RecoveryCheckIn | null {
  return [...recovery].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** Workout the athlete should do today: the planned one, a rest day, or a coach suggestion. */
export function selectTodaysWorkout(input: BriefingInput): BriefingWorkout {
  const { today, plan, profile } = input;
  const todays = plan.filter((session) => session.date === today && session.status !== "Skipped");
  const active = todays.find((s) => s.status !== "Completed" && !isRestSession(s));
  const done = todays.find((s) => s.status === "Completed");
  const chosen = active ?? done ?? todays[0];
  if (chosen) {
    if (isRestSession(chosen)) {
      return { kind: "rest", headline: "Rest Day", subtitle: chosen.title, sessionId: chosen.id, completed: false };
    }
    const info = describeSession(chosen);
    return {
      kind: "planned",
      headline: info.headline,
      subtitle: chosen.title,
      sessionId: chosen.id,
      minutes: info.minutes,
      intensity: info.intensity,
      completed: chosen.status === "Completed",
    };
  }

  const dayName = new Date(dateOnly(today)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const available = profile?.availableTrainingDays ?? [];
  if (available.length && !available.includes(dayName)) {
    return {
      kind: "rest",
      headline: "Rest Day",
      subtitle: "Not one of your training days",
      sessionId: null,
      completed: false,
    };
  }

  // Nothing planned on a training day: suggest one conservative, specific session.
  const readiness = todaysCheckIn(input.recovery, today)?.readinessScore;
  const disliked = new Set(profile?.dislikedActivities ?? []);
  const favorite =
    (profile?.preferredActivities ?? []).find((name) => PREFERRED[name] && !disliked.has(name)) ?? "";
  const choice = PREFERRED[favorite] ?? { type: "Run" as const, noun: "Walk" };
  const noun = PREFERRED[favorite] ? choice.noun : "Walk";
  const intensity: PlannedIntensity = readiness !== undefined && readiness < 40 ? "Recovery" : "Easy";
  const cap = profile?.maxWeekdayWorkoutMinutes ?? 40;
  const minutes = Math.max(20, Math.min(35, cap));
  return {
    kind: "suggested",
    headline: `${minutes} Minute ${intensity} ${noun}`,
    subtitle: "Coach suggestion · nothing is planned for today",
    sessionId: null,
    minutes,
    intensity,
    completed: false,
  };
}

function weekSessions(plan: PlannedSession[], weekStart: string): PlannedSession[] {
  const end = addDays(weekStart, 6);
  return plan.filter((s) => s.date >= weekStart && s.date <= end && !isRestSession(s));
}

export function evaluatePlanStatus(input: BriefingInput): { label: PlanStatusLabel; explanation: string } {
  const { today, plan, approvedRecommendations } = input;
  const start = mondayOf(today);
  const week = weekSessions(plan, start);
  const due = week.filter((s) => s.date < today && s.status !== "Skipped");
  const completedDue = due.filter((s) => s.status === "Completed");
  const unresolved = due.length - completedDue.length;
  const adjusted = approvedRecommendations.filter(
    (r) => r.approvedAt && r.approvedAt.slice(0, 10) >= start,
  ).length;
  const plannedToDate = week.filter((s) => s.date <= today).reduce((n, s) => n + sessionMinutes(s), 0);
  const doneMinutes = week.filter((s) => s.status === "Completed").reduce((n, s) => n + sessionMinutes(s), 0);

  if (!week.length) {
    return { label: "On Track", explanation: "No sessions are due yet this week, so there is nothing to fall behind on." };
  }
  if (unresolved > adjusted) {
    const gap = unresolved - adjusted;
    return {
      label: "Slightly Behind",
      explanation: `${gap} earlier ${gap === 1 ? "session was" : "sessions were"} missed and not yet adjusted. Ask the Coach to rework the week.`,
    };
  }
  if (completedDue.length > 0 && doneMinutes > plannedToDate * 1.1) {
    return {
      label: "Ahead Of Plan",
      explanation: `You have completed more than planned so far this week (${doneMinutes} of ${plannedToDate} planned minutes).`,
    };
  }
  if (unresolved > 0) {
    return {
      label: "On Track",
      explanation: "Missed workouts were successfully adjusted and you remain on track.",
    };
  }
  return {
    label: "On Track",
    explanation: due.length
      ? `You have completed all ${due.length} ${due.length === 1 ? "session" : "sessions"} due this week.`
      : "The week is just getting started and nothing is outstanding.",
  };
}

export function buildInsight(input: BriefingInput): string | null {
  const { today, plan, recovery } = input;
  const past = plan
    .filter((s) => s.date < today && !isRestSession(s) && s.status !== "Skipped")
    .sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const session of past) {
    if (session.status !== "Completed") break;
    streak += 1;
  }
  if (streak >= 3) return `You've completed ${streak} workouts in a row.`;

  const recent = recovery.filter((c) => c.date > addDays(today, -7) && c.date <= today);
  const previous = recovery.filter((c) => c.date > addDays(today, -14) && c.date <= addDays(today, -7));
  if (recent.length >= 3 && previous.length >= 3) {
    const avg = (items: RecoveryCheckIn[]) => items.reduce((n, c) => n + c.readinessScore, 0) / items.length;
    if (avg(recent) - avg(previous) >= 5) return "Your recovery scores have improved this week.";
  }

  const thisWeek = weekSessions(plan, mondayOf(today)).reduce((n, s) => n + sessionMinutes(s), 0);
  const lastWeek = weekSessions(plan, addDays(mondayOf(today), -7)).reduce((n, s) => n + sessionMinutes(s), 0);
  if (lastWeek > 0 && thisWeek >= lastWeek * 1.1) return "You are entering a higher volume training block.";
  return null;
}

const LIMITATION_PATTERN = /\b(sore|soreness|injur\w*|knee|ankle|achilles|calf|hamstring|hip|back|shoulder|tight|pain)\b/i;

function buildWhy(input: BriefingInput, workout: BriefingWorkout, phase: TrainingPhase | null): string[] {
  const { today, plan, history, profile } = input;
  const reasons: string[] = [];
  const session = workout.sessionId ? plan.find((s) => s.id === workout.sessionId) : undefined;

  if (workout.kind === "rest") {
    reasons.push("Rest is when your body absorbs the training you have already done");
  } else if (workout.kind === "suggested") {
    reasons.push("Nothing is planned today, so a short easy session keeps your routine without adding stress");
  } else if (session) {
    const purpose = session.activities.find((a) => a.purpose.trim())?.purpose.trim();
    if (purpose) reasons.push(purpose.replace(/\.$/, ""));
    else if (session.reason.trim()) reasons.push(session.reason.trim().replace(/\.$/, ""));
  }

  const yesterday = addDays(today, -1);
  const yesterdaySession = plan.find(
    (s) => s.date === yesterday && s.status === "Completed" && !isRestSession(s),
  );
  const yesterdayMinutes = history.filter((h) => h.workoutDate === yesterday).reduce((n, h) => n + h.duration, 0);
  if (yesterdaySession && ["Moderate", "Hard"].includes(topIntensity(yesterdaySession))) {
    reasons.push(
      workout.kind === "rest" || ["Recovery", "Easy"].includes(workout.intensity)
        ? "Protects recovery after yesterday's harder workout"
        : "Builds on yesterday's quality session while you are warmed up to the work",
    );
  } else if (!yesterdaySession && yesterdayMinutes >= 60) {
    reasons.push("Accounts for yesterday's long session");
  }

  const week = weekSessions(plan, mondayOf(today));
  if (week.length && workout.kind !== "rest") {
    const planned = week.reduce((n, s) => n + sessionMinutes(s), 0);
    const done = week.filter((s) => s.status === "Completed").reduce((n, s) => n + sessionMinutes(s), 0);
    reasons.push(`Keeps weekly volume on target (${done} of ${planned} planned minutes done)`);
  }

  if (phase && profile?.targetEventName) {
    reasons.push(`Aligns with your ${phase.toLowerCase()} phase for ${profile.targetEventName}`);
  } else if (phase) {
    reasons.push(`Aligns with your current ${phase.toLowerCase()} phase`);
  } else if (profile?.primaryGoal) {
    reasons.push(`Supports your goal: ${profile.primaryGoal === "Custom" ? profile.customGoalName || "custom goal" : profile.primaryGoal}`);
  }

  const readiness = todaysCheckIn(input.recovery, today);
  if (readiness && readiness.readinessScore < 40) {
    reasons.push("Your check-in shows low readiness, so keep effort controlled");
  }
  return [...new Set(reasons)].slice(0, 4).length >= 2
    ? [...new Set(reasons)].slice(0, 4)
    : [...new Set(reasons), "Consistency over weeks matters more than any single session"].slice(0, 4);
}

function buildRecoveryFocus(input: BriefingInput, workout: BriefingWorkout): string[] {
  const checkIn = todaysCheckIn(input.recovery, input.today);
  const items: string[] = [];
  if (workout.kind === "rest") items.push("Easy walking encouraged");
  else if (["Moderate", "Hard"].includes(workout.intensity)) {
    items.push("10 minutes mobility after your session");
  } else items.push("10 minutes mobility");
  if (checkIn && (checkIn.sleepQuality <= 2 || (checkIn.sleepDurationHours ?? 8) < 6.5)) {
    items.push("Prioritize sleep tonight");
  } else {
    items.push("Aim for a consistent bedtime");
  }
  if (checkIn && checkIn.soreness >= 4) items.push("Take extra time warming up; soreness is high");
  const note = input.memories.find((m) => LIMITATION_PATTERN.test(m.detail));
  if (note) items.push(`Keep in mind: ${note.detail.slice(0, 100)}`);
  else if (input.profile?.recurringSoreness.trim()) {
    items.push(`Watch your ${input.profile.recurringSoreness.trim().slice(0, 60)}`);
  }
  return items.slice(0, 4);
}

function buildNutritionFocus(workout: BriefingWorkout): string[] {
  if (workout.kind === "rest") {
    return ["25-30g protein at breakfast", "Spread protein across your meals", "Hydrate well through the day"];
  }
  const demanding = workout.intensity === "Hard" || workout.minutes >= 75;
  return demanding
    ? ["Fuel before workout with easy carbs", "Recovery meal within 60 minutes", "Increase hydration today"]
    : ["25-30g protein at breakfast", "Hydrate well before and after", "Recovery meal within 60 minutes"];
}

function buildConfidence(input: BriefingInput, workout: BriefingWorkout): { level: BriefingConfidence; explanation: string } {
  const gaps: string[] = [];
  const hasToday = todaysCheckIn(input.recovery, input.today) !== null;
  if (!hasToday) gaps.push("no recovery check-in yet today");
  if (workout.kind === "suggested") gaps.push("no planned session to build on");
  if (input.history.length < 3) gaps.push("limited workout history");
  const latest = latestCheckIn(input.recovery);
  const lowReadiness = (todaysCheckIn(input.recovery, input.today) ?? null)?.readinessScore;
  if (lowReadiness !== undefined && lowReadiness < 40 && workout.kind === "planned" && workout.intensity !== "Recovery" && workout.intensity !== "Easy") {
    return { level: "Low", explanation: "Your readiness is low but a demanding session is planned. Consider modifying today's plan." };
  }
  if (!latest && workout.kind === "suggested") {
    return { level: "Low", explanation: "There is little data to go on: no plan and no recovery check-ins yet." };
  }
  if (gaps.length === 0) {
    return { level: "High", explanation: "Based on today's check-in, your plan and your recent training." };
  }
  return {
    level: gaps.length >= 2 ? "Low" : "Medium",
    explanation: `Confidence is reduced by: ${gaps.join(", ")}.`,
  };
}

export function buildDailyBriefing(input: BriefingInput): DailyBriefing {
  const name = input.profile?.preferredName ?? "";
  const greeting = greetingFor(input.hour, name);
  if (!input.profile) {
    return {
      ready: false,
      greeting,
      missingData: ["Athlete profile"],
      message:
        "I need your athlete profile (goal, experience, available training days) before I can brief you each day.",
    };
  }
  if (!input.plan.length && !input.history.length && !input.recovery.length) {
    return {
      ready: false,
      greeting,
      missingData: ["Training plan", "Workout history", "Recovery check-in"],
      message:
        "I do not have enough yet to coach you. Complete a recovery check-in and generate your training plan, then your daily briefing will appear here.",
    };
  }

  const workout = selectTodaysWorkout(input);
  const phase = trainingPhase(input.profile, input.today);
  const approved = input.approvedRecommendations.find((r) => r.targetWorkoutDate === input.today);
  return {
    ready: true,
    greeting,
    workout,
    approvalKey: `${workout.kind}|${workout.sessionId ?? ""}|${workout.headline}`,
    why: buildWhy(input, workout, phase),
    recoveryFocus: buildRecoveryFocus(input, workout),
    nutritionFocus: buildNutritionFocus(workout),
    confidence: buildConfidence(input, workout),
    planStatus: evaluatePlanStatus(input),
    insight: buildInsight(input),
    phase,
    approvedChange: approved ? approved.recommendation.slice(0, 200) : null,
  };
}

export type DailyPlanApproval = {
  planDate: string;
  sessionId: string | null;
  workoutSummary: string;
  approvedAt: string;
};

/** An approval only counts while it still matches the workout shown today. */
export function isApprovalCurrent(approval: DailyPlanApproval | null, approvalKey: string): boolean {
  return approval !== null && approval.workoutSummary === approvalKey;
}
