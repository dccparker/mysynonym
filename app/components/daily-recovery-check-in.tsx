"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Activity, HeartPulse, Moon, X } from "lucide-react";
import {
  localRecoveryDate,
  RECOVERY_CHECKINS_UPDATED_EVENT,
  loadRecoveryCheckIns,
  saveRecoveryCheckIn,
  type RecoveryCheckIn,
  type RecoveryCheckInInput,
} from "../lib/recovery-checkin";
import { supabase } from "../lib/supabase";

type Draft = {
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  sleepQuality: number;
  sleepDurationHours: string;
  bedtime: string;
  wakeTime: string;
  restingHeartRate: string;
  hrv: string;
  painNotes: string;
  recoveryNotes: string;
  availableTrainingMinutes: string;
};

const emptyDraft: Draft = {
  energy: 0,
  soreness: 0,
  stress: 0,
  motivation: 0,
  sleepQuality: 0,
  sleepDurationHours: "",
  bedtime: "",
  wakeTime: "",
  restingHeartRate: "",
  hrv: "",
  painNotes: "",
  recoveryNotes: "",
  availableTrainingMinutes: "",
};

const fieldClass =
  "min-h-10 w-full rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 text-sm text-[#e5ebe6] outline-none focus:border-[#b8f36b]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]";
const labelClass = "grid gap-1.5 text-[11px] font-medium text-[#a6b1a9]";

function subscribeToLocalDay(onChange: () => void): () => void {
  const update = () => onChange();
  window.addEventListener("focus", update);
  window.addEventListener("visibilitychange", update);
  let timer: number;
  const scheduleMidnightUpdate = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = window.setTimeout(() => {
      onChange();
      scheduleMidnightUpdate();
    }, Math.max(1, midnight.getTime() - now.getTime()));
  };
  scheduleMidnightUpdate();
  return () => {
    window.removeEventListener("focus", update);
    window.removeEventListener("visibilitychange", update);
    window.clearTimeout(timer);
  };
}

function draftFromRecord(record?: RecoveryCheckIn): Draft {
  if (!record) return { ...emptyDraft };
  return {
    energy: record.energy,
    soreness: record.soreness,
    stress: record.stress,
    motivation: record.motivation,
    sleepQuality: record.sleepQuality,
    sleepDurationHours: record.sleepDurationHours?.toString() ?? "",
    bedtime: record.bedtime ?? "",
    wakeTime: record.wakeTime ?? "",
    restingHeartRate: record.restingHeartRate?.toString() ?? "",
    hrv: record.hrv?.toString() ?? "",
    painNotes: record.painNotes ?? "",
    recoveryNotes: record.recoveryNotes ?? "",
    availableTrainingMinutes: record.availableTrainingMinutes?.toString() ?? "",
  };
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function numericOptional(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function RatingInput({
  id,
  title,
  hint,
  low,
  high,
  value,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-white/[0.06] bg-[#111714] p-3">
      <legend className="px-1 text-xs font-semibold text-[#e5ebe6]">
        {title} <span className="text-[9px] font-normal text-[#87938b]">Required</span>
      </legend>
      <p className="text-[10px] leading-relaxed text-[#87938b]" id={`${id}-hint`}>{hint}</p>
      <div
        aria-describedby={`${id}-hint ${id}-scale`}
        aria-label={title}
        className="flex gap-2"
        role="group"
      >
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            aria-label={`${title}: ${rating}`}
            aria-pressed={value === rating}
            className={`min-h-10 min-w-10 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] ${
              value === rating
                ? "border-[#b8f36b]/50 bg-[#b8f36b]/15 text-[#d0f79d]"
                : "border-white/[0.08] bg-[#0b100e] text-[#a6b1a9] hover:border-white/[0.18]"
            }`}
            key={rating}
            onClick={() => onChange(rating)}
            type="button"
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[#78857d]" id={`${id}-scale`}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

export function DailyRecoveryCheckIn() {
  const today = useSyncExternalStore(subscribeToLocalDay, localRecoveryDate, () => "");
  const [records, setRecords] = useState<RecoveryCheckIn[]>([]);
  const [storageError, setStorageError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const todaysRecord = records.find((record) => record.date === today);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const loadRecords = async (userId?: string | null) => {
      const currentRequest = ++requestId;
      setIsLoading(true);
      try {
        const loaded = await loadRecoveryCheckIns(userId);
        if (!active || currentRequest !== requestId) return;
        setRecords(loaded);
        setStorageError("");
      } catch (loadError) {
        if (!active || currentRequest !== requestId) return;
        setRecords([]);
        setStorageError(
          loadError instanceof Error
            ? loadError.message
            : "Saved recovery check-ins could not be read.",
        );
      } finally {
        if (active && currentRequest === requestId) setIsLoading(false);
      }
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        setRecords([]);
        void loadRecords(session?.user.id ?? null);
      });
    });
    const reloadRecords = () => void loadRecords();
    void loadRecords();
    window.addEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadRecords);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadRecords);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function beginCheckIn() {
    setDraft(draftFromRecord(todaysRecord));
    setError("");
    setFeedback("");
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!today) {
      setError("Your local calendar date is still being determined. Please try again.");
      return;
    }
    if ([draft.energy, draft.soreness, draft.stress, draft.motivation, draft.sleepQuality].some((value) => value < 1 || value > 5)) {
      setError("Choose a 1-to-5 rating for each required check-in question.");
      return;
    }
    const fields = [
      ["Sleep duration", draft.sleepDurationHours, 0, 24],
      ["Resting heart rate", draft.restingHeartRate, 20, 250],
      ["HRV", draft.hrv, 1, 1000],
      ["Available training time", draft.availableTrainingMinutes, 0, 1440],
    ] as const;
    for (const [label, value, min, max] of fields) {
      const parsed = numericOptional(value);
      if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < min || parsed > max)) {
        setError(`${label} must be between ${min} and ${max}.`);
        return;
      }
    }

    const input: RecoveryCheckInInput = {
      date: today,
      source: "Manual Check-In",
      energy: draft.energy,
      soreness: draft.soreness,
      stress: draft.stress,
      motivation: draft.motivation,
      sleepQuality: draft.sleepQuality,
      ...(numericOptional(draft.sleepDurationHours) === undefined ? {} : { sleepDurationHours: numericOptional(draft.sleepDurationHours) }),
      ...(draft.bedtime ? { bedtime: draft.bedtime } : {}),
      ...(draft.wakeTime ? { wakeTime: draft.wakeTime } : {}),
      ...(numericOptional(draft.restingHeartRate) === undefined ? {} : { restingHeartRate: numericOptional(draft.restingHeartRate) }),
      ...(numericOptional(draft.hrv) === undefined ? {} : { hrv: numericOptional(draft.hrv) }),
      ...(draft.painNotes.trim() ? { painNotes: draft.painNotes.trim() } : {}),
      ...(draft.recoveryNotes.trim() ? { recoveryNotes: draft.recoveryNotes.trim() } : {}),
      ...(numericOptional(draft.availableTrainingMinutes) === undefined ? {} : { availableTrainingMinutes: numericOptional(draft.availableTrainingMinutes) }),
    };
    setIsSaving(true);
    try {
      const saved = await saveRecoveryCheckIn(input);
      setRecords((current) =>
        [saved, ...current.filter((record) => record.date !== saved.date)].sort(
          (left, right) => right.date.localeCompare(left.date),
        ),
      );
      setFeedback(todaysRecord ? "Today’s check-in updated." : "Today’s check-in saved.");
      setError("");
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The check-in could not be saved. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const metricValue = (value: number | undefined, unit: string) =>
    value === undefined ? "Not provided" : `${value} ${unit}`;

  return (
    <>
      <section
        aria-labelledby="daily-recovery-heading"
        className="rounded-lg border border-[#b8f36b]/15 bg-[#111714] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium text-[#a6b1a9]">
              <Activity aria-hidden="true" className="text-[#b8f36b]" size={15} />
              Daily recovery
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#eef2ed]" id="daily-recovery-heading">
              Estimated readiness based on your check-in
            </h2>
          </div>
          <button
            className="min-h-10 rounded-lg bg-[#b8f36b] px-4 py-2 text-xs font-semibold text-[#102010] transition-colors hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] disabled:cursor-wait disabled:opacity-60"
            disabled={!today || isLoading}
            onClick={beginCheckIn}
            type="button"
          >
            {todaysRecord ? "Update Check-In" : "Check In"}
          </button>
        </div>

        {storageError ? (
          <p className="mt-4 text-xs text-[#f0b47c]" role="alert">{storageError}</p>
        ) : isLoading ? (
          <p className="mt-4 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#a6b1a9]">
            Loading recovery check-ins…
          </p>
        ) : !todaysRecord ? (
          <p className="mt-4 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#a6b1a9]">
            No recovery check-in recorded today.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
              <div className="flex min-w-32 flex-col items-center justify-center rounded-lg border border-[#b8f36b]/15 bg-[#0b100e] px-5 py-4 text-center">
                <span className="text-[32px] font-semibold leading-none text-[#f1f4f0]">{todaysRecord.readinessScore}</span>
                <span className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#78857d]">of 100</span>
                <span className="mt-2 rounded-full border border-[#b8f36b]/15 bg-[#b8f36b]/[0.06] px-2.5 py-1 text-[10px] font-semibold text-[#c5ef97]">
                  {todaysRecord.readinessCategory}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Energy", `${todaysRecord.energy}/5`],
                  ["Soreness", `${todaysRecord.soreness}/5`],
                  ["Stress", `${todaysRecord.stress}/5`],
                  ["Sleep quality", `${todaysRecord.sleepQuality}/5`],
                  ["Sleep duration", metricValue(todaysRecord.sleepDurationHours, "hr")],
                  ["HRV", metricValue(todaysRecord.hrv, "ms")],
                  ["Resting heart rate", metricValue(todaysRecord.restingHeartRate, "bpm")],
                  ["Source", todaysRecord.source],
                ].map(([label, value]) => (
                  <div className="rounded-md border border-white/[0.05] bg-[#0b100e] p-2.5" key={label}>
                    <p className="text-[9px] text-[#78857d]">{label}</p>
                    <p className="mt-1 text-[11px] font-medium text-[#dce4dd]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[10px] text-[#87938b]">
              Motivation {todaysRecord.motivation}/5 · Updated {formatTimestamp(todaysRecord.updatedAt)}
            </p>
            {(todaysRecord.painNotes || todaysRecord.availableTrainingMinutes !== undefined) && (
              <p className="mt-2 text-[10px] leading-relaxed text-[#f0c49d]">
                {todaysRecord.painNotes
                  ? "Pain or limitation noted. Consider reducing training and seeking qualified professional advice if the issue is significant or persistent."
                  : `Available training time today: ${todaysRecord.availableTrainingMinutes} minutes.`}
              </p>
            )}
            <details className="mt-3 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3">
              <summary className="cursor-pointer text-[10px] font-semibold text-[#a6b1a9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]">
                How this estimate was calculated
              </summary>
              <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">
                Subjective ratings are equally weighted; energy, motivation, and sleep quality score higher when higher, while soreness and stress score higher when lower. If entered, sleep duration is also included as a proportion of 8 hours, capped at 100. HRV and resting heart rate are recorded but not scored because no personal baseline is available. This is a simple estimate, not a medical assessment.
              </p>
              <p className="mt-2 text-[10px] text-[#a6b1a9]">
                Used: {todaysRecord.calculationUsed.join(" · ")}
              </p>
              <p className="mt-1 text-[10px] text-[#87938b]">
                Not provided or unavailable: {todaysRecord.informationMissing.join(" · ")}
              </p>
            </details>
          </>
        )}
        {feedback && <p className="mt-3 text-[10px] text-[#c5ef97]" role="status">{feedback}</p>}
      </section>

      <section aria-labelledby="recovery-history-heading" className="mt-3 rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Moon aria-hidden="true" className="text-[#8dd7e5]" size={15} />
          <h2 className="text-xs font-semibold text-[#e5ebe6]" id="recovery-history-heading">Recovery history</h2>
        </div>
        {isLoading ? (
          <p className="mt-3 text-[10px] text-[#87938b]">Loading recovery history…</p>
        ) : records.length === 0 ? (
          <p className="mt-3 text-[10px] text-[#87938b]">Check-ins you save will appear here.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[650px] border-collapse text-left text-[10px]">
              <thead className="text-[#78857d]">
                <tr>
                  {["Date", "Readiness", "Score", "Energy", "Soreness", "Sleep", "Source"].map((title) => (
                    <th className="border-b border-white/[0.07] px-2 py-2 font-medium" key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr className="text-[#c2cdc5]" key={record.date}>
                    <td className="border-b border-white/[0.04] px-2 py-2">{formatDate(record.date)}</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.readinessCategory}</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.readinessScore}</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.energy}/5</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.soreness}/5</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.sleepQuality}/5</td>
                    <td className="border-b border-white/[0.04] px-2 py-2">{record.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            aria-labelledby="recovery-checkin-title"
            aria-modal="true"
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/[0.09] bg-[#0d1310] p-5 shadow-2xl sm:rounded-xl sm:p-7"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#b8f36b]">
                  <HeartPulse aria-hidden="true" size={13} /> Manual Check-In · {today}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#eef2ed]" id="recovery-checkin-title">
                  {todaysRecord ? "Update today’s check-in" : "Daily recovery check-in"}
                </h2>
                <p className="mt-1 text-[10px] text-[#87938b]">
                  Required ratings are subjective. Sensor and sleep details are optional.
                </p>
              </div>
              <button
                aria-label="Close recovery check-in"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <form className="mt-4 grid gap-4" onSubmit={save}>
              <div className="grid gap-3 sm:grid-cols-2">
                <RatingInput
                  id="energy"
                  title="Energy"
                  hint="How energized do you feel today?"
                  low="1 = Very low"
                  high="5 = Excellent"
                  value={draft.energy}
                  onChange={(energy) => setDraft((current) => ({ ...current, energy }))}
                />
                <RatingInput
                  id="soreness"
                  title="Muscle soreness"
                  hint="How sore do your muscles feel?"
                  low="1 = No soreness"
                  high="5 = Very sore"
                  value={draft.soreness}
                  onChange={(soreness) => setDraft((current) => ({ ...current, soreness }))}
                />
                <RatingInput
                  id="stress"
                  title="Stress"
                  hint="How much stress are you experiencing?"
                  low="1 = Very low"
                  high="5 = Very high"
                  value={draft.stress}
                  onChange={(stress) => setDraft((current) => ({ ...current, stress }))}
                />
                <RatingInput
                  id="motivation"
                  title="Motivation to train"
                  hint="How willing do you feel to train today?"
                  low="1 = Very low"
                  high="5 = Very high"
                  value={draft.motivation}
                  onChange={(motivation) => setDraft((current) => ({ ...current, motivation }))}
                />
                <RatingInput
                  id="sleep-quality"
                  title="Sleep quality"
                  hint="How restorative did last night’s sleep feel?"
                  low="1 = Very poor"
                  high="5 = Excellent"
                  value={draft.sleepQuality}
                  onChange={(sleepQuality) => setDraft((current) => ({ ...current, sleepQuality }))}
                />
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[#dce4dd]">Optional details</h3>
                <p className="mt-1 text-[10px] text-[#78857d]">Leave any field blank if you do not have that information.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Sleep duration (hours) · optional
                    <input className={fieldClass} max="24" min="0" onChange={(event) => setDraft((current) => ({ ...current, sleepDurationHours: event.currentTarget.value }))} step="0.1" type="number" value={draft.sleepDurationHours} />
                  </label>
                  <label className={labelClass}>Available training time today (minutes) · optional
                    <input className={fieldClass} max="1440" min="0" onChange={(event) => setDraft((current) => ({ ...current, availableTrainingMinutes: event.currentTarget.value }))} step="1" type="number" value={draft.availableTrainingMinutes} />
                  </label>
                  <label className={labelClass}>Bedtime · optional
                    <input className={fieldClass} onChange={(event) => setDraft((current) => ({ ...current, bedtime: event.currentTarget.value }))} type="time" value={draft.bedtime} />
                  </label>
                  <label className={labelClass}>Wake time · optional
                    <input className={fieldClass} onChange={(event) => setDraft((current) => ({ ...current, wakeTime: event.currentTarget.value }))} type="time" value={draft.wakeTime} />
                  </label>
                  <label className={labelClass}>Resting heart rate (bpm) · optional
                    <input className={fieldClass} max="250" min="20" onChange={(event) => setDraft((current) => ({ ...current, restingHeartRate: event.currentTarget.value }))} type="number" value={draft.restingHeartRate} />
                  </label>
                  <label className={labelClass}>HRV (ms) · optional
                    <input className={fieldClass} max="1000" min="1" onChange={(event) => setDraft((current) => ({ ...current, hrv: event.currentTarget.value }))} type="number" value={draft.hrv} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>Pain or limitation notes · optional
                    <textarea className={`${fieldClass} min-h-16 py-2`} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, painNotes: event.currentTarget.value }))} value={draft.painNotes} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>General recovery notes · optional
                    <textarea className={`${fieldClass} min-h-16 py-2`} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, recoveryNotes: event.currentTarget.value }))} value={draft.recoveryNotes} />
                  </label>
                </div>
              </div>
              <p className="rounded-lg border border-white/[0.06] bg-[#111714] p-3 text-[10px] leading-relaxed text-[#87938b]">
                This rule-based estimate is not a medical assessment. If pain or limitations are significant or persistent, consider reducing training and seeking qualified professional advice.
              </p>
              {error && <p className="text-xs text-[#f0b47c]" role="alert">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-4">
                <button className="min-h-10 rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]" onClick={() => setOpen(false)} type="button">
                  Cancel
                </button>
                <button className="min-h-10 rounded-lg bg-[#b8f36b] px-4 py-2 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] disabled:cursor-wait disabled:opacity-60" disabled={isSaving} type="submit">
                  {isSaving ? "Saving…" : "Save Check-In"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
