import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findAmbiguousWording } from "./coach-recommendation-logic.ts";
import { generateTrainingBlock } from "./training-block.ts";
import {
  availableWorkoutTypes,
  buildWorkoutActivity,
  catalogEntry,
  findUnsafeMedicalClaim,
  normalizeWorkoutStructure,
  workoutAvailable,
  workoutTypesForSport,
} from "./workout-catalog.ts";
import { enrichActivities, limitationFlags } from "./workout-selection.ts";

const profile = (overrides: Record<string, unknown> = {}) =>
  ({
    primaryGoal: "Half Marathon",
    customGoalName: "",
    targetEventName: "",
    targetEventDate: "2027-03-14",
    trainingExperience: "Intermediate",
    weeklyTrainingHours: 7,
    availableTrainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"],
    longWorkoutDay: "Saturday",
    preferredRestDay: "Friday",
    equipment: ["Road bike", "Pool access", "Running access", "Gym access"],
    otherEquipment: "",
    preferredActivities: [],
    dislikedActivities: [],
    maxWeekdayWorkoutMinutes: 90,
    maxWeekendWorkoutMinutes: 240,
    currentLimitations: "",
    recurringSoreness: "",
    previousInjuries: "",
    ...overrides,
  }) as never;

const NOW = new Date(2026, 9, 18, 12);
const typesIn = (block: ReturnType<typeof generateTrainingBlock>) =>
  block.sessions.flatMap((session) => session.activities.map((activity) => activity.workoutType));

describe("workout catalog", () => {
  test("contains every required sport-specific type", () => {
    assert.deepEqual(workoutTypesForSport("Running"), ["Easy Run", "Recovery Run", "Long Run", "Tempo Run", "Threshold Run", "Intervals", "Hill Repeats", "Brick Run"]);
    assert.equal(workoutTypesForSport("Cycling").length, 7);
    assert.equal(workoutTypesForSport("Swimming").length, 6);
    assert.equal(workoutTypesForSport("Strength").length, 9);
    assert.equal(workoutTypesForSport("HYROX").length, 11);
  });

  test("every workout has structure, options and no target times", () => {
    for (const sport of ["Running", "Cycling", "Swimming", "Strength", "HYROX"] as const) {
      for (const name of workoutTypesForSport(sport)) {
        const activity = buildWorkoutActivity(name, 60, { experience: "Intermediate", phase: "Build" });
        assert.ok(activity, name);
        assert.ok(activity.warmUp && activity.mainSet && activity.coolDown, `${name} sections`);
        assert.ok(activity.easierOption && activity.harderOption, `${name} options`);
        assert.ok(activity.equipment?.length, `${name} equipment`);
        assert.equal(activity.workoutType, name);
        assert.ok(!/\b\d{1,2}:\d{2}\b|\bmin\/km\b|\bmin\/mile\b|\bsub-?\d/i.test(`${activity.mainSet} ${activity.instructions}`), `${name} has no target time`);
      }
    }
    const circuit = buildWorkoutActivity("Wall Balls", 45, { experience: "Beginner" });
    assert.ok(circuit?.exercises?.[0].sets && circuit.exercises[0].reps);
  });

  test("scales to experience, phase and recovery weeks", () => {
    const beginner = buildWorkoutActivity("Full Body", 45, { experience: "Beginner", phase: "Base" });
    const advanced = buildWorkoutActivity("Full Body", 45, { experience: "Advanced", phase: "Build" });
    assert.ok((advanced?.exercises?.[0].sets ?? 0) > (beginner?.exercises?.[0].sets ?? 99));
    const recovery = buildWorkoutActivity("Full Body", 45, { experience: "Intermediate", phase: "Build", recovery: true });
    assert.match(recovery?.mainSet ?? "", /recovery week/i);
  });

  test("maps types to the coarse activity type", () => {
    assert.equal(catalogEntry("Sled Push")?.activityType, "Strength");
    assert.equal(catalogEntry("SkiErg Intervals")?.activityType, "Other");
    assert.equal(catalogEntry("Compromised Running")?.activityType, "Run");
    assert.equal(catalogEntry("Long Ride")?.activityType, "Ride");
  });

  test("gates HYROX movements on equipment", () => {
    const bare = { equipment: ["Running access"] };
    assert.equal(workoutAvailable("Sled Push", bare), false);
    assert.equal(workoutAvailable("Burpee Broad Jumps", bare), true);
    assert.equal(workoutAvailable("Sled Push", { equipment: ["Sled"] }), true);
    assert.equal(workoutAvailable("Wall Balls", { equipment: [], otherEquipment: "a wall ball and kettlebells" }), true);
    assert.ok(availableWorkoutTypes({ equipment: ["Gym access"] }, "HYROX").includes("SkiErg Intervals"));
  });

  test("normalization keeps valid structure and drops unknown data", () => {
    assert.deepEqual(normalizeWorkoutStructure({}), {});
    assert.deepEqual(normalizeWorkoutStructure(null), {});
    const result = normalizeWorkoutStructure({
      workoutType: "Not A Workout",
      warmUp: "  Easy  ",
      exercises: [{ name: "Squat", sets: 3, reps: 8 }, { name: "" }, 5],
      equipment: ["Bar", 3],
    });
    assert.equal(result.workoutType, undefined);
    assert.equal(result.warmUp, "Easy");
    assert.deepEqual(result.exercises, [{ name: "Squat", sets: 3, reps: "8" }]);
    assert.deepEqual(result.equipment, ["Bar"]);
    assert.equal(normalizeWorkoutStructure({ workoutType: "Tempo Run" }).workoutType, "Tempo Run");
  });
});

describe("medical wording safety", () => {
  test("flags diagnosis and cure claims but allows adaptive wording", () => {
    assert.ok(findUnsafeMedicalClaim("You have runner's knee, so rest."));
    assert.ok(findUnsafeMedicalClaim("This exercise will cure your knee pain."));
    assert.ok(findUnsafeMedicalClaim("These squats fix your knee problem."));
    assert.equal(findUnsafeMedicalClaim("Reduce running load this week and add mobility work. Stop if symptoms worsen."), null);
    assert.equal(findUnsafeMedicalClaim("Knee-support strength to build confidence on easier days."), null);
  });

  test("rejects Coach replacement sessions that make cure claims", () => {
    const action = (instructions: string, extra: Record<string, unknown> = {}) =>
      ({
        type: "replace_session",
        sessionId: "s1",
        title: "Knee-Support Strength",
        reason: "Lower impact this week.",
        activities: [
          { activityType: "Strength", durationMinutes: 30, intensity: "Easy", instructions, purpose: "Support training load.", ...extra },
        ],
      }) as never;
    assert.equal(findAmbiguousWording(action("Slow controlled reps in a pain-free range.")), null);
    assert.ok(findAmbiguousWording(action("Slow controlled reps that will heal your knee pain.")));
    assert.ok(findAmbiguousWording(action("Slow controlled reps.", { mainSet: "This cures knee pain." })));
  });
});

describe("sport-specific generation", () => {
  test("blocks use varied sport-specific workout types", () => {
    const block = generateTrainingBlock(profile(), [], 0, NOW);
    const types = new Set(typesIn(block));
    assert.ok(types.has("Long Run"));
    assert.ok(types.size >= 4, `variety: ${[...types].join(", ")}`);
    assert.ok(block.sessions.every((session) => session.activities.every((activity) => activity.workoutType && activity.warmUp && activity.mainSet)));
    assert.ok(block.sessions.every((session) => catalogEntry(session.title) || session.title.includes("+")));
  });

  test("respects equipment: no swims without a pool", () => {
    const block = generateTrainingBlock(
      profile({ primaryGoal: "Triathlon", equipment: ["Road bike", "Running access"] }),
      [],
      0,
      NOW,
    );
    assert.ok(typesIn(block).every((type) => !type?.includes("Swim")));
  });

  test("triathlon block rehearses bricks", () => {
    const block = generateTrainingBlock(
      profile({ primaryGoal: "Half Ironman", targetEventDate: "2027-01-10", weeklyTrainingHours: 9 }),
      [],
      0,
      NOW,
    );
    assert.ok(typesIn(block).includes("Brick Run"));
    assert.ok(typesIn(block).includes("Brick Ride"));
  });

  test("HYROX plans include station movements when equipment is available", () => {
    const block = generateTrainingBlock(
      profile({ primaryGoal: "HYROX", targetEventDate: "2027-02-14", equipment: ["Running access", "Gym access"] }),
      [],
      0,
      NOW,
    );
    const hyrox = typesIn(block).filter((type) => catalogEntry(type)?.sport === "HYROX");
    assert.ok(hyrox.length >= 6, `hyrox sessions: ${hyrox.length}`);
    const stations = new Set(hyrox);
    for (const station of ["Sled Push", "Wall Balls"]) {
      assert.ok(stations.has(station) || stations.has("HYROX Circuit"), station);
    }
    assert.ok(hyrox.some((type) => ["HYROX Circuit", "Race Simulation", "Compromised Running"].includes(type)));
  });

  test("HYROX without station equipment stays within what is available", () => {
    const block = generateTrainingBlock(
      profile({ primaryGoal: "HYROX", targetEventDate: "2027-02-14", equipment: ["Running access"] }),
      [],
      0,
      NOW,
    );
    for (const type of typesIn(block)) assert.ok(workoutAvailable(type ?? "", { equipment: ["Running access"] }), `${type} should be available`);
  });

  test("knee discomfort lowers run impact and adds supportive work", () => {
    const limited = generateTrainingBlock(profile({ currentLimitations: "Recurring knee discomfort when running" }), [], 0, NOW);
    const baseline = generateTrainingBlock(profile(), [], 0, NOW);
    const count = (block: typeof limited, names: string[]) => typesIn(block).filter((type) => names.includes(type ?? "")).length;
    const highImpact = ["Intervals", "Hill Repeats", "Threshold Run", "Compromised Running", "Long Run"];
    assert.equal(count(limited, highImpact), 0);
    assert.ok(count(baseline, highImpact) > 0);
    assert.ok(count(limited, ["Knee-Support Strength", "Hip Stability", "Mobility", "Core Stability"]) > 0);
    const minutes = (block: typeof limited, type: string) =>
      block.sessions.flatMap((s) => s.activities).filter((a) => a.activityType === type).reduce((sum, a) => sum + a.durationMinutes, 0);
    assert.ok(minutes(limited, "Run") < minutes(baseline, "Run"));
    const text = JSON.stringify(limited.sessions);
    assert.equal(findUnsafeMedicalClaim(text), null);
  });

  test("recovery weeks use gentler workouts", () => {
    const block = generateTrainingBlock(profile({ targetEventDate: "" }), [], 0, NOW);
    const recoveryWeeks = block.weeks.filter((week) => week.weekType === "Recovery").map((week) => week.weekStart);
    assert.ok(recoveryWeeks.length > 0);
    for (const session of block.sessions.filter((item) => item.weekType === "Recovery")) {
      assert.ok(session.activities.every((activity) => activity.intensity !== "Hard"), session.title);
    }
  });

  test("first week is easy when there is no recent training or recovery is low", () => {
    const cold = generateTrainingBlock(profile({ targetEventDate: "" }), [], 0, NOW);
    const firstWeek = cold.sessions.filter((session) => session.date < "2026-10-26");
    assert.ok(firstWeek.every((session) => session.activities.every((activity) => activity.intensity !== "Hard")));
    const tired = generateTrainingBlock(
      profile({ targetEventDate: "" }),
      [{ date: "2026-10-15", title: "Run", activities: [{ activityType: "Run", duration: 45 }] }] as never,
      0,
      NOW,
      0,
      12,
      { lowRecovery: true },
    );
    assert.ok(tired.sessions.filter((session) => session.date < "2026-10-26").every((session) => session.activities.every((activity) => activity.intensity !== "Hard")));
  });
});

describe("enriching legacy activities", () => {
  const legacy = (activityType: string, intensity: string) => ({
    id: `a-${activityType}-${intensity}`,
    activityType,
    durationMinutes: 45,
    intensity,
    instructions: "Generic",
    purpose: "Generic",
  });

  test("adds workout types and structure while keeping existing structured activities", () => {
    const result = enrichActivities([legacy("Run", "Hard"), legacy("Ride", "Easy")] as never, "Mixed", { profile: profile(), phase: "Build" });
    assert.ok(result.activities.every((activity) => activity.workoutType && activity.mainSet));
    assert.equal(result.activities[1].workoutType, "Zone 2 Ride");
    const again = enrichActivities(result.activities, "Mixed", { profile: profile(), phase: "Build" });
    assert.deepEqual(again.activities, result.activities);
  });

  test("HYROX goals swap generic strength for HYROX movements", () => {
    const result = enrichActivities([legacy("Strength", "Moderate")] as never, "Strength", {
      profile: profile({ primaryGoal: "HYROX" }),
      phase: "Build",
    });
    assert.equal(catalogEntry(result.activities[0].workoutType)?.sport, "HYROX");
  });

  test("limitation flags are read from profile text", () => {
    assert.equal(limitationFlags(profile({ currentLimitations: "sore left knee" }) as never).knee, true);
    assert.equal(limitationFlags(profile() as never).any, false);
  });
});
