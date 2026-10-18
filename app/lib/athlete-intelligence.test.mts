import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bestRescheduleDay,
  confidenceFor,
  deriveAthleteMemories,
  groupInsights,
  reconcileMemories,
  type DerivedMemory,
  type IntelligenceInput,
  type StoredMemory,
} from "./athlete-intelligence.ts";

const TODAY = "2026-06-10"; // Wednesday

const session = (date: string, status: string, type = "Run", intensity = "Easy", minutes = 40) =>
  ({
    id: `s-${date}`,
    day: "x",
    date,
    title: "t",
    notes: "",
    reason: "",
    status,
    activities: [{ activityType: type, durationMinutes: minutes, intensity, instructions: "", purpose: "" }],
  }) as never;

const checkIn = (date: string, readinessScore: number, painNotes?: string) =>
  ({ date, readinessScore, painNotes }) as never;

const input = (over: Partial<IntelligenceInput> = {}): IntelligenceInput => ({
  today: TODAY,
  profile: null,
  plan: [],
  history: [],
  recovery: [],
  recommendations: [],
  ...over,
});

const find = (list: DerivedMemory[], key: string) => list.find((m) => m.key === key);

describe("confidence from evidence", () => {
  test("scales with amount of evidence", () => {
    assert.equal(confidenceFor(2), "Low");
    assert.equal(confidenceFor(3), "Medium");
    assert.equal(confidenceFor(6), "High");
  });
});

describe("training consistency", () => {
  const fridays = ["2026-05-15", "2026-05-22", "2026-05-29", "2026-06-05"];
  const plan = [
    ...fridays.map((d, i) => session(d, i === 0 ? "Completed" : "Missed")),
    session("2026-06-06", "Completed"),
    session("2026-05-30", "Completed"),
    session("2026-05-23", "Completed"),
  ];

  test("detects a weekday that is frequently missed", () => {
    const m = find(deriveAthleteMemories(input({ plan })), "miss-day:Friday");
    assert.ok(m);
    assert.equal(m.signal, "watch");
    assert.equal(m.evidenceCount, 3);
    assert.match(m.memory, /Frequently misses Friday/);
  });

  test("detects a reliable day to reschedule to", () => {
    const derived = deriveAthleteMemories(input({ plan }));
    assert.equal(bestRescheduleDay(derived), "Saturday");
  });

  test("detects frequent missed runs", () => {
    assert.ok(find(deriveAthleteMemories(input({ plan })), "miss-type:Run"));
  });

  test("high completion rate becomes a strength", () => {
    const done = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"].map((d) => session(d, "Completed"));
    const m = find(deriveAthleteMemories(input({ plan: done })), "consistency:overall");
    assert.equal(m?.signal, "strength");
  });

  test("too little evidence produces no memory", () => {
    assert.equal(deriveAthleteMemories(input({ plan: [session("2026-06-05", "Missed")] })).length, 0);
  });
});

describe("recovery trends", () => {
  test("improving week over week is an emerging trend", () => {
    const recovery = [
      ...["2026-06-04", "2026-06-05", "2026-06-06", "2026-06-08"].map((d) => checkIn(d, 75)),
      ...["2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"].map((d) => checkIn(d, 55)),
    ];
    const m = find(deriveAthleteMemories(input({ recovery })), "recovery:trend");
    assert.equal(m?.signal, "trend");
    assert.match(m!.memory, /improving/);
  });

  test("declining recovery is a watch area", () => {
    const recovery = [
      ...["2026-06-04", "2026-06-05", "2026-06-06"].map((d) => checkIn(d, 45)),
      ...["2026-05-28", "2026-05-29", "2026-05-30"].map((d) => checkIn(d, 70)),
    ];
    assert.equal(find(deriveAthleteMemories(input({ recovery })), "recovery:trend")?.signal, "watch");
  });
});

describe("injury and limitation patterns", () => {
  test("repeated knee notes after long runs", () => {
    const recovery = [checkIn("2026-06-02", 60, "Left knee sore"), checkIn("2026-06-06", 60, "knee ache again")];
    const history = [
      { workoutDate: "2026-06-01", activityType: "Run", duration: 90 },
      { workoutDate: "2026-06-05", activityType: "Running", duration: 75 },
    ];
    const m = find(deriveAthleteMemories(input({ recovery, history })), "injury:knee");
    assert.ok(m);
    assert.match(m.memory, /after long runs/);
  });

  test("a single mention is not a pattern", () => {
    assert.equal(find(deriveAthleteMemories(input({ recovery: [checkIn("2026-06-02", 60, "knee sore")] })), "injury:knee"), undefined);
  });
});

describe("preference patterns", () => {
  test("approves bike recommendations more often", () => {
    const recommendations = ["45 minute indoor bike", "30 minute easy bike", "Bike ride 60 min", "Easy run 30 min"].map((r, i) => ({
      recommendation: r,
      status: i === 3 ? "rejected" : "approved",
      createdAt: "2026-06-01T00:00:00Z",
    }));
    const derived = deriveAthleteMemories(input({ recommendations }));
    assert.ok(find(derived, "pref:rec-approve:Ride"));
  });

  test("history dominated by one activity", () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ workoutDate: `2026-06-0${i + 1}`, activityType: "Cycling", duration: 45 }));
    assert.match(find(deriveAthleteMemories(input({ history })), "pref:history-activity")!.memory, /cycling/);
  });
});

describe("goal progress", () => {
  test("volume trending upward over three weeks", () => {
    const history = [
      { workoutDate: "2026-05-19", activityType: "Run", duration: 100 },
      { workoutDate: "2026-05-26", activityType: "Run", duration: 130 },
      { workoutDate: "2026-06-02", activityType: "Run", duration: 170 },
    ];
    assert.equal(find(deriveAthleteMemories(input({ history })), "goal:volume")?.signal, "trend");
  });

  test("missed sessions increasing", () => {
    const plan = [
      session("2026-06-08", "Missed"),
      session("2026-06-05", "Missed"),
      session("2026-06-02", "Completed"),
      session("2026-05-20", "Completed"),
    ];
    assert.ok(find(deriveAthleteMemories(input({ plan })), "goal:missed-trend"));
  });
});

describe("memory evolution", () => {
  const stored = (key: string, daysOld: number, confidence: StoredMemory["confidence"], memory = "m"): StoredMemory => ({
    id: key,
    key,
    type: "training_consistency",
    signal: "watch",
    memory,
    confidence,
    evidenceCount: 3,
    source: "plan_adherence",
    updatedAt: new Date(Date.now() - daysOld * 86_400_000).toISOString(),
  });
  const derived = (key: string, memory: string): DerivedMemory => ({
    key, type: "training_consistency", signal: "strength", memory, confidence: "High", evidenceCount: 6, source: "plan_adherence",
  });

  test("new evidence replaces the old conclusion with the same key", () => {
    const r = reconcileMemories([stored("consistency:overall", 1, "Medium", "old")], [derived("consistency:overall", "new")], new Date());
    assert.equal(r.upserts[0].memory, "new");
    assert.equal(r.upserts[0].signal, "strength");
    assert.equal(r.removeIds.length, 0);
  });

  test("unchanged recent memories are not rewritten", () => {
    const s = stored("k", 1, "High", "same");
    const d = { ...derived("k", "same"), signal: "watch" as const, evidenceCount: 3 };
    assert.equal(reconcileMemories([s], [d], new Date()).upserts.length, 0);
  });

  test("unsupported memories weaken, then expire", () => {
    const weakened = reconcileMemories([stored("a", 8, "High")], [], new Date());
    assert.equal(weakened.upserts[0].confidence, "Medium");
    assert.deepEqual(reconcileMemories([stored("b", 8, "Low")], [], new Date()).removeIds, ["b"]);
    assert.deepEqual(reconcileMemories([stored("c", 30, "High")], [], new Date()).removeIds, ["c"]);
    assert.equal(reconcileMemories([stored("d", 2, "High")], [], new Date()).upserts.length, 0);
  });
});

describe("insight grouping", () => {
  test("splits by signal and ranks by confidence", () => {
    const mk = (key: string, signal: DerivedMemory["signal"], confidence: DerivedMemory["confidence"]): DerivedMemory => ({
      key, type: "preference", signal, memory: key, confidence, evidenceCount: 1, source: "profile",
    });
    const g = groupInsights([mk("a", "strength", "Low"), mk("b", "strength", "High"), mk("c", "watch", "Medium"), mk("d", "trend", "Low")]);
    assert.deepEqual(g.strengths.map((m) => m.key), ["b", "a"]);
    assert.equal(g.watchAreas.length, 1);
    assert.equal(g.emerging.length, 1);
  });
});

describe("personalization", () => {
  test("different histories yield different memories", () => {
    const a = deriveAthleteMemories(input({ plan: ["2026-05-22", "2026-05-29", "2026-06-05"].map((d) => session(d, "Missed")).concat([session("2026-06-01", "Completed")]) }));
    const b = deriveAthleteMemories(input({ plan: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map((d) => session(d, "Completed")) }));
    assert.notDeepEqual(a.map((m) => m.key), b.map((m) => m.key));
  });
});
