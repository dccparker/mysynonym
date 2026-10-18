// Pure decisions for keeping the browser copy of the weekly plan in step with
// the server copy. No I/O so the data-loss edge cases can be unit-tested.

export const PLAN_OWNER_KEY = "mysynonym-plan-owner";
export const PLAN_SYNCED_HASH_KEY = "mysynonym-plan-synced-hash";

export type PlanSyncAction =
  | "clear-local-and-pull" // browser copy belongs to someone else
  | "pull" // adopt the server copy
  | "push" // upload the browser copy
  | "noop";

export function hashPlan(serialized: string | null): string {
  if (!serialized) return "";
  let hash = 5381;
  for (let i = 0; i < serialized.length; i += 1) hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  return `${serialized.length}:${hash}`;
}

export type PlanSyncState = {
  userId: string;
  localOwner: string | null;
  local: string | null; // raw localStorage value
  remote: string | null; // serialized remote plan, null when none saved
  lastSyncedHash: string | null;
};

const isEmptyPlan = (value: string | null) => value === null || value.trim() === "" || value.trim() === "[]";

export function decidePlanSync(state: PlanSyncState): PlanSyncAction {
  const { userId, localOwner, local, remote, lastSyncedHash } = state;
  if (localOwner !== null && localOwner !== userId && !isEmptyPlan(local)) return "clear-local-and-pull";

  const remoteEmpty = isEmptyPlan(remote);
  const localEmpty = isEmptyPlan(local);
  if (localEmpty) return remoteEmpty ? "noop" : "pull";
  if (remoteEmpty) return "push";
  if (hashPlan(local) === hashPlan(remote)) return "noop";

  // Both exist and differ. Local edits made since the last sync win; otherwise
  // the server copy is newer (changed on another device).
  const localChanged = hashPlan(local) !== (lastSyncedHash ?? "");
  return localChanged && localOwner === userId ? "push" : "pull";
}
