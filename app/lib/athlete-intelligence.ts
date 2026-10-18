// Coach Memory Engine: pure functions that turn raw athlete history into
// durable, evidence-weighted memories. No I/O so it is fully unit-testable.
import type { AthleteProfile } from "./athlete-profile";
import type { RecoveryCheckIn } from "./recovery-checkin";
import type { PlannedSession } from "./training-plan";

export type MemoryType =
  | "training_consistency"
  | "recovery_trends"
  | "injury_limitation"
  | "preference"
  | "goal_progress";
export type MemorySignal = "strength" | "watch" | "trend";
export type MemoryConfidence = "Low" | "Medium" | "High";
export type MemorySource =
  | "workout_history"
  | "recovery_history"
  | "recommendation_history"
  | "plan_adherence"
  | "profile";

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  training_consistency: "Training Consistency",
  recovery_trends: "Recovery Trends",
  injury_limitation: "Injury & Limitation Patterns",
  preference: "Preference Patterns",
  goal_progress: "Goal Progress Patterns",
};

export type DerivedMemory = {
  key: string;
  type: MemoryType;
  signal: MemorySignal;
  memory: string;
  confidence: MemoryConfidence;
  evidenceCount: number;
  source: MemorySource;
};

export type StoredMemory = DerivedMemory & { id: string; updatedAt: string };

export type IntelligenceHistoryEntry = { workoutDate: string; activityType: string; duration: number };
export type IntelligenceRecommendation = {
  recommendation: string;
  status: string;
  createdAt: string;
};

export type IntelligenceInput = {
  today: string; // YYYY-MM-DD
  profile: AthleteProfile | null;
  plan: PlannedSession[];
  history: IntelligenceHistoryEntry[];
  recovery: RecoveryCheckIn[];
  recommendations: IntelligenceRecommendation[];
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toTime(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function shift(date: string, days: number): string {
  const t = new Date(toTime(date) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
function weekday(date: string): string {
  return WEEKDAYS[new Date(toTime(date)).getUTCDay()];
}
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function confidenceFor(evidence: number): MemoryConfidence {
  if (evidence >= 6) return "High";
  if (evidence >= 3) return "Medium";
  return "Low";
}

type ActivityKind = "Run" | "Ride" | "Swim" | "Strength";
const KIND_NOUN: Record<ActivityKind, string> = {
  Run: "running",
  Ride: "cycling",
  Swim: "swimming",
  Strength: "strength training",
};
const KIND_SESSION: Record<ActivityKind, string> = {
  Run: "runs",
  Ride: "rides",
  Swim: "swims",
  Strength: "strength sessions",
};

export function activityKind(text: string): ActivityKind | null {
  if (/\b(run|runs|running|jog\w*)\b/i.test(text)) return "Run";
  if (/\b(bike|biking|cycl\w*|ride|rides|riding|spin)\b/i.test(text)) return "Ride";
  if (/\bswim\w*\b/i.test(text)) return "Swim";
  if (/\b(strength|weights?|lifting|gym)\b/i.test(text)) return "Strength";
  return null;
}

function sessionKind(session: PlannedSession): ActivityKind | null {
  const main = [...session.activities].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
  if (!main) return null;
  return main.activityType === "Run" || main.activityType === "Ride" || main.activityType === "Swim" || main.activityType === "Strength"
    ? main.activityType
    : null;
}

function isRest(session: PlannedSession): boolean {
  return session.activities.length > 0 && session.activities.every((a) => a.intensity === "Rest");
}
function isHard(session: PlannedSession): boolean {
  return session.activities.some((a) => a.intensity === "Hard" || a.intensity === "Moderate");
}

function memory(
  key: string,
  type: MemoryType,
  signal: MemorySignal,
  text: string,
  evidenceCount: number,
  source: MemorySource,
  confidence: MemoryConfidence = confidenceFor(evidenceCount),
): DerivedMemory {
  return { key, type, signal, memory: text.slice(0, 300), confidence, evidenceCount, source };
}

function consistencyMemories(input: IntelligenceInput): DerivedMemory[] {
  const { today, plan } = input;
  const from = shift(today, -56);
  const due = plan.filter(
    (s) => !isRest(s) && s.date >= from && s.date < today && (s.status === "Completed" || s.status === "Missed"),
  );
  const out: DerivedMemory[] = [];
  if (due.length >= 4) {
    const done = due.filter((s) => s.status === "Completed").length;
    const rate = done / due.length;
    if (rate >= 0.8) {
      out.push(memory("consistency:overall", "training_consistency", "strength", `High workout completion rate (${done} of ${due.length} planned sessions completed)`, due.length, "plan_adherence"));
    } else if (rate < 0.6) {
      out.push(memory("consistency:overall", "training_consistency", "watch", `Completes only ${Math.round(rate * 100)}% of planned sessions (${done} of ${due.length})`, due.length, "plan_adherence"));
    }
  }

  const byDay = new Map<string, { total: number; missed: number }>();
  for (const s of due) {
    const entry = byDay.get(weekday(s.date)) ?? { total: 0, missed: 0 };
    entry.total += 1;
    if (s.status === "Missed") entry.missed += 1;
    byDay.set(weekday(s.date), entry);
  }
  for (const [day, { total, missed }] of byDay) {
    if (missed >= 2 && missed / total >= 0.5) {
      out.push(memory(`miss-day:${day}`, "training_consistency", "watch", `Frequently misses ${day} workouts (${missed} of ${total} missed)`, missed, "plan_adherence"));
    }
  }
  const reliable = [...byDay.entries()]
    .filter(([, v]) => v.total >= 3 && v.missed === 0)
    .sort((a, b) => b[1].total - a[1].total)[0];
  if (reliable) {
    out.push(memory(`reliable-day:${reliable[0]}`, "training_consistency", "strength", `Reliably completes ${reliable[0]} workouts (${reliable[1].total} of ${reliable[1].total})`, reliable[1].total, "plan_adherence"));
  }

  const byKind = new Map<ActivityKind, { total: number; missed: number }>();
  for (const s of due) {
    const kind = sessionKind(s);
    if (!kind) continue;
    const entry = byKind.get(kind) ?? { total: 0, missed: 0 };
    entry.total += 1;
    if (s.status === "Missed") entry.missed += 1;
    byKind.set(kind, entry);
  }
  for (const [kind, { total, missed }] of byKind) {
    if (missed >= 2 && missed / total >= 0.4) {
      out.push(memory(`miss-type:${kind}`, "training_consistency", "watch", `Frequent missed ${KIND_SESSION[kind]} (${missed} of ${total})`, missed, "plan_adherence"));
    }
  }
  return out;
}

function recoveryMemories(input: IntelligenceInput): DerivedMemory[] {
  const { today, recovery, plan, history } = input;
  const out: DerivedMemory[] = [];
  const checkIns = recovery.filter((c) => c.date <= today);
  if (checkIns.length < 3) return out;

  const recent = checkIns.filter((c) => c.date > shift(today, -7));
  const previous = checkIns.filter((c) => c.date > shift(today, -14) && c.date <= shift(today, -7));
  if (recent.length >= 3 && previous.length >= 3) {
    const diff = mean(recent.map((c) => c.readinessScore)) - mean(previous.map((c) => c.readinessScore));
    const n = recent.length + previous.length;
    if (diff >= 5) out.push(memory("recovery:trend", "recovery_trends", "trend", "Recovery scores are improving compared with last week", n, "recovery_history"));
    else if (diff <= -5) out.push(memory("recovery:trend", "recovery_trends", "watch", "Recovery has been declining recently", n, "recovery_history"));
  }

  const overall = mean(checkIns.map((c) => c.readinessScore));
  if (checkIns.length >= 10) {
    const byDay = new Map<string, number[]>();
    for (const c of checkIns) byDay.set(weekday(c.date), [...(byDay.get(weekday(c.date)) ?? []), c.readinessScore]);
    const worst = [...byDay.entries()]
      .filter(([, v]) => v.length >= 3 && mean(v) <= overall - 10)
      .sort((a, b) => mean(a[1]) - mean(b[1]))[0];
    if (worst) out.push(memory(`recovery-day:${worst[0]}`, "recovery_trends", "watch", `Recovery is consistently lower on ${worst[0]}s`, worst[1].length, "recovery_history"));
  }

  const hardDays = new Set(plan.filter((s) => s.status === "Completed" && isHard(s)).map((s) => s.date));
  const workoutDays = new Set([
    ...plan.filter((s) => s.status === "Completed" && !isRest(s)).map((s) => s.date),
    ...history.map((h) => h.workoutDate),
  ]);
  const afterStreak = checkIns.filter(
    (c) => hardDays.has(shift(c.date, -1)) && hardDays.has(shift(c.date, -2)) && hardDays.has(shift(c.date, -3)),
  );
  if (afterStreak.length >= 2 && mean(afterStreak.map((c) => c.readinessScore)) <= overall - 8) {
    out.push(memory("recovery:hard-streak", "recovery_trends", "watch", "Recovery drops after three hard days in a row", afterStreak.length, "recovery_history"));
  }

  const afterRest = checkIns.filter((c) => !workoutDays.has(shift(c.date, -1)));
  const afterWork = checkIns.filter((c) => workoutDays.has(shift(c.date, -1)));
  if (afterRest.length >= 3 && afterWork.length >= 3) {
    const diff = mean(afterRest.map((c) => c.readinessScore)) - mean(afterWork.map((c) => c.readinessScore));
    if (diff >= 8) out.push(memory("recovery:rest-days", "recovery_trends", "trend", "Recovery improves after rest days", afterRest.length, "recovery_history"));
  }
  return out;
}

const BODY_PARTS = ["knee", "ankle", "achilles", "calf", "shin", "hamstring", "quad", "hip", "back", "shoulder", "foot", "plantar"];

function injuryMemories(input: IntelligenceInput): DerivedMemory[] {
  const { recovery, history, profile } = input;
  const out: DerivedMemory[] = [];
  for (const part of BODY_PARTS) {
    const pattern = new RegExp(`\\b${part}\\b`, "i");
    const hits = recovery.filter((c) => c.painNotes && pattern.test(c.painNotes));
    if (hits.length < 2) continue;
    const afterLongRun = hits.filter((c) => {
      const prev = shift(c.date, -1);
      return history.some((h) => h.workoutDate === prev && activityKind(h.activityType) === "Run" && h.duration >= 60);
    }).length;
    const suffix = afterLongRun >= 2 ? " after long runs" : "";
    out.push(memory(`injury:${part}`, "injury_limitation", "watch", `Reports ${part} soreness or pain repeatedly${suffix}`, hits.length, "recovery_history"));
  }
  const soreness = profile?.recurringSoreness.trim();
  if (soreness) out.push(memory("injury:profile-soreness", "injury_limitation", "watch", `Recurring soreness noted in profile: ${soreness.slice(0, 120)}`, 6, "profile", "High"));
  const limitation = profile?.currentLimitations.trim();
  if (limitation) out.push(memory("injury:profile-limitation", "injury_limitation", "watch", `Current limitation noted in profile: ${limitation.slice(0, 120)}`, 6, "profile", "High"));
  return out;
}

function preferenceMemories(input: IntelligenceInput): DerivedMemory[] {
  const { today, history, recommendations, profile } = input;
  const out: DerivedMemory[] = [];

  const recent = history.filter((h) => h.workoutDate >= shift(today, -90) && h.workoutDate <= today);
  const counts = new Map<ActivityKind, number>();
  for (const h of recent) {
    const kind = activityKind(h.activityType);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const classified = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && classified >= 6 && top[1] / classified >= 0.5) {
    out.push(memory("pref:history-activity", "preference", "strength", `Trains most often with ${KIND_NOUN[top[0]]} (${top[1]} of ${classified} recent workouts)`, top[1], "workout_history"));
  }

  const liked = (profile?.preferredActivities ?? []).slice(0, 2);
  if (liked.length) out.push(memory("pref:profile", "preference", "strength", `Prefers ${liked.join(" and ").toLowerCase()} (from profile)`, 6, "profile", "High"));

  const decided = recommendations.filter((r) => r.status === "approved" || r.status === "rejected");
  const byKind = new Map<ActivityKind, { approved: number; total: number }>();
  let outdoor = 0;
  for (const r of decided) {
    const kind = activityKind(r.recommendation);
    if (kind) {
      const entry = byKind.get(kind) ?? { approved: 0, total: 0 };
      entry.total += 1;
      if (r.status === "approved") entry.approved += 1;
      byKind.set(kind, entry);
    }
    if (r.status === "approved" && /\b(outdoor|outside)\b/i.test(r.recommendation)) outdoor += 1;
  }
  for (const [kind, { approved, total }] of byKind) {
    if (total < 3) continue;
    if (approved / total >= 0.75) out.push(memory(`pref:rec-approve:${kind}`, "preference", "strength", `Approves ${KIND_NOUN[kind]} recommendations more often (${approved} of ${total})`, total, "recommendation_history"));
    else if (approved / total <= 0.25) out.push(memory(`pref:rec-decline:${kind}`, "preference", "watch", `Often declines ${KIND_NOUN[kind]} recommendations (${total - approved} of ${total})`, total, "recommendation_history"));
  }
  if (outdoor >= 3) out.push(memory("pref:outdoor", "preference", "strength", "Frequently chooses outdoor workouts", outdoor, "recommendation_history"));
  return out;
}

function goalMemories(input: IntelligenceInput): DerivedMemory[] {
  const { today, history, plan } = input;
  const out: DerivedMemory[] = [];

  const monday = shift(today, -((new Date(toTime(today)).getUTCDay() + 6) % 7));
  const weekly = [3, 2, 1].map((back) => {
    const start = shift(monday, -7 * back);
    const end = shift(start, 6);
    return history.filter((h) => h.workoutDate >= start && h.workoutDate <= end).reduce((n, h) => n + h.duration, 0);
  });
  const [w1, w2, w3] = weekly;
  if (w1 > 0 && w1 < w2 && w2 < w3 && w3 >= w1 * 1.15) out.push(memory("goal:volume", "goal_progress", "trend", "Weekly training volume is trending upward", 3, "workout_history"));
  else if (w3 > 0 && w1 > w2 && w2 > w3 && w1 >= w3 * 1.15) out.push(memory("goal:volume", "goal_progress", "watch", "Weekly training volume is trending down", 3, "workout_history"));

  const resolved = plan.filter((s) => !isRest(s) && (s.status === "Completed" || s.status === "Missed"));
  const inRange = (s: PlannedSession, a: number, b: number) => s.date >= shift(today, -a) && s.date < shift(today, -b);
  const recent = resolved.filter((s) => inRange(s, 14, 0));
  const previous = resolved.filter((s) => inRange(s, 28, 14));
  const missed = (list: PlannedSession[]) => list.filter((s) => s.status === "Missed").length;
  if (missed(recent) - missed(previous) >= 2) {
    out.push(memory("goal:missed-trend", "goal_progress", "watch", "Missed sessions are increasing", missed(recent), "plan_adherence"));
  }
  if (recent.length >= 3 && previous.length >= 3) {
    const rate = (list: PlannedSession[]) => 1 - missed(list) / list.length;
    if (rate(recent) - rate(previous) >= 0.2) out.push(memory("goal:consistency-trend", "goal_progress", "trend", "Consistency is improving", recent.length + previous.length, "plan_adherence"));
  }
  return out;
}

export function deriveAthleteMemories(input: IntelligenceInput): DerivedMemory[] {
  const all = [
    ...consistencyMemories(input),
    ...recoveryMemories(input),
    ...injuryMemories(input),
    ...preferenceMemories(input),
    ...goalMemories(input),
  ];
  const seen = new Set<string>();
  return all.filter((m) => !seen.has(m.key) && seen.add(m.key));
}

const WEAKER: Record<MemoryConfidence, MemoryConfidence | null> = { High: "Medium", Medium: "Low", Low: null };
const WEAKEN_AFTER_DAYS = 7;
const EXPIRE_AFTER_DAYS = 21;
const TOUCH_AFTER_DAYS = 3;

export type MemoryReconciliation = {
  upserts: DerivedMemory[];
  removeIds: string[];
};

/**
 * Evolves stored memories: same-key evidence replaces the old conclusion,
 * memories that evidence no longer supports weaken and finally expire.
 */
export function reconcileMemories(existing: StoredMemory[], derived: DerivedMemory[], now: Date): MemoryReconciliation {
  const upserts: DerivedMemory[] = [];
  const removeIds: string[] = [];
  const stored = new Map(existing.map((m) => [m.key, m]));
  const derivedKeys = new Set(derived.map((m) => m.key));

  for (const item of derived) {
    const old = stored.get(item.key);
    const age = old ? (now.getTime() - new Date(old.updatedAt).getTime()) / DAY_MS : Infinity;
    const same = old && old.memory === item.memory && old.confidence === item.confidence && old.signal === item.signal && old.evidenceCount === item.evidenceCount;
    if (!same || age >= TOUCH_AFTER_DAYS) upserts.push(item);
  }

  for (const old of existing) {
    if (derivedKeys.has(old.key)) continue;
    const age = (now.getTime() - new Date(old.updatedAt).getTime()) / DAY_MS;
    if (age >= EXPIRE_AFTER_DAYS) removeIds.push(old.id);
    else if (age >= WEAKEN_AFTER_DAYS) {
      const weaker = WEAKER[old.confidence];
      if (weaker) upserts.push({ ...old, confidence: weaker });
      else removeIds.push(old.id);
    }
  }
  return { upserts, removeIds };
}

export type AthleteInsights = {
  strengths: DerivedMemory[];
  watchAreas: DerivedMemory[];
  emerging: DerivedMemory[];
};

const CONFIDENCE_RANK: Record<MemoryConfidence, number> = { High: 3, Medium: 2, Low: 1 };

export function groupInsights(memories: DerivedMemory[], limit = 4): AthleteInsights {
  const pick = (signal: MemorySignal) =>
    memories
      .filter((m) => m.signal === signal)
      .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || b.evidenceCount - a.evidenceCount)
      .slice(0, limit);
  return { strengths: pick("strength"), watchAreas: pick("watch"), emerging: pick("trend") };
}

/** A weekday the athlete reliably completes, usable as a reschedule target. */
export function bestRescheduleDay(memories: Pick<DerivedMemory, "key">[]): string | null {
  const hit = memories.find((m) => m.key.startsWith("reliable-day:"));
  return hit ? hit.key.slice("reliable-day:".length) : null;
}
