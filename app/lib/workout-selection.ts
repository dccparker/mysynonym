// Chooses sport-specific workout types for generated plans. Pure and
// deterministic given the same inputs, so plans are explainable and testable.
import type { AthleteProfile } from "./athlete-profile";
import type { HorizonPhase } from "./training-horizon.ts";
import type { PlannedActivity, PlannedActivityType } from "./training-plan";
import {
  availableWorkoutTypes,
  buildWorkoutActivity,
  catalogEntry,
  workoutAvailable,
  workoutImpact,
  type EquipmentProfile,
} from "./workout-catalog.ts";

export type LimitationFlags = {
  any: boolean;
  knee: boolean;
  hip: boolean;
  back: boolean;
  lowerLimb: boolean;
  history: boolean;
};

export function limitationFlags(
  profile: Pick<AthleteProfile, "currentLimitations" | "recurringSoreness" | "previousInjuries">,
): LimitationFlags {
  const active = `${profile.currentLimitations ?? ""} ${profile.recurringSoreness ?? ""}`.toLowerCase();
  const knee = /\bknees?\b|patell|\bit band\b|runner'?s knee/.test(active);
  const hip = /\bhips?\b|\bglute|groin/.test(active);
  const back = /\bback\b|\bspine\b|\bsciatic/.test(active);
  const lowerLimb = knee || hip || /\bshins?\b|achilles|\bankles?\b|\bfoot\b|\bfeet\b|\bcalf\b|calves|plantar|hamstring|\bquads?\b/.test(active);
  return {
    any: Boolean(active.trim()),
    knee,
    hip,
    back,
    lowerLimb,
    history: Boolean((profile.previousInjuries ?? "").trim()),
  };
}

export type Role = "long" | "key" | "easy" | "support";

export type PickContext = {
  coarse: PlannedActivityType;
  role: Role;
  keyIndex: number;
  phase: HorizonPhase | string;
  experience: AthleteProfile["trainingExperience"];
  gentle: boolean;
  flags: LimitationFlags;
  profile: EquipmentProfile;
  goal: string;
  weekIndex: number;
  variation: number;
};

const rotate = <T>(list: readonly T[], index: number): T => list[((index % list.length) + list.length) % list.length];

const HYROX_BY_PHASE: Record<string, string[]> = {
  Foundation: ["Farmers Carry", "Sandbag Lunges", "Sled Push", "Rowing Intervals"],
  Base: ["Sled Push", "Sled Pull", "Rowing Intervals", "SkiErg Intervals", "Farmers Carry", "Sandbag Lunges"],
  Build: ["HYROX Circuit", "Wall Balls", "Sled Push", "SkiErg Intervals", "Burpee Broad Jumps", "Compromised Running", "Sled Pull", "Rowing Intervals"],
  Peak: ["Race Simulation", "HYROX Circuit", "Compromised Running", "Wall Balls", "Burpee Broad Jumps"],
  Taper: ["Wall Balls", "Farmers Carry", "Sled Pull"],
};
const HYROX_GENTLE = ["Farmers Carry", "Sled Pull", "Mobility"];

export function hyroxAvailable(profile: EquipmentProfile): boolean {
  return availableWorkoutTypes(profile, "HYROX").length > 0;
}

export function pickHyroxWorkout(ctx: PickContext): string | null {
  if (["Race", "Recovery"].includes(String(ctx.phase))) return "Mobility";
  let pool = ctx.gentle ? HYROX_GENTLE : HYROX_BY_PHASE[String(ctx.phase)] ?? HYROX_BY_PHASE.Base;
  pool = pool.filter((name) => workoutAvailable(name, ctx.profile));
  if (ctx.flags.lowerLimb) pool = pool.filter((name) => workoutImpact(name) === "low" || name === "Mobility");
  if (ctx.experience === "Beginner") pool = pool.filter((name) => name !== "Race Simulation");
  return pool.length ? rotate(pool, ctx.weekIndex + ctx.variation + ctx.keyIndex) : null;
}

function pickRun(ctx: PickContext): string {
  const { phase, role, experience, flags, gentle, keyIndex, weekIndex, variation } = ctx;
  if (phase === "Recovery") return "Recovery Run";
  if (role === "long") return flags.lowerLimb || phase === "Race" ? "Easy Run" : "Long Run";
  if (role === "easy" || gentle || phase === "Foundation" || phase === "Race" || flags.lowerLimb) {
    return phase === "Race" && !flags.lowerLimb ? "Easy Run" : gentle && keyIndex > 0 ? "Recovery Run" : "Easy Run";
  }
  const beginner = experience === "Beginner";
  const hyrox = ctx.goal === "HYROX";
  switch (phase) {
    case "Base":
      return beginner ? "Easy Run" : keyIndex === 0 && (experience === "Advanced" || experience === "Competitive") ? "Hill Repeats" : "Tempo Run";
    case "Build":
      if (beginner || keyIndex > 0) return "Tempo Run";
      return rotate(["Intervals", "Threshold Run", "Hill Repeats"], weekIndex + variation);
    case "Peak":
      if (hyrox && !beginner && workoutAvailable("Compromised Running", ctx.profile)) return "Compromised Running";
      return beginner || keyIndex > 0 ? "Tempo Run" : "Threshold Run";
    case "Taper":
      return "Tempo Run";
    default:
      return "Easy Run";
  }
}

function pickRide(ctx: PickContext): string {
  const { phase, role, experience, gentle, keyIndex, weekIndex, variation } = ctx;
  if (phase === "Recovery" || phase === "Race") return "Recovery Ride";
  if (role === "long") return "Long Ride";
  if (role === "easy" || gentle || phase === "Foundation") return gentle && keyIndex > 0 ? "Recovery Ride" : "Zone 2 Ride";
  const beginner = experience === "Beginner";
  switch (phase) {
    case "Base":
      return beginner ? "Zone 2 Ride" : "Tempo Ride";
    case "Build":
      if (beginner || keyIndex > 0) return "Tempo Ride";
      return rotate(["Threshold Intervals", "VO2 Intervals"], weekIndex + variation);
    case "Peak":
      return beginner || keyIndex > 0 ? "Tempo Ride" : "Threshold Intervals";
    case "Taper":
      return "Tempo Ride";
    default:
      return "Zone 2 Ride";
  }
}

function pickSwim(ctx: PickContext): string {
  const { phase, role, experience, gentle, keyIndex, weekIndex, profile, goal } = ctx;
  const triathlon = ["Ironman", "Half Ironman", "Triathlon"].includes(goal);
  if (phase === "Recovery" || phase === "Race" || (gentle && role !== "long")) return "Recovery Swim";
  if (role === "long") return "Endurance Swim";
  if (
    triathlon &&
    role === "easy" &&
    ["Base", "Build", "Peak"].includes(String(phase)) &&
    weekIndex % 3 === 0 &&
    workoutAvailable("Open-Water Skills", profile)
  ) {
    return "Open-Water Skills";
  }
  if (role === "easy" || phase === "Foundation") {
    return experience === "Beginner" || weekIndex % 2 === 0 ? "Technique Swim" : "Endurance Swim";
  }
  switch (phase) {
    case "Base":
      return "Endurance Swim";
    case "Build":
      return keyIndex === 0 && experience !== "Beginner" ? "Threshold Swim" : "Endurance Swim";
    case "Peak":
      return triathlon ? "Race-Pace Swim" : "Threshold Swim";
    case "Taper":
      return "Race-Pace Swim";
    default:
      return "Technique Swim";
  }
}

function pickStrength(ctx: PickContext): string {
  const { phase, gentle, flags, weekIndex, variation } = ctx;
  if (phase === "Recovery" || phase === "Race" || phase === "Taper" || gentle) {
    return flags.knee ? "Knee-Support Strength" : flags.hip ? "Hip Stability" : "Mobility";
  }
  const index = weekIndex + variation;
  if (flags.knee) return rotate(["Knee-Support Strength", "Hip Stability", "Core Stability", "Mobility"], index);
  if (flags.hip) return rotate(["Hip Stability", "Core Stability", "Mobility"], index);
  if (flags.back) return rotate(["Core Stability", "Hip Stability", "Mobility"], index);
  if (flags.lowerLimb) return rotate(["Injury Prevention", "Hip Stability", "Core Stability"], index);
  switch (phase) {
    case "Foundation":
      return flags.history && index % 2 === 1 ? "Injury Prevention" : "Full Body";
    case "Base":
      return rotate(flags.history ? ["Lower Body", "Upper Body", "Injury Prevention"] : ["Lower Body", "Upper Body"], index);
    case "Build":
      return rotate(["Single-Leg Strength", "Core Stability", "Lower Body"], index);
    case "Peak":
      return rotate(["Core Stability", "Single-Leg Strength"], index);
    default:
      return "Full Body";
  }
}

function pickByCoarse(ctx: PickContext): string {
  if (ctx.coarse === "Run") return pickRun(ctx);
  if (ctx.coarse === "Ride") return pickRide(ctx);
  if (ctx.coarse === "Swim") return pickSwim(ctx);
  return pickStrength(ctx);
}

const sportFor: Record<PlannedActivityType, "Running" | "Cycling" | "Swimming" | "Strength"> = {
  Run: "Running",
  Ride: "Cycling",
  Swim: "Swimming",
  Strength: "Strength",
  Other: "Strength",
};

/** Picks a workout type that respects the athlete's equipment. */
export function pickWorkoutType(ctx: PickContext): string {
  const choice = pickByCoarse(ctx);
  if (workoutAvailable(choice, ctx.profile)) return choice;
  const fallbacks = availableWorkoutTypes(ctx.profile, sportFor[ctx.coarse]).filter(
    (name) => workoutImpact(name) !== "high" || ctx.coarse === "Run",
  );
  const easyFirst = fallbacks.find((name) => catalogEntry(name)?.intensity === "Easy") ?? fallbacks[0];
  return easyFirst ?? choice;
}

const PHASE_PURPOSE_SUFFIX: Record<string, string> = {
  Foundation: "builds the habit and base for the weeks ahead.",
  Base: "develops the aerobic base for harder training later.",
  Build: "raises your fitness toward race demands.",
  Peak: "sharpens race-specific fitness.",
  Taper: "keeps you sharp while fatigue clears before race day.",
  Race: "keeps you loose for race day.",
  Recovery: "helps your body absorb and rebuild.",
};

export function purposeFor(workoutType: string, phase: string, recoveryWeek: boolean): string {
  const entry = catalogEntry(workoutType);
  if (!entry) return "Supports consistent progress toward your goal.";
  const suffix = recoveryWeek ? "lets your body absorb recent training before the next build." : PHASE_PURPOSE_SUFFIX[phase];
  return suffix ? `${entry.purpose.replace(/\.$/, "")}; this ${recoveryWeek ? "week" : phase.toLowerCase() + " session"} ${suffix}` : entry.purpose;
}

type EnrichContext = {
  profile: AthleteProfile;
  phase: string;
  recovery?: boolean;
  weekIndex?: number;
  variation?: number;
};

// Maps a coarse legacy activity (type + effort) onto a workout type.
function legacyWorkoutType(activity: PlannedActivity, title: string, ctx: EnrichContext, strengthIndex: number): string {
  const flags = limitationFlags(ctx.profile);
  const long = /\blong\b/i.test(title);
  const base: PickContext = {
    coarse: activity.activityType,
    role: long ? "long" : activity.intensity === "Hard" ? "key" : "easy",
    keyIndex: 0,
    phase: ctx.phase,
    experience: ctx.profile.trainingExperience,
    gentle: Boolean(ctx.recovery) || activity.intensity === "Recovery",
    flags,
    profile: ctx.profile,
    goal: ctx.profile.primaryGoal,
    weekIndex: (ctx.weekIndex ?? 0) + strengthIndex,
    variation: ctx.variation ?? 0,
  };
  if (activity.activityType === "Strength" || activity.activityType === "Other") {
    if (ctx.profile.primaryGoal === "HYROX" && !flags.back) {
      const hyrox = pickHyroxWorkout({ ...base, keyIndex: strengthIndex });
      if (hyrox) return hyrox;
    }
    return pickStrength(base);
  }
  if (activity.intensity === "Moderate") {
    return activity.activityType === "Run"
      ? flags.lowerLimb ? "Easy Run" : "Tempo Run"
      : activity.activityType === "Ride" ? "Tempo Ride" : "Race-Pace Swim";
  }
  if (activity.intensity === "Hard") {
    const hard = {
      Run: flags.lowerLimb ? "Easy Run" : rotate(["Intervals", "Threshold Run"], base.weekIndex),
      Ride: rotate(["Threshold Intervals", "VO2 Intervals"], base.weekIndex),
      Swim: "Threshold Swim",
    } as Record<string, string>;
    const choice = hard[activity.activityType] ?? "Easy Run";
    const adjusted = ctx.profile.trainingExperience === "Beginner" ? { Intervals: "Tempo Run", "Threshold Run": "Tempo Run", "VO2 Intervals": "Tempo Ride", "Threshold Intervals": "Tempo Ride", "Threshold Swim": "Endurance Swim" }[choice] ?? choice : choice;
    return workoutAvailable(adjusted, ctx.profile) ? adjusted : pickWorkoutType({ ...base, role: "easy", gentle: true });
  }
  return pickWorkoutType({ ...base, phase: ctx.phase === "Recovery" ? "Recovery" : ctx.phase === "Foundation" ? "Foundation" : "Base" });
}

/**
 * Upgrades coarse activities (for example from the weekly generator) with a
 * sport-specific workout type and full structure. Activities that already
 * carry a workout type are left untouched.
 */
export function enrichActivities(
  activities: PlannedActivity[],
  title: string,
  ctx: EnrichContext,
  strengthOffset = 0,
): { activities: PlannedActivity[]; title: string } {
  const flags = limitationFlags(ctx.profile);
  let strengthIndex = strengthOffset;
  const enriched = activities.map((activity) => {
    if (activity.workoutType) return activity;
    const isStrength = activity.activityType === "Strength" || activity.activityType === "Other";
    const workoutType = legacyWorkoutType(activity, title, ctx, isStrength ? strengthIndex++ : 0);
    const entry = catalogEntry(workoutType);
    if (!entry) return activity;
    const built = buildWorkoutActivity(workoutType, activity.durationMinutes, {
      experience: ctx.profile.trainingExperience,
      phase: ctx.phase,
      recovery: ctx.recovery,
      hasLimitations: flags.any,
      id: activity.id,
      distance: activity.distance,
      ...(activity.intensity === "Rest" ? { intensity: "Rest" as const } : {}),
      purpose: purposeFor(workoutType, ctx.phase, Boolean(ctx.recovery)),
    });
    return built ?? activity;
  });
  const first = enriched[0]?.workoutType;
  return {
    activities: enriched,
    title: enriched.length === 1 && first ? first : title,
  };
}
