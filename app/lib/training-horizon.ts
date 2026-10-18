import type { AthleteProfile } from "./athlete-profile";
import type { PlannedActivityType, PlannedSession } from "./training-plan";

export type HorizonPhase =
  | "Foundation"
  | "Base"
  | "Build"
  | "Peak"
  | "Taper"
  | "Race"
  | "Recovery";

export const horizonPhases: readonly HorizonPhase[] = [
  "Foundation",
  "Base",
  "Build",
  "Peak",
  "Taper",
  "Race",
  "Recovery",
];

export type PlannerViewMode = "1w" | "2w" | "4w" | "roadmap";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RECOVERY_WEEKS = 2;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FOCUS: Record<HorizonPhase, string> = {
  Foundation: "Consistency & Movement Habits",
  Base: "Aerobic Development",
  Build: "Volume Build",
  Peak: "Race Specific",
  Taper: "Freshness & Sharpening",
  Race: "Race Execution",
  Recovery: "Recovery",
};

const PURPOSE: Record<HorizonPhase, string> = {
  Foundation: "builds the consistent routine that every later phase depends on",
  Base: "develops the aerobic engine that supports harder training later",
  Build: "adds the training volume your event will demand",
  Peak: "rehearses race-specific effort so you arrive sharp and confident",
  Taper: "sheds fatigue while keeping fitness so you arrive fresh",
  Race: "keeps you loose and ready for event day",
  Recovery: "lets your body absorb the work and rebuild after the event",
};

export function phaseFocus(phase: HorizonPhase): string {
  return FOCUS[phase];
}

function parseDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function mondayOf(value: string): number | null {
  const time = parseDate(value);
  if (time === null) return null;
  const weekday = (new Date(time).getUTCDay() + 6) % 7;
  return time - weekday * DAY_MS;
}

export function addDays(date: string, days: number): string {
  const time = parseDate(date);
  if (time === null) return date;
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const monday = mondayOf(date);
  return monday === null ? date : new Date(monday).toISOString().slice(0, 10);
}

type PhaseLengths = { taper: number; peak: number; build: number; base: number };

function phaseLengths(goal: string): PhaseLengths {
  const long = goal === "Ironman" || goal === "Marathon";
  return { taper: long ? 3 : 2, peak: 4, build: 8, base: 8 };
}

function goalName(profile: AthleteProfile): string {
  return profile.primaryGoal === "Custom"
    ? profile.customGoalName.trim() || "Custom goal"
    : profile.primaryGoal || "Goal not set";
}

function phaseForWeeksOut(weeksOut: number, lengths: PhaseLengths): HorizonPhase {
  if (weeksOut <= 0) return "Race";
  if (weeksOut <= lengths.taper) return "Taper";
  if (weeksOut <= lengths.taper + lengths.peak) return "Peak";
  if (weeksOut <= lengths.taper + lengths.peak + lengths.build) return "Build";
  if (weeksOut <= lengths.taper + lengths.peak + lengths.build + lengths.base) return "Base";
  return "Foundation";
}

function weekOffsetToRace(profile: AthleteProfile | null, weekStart: string): number | null {
  if (!profile) return null;
  const raceMonday = mondayOf(profile.targetEventDate);
  const monday = mondayOf(weekStart);
  if (raceMonday === null || monday === null) return null;
  return Math.round((raceMonday - monday) / WEEK_MS);
}

export type WeekHorizon = {
  phase: HorizonPhase;
  focus: string;
  weeksToRace: number;
};

/** Training phase and focus for the week containing `date`, or null when no target date is set. */
export function horizonForWeek(profile: AthleteProfile | null, date: string): WeekHorizon | null {
  const weeksOut = weekOffsetToRace(profile, date);
  if (!profile || weeksOut === null) return null;
  if (weeksOut < 0) {
    if (-weeksOut > RECOVERY_WEEKS) return null;
    return { phase: "Recovery", focus: FOCUS.Recovery, weeksToRace: weeksOut };
  }
  const phase = phaseForWeeksOut(weeksOut, phaseLengths(profile.primaryGoal));
  return { phase, focus: FOCUS[phase], weeksToRace: weeksOut };
}

export type RoadmapBlock = {
  phase: HorizonPhase;
  focus: string;
  /** 1-based, where week 1 is the current week. */
  startWeek: number;
  endWeek: number;
  weeks: number;
  isCurrent: boolean;
};

export type Roadmap = {
  goal: string;
  eventName: string;
  targetDate: string;
  daysRemaining: number;
  weeksRemaining: number;
  current: {
    phase: HorizonPhase;
    focus: string;
    weeksLeftInPhase: number;
    /** 0-100, or null when the phase started before the roadmap can see (Foundation). */
    progress: number | null;
    weekInPhase: number | null;
    totalWeeks: number | null;
  };
  next: RoadmapBlock | null;
  blocks: RoadmapBlock[];
  contribution: string;
};

export function buildRoadmap(profile: AthleteProfile | null, today: string): Roadmap | null {
  const todayTime = parseDate(today);
  const targetTime = profile ? parseDate(profile.targetEventDate) : null;
  const currentWeeksOut = weekOffsetToRace(profile, today);
  if (!profile || todayTime === null || targetTime === null || currentWeeksOut === null) return null;
  const current = horizonForWeek(profile, today);
  if (!current) return null;

  const blocks: RoadmapBlock[] = [];
  for (let weeksOut = currentWeeksOut; weeksOut >= 0; weeksOut -= 1) {
    const horizon = horizonForWeek(profile, addDays(weekStartOf(today), (currentWeeksOut - weeksOut) * 7));
    if (!horizon) break;
    const week = currentWeeksOut - weeksOut + 1;
    const last = blocks[blocks.length - 1];
    if (last && last.phase === horizon.phase) {
      last.endWeek = week;
      last.weeks += 1;
    } else {
      blocks.push({
        phase: horizon.phase,
        focus: horizon.focus,
        startWeek: week,
        endWeek: week,
        weeks: 1,
        isCurrent: week === 1,
      });
    }
  }

  const currentBlock = blocks[0];
  const next = blocks[1] ?? null;
  const bounded = current.phase !== "Foundation" && current.phase !== "Recovery";
  const lengths = phaseLengths(profile.primaryGoal);
  const fullLength: Record<HorizonPhase, number | null> = {
    Foundation: null,
    Base: lengths.base,
    Build: lengths.build,
    Peak: lengths.peak,
    Taper: lengths.taper,
    Race: 1,
    Recovery: null,
  };
  const totalWeeks = bounded ? fullLength[current.phase] : null;
  const weeksLeftInPhase = currentBlock?.weeks ?? 0;
  const weekInPhase = totalWeeks === null ? null : Math.max(1, totalWeeks - weeksLeftInPhase + 1);
  const days = Math.round((targetTime - todayTime) / DAY_MS);

  return {
    goal: goalName(profile),
    eventName: profile.targetEventName.trim(),
    targetDate: profile.targetEventDate,
    daysRemaining: days,
    weeksRemaining: Math.max(0, Math.ceil(days / 7)),
    current: {
      phase: current.phase,
      focus: current.focus,
      weeksLeftInPhase,
      weekInPhase,
      totalWeeks,
      progress:
        totalWeeks === null || weekInPhase === null
          ? null
          : Math.min(100, Math.round(((weekInPhase - 1) / totalWeeks) * 100)),
    },
    next,
    blocks: currentBlock ? blocks : [],
    contribution: phaseContribution(current.phase, goalName(profile)),
  };
}

export function phaseContribution(phase: HorizonPhase, goal: string): string {
  const target = goal && goal !== "Goal not set" ? `your ${goal} goal` : "your goal";
  return `This ${phase} phase ${PURPOSE[phase]} for ${target}.`;
}

/** How a single planned workout supports the goal, preferring the coach's own purpose text. */
export function workoutContribution(
  session: PlannedSession | undefined,
  horizon: WeekHorizon | null,
  goal: string,
): string {
  if (!session && !horizon) return "";
  const purpose = session?.activities.find((activity) => activity.purpose.trim())?.purpose.trim();
  const phase = horizon ? phaseContribution(horizon.phase, goal) : "";
  if (purpose && phase) return `${purpose.replace(/\.$/, "")}. ${phase}`;
  return purpose ?? phase;
}

const ABBREVIATIONS: Record<PlannedActivityType, string> = {
  Run: "Run",
  Ride: "Bike",
  Swim: "Swim",
  Strength: "Str",
  Other: "Other",
};

export function sessionTotalMinutes(session: PlannedSession): number {
  return session.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
}

/** Compact zoomed-out label such as "Bike 90" or "Run 30 + Swim 20". */
export function compactSessionLabel(session: PlannedSession): string {
  const activities = session.activities.filter((activity) => activity.intensity !== "Rest");
  if (activities.length === 0 || sessionTotalMinutes(session) === 0) return "Rest";
  return activities
    .map((activity) => `${ABBREVIATIONS[activity.activityType]} ${activity.durationMinutes}`)
    .join(" + ");
}

export function tomorrowDate(today: string): string {
  return addDays(today, 1);
}

export function sessionsOnDate(sessions: PlannedSession[], date: string): PlannedSession[] {
  return sessions
    .filter((session) => session.date === date && session.status !== "Skipped")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function viewWeekCount(mode: PlannerViewMode): number {
  return mode === "2w" ? 2 : mode === "4w" ? 4 : 1;
}

export function weekStartsForView(today: string, mode: PlannerViewMode): string[] {
  const start = weekStartOf(today);
  return Array.from({ length: viewWeekCount(mode) }, (_, index) => addDays(start, index * 7));
}

export type WeekSummary = {
  weekStart: string;
  minutes: number;
  sessionCount: number;
  recovery: boolean;
  keySession: PlannedSession | null;
  sessions: PlannedSession[];
};

export function summarizeWeek(sessions: PlannedSession[], weekStart: string): WeekSummary {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = sessions
    .filter((session) => session.date >= weekStart && session.date <= weekEnd && session.status !== "Skipped")
    .sort((left, right) => left.date.localeCompare(right.date));
  const keySession = inWeek.reduce<PlannedSession | null>(
    (best, session) => (!best || sessionTotalMinutes(session) > sessionTotalMinutes(best) ? session : best),
    null,
  );
  return {
    weekStart,
    minutes: inWeek.reduce((sum, session) => sum + sessionTotalMinutes(session), 0),
    sessionCount: inWeek.length,
    recovery: inWeek.some((session) => session.weekType === "Recovery"),
    keySession,
    sessions: inWeek,
  };
}
