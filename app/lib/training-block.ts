import type { AthleteProfile } from "./athlete-profile";
import { activityPrescription, availableTypes, goalTypes } from "./training-activities.ts";
import { buildWorkoutActivity, catalogEntry, workoutImpact } from "./workout-catalog.ts";
import {
  hyroxAvailable,
  limitationFlags,
  pickHyroxWorkout,
  pickWorkoutType,
  purposeFor,
} from "./workout-selection.ts";
import {
  addDays,
  horizonForWeek,
  phaseFocus,
  weekStartOf,
  type HorizonPhase,
  type WeekHorizon,
} from "./training-horizon.ts";
import type { HistorySession, PlannedActivityType, PlannedSession } from "./training-plan";
import { localDateString, normalizeAvailableTrainingDays, weekDays } from "./week-days.ts";

type Day = (typeof weekDays)[number];
type Experience = AthleteProfile["trainingExperience"];

export type BlockWeek = {
  weekStart: string;
  phase: HorizonPhase;
  focus: string;
  weekType: "Load" | "Recovery";
  plannedMinutes: number;
  sessionCount: number;
  weeksToRace: number | null;
};

export type TrainingBlock = {
  sessions: PlannedSession[];
  weeks: BlockWeek[];
  explanation: string;
};

export const BLOCK_WEEKS = 12;

const START_FRACTION: Record<Experience, number> = {
  Beginner: 0.5,
  Intermediate: 0.6,
  Advanced: 0.7,
  Competitive: 0.8,
  "": 0.6,
};
const WEEKLY_GROWTH: Record<Experience, number> = {
  Beginner: 0.07,
  Intermediate: 0.1,
  Advanced: 0.1,
  Competitive: 0.12,
  "": 0.08,
};
const LOAD_PHASES: readonly HorizonPhase[] = ["Foundation", "Base", "Build", "Peak"];
export function recoveryCycleLength(experience: Experience): number {
  return experience === "Beginner" ? 3 : 4;
}

function phaseFraction(horizon: WeekHorizon): number {
  switch (horizon.phase) {
    case "Foundation":
      return 0.6;
    case "Base":
      return 0.75;
    case "Build":
      return 0.9;
    case "Peak":
      return 1;
    case "Taper":
      return ({ 1: 0.55, 2: 0.7, 3: 0.8 } as Record<number, number>)[horizon.weeksToRace] ?? 0.7;
    case "Race":
      return 0.35;
    case "Recovery":
      return horizon.weeksToRace === -1 ? 0.4 : 0.6;
  }
}

function pickDays(available: Day[], count: number, longDay: Day): Day[] {
  if (count >= available.length) return [...available];
  const chosen: Day[] = [longDay];
  while (chosen.length < count) {
    let best: Day | null = null;
    let bestDistance = -1;
    for (const day of available) {
      if (chosen.includes(day)) continue;
      const distance = Math.min(
        ...chosen.map((other) => Math.abs(weekDays.indexOf(day) - weekDays.indexOf(other))),
      );
      if (distance > bestDistance) {
        best = day;
        bestDistance = distance;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return available.filter((day) => chosen.includes(day));
}

function disciplineWeights(profile: AthleteProfile, types: PlannedActivityType[]) {
  const triathlon = ["Ironman", "Half Ironman", "Triathlon"].includes(profile.primaryGoal);
  const weights = new Map<PlannedActivityType, number>();
  types.forEach((type, index) => {
    weights.set(
      type,
      triathlon ? (type === "Ride" ? 0.4 : type === "Run" ? 0.3 : 0.3) : index === 0 ? 0.5 : 0.3,
    );
  });
  return weights;
}

function longDiscipline(profile: AthleteProfile, nonStrength: PlannedActivityType[]): PlannedActivityType {
  const goal = profile.primaryGoal;
  const preferred: PlannedActivityType | null = ["Ironman", "Half Ironman", "Triathlon", "Cycling Event"].includes(goal)
    ? "Ride"
    : ["Marathon", "Half Marathon", "HYROX"].includes(goal)
      ? "Run"
      : null;
  return preferred && nonStrength.includes(preferred) ? preferred : nonStrength[0];
}

type PlanWeekInput = {
  profile: AthleteProfile;
  weekStart: string;
  minutes: number;
  horizon: WeekHorizon;
  recovery: boolean;
  types: PlannedActivityType[];
  variation: number;
  weekIndex: number;
  now: string;
  easyOnly?: boolean;
};

function planWeek(input: PlanWeekInput): PlannedSession[] {
  const { profile, weekStart, minutes, horizon, recovery, types, variation, weekIndex } = input;
  const experience = profile.trainingExperience;
  const raceDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.targetEventDate) ? profile.targetEventDate : "";
  let days = normalizeAvailableTrainingDays(profile.availableTrainingDays).filter(
    (day) => horizon.weeksToRace !== 0 || !raceDate || addDays(weekStart, weekDays.indexOf(day)) < raceDate,
  );
  const withoutRest = days.filter((day) => day !== profile.preferredRestDay);
  if (withoutRest.length >= 3) days = withoutRest;
  if (days.length === 0 || types.length === 0) return [];

  const minSession = experience === "Beginner" ? 25 : 30;
  const weekendDays = days.filter((day) => day === "Saturday" || day === "Sunday");
  const longDay =
    days.find((day) => day === profile.longWorkoutDay) ??
    weekendDays[weekendDays.length - 1] ??
    days[days.length - 1];
  const limitFor = (day: Day) =>
    day === "Saturday" || day === "Sunday"
      ? profile.maxWeekendWorkoutMinutes ?? 180
      : profile.maxWeekdayWorkoutMinutes ?? 120;

  const nonStrength = types.filter((type) => type !== "Strength");
  const strengthAllowed =
    types.includes("Strength") && ["Foundation", "Base", "Build"].includes(horizon.phase);
  const longWeight = recovery || ["Taper", "Race", "Recovery"].includes(horizon.phase) ? 1.2 : horizon.phase === "Build" || horizon.phase === "Peak" ? 2.2 : 2;

  let count = Math.max(1, Math.min(days.length, 6, Math.floor(minutes / minSession)));
  let sizes: number[] = [];
  for (; count >= 1; count -= 1) {
    const totalWeight = longWeight + (count - 1);
    sizes = Array.from({ length: count }, (_, index) =>
      Math.floor(((minutes * (index === 0 ? longWeight : 1)) / totalWeight) / 5) * 5,
    );
    if (sizes.every((size) => size >= 20)) break;
  }
  if (count < 1) return [];
  const chosenDays = pickDays(days, count, longDay);
  const slotDays = [longDay, ...chosenDays.filter((day) => day !== longDay)];

  const flags = limitationFlags(profile);
  const gentle = recovery || Boolean(input.easyOnly);
  const hyroxGoal = profile.primaryGoal === "HYROX";
  const hyroxMode = hyroxGoal && hyroxAvailable(profile) && ["Foundation", "Base", "Build", "Peak", "Taper"].includes(horizon.phase);

  const rotated =
    nonStrength.length > 0
      ? [...nonStrength.slice((variation + weekIndex) % nonStrength.length), ...nonStrength.slice(0, (variation + weekIndex) % nonStrength.length)]
      : [];
  const weights = disciplineWeights(profile, rotated.length ? rotated : types);
  if (flags.lowerLimb && weights.has("Run")) weights.set("Run", (weights.get("Run") ?? 0.3) * 0.5);
  const longType = nonStrength.length > 0 ? longDiscipline(profile, nonStrength) : types[0];
  const counts = new Map<PlannedActivityType, number>([[longType, 1]]);
  type Slot = { type: PlannedActivityType; role: "long" | "other"; hyrox?: boolean };
  const otherTypes: Slot[] = [];
  const otherSlots = count - 1;
  const strengthSlots = strengthAllowed && otherSlots >= 3 && nonStrength.length > 0 ? 1 : 0;
  const hyroxSlots = hyroxMode ? (otherSlots >= 4 ? 2 : otherSlots >= 1 ? 1 : 0) : 0;
  const supportSlots = Math.min(otherSlots, Math.max(strengthSlots, hyroxSlots));
  for (let slot = 0; slot < otherSlots; slot += 1) {
    const fromEnd = otherSlots - 1 - slot;
    if (fromEnd < supportSlots) {
      otherTypes.push({ type: "Strength", role: "other", hyrox: hyroxMode && fromEnd < hyroxSlots });
      continue;
    }
    const pool = rotated.length ? rotated : types;
    let best = pool[0];
    let bestScore = -1;
    for (const type of pool) {
      const score = (weights.get(type) ?? 0.3) / ((counts.get(type) ?? 0) + 1);
      if (score > bestScore) {
        best = type;
        bestScore = score;
      }
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
    otherTypes.push({ type: best, role: "other" });
  }

  const slots: Slot[] = [{ type: longType, role: "long" }, ...otherTypes];
  const experienceLevel = profile.trainingExperience;
  let keyAssigned = 0;
  let supportAssigned = 0;
  const focusLabel = `${horizon.phase} · ${horizon.focus}${recovery ? " · Recovery week" : ""}`;
  const triathlon = ["Ironman", "Half Ironman", "Triathlon"].includes(profile.primaryGoal);

  const planned = slots.map((slot, index) => {
    const day = slotDays[index];
    const date = addDays(weekStart, weekDays.indexOf(day));
    let duration = Math.min(sizes[index] ?? 30, limitFor(day));
    if (flags.lowerLimb && slot.type === "Run") duration = Math.max(20, Math.round((duration * 0.8) / 5) * 5);
    const isSupport = slot.type === "Strength";
    const isKeyCandidate = slot.role === "other" && !isSupport && !gentle;
    const keyIndex = isKeyCandidate ? keyAssigned++ : isSupport ? supportAssigned++ : 0;
    const pickContext = {
      coarse: slot.type,
      role: slot.role === "long" && !isSupport ? ("long" as const) : isKeyCandidate ? ("key" as const) : isSupport ? ("support" as const) : ("easy" as const),
      keyIndex,
      phase: horizon.phase,
      experience: experienceLevel,
      gentle,
      flags,
      profile,
      goal: profile.primaryGoal,
      weekIndex,
      variation,
    };
    const hyroxPick = isSupport && (slot.hyrox || (slot.role === "long" && hyroxMode)) ? pickHyroxWorkout(pickContext) : null;
    const workoutType = hyroxPick ?? pickWorkoutType(pickContext);
    const entry = catalogEntry(workoutType);
    const purpose = purposeFor(workoutType, horizon.phase, recovery);
    const activity = buildWorkoutActivity(workoutType, duration, {
      experience: experienceLevel,
      phase: horizon.phase,
      recovery,
      hasLimitations: flags.any && (flags.lowerLimb || entry?.sport === "Strength" || workoutImpact(workoutType) !== "low"),
      purpose,
    });
    const activities = [activity ?? activityPrescription(slot.type, duration, "Easy", experienceLevel, flags.any)];
    return {
      id: globalThis.crypto.randomUUID(),
      day,
      date,
      title: workoutType,
      notes: "",
      reason: `${focusLabel}: ${purpose}`,
      activities,
      status: "Planned" as const,
      createdAt: input.now,
      updatedAt: input.now,
      generated: true,
      weekType: recovery ? ("Recovery" as const) : ("Load" as const),
    };
  });

  // Triathlon build/peak weeks pair a ride with a short run off the bike every other week.
  const hasRunAccess = types.includes("Run") && !flags.lowerLimb;
  if (triathlon && hasRunAccess && !gentle && ["Build", "Peak"].includes(horizon.phase) && weekIndex % 2 === 0) {
    const target =
      planned.find((session) => session.activities[0].activityType === "Ride" && session.activities[0].workoutType !== "Long Ride") ??
      planned.find((session) => session.activities[0].activityType === "Ride");
    if (target) {
      const ride = target.activities[0];
      const runMinutes = Math.min(25, Math.max(10, Math.round((ride.durationMinutes * 0.2) / 5) * 5));
      const brickRide = buildWorkoutActivity("Brick Ride", ride.durationMinutes - runMinutes, {
        experience: experienceLevel,
        phase: horizon.phase,
        purpose: purposeFor("Brick Ride", horizon.phase, false),
      });
      const brickRun = buildWorkoutActivity("Brick Run", runMinutes, {
        experience: experienceLevel,
        phase: horizon.phase,
        purpose: purposeFor("Brick Run", horizon.phase, false),
      });
      if (brickRide && brickRun) {
        target.activities = [{ ...brickRide, id: ride.id }, brickRun];
        target.title = "Brick Ride + Brick Run";
      }
    }
  }
  return planned.sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Plans the weeks after the current one as a periodised block: volume grows
 * gradually within the athlete's weekly hours, recovery weeks recur
 * automatically, and phases are taken from the goal event date.
 */
export function generateTrainingBlock(
  profile: AthleteProfile,
  history: HistorySession[],
  currentWeekPlannedMinutes: number,
  now = new Date(),
  variation = 0,
  maxWeeks = BLOCK_WEEKS,
  context: { lowRecovery?: boolean } = {},
): TrainingBlock {
  const cap = (profile.weeklyTrainingHours ?? 0) * 60;
  const types = goalTypes(profile, availableTypes(profile));
  if (cap <= 0 || types.length === 0 || normalizeAvailableTrainingDays(profile.availableTrainingDays).length === 0) {
    return { sessions: [], weeks: [], explanation: "A training block needs weekly hours, training days and supported equipment in your profile." };
  }
  const today = localDateString(now);
  const thisWeek = weekStartOf(today);
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.targetEventDate);
  const experience = profile.trainingExperience;
  const cycle = recoveryCycleLength(experience);
  const growth = WEEKLY_GROWTH[experience];
  const nowIso = now.toISOString();

  const recentStart = addDays(today, -13);
  const recentMinutes = history
    .filter((session) => session.date >= recentStart && session.date <= today)
    .reduce((sum, session) => sum + session.activities.reduce((total, activity) => total + activity.duration, 0), 0);
  const fromHistory = recentMinutes > 0 ? Math.min(cap, Math.max(cap * 0.3, recentMinutes / 2)) : cap * START_FRACTION[experience];
  let previousLoad = Math.max(fromHistory, Math.min(cap, currentWeekPlannedMinutes));
  let streak = 0;
  const phaseWeeks = new Map<HorizonPhase, number>();

  const weeks: BlockWeek[] = [];
  const sessions: PlannedSession[] = [];
  for (let index = 1; index <= maxWeeks; index += 1) {
    const weekStart = addDays(thisWeek, index * 7);
    const horizon = horizonForWeek(profile, weekStart);
    if (hasDate && !horizon) break;
    const week: WeekHorizon = horizon ?? { phase: "Base", focus: phaseFocus("Base"), weeksToRace: 99 };
    const next = horizonForWeek(profile, addDays(weekStart, 7));
    const isLoad = LOAD_PHASES.includes(week.phase);
    const recovery = isLoad && streak >= cycle - 1 && !(next && ["Taper", "Race"].includes(next.phase));
    const weeksInPhase = (phaseWeeks.get(week.phase) ?? 0) + 1;
    phaseWeeks.set(week.phase, weeksInPhase);
    const ramp = ["Foundation", "Base", "Build"].includes(week.phase) ? Math.min(0.1, 0.02 * (weeksInPhase - 1)) : 0;
    const target = cap * Math.min(1, phaseFraction(week) + ramp);
    let minutes: number;
    if (recovery) {
      minutes = previousLoad * 0.7;
      streak = 0;
    } else if (!isLoad) {
      minutes = Math.min(target, previousLoad);
      streak = 0;
    } else {
      minutes = target >= previousLoad ? Math.min(target, previousLoad * (1 + growth)) : Math.max(target, previousLoad * 0.9);
      minutes = Math.min(minutes, cap);
      previousLoad = minutes;
      streak += 1;
    }
    const weekSessions = planWeek({
      profile,
      weekStart,
      minutes: Math.round(minutes),
      horizon: week,
      recovery,
      types,
      variation,
      weekIndex: index,
      now: nowIso,
      easyOnly: index === 1 && (recentMinutes === 0 || Boolean(context.lowRecovery)),
    });
    sessions.push(...weekSessions);
    weeks.push({
      weekStart,
      phase: week.phase,
      focus: week.focus,
      weekType: recovery ? "Recovery" : "Load",
      plannedMinutes: weekSessions.reduce(
        (sum, session) => sum + session.activities.reduce((total, activity) => total + activity.durationMinutes, 0),
        0,
      ),
      sessionCount: weekSessions.length,
      weeksToRace: horizon ? horizon.weeksToRace : null,
    });
    if (week.phase === "Race" && hasDate) break;
  }

  const peak = Math.max(0, ...weeks.map((week) => week.plannedMinutes));
  const phases = [...new Set(weeks.map((week) => week.phase))].join(" → ");
  return {
    sessions,
    weeks,
    explanation:
      `Training block of ${weeks.length} weeks after this one (${phases || "no phases"}). ` +
      `Weekly volume builds gradually (about ${Math.round(growth * 100)}% per week) up to ${(peak / 60).toFixed(1)} hrs, within your ${profile.weeklyTrainingHours} available hrs/week. ` +
      `Every ${cycle}th week is a lighter recovery week${hasDate ? "" : ". Add a target event date in your profile to align the block with race day"}. ` +
      `Future weeks are a plan, not a promise: regenerate as your fitness and schedule change.`,
  };
}
