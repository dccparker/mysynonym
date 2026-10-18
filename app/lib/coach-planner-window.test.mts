import assert from "node:assert/strict";
import test from "node:test";
import { compactPlannerForCoach } from "./coach-planner-window.ts";
import type { PlannedSession } from "./training-plan.ts";

function session(date: string, i: number): PlannedSession {
  return {
    id: `s${i}`,
    date,
    status: "planned",
    activities: [
      {
        id: `a${i}`,
        activityType: "run",
        workoutType: "Easy Run",
        durationMinutes: 45,
        intensity: "easy",
        instructions: "x".repeat(2000),
        purpose: "y".repeat(2000),
        exercises: Array.from({ length: 20 }, (_, n) => ({ name: `Ex ${n}` })),
      },
    ],
  } as unknown as PlannedSession;
}

test("a 12-week block is windowed and fits the chat request limits", () => {
  const start = new Date("2026-01-01T00:00:00");
  const plan = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return session(d.toISOString().slice(0, 10), i);
  });
  const result = compactPlannerForCoach(plan, "2026-02-01");
  assert.ok(result.length > 0 && result.length <= 50);
  assert.ok(result.every((s) => s.date >= "2026-01-18" && s.date <= "2026-03-01"));
  assert.ok(JSON.stringify(result).length < 50_000);
  assert.equal(result[0].activities[0].exercises, undefined);
  assert.equal(result[0].activities[0].workoutType, "Easy Run");
  assert.deepEqual(result.map((s) => s.date), [...result.map((s) => s.date)].sort());
});
