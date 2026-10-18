// Pure decision helpers. Keep this file free of runtime imports so it can be
// unit-tested directly and used on both the client and the server.
import type { CoachMessage, CoachPlannerAction } from "./coach-chat-types";

const ACTIVITY_WORDS =
  "bike|biking|ride|riding|cycle|cycling|run|running|jog|jogging|swim|swimming|row|rowing|walk|walking|hike|hiking|strength|cardio|elliptical|yoga|mobility";

const ACTIVITY_PAIR = new RegExp(
  `\\b(?:${ACTIVITY_WORDS})\\s*(?:\\bor\\b|/|\\band/or\\b)\\s*(?:${ACTIVITY_WORDS})\\b`,
  "i",
);
const VAGUE_WORDING =
  /\b(cardio|anything|whatever|any (?:easy|light|gentle|activity|exercise|workout|cardio)|of your choice|your choice|something easy|something light)\b/i;

/** Returns a description of the ambiguity, or null if the text is specific. */
export function findAmbiguousText(text: string, options: { strictOr?: boolean } = {}) {
  if (options.strictOr && /\bor\b/i.test(text)) {
    return `"${text.trim()}" offers more than one option`;
  }
  const pair = ACTIVITY_PAIR.exec(text);
  if (pair) return `"${pair[0]}" offers more than one activity`;
  const vague = VAGUE_WORDING.exec(text);
  if (vague) return `"${vague[0]}" is too vague to apply as a workout`;
  return null;
}

/** Checks every text field of a replace_session action. */
export function findAmbiguousWording(action: CoachPlannerAction): string | null {
  if (action.type !== "replace_session") return null;
  const issues = [
    findAmbiguousText(action.title, { strictOr: true }),
    findAmbiguousText(action.reason),
    ...action.activities.flatMap((activity) => [
      findAmbiguousText(activity.instructions),
      findAmbiguousText(activity.purpose),
    ]),
  ];
  return issues.find((issue): issue is string => issue !== null) ?? null;
}

export function findAmbiguousSessionTitle(title: string) {
  return findAmbiguousText(title, { strictOr: true });
}

/** Stable key for "the workout this recommendation changes". */
export function targetWorkoutKey(action: CoachPlannerAction): string {
  return action.type === "regenerate_rest_of_week"
    ? `week:${action.weekStarting}`
    : action.sessionId;
}

const CHANGE_VERB =
  /\b(i recommend|i suggest|i['’]d suggest|i['’]d recommend|recommendation:|suggestion:|try|swap|replace|replacing|instead|switch|go for|how about|consider|opt for|i['’]ve revised|revised|let['’]s do|do a)\b/i;
const WORKOUT_NOUN =
  /\b(walk|hike|run|jog|ride|bike|cycle|cycling|swim|row|yoga|mobility|stretch\w*|session|workout|strength|recovery|tempo|intervals?|\d+[- ]?(?:min|minute)s?)\b/i;

export type ReplyKind = "card" | "text" | "needs_card";

/**
 * Classifies a Coach reply. A reply that proposes a different workout in text
 * without a structured proposal must be turned into a card.
 */
export function classifyCoachReply(input: {
  content: string;
  hasProposal: boolean;
  safetyBlocked: boolean;
}): ReplyKind {
  if (input.hasProposal) return "card";
  if (input.safetyBlocked) return "text";
  return CHANGE_VERB.test(input.content) && WORKOUT_NOUN.test(input.content)
    ? "needs_card"
    : "text";
}

type MessageLike = Pick<CoachMessage, "id" | "role" | "plannerProposal" | "plannerAction">;

/** The most recent proposal card that is still awaiting a decision. */
export function findActivePendingMessage<T extends MessageLike>(messages: T[]): T | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.plannerProposal) continue;
    const status = message.plannerAction?.status ?? "pending";
    return status === "pending" ? message : null;
  }
  return null;
}

/**
 * Ids of proposal messages replaced by a later proposal for the same target
 * that have not been decided, so their card cannot be approved.
 */
export function findReplacedMessageIds<T extends MessageLike>(messages: T[]): Set<string> {
  const replaced = new Set<string>();
  const latestByTarget = new Map<string, string>();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.plannerProposal) continue;
    const key = targetWorkoutKey(message.plannerProposal.action);
    if (latestByTarget.has(key)) {
      const status = message.plannerAction?.status;
      if (!status || status === "pending" || status === "superseded") replaced.add(message.id);
    } else {
      latestByTarget.set(key, message.id);
    }
  }
  return replaced;
}

export type RecommendationLike = {
  id: string;
  status: string;
  targetWorkoutId: string | null;
};

/** Pending recommendations that a new recommendation for `target` replaces. */
export function planSupersession<T extends RecommendationLike>(
  existing: T[],
  target: string,
): T[] {
  return existing.filter(
    (recommendation) =>
      recommendation.status === "pending" && recommendation.targetWorkoutId === target,
  );
}

export function canApproveStatus(status: string): { ok: true } | { ok: false; reason: string } {
  if (status === "pending") return { ok: true };
  if (status === "superseded") {
    return {
      ok: false,
      reason: "This recommendation was replaced by a newer one and can no longer be approved.",
    };
  }
  return { ok: false, reason: "This recommendation is no longer pending." };
}

type PlannerSessionLike = {
  id?: unknown;
  title?: unknown;
  date?: unknown;
  day?: unknown;
  activities?: unknown;
};

/** Plain-text description of the card the athlete currently sees. */
export function describePendingRecommendation(
  message: Pick<CoachMessage, "content" | "plannerProposal">,
  planner: unknown[],
): string {
  const action = message.plannerProposal?.action;
  if (!action) return "none";
  const lines = [`Coach reply shown with the card: ${message.content.slice(0, 400)}`];
  if (action.type === "regenerate_rest_of_week") {
    lines.push(`Proposed change: regenerate the rest of the week starting ${action.weekStarting}.`);
  } else {
    const session = planner.find(
      (item): item is PlannerSessionLike =>
        typeof item === "object" && item !== null && (item as PlannerSessionLike).id === action.sessionId,
    );
    if (session) {
      lines.push(
        `Planned session it changes (id ${action.sessionId}): ${String(session.day)} ${String(session.date)} · ${String(session.title)}.`,
      );
    }
    lines.push(`Proposed change: ${JSON.stringify(action)}`);
  }
  lines.push(
    "It is pending: not approved or rejected. The planner is unchanged until the athlete approves.",
  );
  return lines.join(" ");
}
