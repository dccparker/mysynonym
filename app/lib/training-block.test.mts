import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateTrainingBlock } from "./training-block.ts";
import { summarizeWeek } from "./training-horizon.ts";

const profile = (overrides: Record<string, unknown> = {}) =>
  ({
    primaryGoal: "Half Ironman",
    customGoalName: "",
    targetEventName: "Half Ironman",
    targetEventDate: "2027-06-13",
    trainingExperience: "Intermediate",
    weeklyTrainingHours: 8,
    availableTrainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"],
    longWorkoutDay: "Saturday",
    preferredRestDay: "Friday",
    equipment: ["Road bike", "Pool access", "Running access", "Gym access"],
    preferredActivities: [],
    dislikedActivities: [],
    maxWeekdayWorkoutMinutes: 90,
    maxWeekendWorkoutMinutes: 240,
    currentLimitations: "",
    ...overrides,
  }) as never;

// 2026-10-18 is a Sunday; the block starts Monday 2026-10-19.
const NOW = new Date(2026, 9, 18, 12);

describe("training block", () => {
  test("fills future weeks with real workouts within weekly hours", () => {
    const block = generateTrainingBlock(profile(), [], 0, NOW);
    assert.equal(block.weeks.length, 12);
    for (const week of block.weeks) {
      assert.ok(week.sessionCount >= 2, `week ${week.weekStart} has sessions`);
      assert.ok(week.plannedMinutes <= 8 * 60, "within weekly cap");
      assert.ok(week.plannedMinutes > 0);
    }
    assert.ok(block.sessions.every((session) => session.date >= "2026-10-19"));
    assert.ok(block.sessions.every((session) => session.day !== "Friday"));
  });

  test("includes recovery weeks and bounded progression", () => {
    const block = generateTrainingBlock(profile(), [], 0, NOW);
    const recovery = block.weeks.filter((week) => week.weekType === "Recovery");
    assert.ok(recovery.length >= 2);
    block.weeks.forEach((week, index) => {
      if (week.weekType !== "Load" || index === 0) return;
      const previousLoad = [...block.weeks.slice(0, index)].reverse().find((item) => item.weekType === "Load");
      if (previousLoad && previousLoad.phase === week.phase) {
        assert.ok(week.plannedMinutes <= previousLoad.plannedMinutes * 1.25, "no big jumps");
      }
    });
    for (const week of recovery) {
      const summary = summarizeWeek(block.sessions, week.weekStart);
      assert.equal(summary.recovery, true);
    }
  });

  test("ends with taper and race week lighter than peak", () => {
    const block = generateTrainingBlock(profile({ targetEventDate: "2026-12-20" }), [], 0, NOW);
    const phases = block.weeks.map((week) => week.phase);
    assert.equal(phases.at(-1), "Race");
    assert.ok(phases.includes("Taper"));
    const peakish = Math.max(...block.weeks.filter((w) => w.phase !== "Race").map((w) => w.plannedMinutes));
    assert.ok(block.weeks.at(-1)!.plannedMinutes < peakish);
    assert.ok(block.weeks.at(-1)!.sessionCount > 0);
    assert.ok(block.sessions.every((session) => session.date < "2026-12-20" || session.date > "2026-12-20"));
  });

  test("works without a target date and rejects unusable profiles", () => {
    const open = generateTrainingBlock(profile({ targetEventDate: "" }), [], 0, NOW);
    assert.equal(open.weeks.length, 12);
    const none = generateTrainingBlock(profile({ equipment: [] }), [], 0, NOW);
    assert.equal(none.sessions.length, 0);
  });

  test("triathlon weeks mix disciplines; variation changes output", () => {
    const block = generateTrainingBlock(profile(), [], 0, NOW);
    const week = summarizeWeek(block.sessions, "2026-10-26");
    const types = new Set(week.sessions.flatMap((s) => s.activities.map((a) => a.activityType)));
    assert.ok(types.size >= 3);
    const other = generateTrainingBlock(profile(), [], 0, NOW, 1);
    const sig = (b: typeof block) => b.sessions.map((s) => s.title + s.date).join("|");
    assert.notEqual(sig(block), sig(other));
  });

  test("beginners get a recovery week every third week", () => {
    const block = generateTrainingBlock(profile({ trainingExperience: "Beginner" }), [], 0, NOW);
    assert.equal(block.weeks[2].weekType, "Recovery");
  });
});
