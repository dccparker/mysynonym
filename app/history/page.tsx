"use client";

import { useEffect, useState } from "react";
import { Activity, CalendarDays, Clock3, HeartPulse } from "lucide-react";
import {
  loadRecoveryCheckIns,
  RECOVERY_CHECKINS_UPDATED_EVENT,
  type RecoveryCheckIn,
} from "../lib/recovery-checkin";
import {
  loadWorkoutHistory,
  WORKOUTS_UPDATED_EVENT,
} from "../lib/workout-storage";
import { supabase } from "../lib/supabase";
import { RecommendationHistory } from "../components/recommendation-history";

type WorkoutHistoryEntry = {
  id: string;
  workoutDate: string;
  activityType: string;
  title: string;
  startTime?: string;
  savedAt?: string;
  duration: number;
  distance?: number;
  distanceUnit?: "km" | "m";
  source?: string;
  notes?: string;
  sessionNotes?: string;
  averageHeartRate?: number;
  maximumHeartRate?: number;
  averagePace?: string;
  averagePower?: number;
  calories?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkouts(value: unknown[]): WorkoutHistoryEntry[] {
  return value.flatMap((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.workoutDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.workoutDate) ||
      typeof raw.activityType !== "string" ||
      typeof raw.duration !== "number" ||
      !Number.isFinite(raw.duration)
    ) {
      return [];
    }
    const optionalNumber = (key: string) =>
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? (raw[key] as number)
        : undefined;
    const distanceUnit: "m" | "km" | undefined =
      raw.distanceUnit === "m" || raw.distanceUnit === "km"
        ? raw.distanceUnit
        : undefined;
    return [{
      id: typeof raw.id === "string" ? raw.id : `workout-${index}`,
      workoutDate: raw.workoutDate,
      activityType: raw.activityType,
      title:
        (typeof raw.workoutTitle === "string" && raw.workoutTitle) ||
        (typeof raw.sessionTitle === "string" && raw.sessionTitle) ||
        raw.activityType,
      ...(typeof raw.startTime === "string" ? { startTime: raw.startTime } : {}),
      ...(typeof raw.savedAt === "string" ? { savedAt: raw.savedAt } : {}),
      duration: raw.duration,
      ...(optionalNumber("distance") !== undefined
        ? { distance: optionalNumber("distance") }
        : {}),
      ...(distanceUnit !== undefined ? { distanceUnit } : {}),
      ...(typeof raw.source === "string" ? { source: raw.source } : {}),
      ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
      ...(typeof raw.sessionNotes === "string" ? { sessionNotes: raw.sessionNotes } : {}),
      ...(optionalNumber("averageHeartRate") !== undefined
        ? { averageHeartRate: optionalNumber("averageHeartRate") }
        : {}),
      ...(optionalNumber("maximumHeartRate") !== undefined
        ? { maximumHeartRate: optionalNumber("maximumHeartRate") }
        : {}),
      ...(typeof raw.averagePace === "string" ? { averagePace: raw.averagePace } : {}),
      ...(optionalNumber("averagePower") !== undefined
        ? { averagePower: optionalNumber("averagePower") }
        : {}),
      ...(optionalNumber("calories") !== undefined
        ? { calories: optionalNumber("calories") }
        : {}),
    }];
  }).sort((left, right) =>
    right.workoutDate.localeCompare(left.workoutDate) ||
    (right.startTime ?? "").localeCompare(left.startTime ?? "") ||
    (right.savedAt ?? "").localeCompare(left.savedAt ?? "") ||
    right.id.localeCompare(left.id),
  );
}

function displayDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function metric(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${value} ${unit}`;
}

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [recovery, setRecovery] = useState<RecoveryCheckIn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const loadHistory = async (userId?: string | null) => {
      const currentRequest = ++requestId;
      setIsLoading(true);
      setError("");
      try {
        let resolvedUserId = userId;
        if (resolvedUserId === undefined) {
          const { data, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          resolvedUserId = data.user?.id ?? null;
        }
        if (resolvedUserId === null) {
          if (active && currentRequest === requestId) {
            setWorkouts([]);
            setRecovery([]);
          }
          return;
        }
        const [rawWorkouts, recoveryEntries] = await Promise.all([
          loadWorkoutHistory(resolvedUserId),
          loadRecoveryCheckIns(resolvedUserId),
        ]);
        if (!active || currentRequest !== requestId) return;
        setWorkouts(normalizeWorkouts(rawWorkouts));
        setRecovery(recoveryEntries);
      } catch (loadError) {
        if (!active || currentRequest !== requestId) return;
        setWorkouts([]);
        setRecovery([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Training history could not be loaded.",
        );
      } finally {
        if (active && currentRequest === requestId) setIsLoading(false);
      }
    };

    const reloadHistory = () => void loadHistory();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        setWorkouts([]);
        setRecovery([]);
        void loadHistory(session?.user.id ?? null);
      });
    });

    void loadHistory();
    window.addEventListener(WORKOUTS_UPDATED_EVENT, reloadHistory);
    window.addEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadHistory);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener(WORKOUTS_UPDATED_EVENT, reloadHistory);
      window.removeEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadHistory);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <header className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">
          MySynonym
        </p>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
          Training History
        </h1>
        <p className="mt-1.5 text-xs text-[#87938b]">
          Your completed workouts and daily recovery check-ins.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0b47c]" role="alert">
          Training history could not be loaded: {error}
        </p>
      )}

      <div className="grid gap-4">
        <RecommendationHistory />
        <section
          aria-labelledby="workout-history-heading"
          className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Activity aria-hidden="true" className="text-[#b8f36b]" size={16} />
            <h2 className="text-sm font-semibold text-[#e5ebe6]" id="workout-history-heading">
              Workout History
            </h2>
            {!isLoading && (
              <span className="ml-auto text-[10px] text-[#78857d]">
                {workouts.length} {workouts.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
          {isLoading ? (
            <p className="mt-4 text-xs text-[#87938b]">Loading workout history…</p>
          ) : workouts.length === 0 ? (
            <p className="mt-4 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#87938b]">
              No workout history yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {workouts.map((workout) => {
                const details = [
                  metric(workout.duration, "min"),
                  metric(workout.distance, workout.distanceUnit ?? "km"),
                  metric(workout.averageHeartRate, "bpm avg HR"),
                  metric(workout.maximumHeartRate, "bpm max HR"),
                  workout.averagePace ? `${workout.averagePace} pace` : undefined,
                  metric(workout.averagePower, "W"),
                  metric(workout.calories, "kcal"),
                ].filter((detail): detail is string => detail !== undefined);
                return (
                  <article
                    className="rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 sm:p-4"
                    key={workout.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[#e5ebe6]">{workout.title}</h3>
                        <p className="mt-1 text-[10px] text-[#87938b]">{workout.activityType}</p>
                      </div>
                      <p className="flex items-center gap-1.5 text-[10px] text-[#a6b1a9]">
                        <CalendarDays aria-hidden="true" size={12} />
                        {displayDate(workout.workoutDate)}
                        {workout.startTime && (
                          <>
                            <Clock3 aria-hidden="true" className="ml-1" size={12} />
                            {workout.startTime}
                          </>
                        )}
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-[#a6b1a9]">
                      {details.join(" · ")}
                      {workout.source ? ` · ${workout.source}` : ""}
                    </p>
                    {(workout.notes || workout.sessionNotes) && (
                      <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-[#87938b]">
                        {workout.notes || workout.sessionNotes}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="recovery-history-heading"
          className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <HeartPulse aria-hidden="true" className="text-[#8dd7e5]" size={16} />
            <h2 className="text-sm font-semibold text-[#e5ebe6]" id="recovery-history-heading">
              Recovery History
            </h2>
            {!isLoading && (
              <span className="ml-auto text-[10px] text-[#78857d]">
                {recovery.length} {recovery.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
          {isLoading ? (
            <p className="mt-4 text-xs text-[#87938b]">Loading recovery history…</p>
          ) : recovery.length === 0 ? (
            <p className="mt-4 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#87938b]">
              No recovery check-ins yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[10px]">
                <thead className="text-[#78857d]">
                  <tr>
                    {["Date", "Readiness", "Score", "Energy", "Soreness", "Stress", "Sleep", "Source"].map((title) => (
                      <th className="border-b border-white/[0.07] px-2 py-2 font-medium" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recovery.map((entry) => (
                    <tr className="text-[#c2cdc5]" key={`${entry.date}-${entry.id}`}>
                      <td className="border-b border-white/[0.04] px-2 py-2">{displayDate(entry.date)}</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.readinessCategory}</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.readinessScore}</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.energy}/5</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.soreness}/5</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.stress}/5</td>
                      <td className="border-b border-white/[0.04] px-2 py-2">
                        {entry.sleepQuality}/5{entry.sleepDurationHours === undefined
                          ? ""
                          : ` · ${entry.sleepDurationHours} hr`}
                      </td>
                      <td className="border-b border-white/[0.04] px-2 py-2">{entry.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
