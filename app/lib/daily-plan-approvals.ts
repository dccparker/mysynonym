import { supabase } from "./supabase";
import type { DailyBriefing, DailyPlanApproval } from "./daily-briefing";

export type { DailyPlanApproval };

export { isApprovalCurrent } from "./daily-briefing";


const MISSING = ["42P01", "PGRST205"];

export async function loadDailyPlanApproval(
  userId: string,
  planDate: string,
): Promise<DailyPlanApproval | null> {
  const { data, error } = await supabase
    .from("daily_plan_approvals")
    .select("plan_date,session_id,workout_summary,approved_at")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (error) {
    if (MISSING.includes(error.code ?? "")) {
      console.warn("[daily-plan] daily_plan_approvals missing; apply migration 20261021000000.", error);
      return null;
    }
    console.error("[daily-plan] Could not load approval", error);
    return null;
  }
  return data
    ? {
        planDate: data.plan_date,
        sessionId: data.session_id,
        workoutSummary: data.workout_summary,
        approvedAt: data.approved_at,
      }
    : null;
}

export async function approveDailyPlan(
  userId: string,
  planDate: string,
  briefing: Extract<DailyBriefing, { ready: true }>,
): Promise<DailyPlanApproval> {
  const row = {
    user_id: userId,
    plan_date: planDate,
    session_id: briefing.workout.sessionId,
    workout_summary: briefing.approvalKey,
    briefing: {
      workout: briefing.workout.headline,
      why: briefing.why,
      confidence: briefing.confidence.level,
      planStatus: briefing.planStatus.label,
    },
    approved_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("daily_plan_approvals")
    .upsert(row, { onConflict: "user_id,plan_date" })
    .select("plan_date,session_id,workout_summary,approved_at")
    .single();
  if (error) {
    console.error("[daily-plan] Approval failed", error);
    throw new Error(
      MISSING.includes(error.code ?? "")
        ? "Daily approvals are not set up yet. Apply the latest Supabase migrations."
        : "Could not save your approval. Please try again.",
    );
  }
  return {
    planDate: data.plan_date,
    sessionId: data.session_id,
    workoutSummary: data.workout_summary,
    approvedAt: data.approved_at,
  };
}
