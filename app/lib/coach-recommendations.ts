import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachPlannerAction } from "./coach-chat-types";
import { splitProposalDetails } from "./coach-chat-types";
import type { CoachPlannerProposal } from "./coach-chat-types";
import type {
  CoachRecommendation,
  RecommendationChange,
  RecommendationConfidence,
  RecommendationImpact,
  RecommendationPlanChanges,
  RecommendationStatus,
  RecommendationType,
} from "./coach-recommendation-types";
import {
  isRecommendationConfidence,
  isRecommendationType,
} from "./coach-recommendation-types";
import { isMissingStorageError } from "./planner-storage-check";
import { canApproveStatus, targetWorkoutKey } from "./coach-recommendation-logic";
import type { PlannedSession } from "./training-plan";

type RecommendationRow = {
  id: string;
  user_id: string;
  planner_action_id: string | null;
  recommendation_type: string;
  recommendation: string;
  reasoning: unknown;
  impact: unknown;
  confidence: string;
  status: RecommendationStatus;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  plan_changes: RecommendationPlanChanges | null;
  superseded_at: string | null;
  superseded_by_recommendation_id: string | null;
  source_recommendation_id: string | null;
  target_workout_id: string | null;
  target_workout_date: string | null;
};

const COLUMNS =
  "id,user_id,planner_action_id,recommendation_type,recommendation,reasoning,impact,confidence,status,created_at,approved_at,rejected_at,plan_changes,superseded_at,superseded_by_recommendation_id,source_recommendation_id,target_workout_id,target_workout_date";

export class RecommendationSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendationSupersededError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toRecommendation(row: RecommendationRow): CoachRecommendation {
  const impact =
    typeof row.impact === "object" && row.impact !== null
      ? (row.impact as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    userId: row.user_id,
    plannerActionId: row.planner_action_id,
    recommendationType: isRecommendationType(row.recommendation_type)
      ? row.recommendation_type
      : "training_load_adjustment",
    recommendation: row.recommendation,
    reasoning: Array.isArray(row.reasoning)
      ? row.reasoning.filter((line): line is string => typeof line === "string")
      : [],
    impact: {
      weeklyVolume: text(impact.weeklyVolume),
      recovery: text(impact.recovery),
      fitnessProgression: text(impact.fitnessProgression),
      goalProgression: text(impact.goalProgression),
    },
    confidence: isRecommendationConfidence(row.confidence) ? row.confidence : "medium",
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    planChanges: row.plan_changes,
    supersededAt: row.superseded_at,
    supersededByRecommendationId: row.superseded_by_recommendation_id,
    sourceRecommendationId: row.source_recommendation_id,
    targetWorkoutId: row.target_workout_id,
    targetWorkoutDate: row.target_workout_date,
  };
}

function minutes(session: PlannedSession) {
  return session.activities.reduce((total, activity) => total + activity.durationMinutes, 0);
}

function describeSession(session: PlannedSession) {
  const intensities = [...new Set(session.activities.map((activity) => activity.intensity))].join("/");
  return `${session.date} (${session.day}) · ${session.title} · ${minutes(session)} min · ${intensities}`;
}

/** Diffs two planner snapshots into target-agnostic change records. */
export function buildTrainingPlanChanges(
  action: CoachPlannerAction,
  before: PlannedSession[],
  after: PlannedSession[],
  appliedAt?: string,
): RecommendationPlanChanges {
  const beforeById = new Map(before.map((session) => [session.id, session]));
  const afterById = new Map(after.map((session) => [session.id, session]));
  const changes: RecommendationChange[] = [];
  for (const session of after) {
    const previous = beforeById.get(session.id);
    if (!previous) {
      changes.push({
        target: "training_plan",
        entityId: session.id,
        summary: `Added ${session.day}: ${session.title}`,
        before: null,
        after: describeSession(session),
      });
    } else if (JSON.stringify(previous) !== JSON.stringify(session)) {
      changes.push({
        target: "training_plan",
        entityId: session.id,
        summary: `Updated ${session.day}: ${session.title}`,
        before: describeSession(previous),
        after: describeSession(session),
      });
    }
  }
  for (const session of before) {
    if (!afterById.has(session.id)) {
      changes.push({
        target: "training_plan",
        entityId: session.id,
        summary: `Removed ${session.day}: ${session.title}`,
        before: describeSession(session),
        after: null,
      });
    }
  }
  return { target: "training_plan", action, changes, ...(appliedAt ? { appliedAt } : {}) };
}

export function approvalMessage(changes: RecommendationPlanChanges | null) {
  const names = [
    ...new Set(
      (changes?.changes ?? []).map((change) => {
        const match = /^(?:Added|Updated|Removed) (\w+):/.exec(change.summary);
        return match ? `${match[1]}'s` : "";
      }),
    ),
  ].filter(Boolean);
  if (names.length === 1) {
    return `Recommendation approved. ${names[0]} workout has been updated.`;
  }
  if (names.length > 1) {
    return `Recommendation approved. ${names.length} workouts have been updated.`;
  }
  return "Recommendation approved. Your training plan has been updated.";
}

export const REJECTION_MESSAGE = "No changes were made to your training plan.";

export function proposalToRecommendationFields(
  proposal: CoachPlannerProposal,
  coachMessage: string,
): {
  recommendationType: RecommendationType;
  confidence: RecommendationConfidence;
  impact: RecommendationImpact;
  reasoning: string[];
  recommendation: string;
} {
  const details = splitProposalDetails(proposal);
  const recommendation = coachMessage
    .replace(/^\s*Recommendation:\s*/i, "")
    .trim()
    .slice(0, 2000);
  return {
    recommendationType: details.recommendationType ?? "training_load_adjustment",
    confidence: details.confidence ?? "medium",
    impact: details.impact,
    reasoning: details.why,
    recommendation: recommendation || details.why[0] || "Training plan adjustment",
  };
}

export type SupersededRecords = {
  plannerActionIds: string[];
  recommendationIds: string[];
};

export function targetFor(action: CoachPlannerAction, plan: PlannedSession[]) {
  const id = targetWorkoutKey(action);
  const date =
    action.type === "regenerate_rest_of_week"
      ? action.weekStarting
      : (plan.find((session) => session.id === action.sessionId)?.date ?? null);
  return { id, date };
}

/**
 * Marks every pending planner action and recommendation for the same target
 * workout as superseded so they can no longer be approved.
 */
export async function supersedePendingForTarget(
  supabase: SupabaseClient,
  userId: string,
  action: CoachPlannerAction,
  excludeActionId?: string,
): Promise<SupersededRecords> {
  const target = targetWorkoutKey(action);
  const path = action.type === "regenerate_rest_of_week" ? "action->>weekStarting" : "action->>sessionId";
  const value = action.type === "regenerate_rest_of_week" ? action.weekStarting : action.sessionId;
  const now = new Date().toISOString();

  const { data: actions, error: actionsError } = await supabase
    .from("coach_planner_actions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq(path, value);
  if (actionsError) throw actionsError;
  const plannerActionIds = ((actions ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter((id) => id !== excludeActionId);
  if (plannerActionIds.length) {
    const { error } = await supabase
      .from("coach_planner_actions")
      .update({ status: "superseded" })
      .in("id", plannerActionIds)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
  }

  let recommendationIds: string[] = [];
  const { data: recommendations, error: recommendationsError } = await supabase
    .from("coach_recommendations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("target_workout_id", target);
  if (recommendationsError) {
    // History is optional until migrated; planner actions are already closed.
    if (!isMissingStorageError(recommendationsError)) throw recommendationsError;
  } else {
    recommendationIds = ((recommendations ?? []) as { id: string }[]).map((row) => row.id);
    if (recommendationIds.length) {
      const { error } = await supabase
        .from("coach_recommendations")
        .update({ status: "superseded", superseded_at: now })
        .in("id", recommendationIds)
        .eq("user_id", userId)
        .eq("status", "pending");
      if (error) throw error;
    }
  }
  return { plannerActionIds, recommendationIds };
}

/** Undo supersession when the replacement could not be saved. */
export async function restoreSuperseded(
  supabase: SupabaseClient,
  userId: string,
  records: SupersededRecords,
): Promise<void> {
  if (records.plannerActionIds.length) {
    await supabase
      .from("coach_planner_actions")
      .update({ status: "pending" })
      .in("id", records.plannerActionIds)
      .eq("user_id", userId)
      .eq("status", "superseded");
  }
  if (records.recommendationIds.length) {
    await supabase
      .from("coach_recommendations")
      .update({ status: "pending", superseded_at: null })
      .in("id", records.recommendationIds)
      .eq("user_id", userId)
      .eq("status", "superseded")
      .is("superseded_by_recommendation_id", null);
  }
}

export async function createRecommendation(
  supabase: SupabaseClient,
  input: {
    userId: string;
    plannerActionId: string;
    proposal: CoachPlannerProposal;
    coachMessage: string;
    beforePlan: PlannedSession[];
    afterPlan: PlannedSession[];
    superseded?: SupersededRecords;
  },
): Promise<void> {
  const fields = proposalToRecommendationFields(input.proposal, input.coachMessage);
  const target = targetFor(input.proposal.action, input.beforePlan);
  const sourceId = input.superseded?.recommendationIds[0] ?? null;
  const { data, error } = await supabase
    .from("coach_recommendations")
    .insert({
      user_id: input.userId,
      planner_action_id: input.plannerActionId,
      recommendation_type: fields.recommendationType,
      target: "training_plan",
      recommendation: fields.recommendation,
      reasoning: fields.reasoning,
      impact: fields.impact,
      confidence: fields.confidence,
      status: "pending",
      target_workout_id: target.id,
      target_workout_date: target.date,
      source_recommendation_id: sourceId,
      plan_changes: buildTrainingPlanChanges(
        input.proposal.action,
        input.beforePlan,
        input.afterPlan,
      ),
    })
    .select("id")
    .single();
  if (error) {
    // 23505 on planner_action_id means it was already recorded; the
    // one-pending-per-target index must still surface.
    if (error.code === "23505" && !error.message.includes("one_pending_per_target")) return;
    throw error;
  }
  const ids = input.superseded?.recommendationIds ?? [];
  if (data && ids.length) {
    const { error: linkError } = await supabase
      .from("coach_recommendations")
      .update({ superseded_by_recommendation_id: (data as { id: string }).id })
      .in("id", ids)
      .eq("user_id", input.userId);
    if (linkError) throw linkError;
  }
}

/** Throws if the recommendation was replaced, so a stale card cannot be approved. */
export async function assertRecommendationApprovable(
  supabase: SupabaseClient,
  userId: string,
  plannerActionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("coach_recommendations")
    .select("status")
    .eq("user_id", userId)
    .eq("planner_action_id", plannerActionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const status = (data as { status: string }).status;
  if (status === "superseded") {
    const verdict = canApproveStatus(status);
    throw new RecommendationSupersededError(verdict.ok ? "" : verdict.reason);
  }
}

export async function approveRecommendation(
  supabase: SupabaseClient,
  userId: string,
  plannerActionId: string,
  planChanges: RecommendationPlanChanges,
): Promise<void> {
  const { error } = await supabase
    .from("coach_recommendations")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      plan_changes: planChanges,
    })
    .eq("user_id", userId)
    .eq("planner_action_id", plannerActionId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function recordRecommendationApplied(
  supabase: SupabaseClient,
  userId: string,
  plannerActionId: string,
  planChanges: RecommendationPlanChanges,
): Promise<void> {
  const { error } = await supabase
    .from("coach_recommendations")
    .update({ plan_changes: planChanges })
    .eq("user_id", userId)
    .eq("planner_action_id", plannerActionId)
    .eq("status", "approved");
  if (error) throw error;
}

export async function rejectRecommendation(
  supabase: SupabaseClient,
  userId: string,
  plannerActionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("coach_recommendations")
    .update({ status: "rejected", rejected_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("planner_action_id", plannerActionId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function expireRecommendation(
  supabase: SupabaseClient,
  userId: string,
  plannerActionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("coach_recommendations")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("planner_action_id", plannerActionId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function listRecommendations(
  supabase: SupabaseClient,
  limit = 100,
): Promise<CoachRecommendation[]> {
  const { data, error } = await supabase
    .from("coach_recommendations")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as RecommendationRow[]).map(toRecommendation);
}
