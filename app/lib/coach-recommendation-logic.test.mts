import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canApproveStatus,
  classifyCoachReply,
  describePendingRecommendation,
  findActivePendingMessage,
  findAmbiguousText,
  findAmbiguousWording,
  findReplacedMessageIds,
  planSupersession,
  targetWorkoutKey,
  type RecommendationLike,
} from "./coach-recommendation-logic.ts";

type Msg = Parameters<typeof findActivePendingMessage>[0][number];

const replaceAction = (sessionId: string, title: string, instructions = "Steady effort.") => ({
  type: "replace_session" as const,
  sessionId,
  title,
  reason: "Weather changed.",
  activities: [
    {
      activityType: "Ride" as const,
      durationMinutes: 45,
      intensity: "Moderate" as const,
      instructions,
      purpose: "Aerobic work.",
    },
  ],
});

const card = (id: string, sessionId: string, status?: string): Msg =>
  ({
    id,
    role: "assistant",
    content: "Recommendation: 45-minute moderate indoor bike.",
    plannerProposal: {
      action: replaceAction(sessionId, "Indoor bike"),
      rationale: "x",
      assumptions: [],
      tradeOffs: [],
      expectedEffects: [],
    },
    ...(status ? { plannerAction: { status } } : {}),
  }) as unknown as Msg;

const user = (id: string): Msg => ({ id, role: "user" }) as Msg;

describe("card versus plain-text classification", () => {
  test("a proposal is always a card", () => {
    assert.equal(
      classifyCoachReply({ content: "anything", hasProposal: true, safetyBlocked: false }),
      "card",
    );
  });
  test("a text-only workout suggestion needs a card", () => {
    for (const content of [
      "I suggest a 30-minute recovery walk outside instead.",
      "Recommendation: swap today's session for an easy yoga flow.",
      "How about a short mobility session?",
    ]) {
      assert.equal(
        classifyCoachReply({ content, hasProposal: false, safetyBlocked: false }),
        "needs_card",
        content,
      );
    }
  });
  test("informational replies stay text", () => {
    for (const content of [
      "Today's session is a 30 minute recovery workout designed to promote blood flow.",
      "Your recovery score looks steady this week.",
    ]) {
      assert.equal(
        classifyCoachReply({ content, hasProposal: false, safetyBlocked: false }),
        "text",
        content,
      );
    }
  });
  test("safety conversations may stay text", () => {
    assert.equal(
      classifyCoachReply({
        content: "I suggest you rest and see a physio.",
        hasProposal: false,
        safetyBlocked: true,
      }),
      "text",
    );
  });
});

describe("ambiguous workout rejection", () => {
  test("rejects option titles", () => {
    for (const title of [
      "Moderate Intensity Bike or Run – 45 min",
      "Swim or Cycle",
      "Bike/Run",
      "Easy cardio",
      "Anything easy",
    ]) {
      assert.ok(findAmbiguousWording(replaceAction("s1", title)), title);
    }
  });
  test("rejects option wording in instructions", () => {
    assert.ok(findAmbiguousWording(replaceAction("s1", "Indoor bike", "Ride or run at an easy pace")));
  });
  test("accepts specific workouts", () => {
    for (const title of ["45-minute moderate indoor bike", "Outdoor recovery walk", "Easy run"]) {
      assert.equal(findAmbiguousWording(replaceAction("s1", title)), null, title);
    }
    assert.equal(findAmbiguousText("Cardiovascular base work"), null);
  });
  test("non-replacement actions have no wording to reject", () => {
    assert.equal(
      findAmbiguousWording({ type: "move_session", sessionId: "s1", targetDate: "2026-10-20" }),
      null,
    );
  });
});

describe("pending recommendation lookup", () => {
  test("finds the latest undecided card", () => {
    const messages = [user("u1"), card("a1", "s1"), user("u2")];
    assert.equal(findActivePendingMessage(messages)?.id, "a1");
  });
  test("a decided latest card means nothing is pending", () => {
    for (const status of ["applied", "rejected", "approved", "stale", "superseded"]) {
      assert.equal(findActivePendingMessage([card("a1", "s1", status)]), null, status);
    }
  });
  test("a saved pending card is pending", () => {
    assert.equal(findActivePendingMessage([card("a1", "s1", "pending")])?.id, "a1");
  });
  test("no cards", () => {
    assert.equal(findActivePendingMessage([user("u1")]), null);
  });
  test("describes the pending card with the planned session", () => {
    const text = describePendingRecommendation(
      card("a1", "s1") as never,
      [{ id: "s1", title: "Recovery Session", date: "2026-10-18", day: "Sunday" }],
    );
    assert.match(text, /Recovery Session/);
    assert.match(text, /pending/);
  });
});

describe("superseding and replacement", () => {
  test("a later card for the same workout replaces the earlier undecided one", () => {
    const messages = [card("a1", "s1"), user("u1"), card("a2", "s1")];
    assert.deepEqual([...findReplacedMessageIds(messages)], ["a1"]);
  });
  test("cards for different workouts do not replace each other", () => {
    assert.equal(findReplacedMessageIds([card("a1", "s1"), card("a2", "s2")]).size, 0);
  });
  test("a decided earlier card is never shown as replaced", () => {
    const messages = [card("a1", "s1", "applied"), card("a2", "s1")];
    assert.equal(findReplacedMessageIds(messages).size, 0);
  });
  test("a stored superseded card stays replaced", () => {
    assert.ok(findReplacedMessageIds([card("a1", "s1", "superseded"), card("a2", "s1")]).has("a1"));
  });
  test("week regeneration targets the week", () => {
    assert.equal(targetWorkoutKey({ type: "regenerate_rest_of_week", weekStarting: "2026-10-12" }), "week:2026-10-12");
  });
});

describe("approval prevention", () => {
  test("only pending can be approved", () => {
    assert.deepEqual(canApproveStatus("pending"), { ok: true });
    const superseded = canApproveStatus("superseded");
    assert.equal(superseded.ok, false);
    assert.match(superseded.ok ? "" : superseded.reason, /replaced by a newer/);
    for (const status of ["approved", "rejected", "expired"]) {
      assert.equal(canApproveStatus(status).ok, false, status);
    }
  });
});

describe("one pending recommendation per target workout", () => {
  // In-memory mirror of the database unique index and the supersede-then-insert flow.
  function create(store: (RecommendationLike & { supersededBy?: string; source?: string })[], id: string, target: string) {
    const replaced = planSupersession(store, target);
    for (const old of replaced) {
      old.status = "superseded";
      old.supersededBy = id;
    }
    store.push({ id, status: "pending", targetWorkoutId: target, source: replaced[0]?.id });
    return store;
  }
  const pendingFor = (store: RecommendationLike[], target: string) =>
    store.filter((item) => item.status === "pending" && item.targetWorkoutId === target);

  test("a revision supersedes the old recommendation and links both", () => {
    const store: ReturnType<typeof Array<RecommendationLike & { supersededBy?: string; source?: string }>> = [];
    create(store, "r1", "s1");
    create(store, "r2", "s1");
    assert.equal(pendingFor(store, "s1").length, 1);
    assert.equal(store[0].status, "superseded");
    assert.equal(store[0].supersededBy, "r2");
    assert.equal(store[1].source, "r1");
    assert.equal(store.length, 2);
  });
  test("repeated revisions keep a single pending row", () => {
    const store: RecommendationLike[] = [];
    for (const id of ["r1", "r2", "r3", "r4"]) create(store, id, "s1");
    assert.equal(pendingFor(store, "s1").length, 1);
    assert.equal(store.filter((item) => item.status === "superseded").length, 3);
  });
  test("different workouts stay independent", () => {
    const store: RecommendationLike[] = [];
    create(store, "r1", "s1");
    create(store, "r2", "s2");
    assert.equal(pendingFor(store, "s1").length, 1);
    assert.equal(pendingFor(store, "s2").length, 1);
  });
  test("decided recommendations are not superseded", () => {
    const store: RecommendationLike[] = [{ id: "r0", status: "approved", targetWorkoutId: "s1" }];
    create(store, "r1", "s1");
    assert.equal(store[0].status, "approved");
  });
});
