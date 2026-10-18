import type { AthleteProfile } from "./athlete-profile";
import {
  deriveAthleteMemories,
  reconcileMemories,
  type DerivedMemory,
  type IntelligenceHistoryEntry,
  type StoredMemory,
} from "./athlete-intelligence";
import { loadRecoveryCheckIns } from "./recovery-checkin";
import { supabase } from "./supabase";
import type { PlannedSession } from "./training-plan";
import { loadWorkoutHistory } from "./workout-storage";

const MISSING = ["42P01", "PGRST205", "42703", "PGRST204"];
const COLUMNS = "id,memory_key,memory_type,signal,detail,confidence,evidence_count,source,updated_at";

type Row = {
  id: string;
  memory_key: string;
  memory_type: StoredMemory["type"];
  signal: StoredMemory["signal"];
  detail: string;
  confidence: StoredMemory["confidence"];
  evidence_count: number;
  source: StoredMemory["source"];
  updated_at: string;
};

const toStored = (row: Row): StoredMemory => ({
  id: row.id,
  key: row.memory_key,
  type: row.memory_type,
  signal: row.signal,
  memory: row.detail,
  confidence: row.confidence,
  evidenceCount: row.evidence_count,
  source: row.source,
  updatedAt: row.updated_at,
});

export async function loadAthleteMemories(userId: string): Promise<StoredMemory[]> {
  const { data, error } = await supabase
    .from("coach_memories")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("category", "athlete_pattern")
    .limit(100);
  if (error) {
    if (MISSING.includes(error.code ?? "")) {
      console.warn("[athlete-intelligence] Apply migration 20261022000000_athlete_intelligence_memories.sql.", error);
    } else {
      console.error("[athlete-intelligence] Could not load memories", error);
    }
    return [];
  }
  return (data as Row[]).map(toStored);
}

async function loadRecommendations(userId: string) {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("coach_recommendations")
    .select("recommendation,status,created_at")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    if (!MISSING.includes(error.code ?? "")) console.error("[athlete-intelligence] Could not load recommendations", error);
    return [];
  }
  return data.map((r) => ({ recommendation: r.recommendation as string, status: r.status as string, createdAt: r.created_at as string }));
}

/**
 * Re-derives memories from current evidence and persists changes. Returns the
 * memories now stored. Never throws: intelligence is additive to the app.
 */
export async function syncAthleteMemories(
  userId: string,
  profile: AthleteProfile | null,
  plan: PlannedSession[],
  today: string,
): Promise<StoredMemory[]> {
  try {
    const [rawHistory, recovery, recommendations, existing] = await Promise.all([
      loadWorkoutHistory(userId),
      loadRecoveryCheckIns(userId),
      loadRecommendations(userId),
      loadAthleteMemories(userId),
    ]);
    const history = (rawHistory as { workoutDate?: unknown; activityType?: unknown; duration?: unknown }[])
      .filter((h) => typeof h?.workoutDate === "string")
      .map<IntelligenceHistoryEntry>((h) => ({
        workoutDate: h.workoutDate as string,
        activityType: String(h.activityType ?? ""),
        duration: Number(h.duration) || 0,
      }));

    const derived = deriveAthleteMemories({ today, profile, plan, history, recovery, recommendations });
    const { upserts, removeIds } = reconcileMemories(existing, derived, new Date());

    if (upserts.length) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("coach_memories").upsert(
        upserts.map((m: DerivedMemory) => ({
          user_id: userId,
          category: "athlete_pattern",
          memory_key: m.key,
          memory_type: m.type,
          signal: m.signal,
          detail: m.memory,
          confidence: m.confidence,
          evidence_count: m.evidenceCount,
          source: m.source,
          updated_at: now,
        })),
        { onConflict: "user_id,memory_key" },
      );
      if (error) {
        console.error("[athlete-intelligence] Could not save memories", error);
        return existing;
      }
    }
    if (removeIds.length) {
      const { error } = await supabase.from("coach_memories").delete().in("id", removeIds);
      if (error) console.error("[athlete-intelligence] Could not expire memories", error);
    }
    return upserts.length || removeIds.length ? loadAthleteMemories(userId) : existing;
  } catch (error) {
    console.error("[athlete-intelligence] Sync failed", error);
    return [];
  }
}
