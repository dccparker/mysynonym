"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAthleteProfile } from "../lib/athlete-profile";
import { buildDailyBriefing, type BriefingMemory, type DailyBriefing } from "../lib/daily-briefing";
import {
  approveDailyPlan,
  isApprovalCurrent,
  loadDailyPlanApproval,
  type DailyPlanApproval,
} from "../lib/daily-plan-approvals";
import { loadRecoveryCheckIns, localRecoveryDate, RECOVERY_CHECKINS_UPDATED_EVENT, type RecoveryCheckIn } from "../lib/recovery-checkin";
import { supabase } from "../lib/supabase";
import { normalizeTrainingPlan, type PlannedSession } from "../lib/training-plan";
import {
  loadWorkoutHistory,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  WORKOUTS_UPDATED_EVENT,
} from "../lib/workout-storage";

type Ready = Extract<DailyBriefing, { ready: true }>;

const LEVEL_STYLE = {
  High: "text-[#b8f36b]",
  Medium: "text-amber-300",
  Low: "text-red-300",
} as const;

const STATUS_STYLE = {
  "On Track": "text-[#b8f36b]",
  "Slightly Behind": "text-amber-300",
  "Ahead Of Plan": "text-sky-300",
} as const;

export function readPlan(): PlannedSession[] {
  try {
    const raw = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
    return (raw ? normalizeTrainingPlan(JSON.parse(raw)) : null) ?? [];
  } catch {
    return [];
  }
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm text-white/75">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="text-[#b8f36b]">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.07] pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">{title}</h3>
      {children}
    </section>
  );
}

export function DailyCoachingPlan() {
  const { profile, isProfileLoaded } = useAthleteProfile();
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [approval, setApproval] = useState<DailyPlanApproval | null>(null);
  const [today, setToday] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isProfileLoaded) return;
    const now = new Date();
    const date = localRecoveryDate(now);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    setToday(date);

    let history: Awaited<ReturnType<typeof loadWorkoutHistory>> = [];
    let recovery: RecoveryCheckIn[] = [];
    try {
      [history, recovery] = await Promise.all([loadWorkoutHistory(uid), loadRecoveryCheckIns(uid)]);
    } catch (loadError) {
      console.error("[daily-plan] Could not load history or recovery", loadError);
    }

    let memories: BriefingMemory[] = [];
    let approved: { recommendation: string; approvedAt: string | null; targetWorkoutDate: string | null }[] = [];
    if (uid) {
      const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
      const [memoryResult, recResult] = await Promise.all([
        supabase
          .from("coach_memories")
          .select("category,detail,signal,confidence")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("coach_recommendations")
          .select("recommendation,approved_at,target_workout_date")
          .eq("user_id", uid)
          .eq("status", "approved")
          .gte("approved_at", since),
      ]);
      memories = memoryResult.error
        ? ((await supabase.from("coach_memories").select("category,detail").eq("user_id", uid).limit(40)).data ?? [])
        : memoryResult.data;
      approved = (recResult.data ?? []).map((row) => ({
        recommendation: row.recommendation,
        approvedAt: row.approved_at,
        targetWorkoutDate: row.target_workout_date ?? null,
      }));
      setApproval(await loadDailyPlanApproval(uid, date));
    }

    setBriefing(
      buildDailyBriefing({
        today: date,
        hour: now.getHours(),
        profile,
        plan: readPlan(),
        history: (history as { workoutDate?: string; activityType?: string; duration?: number }[])
          .filter((entry) => typeof entry?.workoutDate === "string")
          .map((entry) => ({
            workoutDate: entry.workoutDate as string,
            activityType: String(entry.activityType ?? ""),
            duration: Number(entry.duration) || 0,
          })),
        recovery,
        memories,
        approvedRecommendations: approved,
      }),
    );
  }, [isProfileLoaded, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const handler = () => void refresh();
    const events = [TRAINING_PLAN_UPDATED_EVENT, WORKOUTS_UPDATED_EVENT, RECOVERY_CHECKINS_UPDATED_EVENT];
    events.forEach((name) => window.addEventListener(name, handler));
    return () => events.forEach((name) => window.removeEventListener(name, handler));
  }, [refresh]);

  if (!briefing) {
    return (
      <section aria-busy className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 text-sm text-white/50">
        Preparing today&apos;s coaching plan…
      </section>
    );
  }

  const shell = "rounded-lg border border-white/[0.07] bg-[#111714] p-5";

  if (!briefing.ready) {
    return (
      <section className={shell}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#b8f36b]">Today&apos;s Coaching Plan</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{briefing.greeting}</h2>
        <p className="mt-3 text-sm text-white/75">{briefing.message}</p>
        <BulletList items={briefing.missingData} />
        <Link href="/coach" className="mt-4 inline-flex rounded-lg bg-[#b8f36b] px-4 py-2 text-sm font-semibold text-black">
          Ask Coach
        </Link>
      </section>
    );
  }

  const b: Ready = briefing;
  const approved = isApprovalCurrent(approval, b.approvalKey);
  const staleApproval = approval !== null && !approved;
  const canApprove = !b.workout.completed && !approved;

  async function handleApprove() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      setApproval(await approveDailyPlan(userId, today, b));
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not save your approval.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${shell} space-y-4`} aria-label="Today's Coaching Plan">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#b8f36b]">Today&apos;s Coaching Plan</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{b.greeting}</h2>
      </header>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Today&apos;s Workout</p>
        <p className="mt-1 text-2xl font-semibold text-white">{b.workout.headline}</p>
        <p className="mt-1 text-sm text-white/60">
          {b.workout.completed ? "Completed · " : ""}
          {b.workout.subtitle}
        </p>
        {b.approvedChange && (
          <p className="mt-2 rounded-md bg-[#b8f36b]/10 px-3 py-2 text-xs text-[#b8f36b]">
            Updated by an approved recommendation: {b.approvedChange}
          </p>
        )}
      </div>

      <Section title="Why Today"><BulletList items={b.why} /></Section>
      <Section title="Recovery Focus"><BulletList items={b.recoveryFocus} /></Section>
      <Section title="Nutrition Focus"><BulletList items={b.nutritionFocus} /></Section>

      <Section title="Plan Status">
        <p className={`mt-1 font-semibold ${STATUS_STYLE[b.planStatus.label]}`}>{b.planStatus.label}</p>
        <p className="mt-1 text-sm text-white/70">{b.planStatus.explanation}</p>
      </Section>

      <Section title="Confidence">
        <p className={`mt-1 font-semibold ${LEVEL_STYLE[b.confidence.level]}`}>{b.confidence.level}</p>
        <p className="mt-1 text-sm text-white/70">{b.confidence.explanation}</p>
      </Section>

      {b.insight && (
        <Section title="Smart Insight">
          <p className="mt-1 text-sm text-white/80">{b.insight}</p>
        </Section>
      )}

      {staleApproval && (
        <p className="text-sm text-amber-300">Today&apos;s plan changed since you approved it. Review and approve again.</p>
      )}
      {approved && approval && (
        <p role="status" className="text-sm text-[#b8f36b]">
          Plan approved at {new Date(approval.approvedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        {canApprove && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={saving || !userId}
            className="rounded-lg bg-[#b8f36b] px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Approve Today's Plan"}
          </button>
        )}
        <Link href="/training" className="rounded-lg border border-white/15 px-4 py-3 text-center text-sm font-semibold text-white">
          Modify Today&apos;s Plan
        </Link>
        <Link href="/coach" className="rounded-lg border border-white/15 px-4 py-3 text-center text-sm font-semibold text-white">
          Ask Coach
        </Link>
      </div>
    </section>
  );
}
