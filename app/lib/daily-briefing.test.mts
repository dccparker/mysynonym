import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDailyBriefing,
  buildInsight,
  evaluatePlanStatus,
  greetingFor,
  isApprovalCurrent,
  trainingPhase,
  type BriefingInput,
} from "./daily-briefing.ts";

// 2026-06-10 is a Wednesday.
const TODAY = "2026-06-10";

const profile = {
  preferredName: "Sam",
  primaryGoal: "Marathon",
  customGoalName: "",
  targetEventName: "City Marathon",
  targetEventDate: "2026-09-20",
  availableTrainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"],
  preferredActivities: ["Cycling"],
  dislikedActivities: [],
  maxWeekdayWorkoutMinutes: 60,
  recurringSoreness: "",
} as unknown as BriefingInput["profile"];

const session = (id: string, date: string, status: string, minutes = 45, intensity = "Easy", type = "Ride") => ({
  id,
  day: "x",
  date,
  title: `Session ${id}`,
  notes: "",
  reason: "Keeps the week on target",
  status,
  activities: [{ activityType: type, durationMinutes: minutes, intensity, instructions: "", purpose: "Supports aerobic development" }],
});

const checkIn = (date: string, readinessScore: number) =>
  ({ date, readinessScore, energy: 3, soreness: 2, stress: 2, motivation: 3, sleepQuality: 4, sleepDurationHours: 7.5 }) as never;

const base = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  today: TODAY,
  hour: 8,
  profile,
  plan: [],
  history: [],
  recovery: [],
  memories: [],
  approvedRecommendations: [],
  ...over,
});

describe("greeting", () => {
  test("is time aware", () => {
    assert.equal(greetingFor(8, "Sam"), "Good morning, Sam");
    assert.equal(greetingFor(14, "Sam"), "Good afternoon, Sam");
    assert.equal(greetingFor(20, ""), "Good evening");
  });
});

describe("today's workout", () => {
  test("planned single-activity session reads as a headline", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", TODAY, "Planned", 45, "Moderate")], recovery: [checkIn(TODAY, 70)] }));
    assert.ok(b.ready);
    assert.equal(b.workout.headline, "45 Minute Moderate Bike");
    assert.ok(b.why.length >= 2 && b.why.length <= 4);
  });

  test("rest session is a rest day", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", TODAY, "Planned", 0, "Rest", "Other")], recovery: [checkIn(TODAY, 70)] }));
    assert.ok(b.ready);
    assert.equal(b.workout.headline, "Rest Day");
    assert.ok(b.recoveryFocus.includes("Easy walking encouraged"));
  });

  test("empty day on a training day yields one specific suggestion", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", "2026-06-12", "Planned")] }));
    assert.ok(b.ready && b.workout.kind === "suggested");
    assert.doesNotMatch(b.workout.headline, /\bor\b/i);
    assert.match(b.workout.headline, /Bike/);
  });

  test("empty day that is not a training day is a rest day", () => {
    const b = buildDailyBriefing(base({ today: "2026-06-12", plan: [session("a", "2026-06-13", "Planned")] }));
    assert.ok(b.ready);
    assert.equal(b.workout.headline, "Rest Day");
  });

  test("low readiness lowers a suggestion to recovery", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", "2026-06-12", "Planned")], recovery: [checkIn(TODAY, 20)] }));
    assert.ok(b.ready && b.workout.kind === "suggested");
    assert.match(b.workout.headline, /Recovery/);
  });
});

describe("insufficient information", () => {
  test("no profile explains what is needed", () => {
    const b = buildDailyBriefing(base({ profile: null }));
    assert.equal(b.ready, false);
    if (!b.ready) assert.ok(b.missingData.includes("Athlete profile"));
  });

  test("no plan, history or recovery explains what is needed", () => {
    const b = buildDailyBriefing(base());
    assert.equal(b.ready, false);
  });
});

describe("confidence", () => {
  const history = [1, 2, 3].map((n) => ({ workoutDate: `2026-06-0${n}`, activityType: "Ride", duration: 40 }));
  test("High with check-in, plan and history", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", TODAY, "Planned")], recovery: [checkIn(TODAY, 70)], history }));
    assert.ok(b.ready);
    assert.equal(b.confidence.level, "High");
  });
  test("Medium when only the check-in is missing", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", TODAY, "Planned")], history }));
    assert.ok(b.ready);
    assert.equal(b.confidence.level, "Medium");
  });
  test("Low when readiness is low but a hard session is planned", () => {
    const b = buildDailyBriefing(base({ plan: [session("a", TODAY, "Planned", 60, "Hard")], recovery: [checkIn(TODAY, 20)], history }));
    assert.ok(b.ready);
    assert.equal(b.confidence.level, "Low");
  });
});

describe("plan status", () => {
  test("On Track when everything due is complete", () => {
    const s = evaluatePlanStatus(base({ plan: [session("a", "2026-06-08", "Completed"), session("b", TODAY, "Planned")] }));
    assert.equal(s.label, "On Track");
  });
  test("Slightly Behind with an unadjusted missed session", () => {
    const s = evaluatePlanStatus(base({ plan: [session("a", "2026-06-08", "Missed"), session("b", TODAY, "Planned")] }));
    assert.equal(s.label, "Slightly Behind");
  });
  test("approved recommendation makes a missed session On Track", () => {
    const s = evaluatePlanStatus(
      base({
        plan: [session("a", "2026-06-08", "Missed"), session("b", TODAY, "Planned")],
        approvedRecommendations: [{ recommendation: "Makeup run", approvedAt: "2026-06-09T10:00:00Z", targetWorkoutDate: TODAY }],
      }),
    );
    assert.equal(s.label, "On Track");
    assert.match(s.explanation, /adjusted/);
  });
  test("Ahead Of Plan when a future session is already completed", () => {
    const s = evaluatePlanStatus(
      base({ plan: [session("a", "2026-06-08", "Completed"), session("b", TODAY, "Completed"), session("c", "2026-06-11", "Completed")] }),
    );
    assert.equal(s.label, "Ahead Of Plan");
  });
});

describe("insight and phase", () => {
  test("streak of three completed workouts", () => {
    const plan = ["2026-06-07", "2026-06-08", "2026-06-09"].map((d, i) => session(`s${i}`, d, "Completed"));
    assert.equal(buildInsight(base({ plan })), "You've completed 3 workouts in a row.");
  });
  test("no insight when nothing stands out", () => {
    assert.equal(buildInsight(base({ plan: [session("a", TODAY, "Planned")] })), null);
  });
  test("phase from weeks to the event", () => {
    assert.equal(trainingPhase(profile, TODAY), "Build")
    assert.equal(trainingPhase({ ...profile!, targetEventDate: "2027-03-01" }, TODAY), "Base");
    assert.equal(trainingPhase({ ...profile!, targetEventDate: "2026-06-15" }, TODAY), "Race week");
    assert.equal(trainingPhase({ ...profile!, targetEventDate: "" }, TODAY), null);
  });
});

describe("approval validity", () => {
  const approval = { planDate: TODAY, sessionId: "a", workoutSummary: "planned|a|45 Minute Easy Bike", approvedAt: "x" };
  test("matches only the same workout", () => {
    assert.equal(isApprovalCurrent(approval, "planned|a|45 Minute Easy Bike"), true);
    assert.equal(isApprovalCurrent(approval, "planned|a|60 Minute Easy Bike"), false);
    assert.equal(isApprovalCurrent(null, "x"), false);
  });
});
