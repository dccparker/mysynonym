"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import {
  normalizeAvailableTrainingDays,
  useAthleteProfile,
  weekDays,
} from "../lib/athlete-profile";
import { loadRecoveryCheckIns } from "../lib/recovery-checkin";
import { buildWorkoutActivity, catalogEntry } from "../lib/workout-catalog";
import { loadWorkoutHistory, WORKOUTS_UPDATED_EVENT } from "../lib/workout-storage";
import { supabase } from "../lib/supabase";
import {
  dateForPlanDay,
  findUnavailablePlanDays,
  generateTrainingWeek,
  localDateString,
  matchPlannedSessions,
  normalizeTrainingPlan,
  plannedSessionDuration,
  startOfWeek,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  notifyTrainingPlanUpdated,
  type CompletedSession,
  type PlannedActivity,
  type PlannedActivityType,
  type PlannedIntensity,
  type PlannedSession,
} from "../lib/training-plan";
import type { PlannerViewMode } from "../lib/training-horizon";
import { generateTrainingBlock, type BlockWeek } from "../lib/training-block";
import {
  BlockPreview,
  PlannerHorizonCalendar,
  PlannerViewSelector,
  RoadmapView,
  TrainingFocusBanner,
} from "./planner-horizon";
import { WorkoutStructureDetails, WorkoutStructureEditor, WorkoutTypeSelect } from "./workout-structure";
const inputClass =
  "min-h-10 rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 text-sm text-[#e5ebe6] outline-none placeholder:text-[#56625b] focus:border-[#b8f36b]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]";
const labelClass = "grid gap-2 text-xs font-medium text-[#a6b1a9]";

const workoutTypes: readonly PlannedActivityType[] = ["Run", "Ride", "Swim", "Strength", "Other"];
const intensities: readonly PlannedIntensity[] = ["Recovery", "Easy", "Moderate", "Hard", "Rest"];
const newId = () => `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isAutoTitle = (value: string) =>
  Boolean(catalogEntry(value)) || workoutTypes.some((type) => type === value);

function displayDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
}

function displayEffort(intensity: PlannedIntensity): string {
  const description =
    intensity === "Recovery"
      ? "Very light, comfortable movement."
      : intensity === "Easy"
        ? "Comfortable conversation pace."
        : intensity === "Moderate"
          ? "Steady and controlled; stay in control throughout."
          : intensity === "Hard"
            ? "Challenging but controlled, with easier recovery between efforts."
            : "Rest or very light movement.";
  return `${intensity} — ${description}`;
}

function PlannedWorkoutForm({
  day,
  availableDays,
  initial,
  onCancel,
  onSave,
}: {
  day: PlannedSession["day"];
  availableDays: PlannedSession["day"][];
  initial?: PlannedSession;
  onCancel: () => void;
  onSave: (session: Omit<PlannedSession, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [plannedDay, setPlannedDay] = useState<PlannedSession["day"]>(
    availableDays.includes(initial?.day ?? day)
      ? initial?.day ?? day
      : availableDays[0] ?? day,
  );
  const [activities, setActivities] = useState<PlannedActivity[]>(
    initial?.activities ?? [{
      id: newId(),
      activityType: "Run",
      durationMinutes: 45,
      intensity: "Easy",
      instructions: "Run at a comfortable effort where you can speak in full sentences.",
      purpose: "Build consistency without making the next session harder.",
    }],
  );
  const { profile } = useAthleteProfile();
  const updateActivity = (id: string, patch: Partial<PlannedActivity>) =>
    setActivities((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  function selectWorkoutType(activity: PlannedActivity, workoutType: string) {
    if (!workoutType) {
      updateActivity(activity.id, {
        workoutType: undefined,
        warmUp: undefined,
        mainSet: undefined,
        coolDown: undefined,
        equipment: undefined,
        exercises: undefined,
        easierOption: undefined,
        harderOption: undefined,
      });
      return;
    }
    const entry = catalogEntry(workoutType);
    const built = buildWorkoutActivity(workoutType, activity.durationMinutes > 0 ? activity.durationMinutes : 45, {
      experience: profile?.trainingExperience ?? "",
      hasLimitations: Boolean(profile?.currentLimitations.trim()),
      id: activity.id,
    });
    if (!entry || !built) return;
    updateActivity(activity.id, { ...built, distance: activity.distance });
    setTitle((current) => (current.trim() && !isAutoTitle(current) ? current : workoutType));
  }
  const [title, setTitle] = useState(initial?.title ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !availableDays.includes(plannedDay) ||
      activities.length === 0 ||
      activities.some((activity) => !Number.isFinite(activity.durationMinutes) || activity.durationMinutes <= 0)
    ) return;
    onSave({
      day: plannedDay,
      date: dateForPlanDay(localDateString(startOfWeek(new Date())), plannedDay),
      title: title.trim() || activities.map((activity) => activity.workoutType ?? activity.activityType).join(" + "),
      notes: notes.trim(),
      reason:
        reason.trim() ||
        "Supports the athlete's training goal within the available training time.",
      activities: activities.map((activity) => ({
        ...activity,
        ...(activity.exercises
          ? { exercises: activity.exercises.filter((exercise) => exercise.name.trim()) }
          : {}),
        instructions:
          activity.instructions.trim() ||
          "Keep the effort controlled and adjust the session to stay comfortable.",
        purpose:
          activity.purpose.trim() ||
          "Support consistent progress toward the training goal.",
      })),
      status: initial?.status === "Skipped" ? "Skipped" : "Planned",
      ...(initial?.matchedSessionId ? { matchedSessionId: initial.matchedSessionId } : {}),
      ...(initial?.rescheduledFromDay
        ? { rescheduledFromDay: initial.rescheduledFromDay }
        : {}),
      ...(initial?.autoMatchDisabled ? { autoMatchDisabled: true } : {}),
      ...(initial?.generated ? { generated: true } : {}),
    });
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold text-[#eef2ed]">
          {initial ? "Edit Planned Workout" : "Create Planned Workout"}
        </h4>
        <button
          aria-label={`Cancel ${initial ? "editing" : "creating"} workout for ${day}`}
          className="rounded-md p-1 text-[#87938b] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
          onClick={onCancel}
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <label className={labelClass}>
        Day
        <select
          className={inputClass}
          onChange={(event) =>
            setPlannedDay(event.currentTarget.value as PlannedSession["day"])
          }
          value={plannedDay}
          disabled={availableDays.length === 0}
        >
          {availableDays.map((weekDay) => (
            <option key={weekDay}>{weekDay}</option>
          ))}
        </select>
      </label>
      {availableDays.length === 0 && (
        <p className="text-[10px] text-[#f0b47c]" role="alert">
          Select at least one available training day in your athlete profile before scheduling a session.
        </p>
      )}
      <label className={labelClass}>
        Session Title
        <input
          className={inputClass}
          maxLength={120}
          onChange={(event) => setTitle(event.currentTarget.value)}
          value={title}
        />
      </label>
      <label className={labelClass}>
        Reason for this session
        <input
          className={inputClass}
          maxLength={240}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder="What does this session support?"
          value={reason}
        />
      </label>
      <fieldset className="grid gap-3">
        <legend className="text-xs font-semibold text-[#e5ebe6]">Activities</legend>
        {activities.map((activity, index) => (
          <div className="grid gap-3 rounded-lg border border-white/[0.07] bg-[#0b100e] p-3 sm:grid-cols-2" key={activity.id}>
            <p className="text-[10px] font-semibold text-[#a6b1a9] sm:col-span-2">
              Activity {index + 1}
            </p>
            <WorkoutTypeSelect
              onChange={(workoutType) => selectWorkoutType(activity, workoutType)}
              value={activity.workoutType}
            />
            {!activity.workoutType && (
              <label className={labelClass}>
                Activity Type
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateActivity(activity.id, { activityType: event.currentTarget.value as PlannedActivityType })
                  }
                  value={activity.activityType}
                >
                  {workoutTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
            )}
            <label className={labelClass}>
              Duration (minutes)
              <input
                className={inputClass}
                min="1"
                onChange={(event) => {
                  const durationMinutes = Number(event.currentTarget.value);
                  setActivities((current) =>
                    current.map((item) => item.id === activity.id ? { ...item, durationMinutes } : item),
                  );
                }}
                required
                type="number"
                value={activity.durationMinutes}
              />
            </label>
            <label className={labelClass}>
              Distance (optional)
              <input
                className={inputClass}
                min="0"
                onChange={(event) => {
                  const distance = event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value);
                  setActivities((current) =>
                    current.map((item) => item.id === activity.id ? { ...item, distance } : item),
                  );
                }}
                step="any"
                type="number"
                value={activity.distance ?? ""}
              />
            </label>
            <label className={labelClass}>
              Intensity
              <select
                className={inputClass}
                onChange={(event) =>
                  setActivities((current) =>
                    current.map((item) =>
                      item.id === activity.id
                        ? { ...item, intensity: event.currentTarget.value as PlannedIntensity }
                        : item,
                    ),
                  )
                }
                value={activity.intensity}
              >
                {intensities.map((intensity) => <option key={intensity}>{intensity}</option>)}
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Plain-language instructions
              <textarea
                className={`${inputClass} min-h-16 py-2.5`}
                onChange={(event) =>
                  setActivities((current) =>
                    current.map((item) => item.id === activity.id ? { ...item, instructions: event.currentTarget.value } : item),
                  )
                }
                value={activity.instructions}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Purpose
              <input
                className={inputClass}
                onChange={(event) =>
                  setActivities((current) =>
                    current.map((item) => item.id === activity.id ? { ...item, purpose: event.currentTarget.value } : item),
                  )
                }
                value={activity.purpose}
              />
            </label>
            <WorkoutStructureEditor activity={activity} onChange={(patch) => updateActivity(activity.id, patch)} />
            {activities.length > 1 && (
              <button
                className="justify-self-start text-[10px] text-[#f0b47c] sm:col-span-2"
                onClick={() => setActivities((current) => current.filter((item) => item.id !== activity.id))}
                type="button"
              >
                Remove activity
              </button>
            )}
          </div>
        ))}
        <button
          className="justify-self-start rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#c5ef97]"
          onClick={() =>
            setActivities((current) => [
              ...current,
              {
                id: newId(),
                activityType: "Run",
                durationMinutes: 20,
                intensity: "Easy",
                instructions: "Keep the effort comfortable and controlled.",
                purpose: "Add a short, manageable second activity.",
              },
            ])
          }
          type="button"
        >
          <Plus aria-hidden="true" className="mr-1 inline" size={12} /> Add Activity
        </button>
      </fieldset>
      <label className={labelClass}>
        Notes (optional)
        <textarea
          className={`${inputClass} min-h-16 py-2.5`}
          maxLength={1000}
          onChange={(event) => setNotes(event.currentTarget.value)}
          rows={2}
          value={notes}
        />
      </label>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-white/[0.07] bg-[#111714] px-4 py-3 sm:-mx-5 sm:px-5">
        <button
          className="rounded-lg bg-[#b8f36b] px-3 py-2 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
          type="submit"
        >
          {initial ? "Save Session" : "Add Workout Manually"}
        </button>
        <button
          className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function WeeklyTrainingPlan() {
  const { profile } = useAthleteProfile();
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [lowRecovery, setLowRecovery] = useState(false);
  const [isWorkoutHistoryLoaded, setIsWorkoutHistoryLoaded] = useState(false);
  const [today, setToday] = useState("");
  const [editing, setEditing] = useState<{ day: PlannedSession["day"]; id?: string } | null>(null);
  const [reviewSessions, setReviewSessions] = useState<PlannedSession[] | null>(null);
  const [starterWeek, setStarterWeek] = useState(false);
  const [generationExplanation, setGenerationExplanation] = useState("");
  const [proposalIndex, setProposalIndex] = useState(0);
  const [proposalNotice, setProposalNotice] = useState("");
  const [showRescheduleOptions, setShowRescheduleOptions] = useState(false);
  const [movingSessionId, setMovingSessionId] = useState("");
  const [moveToDay, setMoveToDay] = useState<PlannedSession["day"] | "">("");
  const [generationError, setGenerationError] = useState("");
  const [incompleteProfile, setIncompleteProfile] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [viewMode, setViewMode] = useState<PlannerViewMode>("1w");
  const [blockWeeks, setBlockWeeks] = useState<BlockWeek[]>([]);

  useEffect(() => {
    let active = true;
    let historyRequestId = 0;
    const loadHistory = async () => {
      const currentRequest = ++historyRequestId;
      try {
        const parsed = await loadWorkoutHistory();
        if (!Array.isArray(parsed)) throw new Error("Workout history has an invalid format.");
        const grouped = new Map<string, CompletedSession>();
        parsed.forEach((entry, index) => {
          if (!isRecord(entry)) throw new Error("Workout history contains an invalid activity.");
          if (
            typeof entry.activityType !== "string" ||
            !workoutTypes.some((type) => type === entry.activityType) ||
            typeof entry.workoutDate !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(entry.workoutDate) ||
            typeof entry.duration !== "number" ||
            !Number.isFinite(entry.duration)
          ) throw new Error("Workout history contains an invalid activity.");
          const activityId = typeof entry.id === "string" ? entry.id : `legacy-${index}`;
          const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : activityId;
          const session = grouped.get(sessionId) ?? {
            id: sessionId,
            date: entry.workoutDate,
            title:
              typeof entry.sessionTitle === "string"
                ? entry.sessionTitle
                : typeof entry.workoutTitle === "string"
                  ? entry.workoutTitle
                  : "",
            activities: [],
          };
          session.activities.push({
            activityType: entry.activityType,
            durationMinutes: entry.duration,
          });
          grouped.set(sessionId, session);
        });
        if (!active || currentRequest !== historyRequestId) return;
        setCompletedSessions([...grouped.values()]);
        setHistoryError("");
      } catch (loadError) {
        if (!active || currentRequest !== historyRequestId) return;
        setCompletedSessions([]);
        setHistoryError(
          loadError instanceof Error
            ? `Saved workouts could not be read: ${loadError.message}`
            : "Saved workouts could not be read, so planned completion status is unavailable.",
        );
      } finally {
        if (active && currentRequest === historyRequestId) setIsWorkoutHistoryLoaded(true);
      }
    };
    const loadPlan = () => {
      try {
        const stored = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
        if (stored === null) {
          setPlannedSessions([]);
          setStorageError("");
          setIsLoaded(true);
          return;
        }
        const parsed: unknown = JSON.parse(stored);
        const normalized = normalizeTrainingPlan(parsed);
        if (!normalized) throw new Error("Weekly plan data has an invalid format.");
        setPlannedSessions(normalized);
        setStorageError("");
      } catch {
        setStorageError("The weekly plan could not be loaded from this browser.");
      } finally {
        setIsLoaded(true);
      }
    };
    const timeout = window.setTimeout(() => {
      setToday(localDateString(new Date()));
      loadPlan();
      void loadHistory();
    }, 0);
    window.addEventListener(WORKOUTS_UPDATED_EVENT, loadHistory);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
    const loadStoredData = (event: StorageEvent) => {
      if (event.key === null || event.key === TRAINING_PLAN_STORAGE_KEY) loadPlan();
    };
    window.addEventListener("storage", loadStoredData);
    const { data } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(() => {
        if (!active) return;
        setCompletedSessions([]);
        setIsWorkoutHistoryLoaded(false);
        void loadHistory();
      });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.clearTimeout(timeout);
      window.removeEventListener(WORKOUTS_UPDATED_EVENT, loadHistory);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
      window.removeEventListener("storage", loadStoredData);
    };
  }, []);

  const plansWithStatus = useMemo(() => {
    if (!today || !isWorkoutHistoryLoaded || historyError) {
      return plannedSessions;
    }
    return matchPlannedSessions(plannedSessions, completedSessions, today);
  }, [completedSessions, historyError, isWorkoutHistoryLoaded, plannedSessions, today]);

  useEffect(() => {
    if (!isLoaded || !isWorkoutHistoryLoaded || historyError || !today) return;
    const serialized = JSON.stringify(plansWithStatus);
    if (serialized === JSON.stringify(plannedSessions)) return;
    try {
      window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, serialized);
    } catch {
      window.setTimeout(
        () => setStorageError("Updated completion status could not be saved. Check browser storage and try again."),
        0,
      );
    }
  }, [
    historyError,
    isLoaded,
    isWorkoutHistoryLoaded,
    plannedSessions,
    plansWithStatus,
    today,
  ]);

  const weekStart = today ? localDateString(startOfWeek(new Date(`${today}T00:00:00`))) : "";
  const weekEnd = weekStart
    ? dateForPlanDay(weekStart, "Sunday")
    : "";
  const currentWeekPlans = useMemo(
    () => plansWithStatus.filter((session) => session.date >= weekStart && session.date <= weekEnd),
    [plansWithStatus, weekEnd, weekStart],
  );
  const availableTrainingDays = useMemo(
    () => normalizeAvailableTrainingDays(profile?.availableTrainingDays ?? []),
    [profile?.availableTrainingDays],
  );
  const unavailableCurrentWeekPlans = useMemo(
    () =>
      currentWeekPlans.filter(
        (session) =>
          session.status !== "Completed" &&
          session.status !== "Skipped" &&
          !availableTrainingDays.includes(session.day),
      ),
    [availableTrainingDays, currentWeekPlans],
  );
  const schedulableCurrentWeekPlans = useMemo(
    () =>
      currentWeekPlans.filter(
        (session) =>
          session.status === "Completed" ||
          session.status === "Skipped" ||
          availableTrainingDays.includes(session.day),
      ),
    [availableTrainingDays, currentWeekPlans],
  );

  const plansByDay = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        plans: schedulableCurrentWeekPlans.filter((session) => session.day === day),
      })),
    [schedulableCurrentWeekPlans],
  );
  const rescheduleSuggestions = useMemo(() => {
    const missedSessions = currentWeekPlans.filter((session) => session.status === "Missed");
    return missedSessions.map((session) => {
      const duration = plannedSessionDuration(session);
      const options = availableTrainingDays
        .filter((day) => {
          const date = dateForPlanDay(weekStart, day);
          if (date < today) return false;
          if (completedSessions.some((completed) => completed.date === date)) return false;
          const alreadyPlannedMinutes = currentWeekPlans
            .filter(
              (planned) =>
                planned.id !== session.id &&
                planned.date === date &&
                planned.status !== "Skipped",
            )
            .reduce((sum, planned) => sum + plannedSessionDuration(planned), 0);
          const isWeekend = day === "Saturday" || day === "Sunday";
          const dailyLimit = isWeekend
            ? profile?.maxWeekendWorkoutMinutes ?? 180
            : profile?.maxWeekdayWorkoutMinutes ?? 120;
          return alreadyPlannedMinutes + duration <= dailyLimit;
        })
        .slice(0, 2);
      return { session, options };
    });
  }, [
    availableTrainingDays,
    completedSessions,
    currentWeekPlans,
    profile?.maxWeekdayWorkoutMinutes,
    profile?.maxWeekendWorkoutMinutes,
    today,
    weekStart,
  ]);

  const adherence = useMemo(() => {
    const completed = schedulableCurrentWeekPlans.filter((session) => session.status === "Completed").length;
    const missed = schedulableCurrentWeekPlans.filter((session) => session.status === "Missed").length;
    const skipped = schedulableCurrentWeekPlans.filter((session) => session.status === "Skipped").length;
    const due = completed + missed;
    return {
      planned: schedulableCurrentWeekPlans.filter((session) => session.status !== "Skipped").length,
      completed,
      missed,
      skipped,
      percentage: due === 0 ? 0 : Math.round((completed / due) * 100),
    };
  }, [schedulableCurrentWeekPlans]);
  const workoutStatusReady = isWorkoutHistoryLoaded && !historyError;
  const completedSessionCount = useMemo(
    () =>
      completedSessions.filter((session) => today && session.date >= weekStart && session.date <= weekEnd).length,
    [completedSessions, today, weekEnd, weekStart],
  );
  const completedMinutes = useMemo(
    () =>
      completedSessions
        .filter((session) => today && session.date >= weekStart && session.date <= weekEnd)
        .reduce(
          (total, session) =>
            total + session.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0),
          0,
        ),
    [completedSessions, today, weekEnd, weekStart],
  );

  const totals = useMemo(() => {
    const plannedMinutes = schedulableCurrentWeekPlans
      .filter((session) => session.status !== "Skipped")
      .reduce((total, session) => total + plannedSessionDuration(session), 0);
    const longestWorkout = schedulableCurrentWeekPlans
      .filter((session) => session.status !== "Skipped")
      .reduce<PlannedSession | null>(
      (longest, session) =>
        !longest || plannedSessionDuration(session) > plannedSessionDuration(longest)
          ? session
          : longest,
      null,
      );
    const hoursByDay = weekDays.map((day) => ({
      day,
      minutes: schedulableCurrentWeekPlans
        .filter((session) => session.day === day && session.status !== "Skipped")
        .reduce((total, session) => total + plannedSessionDuration(session), 0),
    }));
    const busiestDay = hoursByDay.reduce<(typeof hoursByDay)[number] | null>(
      (longest, item) => (item.minutes > 0 && (!longest || item.minutes > longest.minutes) ? item : longest),
      null,
    );
    return { plannedMinutes, longestWorkout, busiestDay };
  }, [schedulableCurrentWeekPlans]);

  function persist(next: PlannedSession[], success: string): boolean {
    try {
      const serialized = JSON.stringify(next);
      window.localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, serialized);
      const persisted = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
      if (persisted !== serialized) {
        throw new Error("The saved plan did not match the submitted plan.");
      }
      setPlannedSessions(next);
      setEditing(null);
      setMovingSessionId("");
      setMoveToDay("");
      setStorageError("");
      setFeedback(success);
      notifyTrainingPlanUpdated();
      return true;
    } catch {
      setStorageError("The weekly plan could not be saved. Check browser storage and try again.");
      return false;
    }
  }

  function savePlannedSession(
    session: Omit<PlannedSession, "id" | "createdAt" | "updatedAt">,
    id?: string,
  ) {
    if (
      session.status !== "Completed" &&
      session.status !== "Skipped" &&
      !availableTrainingDays.includes(session.day)
    ) {
      setStorageError("Choose an available training day before saving this planned session.");
      return;
    }
    const now = new Date().toISOString();
    if (id) {
      const existing = plannedSessions.find((workout) => workout.id === id);
      if (!existing) {
        setStorageError("The planned session could not be found. Refresh the page and try again.");
        return;
      }
      const updated = plannedSessions.map((workout) =>
        workout.id === id ? { ...workout, ...session, updatedAt: now } : workout,
      );
      return persist(updated, "Planned session updated.");
    }
    const created: PlannedSession = {
      ...session,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    return persist([...plannedSessions, created], "Planned session added.");
  }

  function deletePlannedSession(id: string) {
    if (!plannedSessions.some((workout) => workout.id === id)) {
      setStorageError("The planned session could not be found. Refresh the page and try again.");
      return;
    }
    persist(
      plannedSessions.filter((workout) => workout.id !== id),
      "Planned session deleted.",
    );
  }

  const supportedEquipment = new Set(profile?.equipment ?? []);
  const hasSupportedActivity =
    supportedEquipment.has("Running access") ||
    supportedEquipment.has("Treadmill") ||
    supportedEquipment.has("Road bike") ||
    supportedEquipment.has("Indoor bike trainer") ||
    supportedEquipment.has("Pool access") ||
    supportedEquipment.has("Open-water swimming access") ||
    supportedEquipment.has("Gym access") ||
    supportedEquipment.has("Strength equipment");
  const hasSpecificGoal =
    Boolean(
      profile &&
        profile.primaryGoal &&
        (profile.primaryGoal !== "Custom" || profile.customGoalName.trim()),
    );
  const profileReadyForGeneration = Boolean(
      profile &&
        hasSpecificGoal &&
        profile.weeklyTrainingHours !== null &&
      profile.weeklyTrainingHours > 0 &&
      profile.availableTrainingDays.length > 0 &&
      hasSupportedActivity,
  );

  useEffect(() => {
    let cancelled = false;
    loadRecoveryCheckIns()
      .then((checkIns) => {
        const latest = checkIns[0];
        if (cancelled || !latest) return;
        const ageDays = (Date.now() - new Date(`${latest.date}T00:00:00`).getTime()) / 86_400_000;
        setLowRecovery(latest.readinessCategory === "Low" && ageDays <= 3);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function createProposal(variation: number) {
    if (!profile) return null;
    const result = generateTrainingWeek(
      profile,
      completedSessions.map((session) => ({
        date: session.date,
        title: session.title,
        activities: session.activities.map((activity) => ({
          activityType: activity.activityType,
          duration: activity.durationMinutes,
        })),
      })),
      plansWithStatus,
      new Date(),
      variation,
    );
    const invalidDays = findUnavailablePlanDays(
      result.sessions,
      availableTrainingDays,
      weekStart,
    );
    if (invalidDays.length > 0) {
      throw new Error(
        `Generated proposal was rejected because it included unavailable days: ${invalidDays.join(", ")}.`,
      );
    }
    const currentWeekMinutes = result.sessions
      .filter((session) => session.date >= weekStart && session.date <= weekEnd && session.status !== "Skipped")
      .reduce((sum, session) => sum + plannedSessionDuration(session), 0);
    const block = generateTrainingBlock(
      profile,
      completedSessions.map((session) => ({
        date: session.date,
        title: session.title,
        activities: session.activities.map((activity) => ({
          activityType: activity.activityType,
          duration: activity.durationMinutes,
        })),
      })),
      currentWeekMinutes,
      new Date(),
      variation,
      undefined,
      { lowRecovery },
    );
    const keptManual = plansWithStatus.filter(
      (session) => session.date > weekEnd && !session.generated && session.status === "Planned",
    );
    return {
      ...result,
      sessions: [...result.sessions, ...keptManual, ...block.sessions],
      explanation: `${result.explanation} ${block.explanation}`,
      blockWeeks: block.weeks,
    };
  }

  function proposalSignature(sessions: PlannedSession[]): string {
    return JSON.stringify(
      sessions
        .filter((session) => session.date >= weekStart && session.date <= weekEnd)
        .map((session) => ({
          date: session.date,
          title: session.title,
          reason: session.reason,
          activities: session.activities.map((activity) => ({
            type: activity.activityType,
            duration: activity.durationMinutes,
            intensity: activity.intensity,
          })),
        })),
    );
  }

  function isMeaningfullyDifferent(
    previous: PlannedSession[],
    next: PlannedSession[],
  ): boolean {
    const weekSessions = (sessions: PlannedSession[]) =>
      sessions.filter((session) => session.date >= weekStart && session.date <= weekEnd);
    const previousWeek = weekSessions(previous);
    const nextWeek = weekSessions(next);
    if (previousWeek.length !== nextWeek.length) return true;
    const activitiesByDate = (sessions: PlannedSession[]) =>
      new Map(
        sessions.map((session) => [
          session.date,
          session.activities.map((activity) => activity.activityType).sort().join("+"),
        ]),
      );
    const previousActivities = activitiesByDate(previousWeek);
    const nextActivities = activitiesByDate(nextWeek);
    if (
      [...new Set([...previousActivities.keys(), ...nextActivities.keys()])].some(
        (date) => previousActivities.get(date) !== nextActivities.get(date),
      )
    ) {
      return true;
    }
    const totalMinutes = (sessions: PlannedSession[]) =>
      sessions.reduce((sum, session) => sum + plannedSessionDuration(session), 0);
    const previousMinutes = totalMinutes(previousWeek);
    const nextMinutes = totalMinutes(nextWeek);
    return Math.abs(previousMinutes - nextMinutes) >= Math.max(15, previousMinutes * 0.1);
  }

  function describeProposalChanges(
    previous: PlannedSession[],
    next: PlannedSession[],
  ): string {
    const byDay = (sessions: PlannedSession[]) =>
      new Map(
        sessions
          .filter((session) => session.date >= weekStart && session.date <= weekEnd)
          .map((session) => [
            session.day,
            `${session.title} (${session.activities.map((activity) => activity.activityType).join(" + ")}, ${displayDuration(plannedSessionDuration(session))})`,
          ]),
      );
    const previousByDay = byDay(previous);
    const nextByDay = byDay(next);
    const changes = weekDays
      .filter((day) => previousByDay.get(day) !== nextByDay.get(day))
      .map(
        (day) =>
          `${day}: ${previousByDay.get(day) ?? "rest"} → ${nextByDay.get(day) ?? "rest"}`,
      );
    return changes.slice(0, 3).join("; ") ||
      `Weekly volume changed from ${displayDuration(
        previous.reduce((sum, session) => sum + plannedSessionDuration(session), 0),
      )} to ${displayDuration(
        next.reduce((sum, session) => sum + plannedSessionDuration(session), 0),
      )}.`;
  }

  function generateWeek() {
    setFeedback("");
    setStorageError("");
    setGenerationError("");
    setProposalNotice("");
    if (!profileReadyForGeneration || !profile) {
      setIncompleteProfile(true);
      return;
    }
    setIncompleteProfile(false);
    try {
      const generated = createProposal(0);
      if (!generated) return;
      setReviewSessions(generated.sessions);
      setBlockWeeks(generated.blockWeeks);
      setStarterWeek(generated.starterWeek);
      setGenerationExplanation(generated.explanation);
      setProposalIndex(0);
      setProposalNotice("A new training block has been generated for review.");
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "The week could not be generated. Review your available training days and try again.",
      );
    }
  }

  function regenerateWeek() {
    if (!profileReadyForGeneration || !profile || !reviewSessions) return;
    const previousSignature = proposalSignature(reviewSessions);
    setGenerationError("");
    try {
      for (let offset = 1; offset <= 84; offset += 1) {
        const nextIndex = proposalIndex + offset;
        const generated = createProposal(nextIndex);
        if (!generated) return;
        if (
          proposalSignature(generated.sessions) === previousSignature ||
          !isMeaningfullyDifferent(reviewSessions, generated.sessions)
        ) continue;
        setReviewSessions(generated.sessions);
        setBlockWeeks(generated.blockWeeks);
        setStarterWeek(generated.starterWeek);
        setGenerationExplanation(generated.explanation);
        setProposalIndex(nextIndex);
        setProposalNotice(
          `Alternative proposal ${nextIndex + 1} created. Changes: ${describeProposalChanges(reviewSessions, generated.sessions)}.`,
        );
        return;
      }
      setProposalNotice("No reasonable alternative was found with the current availability and profile. Your proposal is unchanged.");
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "The week could not be regenerated. Review your available training days and try again.",
      );
    }
  }

  function saveGeneratedWeek() {
    if (!reviewSessions) return;
    const invalidDays = findUnavailablePlanDays(
      reviewSessions,
      availableTrainingDays,
      weekStart,
    );
    if (invalidDays.length > 0) {
      setGenerationError(
        `This proposal cannot be saved because it includes unavailable days: ${invalidDays.join(", ")}.`,
      );
      return;
    }
    const linkedSessions = matchPlannedSessions(reviewSessions, completedSessions, today);
    if (persist(linkedSessions, "Your training block was saved.")) {
      setReviewSessions(null);
      setFeedback("Your training block was saved.");
    }
  }

  function setPlannedStatus(session: PlannedSession, status: PlannedSession["status"]) {
    if (
      status !== "Completed" &&
      status !== "Skipped" &&
      !availableTrainingDays.includes(session.day)
    ) {
      setStorageError("Move this session to an available training day before restoring it to the plan.");
      return;
    }
    persist(
      plannedSessions.map((item) =>
        item.id === session.id
          ? {
              ...item,
              status,
              ...(status === "Completed" ? {} : { matchedSessionId: undefined }),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
      status === "Skipped" ? "Planned session skipped." : "Planned session restored.",
    );
  }

  function moveWorkout(session: PlannedSession, targetDay: PlannedSession["day"]) {
    if (session.status === "Completed") {
      setStorageError("Completed workouts cannot be moved. Completed training history is unchanged.");
      return;
    }
    if (!availableTrainingDays.includes(targetDay)) {
      setStorageError("Choose an available training day before moving this workout.");
      return;
    }
    if (targetDay === session.day) return;
    const targetDate = dateForPlanDay(weekStart, targetDay);
    if (targetDate < today) {
      setStorageError("Move this workout to today or a later available day.");
      return;
    }
    const longestScheduledDuration = currentWeekPlans
      .filter((item) => item.status !== "Skipped")
      .reduce(
        (longest, item) => Math.max(longest, plannedSessionDuration(item)),
        0,
      );
    if (
      session.day === profile?.longWorkoutDay &&
      plannedSessionDuration(session) >= longestScheduledDuration
    ) {
      const shouldMove = window.confirm(
        "This workout is currently your week's long workout and is scheduled on your preferred long-workout day. Are you sure you want to move it?",
      );
      if (!shouldMove) return;
    }
    const originalDay = session.rescheduledFromDay ?? session.day;
    persist(
      plannedSessions.map((item) =>
        item.id === session.id
          ? {
              ...item,
              day: targetDay,
              date: targetDate,
              status: "Planned",
              ...(targetDay === originalDay
                ? { rescheduledFromDay: undefined }
                : { rescheduledFromDay: originalDay }),
              matchedSessionId: undefined,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
      `${session.title} moved from ${session.day} to ${targetDay}.`,
    );
  }

  function matchSession(sessionId: string, completedSessionId: string) {
    const selectedPlan = plannedSessions.find((item) => item.id === sessionId);
    if (!selectedPlan) return;
    if (!completedSessionId && !availableTrainingDays.includes(selectedPlan.day)) {
      setStorageError("Move this session to an available training day before unlinking it from completed history.");
      return;
    }
    if (
      completedSessionId &&
      plansWithStatus.some(
        (item) => item.id !== sessionId && item.matchedSessionId === completedSessionId,
      )
    ) {
      setStorageError("That completed session is already matched to another planned session.");
      return;
    }
    persist(
      plannedSessions.map((item) =>
        item.id === sessionId
          ? {
              ...item,
              status: completedSessionId ? "Completed" : "Planned",
              matchedSessionId: completedSessionId || undefined,
              autoMatchDisabled: !completedSessionId,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
      completedSessionId ? "Completed session matched." : "Completed session unlinked.",
    );
  }

  function regenerateSession(session: PlannedSession) {
    if (!profile) return;
    const generated = generateTrainingWeek(
      profile,
      completedSessions.map((item) => ({
        date: item.date,
        title: item.title,
        activities: item.activities.map((activity) => ({
          activityType: activity.activityType,
          duration: activity.durationMinutes,
        })),
      })),
      plansWithStatus,
    );
    const replacement = generated.sessions.find(
      (item) => item.day === session.day && item.date === session.date && item.status !== "Completed",
    );
    if (!replacement) {
      setStorageError("No replacement session fits this day and your current profile.");
      return;
    }
    persist(
      plannedSessions.map((item) =>
        item.id === session.id
          ? { ...replacement, id: item.id, createdAt: item.createdAt, updatedAt: new Date().toISOString() }
          : item,
      ),
      "Planned session regenerated.",
    );
  }

  const currentGoal =
    profile?.primaryGoal === "Custom"
      ? profile.customGoalName || "Custom goal"
      : profile?.primaryGoal;
  const isOverAvailability =
    profile?.weeklyTrainingHours !== null &&
    profile?.weeklyTrainingHours !== undefined &&
    totals.plannedMinutes > profile.weeklyTrainingHours * 60;
  const reviewWeekSessions =
    reviewSessions?.filter((session) => session.date >= weekStart && session.date <= weekEnd) ?? [];
  const reviewActivityCounts = {
    Swim: reviewWeekSessions.filter((session) => session.activities.some((activity) => activity.activityType === "Swim")).length,
    Ride: reviewWeekSessions.filter((session) => session.activities.some((activity) => activity.activityType === "Ride")).length,
    Run: reviewWeekSessions.filter((session) => session.activities.some((activity) => activity.activityType === "Run")).length,
    Strength: reviewWeekSessions.filter((session) => session.activities.some((activity) => activity.activityType === "Strength")).length,
  };
  const reviewPlannedMinutes = reviewWeekSessions
    .filter((session) => session.status !== "Skipped")
    .reduce((sum, session) => sum + plannedSessionDuration(session), 0);

  return (
    <section
      aria-labelledby="weekly-plan-heading"
      className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#748078]">
            Plan ahead
          </p>
          <h2
            className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#eef2ed]"
            id="weekly-plan-heading"
          >
            Training Planner
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-medium ${
              showRescheduleOptions
                ? "border-[#b8f36b]/30 text-[#c5ef97]"
                : "border-white/[0.09] text-[#a6b1a9] hover:border-[#b8f36b]/25 hover:text-[#c5ef97]"
            }`}
            disabled={!isLoaded || !isWorkoutHistoryLoaded}
            onClick={() => setShowRescheduleOptions((visible) => !visible)}
            type="button"
          >
            <CalendarDays aria-hidden="true" size={13} />
            Reschedule Week
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#b8f36b] px-3.5 py-2 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isLoaded || !isWorkoutHistoryLoaded || Boolean(historyError)}
            onClick={generateWeek}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
            Generate Training Block
          </button>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] font-medium text-[#a6b1a9] hover:border-[#b8f36b]/25 hover:text-[#c5ef97]"
            disabled={!isLoaded}
            onClick={() => {
              setFeedback("");
              setStorageError("");
              setEditing({ day: weekDays.find((day) => day === profile?.longWorkoutDay) ?? "Monday" });
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={13} />
            Add Workout Manually
          </button>
        </div>
      </div>

      {incompleteProfile && (
        <p className="mt-3 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]" role="alert">
          Complete your goal, weekly availability, available training days, and equipment before generating your week.{" "}
          <Link className="font-semibold underline underline-offset-2" href="/settings">
            Update profile
          </Link>
        </p>
      )}
      {generationError && (
        <p className="mt-3 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]" role="alert">
          {generationError}
        </p>
      )}
      {unavailableCurrentWeekPlans.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]" role="status">
          {unavailableCurrentWeekPlans.length} saved session{unavailableCurrentWeekPlans.length === 1 ? " is" : "s are"} on a day not currently selected as available. They are excluded from this week&apos;s schedule; edit and move them to an available day.
        </div>
      )}
      {showRescheduleOptions && (
        <section
          aria-labelledby="reschedule-week-heading"
          className="mt-4 rounded-lg border border-[#8dd7e5]/15 bg-[#0b100e] p-4"
        >
          <h3 className="text-sm font-semibold text-[#dce4dd]" id="reschedule-week-heading">
            Reschedule missed workouts
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-[#87938b]">
            Choose an available open day for a missed session, or skip it. Moving sessions keeps weekly volume unchanged and will not add extra workouts.
          </p>
          {rescheduleSuggestions.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {rescheduleSuggestions.map(({ session, options }) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/[0.07] bg-[#111714] p-3"
                  key={session.id}
                >
                  <div>
                    <p className="text-xs font-semibold text-[#dce4dd]">
                      Missed {session.day} {session.title}
                    </p>
                    <p className="mt-1 text-[10px] text-[#87938b]">
                      {displayDuration(plannedSessionDuration(session))} · {session.activities.map((activity) => activity.activityType).join(" + ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.map((day) => (
                      <button
                        className="rounded-md border border-[#8dd7e5]/20 px-2.5 py-1.5 text-[10px] text-[#b9e5eb] hover:bg-[#8dd7e5]/[0.06]"
                        key={day}
                        onClick={() => moveWorkout(session, day)}
                        type="button"
                      >
                        Move to {day}
                      </button>
                    ))}
                    <button
                      className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-[#a6b1a9] hover:text-white"
                      onClick={() => setPlannedStatus(session, "Skipped")}
                      type="button"
                    >
                      Skip this workout
                    </button>
                  </div>
                  {options.length === 0 && (
                    <p className="w-full text-[10px] text-[#f0c49d]">
                      No available open day fits this session without exceeding a daily workout limit.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[10px] text-[#78857d]">
              No missed workouts need rescheduling this week.
            </p>
          )}
        </section>
      )}
      {reviewSessions && (
        <section className="mt-4 rounded-lg border border-[#b8f36b]/20 bg-[#0b100e] p-4" aria-labelledby="review-week-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#eef2ed]" id="review-week-heading">
                Review your training block · Proposal {proposalIndex + 1}
              </h3>
              <p className="mt-1 text-[10px] font-medium text-[#c5ef97]">
                {proposalNotice}
              </p>
              {starterWeek && (
                <p className="mt-2 rounded-md border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.05] p-2 text-[10px] text-[#b9e5eb]">
                  Starter week based on your profile. Future weeks will also consider your completed training history.
                </p>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">{generationExplanation}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-[#b8f36b] px-3 py-2 text-xs font-semibold text-[#102010]"
                onClick={saveGeneratedWeek}
                type="button"
              >
                Save Block
              </button>
              <button
                className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#c5ef97]"
                onClick={regenerateWeek}
                type="button"
              >
                Regenerate Block
              </button>
              <button
                className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#a6b1a9]"
                onClick={() => setReviewSessions(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
          {schedulableCurrentWeekPlans.some((session) => session.status !== "Completed") && (
            <p className="mt-3 rounded-md border border-[#f0b47c]/15 bg-[#f0b47c]/[0.05] p-2.5 text-[10px] text-[#f0c49d]">
              Generating a training block will replace the remaining uncompleted workouts in this week and generated workouts in later weeks. Completed sessions and workouts you added manually to later weeks are kept.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Planned hours", `${(reviewPlannedMinutes / 60).toFixed(1)} hrs`],
              ["Planned sessions", reviewWeekSessions.filter((session) => session.status !== "Skipped").length],
              ["Swim sessions", reviewActivityCounts.Swim],
              ["Ride sessions", reviewActivityCounts.Ride],
              ["Run sessions", reviewActivityCounts.Run],
              ["Strength sessions", reviewActivityCounts.Strength],
            ].map(([label, value]) => (
              <div className="rounded-md border border-white/[0.06] bg-[#111714] px-3 py-2" key={label}>
                <p className="text-[9px] text-[#78857d]">{label}</p>
                <p className="mt-1 text-sm font-semibold text-[#dce4dd]">{value}</p>
              </div>
            ))}
          </div>
          <BlockPreview weeks={blockWeeks} />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {weekDays.map((day) => {
              const daySessions = reviewWeekSessions.filter((session) => session.day === day);
              const date = dateForPlanDay(weekStart, day);
              const completedToday = completedSessions.some((session) => session.date === date);
              return daySessions.length > 0 ? (
                daySessions.map((session) => (
                  <li className="rounded-md border border-white/[0.07] bg-[#111714] p-3" key={session.id}>
                    <p className="text-xs font-semibold text-[#dce4dd]">
                      {session.day} · {session.date} · {session.title}
                    </p>
                    {session.activities.map((activity) => (
                      <div className="mt-2" key={activity.id}>
                        <p className="text-[10px] text-[#a6b1a9]">
                          {activity.workoutType ?? activity.activityType} · {displayDuration(activity.durationMinutes)}
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#87938b]">
                          <span className="font-semibold">Expected effort:</span> {displayEffort(activity.intensity)}
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#87938b]">
                          <span className="font-semibold">Plain-language explanation:</span> {activity.instructions}
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#78857d]">
                          <span className="font-semibold">Purpose:</span> {activity.purpose}
                        </p>
                        <WorkoutStructureDetails activity={activity} />
                      </div>
                    ))}
                    {session.reason && (
                      <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] leading-relaxed text-[#c5ef97]">
                        <span className="font-semibold">Why this workout:</span> {session.reason}
                      </p>
                    )}
                  </li>
                ))
              ) : (
                <li className="rounded-md border border-white/[0.06] bg-[#111714]/60 p-3" key={day}>
                  <p className="text-xs font-semibold text-[#a6b1a9]">{day} · {date}</p>
                  <p className="mt-2 text-[10px] text-[#78857d]">
                    {date < today ? "Earlier this week" : completedToday ? "Training completed" : "Rest / recovery"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {feedback && (
        <p className="mt-3 text-xs text-[#c5ef97]" role="status">
          {feedback}
        </p>
      )}
      {storageError && (
        <p className="mt-3 text-xs text-[#f0b47c]" role="alert">
          {storageError}
        </p>
      )}
      {historyError && (
        <p className="mt-3 text-xs text-[#f0b47c]" role="alert">
          {historyError}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        <PlannerViewSelector mode={viewMode} onChange={setViewMode} />
        {viewMode !== "roadmap" && <TrainingFocusBanner date={weekStart} profile={profile} />}
      </div>
      {viewMode === "2w" || viewMode === "4w" ? (
        <PlannerHorizonCalendar mode={viewMode} onGenerate={generateWeek} profile={profile} sessions={plansWithStatus} today={today} />
      ) : viewMode === "roadmap" ? (
        <RoadmapView onGenerate={generateWeek} profile={profile} sessions={plansWithStatus} today={today} />
      ) : (
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[repeat(7,minmax(0,1fr))]">
        {plansByDay.map(({ day, plans: dayPlans }) => {
          const isLongWorkoutDay = profile?.longWorkoutDay === day;
          return (
            <article
              aria-label={`${day}${isLongWorkoutDay ? ", preferred long workout day" : ""}`}
              className={`min-h-56 min-w-0 rounded-lg border p-3.5 ${
                isLongWorkoutDay
                  ? "border-[#b8f36b]/25 bg-[#b8f36b]/[0.035]"
                  : "border-white/[0.07] bg-[#0b100e]"
              }`}
              key={day}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#e5ebe6]">{day}</h3>
                {isLongWorkoutDay && (
                  <span className="rounded-full bg-[#b8f36b]/[0.08] px-2 py-1 text-[9px] font-medium text-[#b8f36b]">
                    Long workout day
                  </span>
                )}
              </div>
              {dayPlans.length > 0 ? (
                <ul className="mt-3 grid min-w-0 gap-2">
                  {dayPlans.map((workout) => (
                    <li
                      className="min-w-0 rounded-lg border border-white/[0.06] bg-[#111714] p-3"
                      key={workout.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-xs font-semibold text-[#dce4dd]">
                            {workout.title}
                          </p>
                          <p className="mt-1 text-[10px] text-[#78857d]">
                            {workout.activities.map((activity) => activity.activityType).join(" + ")}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-medium ${
                            workoutStatusReady && workout.status === "Completed"
                              ? "border-[#b8f36b]/20 bg-[#b8f36b]/[0.07] text-[#c5ef97]"
                              : workoutStatusReady && workout.status === "Missed"
                                ? "border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] text-[#f0c49d]"
                                : workout.status === "Skipped"
                                  ? "border-white/[0.08] text-[#78857d]"
                                : "border-white/[0.08] text-[#a6b1a9]"
                          }`}
                        >
                          {workoutStatusReady && workout.status === "Completed" && (
                            <Check aria-hidden="true" size={10} />
                          )}
                          {workoutStatusReady ? workout.status : "Status unavailable"}
                        </span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#9aa69e]">
                        <Clock3 aria-hidden="true" size={12} />
                        {displayDuration(plannedSessionDuration(workout))}
                      </p>
                      <div className="mt-2 grid min-w-0 gap-2">
                        {workout.activities.map((activity) => (
                          <div className="min-w-0 rounded-md border border-white/[0.05] bg-[#0b100e]/60 p-2" key={activity.id}>
                            <p className="text-[10px] font-medium text-[#dce4dd]">
                              {activity.workoutType ?? activity.activityType} · {displayDuration(activity.durationMinutes)}
                            </p>
                            <p className="mt-1 break-words text-[9px] leading-relaxed text-[#87938b]">
                              <span className="font-semibold">Expected effort:</span> {displayEffort(activity.intensity)}
                            </p>
                            <p className="mt-1 break-words text-[9px] leading-relaxed text-[#87938b]">
                              <span className="font-semibold">Plain-language explanation:</span> {activity.instructions}
                            </p>
                            <p className="mt-1 break-words text-[9px] leading-relaxed text-[#78857d]">
                              <span className="font-semibold">Purpose:</span> {activity.purpose}
                            </p>
                            {activity.workoutType && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[10px] font-semibold text-[#c5ef97]">Workout details</summary>
                                <WorkoutStructureDetails activity={activity} />
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                      {workout.notes && (
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[#78857d]">
                          {workout.notes}
                        </p>
                      )}
                      {workout.reason && (
                        <p className="mt-2 break-words text-[10px] leading-relaxed text-[#c5ef97]">
                          <span className="font-semibold">Why this workout:</span> {workout.reason}
                        </p>
                      )}
                      {workout.rescheduledFromDay && (
                        <p className="mt-2 text-[9px] text-[#b9e5eb]">
                          Moved from {workout.rescheduledFromDay} to {workout.day}.
                        </p>
                      )}
                      {workout.matchedSessionId && (
                        <p className="mt-2 text-[9px] text-[#c5ef97]">
                          Matched to a completed training session.
                        </p>
                      )}
                      {workout.autoMatchDisabled && !workout.matchedSessionId && (
                        <p className="mt-2 text-[9px] text-[#87938b]">
                          Automatic matching is paused for this session.
                        </p>
                      )}
                      <label className="mt-2 grid min-w-0 gap-1 text-[9px] text-[#78857d]">
                        Match completed session
                        <select
                          aria-label={`Match completed session for ${workout.title}`}
                          className={`${inputClass} min-h-8 w-full min-w-0 text-[10px]`}
                          onChange={(event) => matchSession(workout.id, event.currentTarget.value)}
                          value={workout.matchedSessionId ?? ""}
                        >
                          <option value="">Automatic / no manual match</option>
                          {completedSessions.map((session) => (
                            <option key={session.id} value={session.id}>
                              {session.date} · {session.title || session.activities.map((activity) => activity.activityType).join(" + ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="mt-3 flex flex-wrap gap-1 border-t border-white/[0.06] pt-2">
                        {workout.status !== "Completed" && (
                          <>
                            <button
                              aria-expanded={movingSessionId === workout.id}
                              aria-label={`Move ${workout.title} to another day`}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] text-[#b9e5eb] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                              onClick={() => {
                                const isOpen = movingSessionId === workout.id;
                                setMovingSessionId(isOpen ? "" : workout.id);
                                setMoveToDay("");
                              }}
                              type="button"
                            >
                              <CalendarDays aria-hidden="true" size={10} /> Move Workout
                            </button>
                            {movingSessionId === workout.id && (
                              <div className="mt-1 flex w-full flex-wrap items-center gap-2">
                                <label className="sr-only" htmlFor={`move-day-${workout.id}`}>
                                  Move {workout.title} to day
                                </label>
                                <select
                                  className={`${inputClass} min-h-8 max-w-40 text-[10px]`}
                                  id={`move-day-${workout.id}`}
                                  onChange={(event) =>
                                    setMoveToDay(
                                      weekDays.find((day) => day === event.currentTarget.value) ?? "",
                                    )
                                  }
                                  value={moveToDay}
                                >
                                  <option value="">Select an available day</option>
                                  {availableTrainingDays
                                    .filter(
                                      (targetDay) =>
                                        targetDay !== workout.day &&
                                        dateForPlanDay(weekStart, targetDay) >= today,
                                    )
                                    .map((targetDay) => (
                                      <option key={targetDay} value={targetDay}>
                                        {targetDay}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  className="rounded-md bg-[#8dd7e5]/10 px-2.5 py-1.5 text-[9px] font-medium text-[#b9e5eb] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!moveToDay}
                                  onClick={() => {
                                    if (moveToDay) moveWorkout(workout, moveToDay);
                                  }}
                                  type="button"
                                >
                                  Move to selected day
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        <button
                          aria-label={`Edit ${workout.title} planned for ${day}`}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] text-[#c5ef97] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                          onClick={() => {
                            setFeedback("");
                            setStorageError("");
                            setEditing({ day, id: workout.id });
                          }}
                          type="button"
                        >
                          <Pencil aria-hidden="true" size={10} /> Edit
                        </button>
                        <button
                          aria-label={`Delete ${workout.title} planned for ${day}`}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] text-[#f0b47c] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                          onClick={() => deletePlannedSession(workout.id)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={10} /> Delete
                        </button>
                        {workout.status !== "Completed" && (
                          <button
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] text-[#a6b1a9] hover:bg-white/[0.05]"
                            onClick={() =>
                              setPlannedStatus(
                                workout,
                                workout.status === "Skipped" ? "Planned" : "Skipped",
                              )
                            }
                            type="button"
                          >
                            {workout.status === "Skipped" ? "Restore" : "Skip"}
                          </button>
                        )}
                        {workout.generated && workout.status !== "Completed" && (
                          <button
                            aria-label={`Regenerate ${workout.title}`}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] text-[#c5ef97] hover:bg-white/[0.05]"
                            onClick={() => regenerateSession(workout)}
                            type="button"
                          >
                            <RefreshCw aria-hidden="true" size={10} /> Regenerate
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[10px] text-[#68756d]">
                  {currentWeekPlans.some((session) => session.generated)
                    ? "Rest / recovery day"
                    : "Open for planning"}
                </p>
              )}
            </article>
          );
        })}
      </div>
      )}
      {!isLoaded && (
        <p className="mt-3 text-[10px] text-[#78857d]" role="status">
          Loading weekly plan…
        </p>
      )}

      <section
        aria-labelledby="weekly-summary-heading"
        className="mt-4 rounded-lg border border-white/[0.07] bg-[#0b100e] p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#e5ebe6]" id="weekly-summary-heading">
            Weekly Summary
          </h3>
          {!workoutStatusReady && (
            <span className="text-[10px] text-[#78857d]" role="status">
              {historyError ? "Completion status unavailable" : "Loading completion status…"}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Planned sessions", currentWeekPlans.filter((session) => session.status !== "Skipped").length],
            ["Completed sessions", workoutStatusReady ? completedSessionCount : "—"],
            [
              "Adherence",
              workoutStatusReady && adherence.planned > 0
                ? `${adherence.percentage}%`
                : "—",
            ],
            ["Planned hours", `${(totals.plannedMinutes / 60).toFixed(1)} hrs`],
            ["Completed hours", workoutStatusReady ? `${(completedMinutes / 60).toFixed(1)} hrs` : "—"],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/[0.06] bg-[#111714] px-3 py-2" key={label}>
              <p className="text-[9px] text-[#78857d]">{label}</p>
              <p className="mt-1 text-sm font-semibold text-[#dce4dd]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {isOverAvailability && (
        <p
          className="mt-3 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]"
          role="status"
        >
          Your planned {(totals.plannedMinutes / 60).toFixed(1)} hours exceed your available{" "}
          {profile?.weeklyTrainingHours} hours this week.
        </p>
      )}

      <details className="mt-3 rounded-lg border border-white/[0.07] bg-[#0b100e]">
        <summary className="cursor-pointer list-none px-3.5 py-3 text-[11px] font-medium text-[#a6b1a9] marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]">
          More Weekly Details
        </summary>
        <div className="grid gap-3 border-t border-white/[0.06] px-3.5 py-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[10px] text-[#78857d]">Missed workouts</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {workoutStatusReady ? adherence.missed : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Planned workouts completed</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {workoutStatusReady ? adherence.completed : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Longest workout</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {totals.longestWorkout
                ? `${totals.longestWorkout.title} · ${displayDuration(plannedSessionDuration(totals.longestWorkout))}`
                : "Not planned"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Current goal</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {currentGoal || "Complete your athlete profile to personalize MySynonym."}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Available training hours</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {profile?.weeklyTrainingHours === null || profile?.weeklyTrainingHours === undefined
                ? "Not set"
                : `${profile.weeklyTrainingHours} hrs per week`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Preferred long workout day</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {profile?.longWorkoutDay || "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#78857d]">Available training days</p>
            <p className="mt-1 text-xs font-medium text-[#dce4dd]">
              {profile?.availableTrainingDays.join(", ") || "Not set"}
            </p>
          </div>
        </div>
      </details>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          onClick={() => setEditing(null)}
        >
          <section
            aria-labelledby="planned-workout-dialog-title"
            aria-modal="true"
            className="flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#111714] shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] p-4 sm:p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">
                  Weekly plan
                </p>
                <h3
                  className="mt-1 text-base font-semibold text-[#eef2ed]"
                  id="planned-workout-dialog-title"
                >
                  {editing.id ? "Edit Planned Workout" : "Create Planned Workout"}
                </h3>
              </div>
              <button
                aria-label="Close planned workout form"
                className="rounded-md p-1 text-[#87938b] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                onClick={() => setEditing(null)}
                type="button"
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-0 sm:p-5 sm:pb-0">
            {storageError && (
              <p className="mb-3 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]" role="alert">
                {storageError}
              </p>
            )}
            <PlannedWorkoutForm
              day={editing.day}
              availableDays={availableTrainingDays}
              initial={editing.id ? plannedSessions.find((item) => item.id === editing.id) : undefined}
              key={`${editing.id ?? "new"}-${editing.day}`}
              onCancel={() => setEditing(null)}
              onSave={(session) => savePlannedSession(session, editing.id)}
            />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
