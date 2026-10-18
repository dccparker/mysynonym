import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildRoadmap,
  compactSessionLabel,
  horizonForWeek,
  sessionsOnDate,
  tomorrowDate,
  weekStartsForView,
  workoutContribution,
} from "./training-horizon.ts";

const profile = (overrides: Record<string, unknown> = {}) =>
  ({
    primaryGoal: "Half Ironman",
    customGoalName: "",
    targetEventName: "Half Ironman",
    targetEventDate: "2027-06-13",
    ...overrides,
  }) as never;

const session = (date: string, activities: Array<[string, number, string?]>, status = "Planned") =>
  ({
    id: date,
    day: "Monday",
    date,
    title: "Easy Aerobic Run",
    notes: "",
    reason: "",
    status,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    activities: activities.map(([activityType, durationMinutes, intensity], index) => ({
      id: `${date}-${index}`,
      activityType,
      durationMinutes,
      intensity: intensity ?? "Easy",
      instructions: "",
      purpose: "Build aerobic base",
    })),
  }) as never;

describe("training phases", () => {
  // 2027-06-13 is a Sunday; its week starts Monday 2027-06-07.
  test("derives phases backwards from race week", () => {
    const phase = (date: string) => horizonForWeek(profile(), date)?.phase;
    assert.equal(phase("2027-06-09"), "Race");
    assert.equal(phase("2027-06-02"), "Taper");
    assert.equal(phase("2027-05-26"), "Taper");
    assert.equal(phase("2027-05-19"), "Peak");
    assert.equal(phase("2027-04-14"), "Build");
    assert.equal(phase("2027-02-17"), "Base");
    assert.equal(phase("2026-10-19"), "Foundation");
    assert.equal(phase("2027-06-16"), "Recovery");
    assert.equal(phase("2027-08-01"), undefined);
  });

  test("returns null without a valid target date", () => {
    assert.equal(horizonForWeek(profile({ targetEventDate: "" }), "2026-10-19"), null);
    assert.equal(buildRoadmap(null, "2026-10-19"), null);
  });

  test("lengthens taper for Ironman", () => {
    assert.equal(horizonForWeek(profile({ primaryGoal: "Ironman" }), "2027-05-26")?.phase, "Taper");
    assert.equal(horizonForWeek(profile({ primaryGoal: "Ironman" }), "2027-05-19")?.phase, "Taper");
  });
});

describe("roadmap", () => {
  test("builds timeline with relative weeks and next phase", () => {
    const roadmap = buildRoadmap(profile(), "2027-02-17");
    assert.ok(roadmap);
    assert.equal(roadmap.current.phase, "Base");
    assert.equal(roadmap.current.focus, "Aerobic Development");
    assert.equal(roadmap.next?.phase, "Build");
    assert.equal(roadmap.blocks[0].startWeek, 1);
    assert.equal(roadmap.blocks.at(-1)?.phase, "Race");
    assert.equal(roadmap.weeksRemaining, 17);
    assert.equal(roadmap.blocks.reduce((sum, block) => sum + block.weeks, 0), 17);
    assert.ok(roadmap.current.progress !== null);
  });

  test("foundation has no bounded progress", () => {
    const roadmap = buildRoadmap(profile(), "2026-10-19");
    assert.equal(roadmap?.current.phase, "Foundation");
    assert.equal(roadmap?.current.progress, null);
    assert.equal(roadmap?.next?.phase, "Base");
  });

  test("recovery after the event", () => {
    const roadmap = buildRoadmap(profile(), "2027-06-16");
    assert.equal(roadmap?.current.phase, "Recovery");
    assert.equal(roadmap?.blocks.length, 0);
    assert.equal(roadmap?.weeksRemaining, 0);
  });
});

describe("compact labels and dates", () => {
  test("compacts workouts", () => {
    assert.equal(compactSessionLabel(session("2026-10-19", [["Ride", 90]])), "Bike 90");
    assert.equal(compactSessionLabel(session("2026-10-19", [["Run", 30], ["Strength", 20]])), "Run 30 + Str 20");
    assert.equal(compactSessionLabel(session("2026-10-19", [["Other", 0, "Rest"]])), "Rest");
  });

  test("finds tomorrow's sessions and skips skipped ones", () => {
    const sessions = [session("2026-10-19", [["Run", 45]]), session("2026-10-20", [["Run", 45]], "Skipped")];
    assert.equal(tomorrowDate("2026-10-18"), "2026-10-19");
    assert.equal(sessionsOnDate(sessions, "2026-10-19").length, 1);
    assert.equal(sessionsOnDate(sessions, "2026-10-20").length, 0);
  });

  test("week starts for view modes", () => {
    assert.deepEqual(weekStartsForView("2026-10-18", "2w"), ["2026-10-12", "2026-10-19"]);
    assert.equal(weekStartsForView("2026-10-18", "4w").length, 4);
    assert.equal(weekStartsForView("2026-10-18", "1w").length, 1);
  });

  test("workout contribution joins purpose and phase", () => {
    const text = workoutContribution(
      session("2026-10-19", [["Run", 45]]),
      { phase: "Base", focus: "Aerobic Development", weeksToRace: 10 },
      "Marathon",
    );
    assert.match(text, /Build aerobic base\. This Base phase/);
  });
});
