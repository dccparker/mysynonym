import {
  decidePlanSync,
  hashPlan,
  PLAN_OWNER_KEY,
  PLAN_SYNCED_HASH_KEY,
} from "./plan-sync";
import { supabase } from "./supabase";
import { TRAINING_PLAN_STORAGE_KEY, notifyTrainingPlanUpdated } from "./workout-storage";

const ACTIVE_CONVERSATION_KEY = "mysynonym-coach-active-conversation";
const MISSING = ["42P01", "PGRST205"];

let missingTableWarned = false;

function warnMissing(error: { code?: string }) {
  if (missingTableWarned) return;
  missingTableWarned = true;
  console.warn("[plan-sync] training_plans is missing; apply migration 20261023000000_create_training_plans.sql.", error);
}

/** Removes per-user browser data so the next account never sees it. */
export function clearLocalAthleteData(): void {
  [TRAINING_PLAN_STORAGE_KEY, PLAN_OWNER_KEY, PLAN_SYNCED_HASH_KEY, ACTIVE_CONVERSATION_KEY].forEach((key) =>
    window.localStorage.removeItem(key),
  );
}

async function pushPlan(userId: string, local: string): Promise<boolean> {
  let plan: unknown;
  try {
    plan = JSON.parse(local);
  } catch {
    return false;
  }
  if (!Array.isArray(plan)) return false;
  const { error } = await supabase
    .from("training_plans")
    .upsert({ user_id: userId, plan, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    if (MISSING.includes(error.code ?? "")) warnMissing(error);
    else console.error("[plan-sync] Could not back up the training plan", error);
    return false;
  }
  window.localStorage.setItem(PLAN_SYNCED_HASH_KEY, hashPlan(local));
  window.localStorage.setItem(PLAN_OWNER_KEY, userId);
  return true;
}

/**
 * Reconciles the browser plan with the server copy for the signed-in athlete.
 * Never throws; failures leave the browser copy untouched.
 */
export async function syncTrainingPlan(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("training_plans")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (MISSING.includes(error.code ?? "")) warnMissing(error);
      else console.error("[plan-sync] Could not load the training plan", error);
      return;
    }
    const remote = data ? JSON.stringify(data.plan) : null;
    const local = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
    const action = decidePlanSync({
      userId,
      localOwner: window.localStorage.getItem(PLAN_OWNER_KEY),
      local,
      remote,
      lastSyncedHash: window.localStorage.getItem(PLAN_SYNCED_HASH_KEY),
    });

    if (action === "push" && local) {
      await pushPlan(userId, local);
      return;
    }
    if (action === "clear-local-and-pull") window.localStorage.removeItem(TRAINING_PLAN_STORAGE_KEY);
    if (action === "pull" || action === "clear-local-and-pull") {
      if (remote) window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, remote);
      window.localStorage.setItem(PLAN_SYNCED_HASH_KEY, hashPlan(remote));
      window.localStorage.setItem(PLAN_OWNER_KEY, userId);
      notifyTrainingPlanUpdated();
      return;
    }
    window.localStorage.setItem(PLAN_OWNER_KEY, userId);
    window.localStorage.setItem(PLAN_SYNCED_HASH_KEY, hashPlan(local));
  } catch (syncError) {
    console.error("[plan-sync] Sync failed", syncError);
  }
}

/** Uploads the browser plan if it changed since the last sync. */
export async function pushPlanIfChanged(userId: string): Promise<void> {
  const local = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
  if (!local || local.trim() === "[]") return;
  if (hashPlan(local) === window.localStorage.getItem(PLAN_SYNCED_HASH_KEY)) return;
  if (window.localStorage.getItem(PLAN_OWNER_KEY) !== userId) return;
  await pushPlan(userId, local);
}
