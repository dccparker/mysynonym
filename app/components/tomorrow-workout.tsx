"use client";

import { CalendarDays, Clock3, Moon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAthleteProfile } from "../lib/athlete-profile";
import {
  addDays,
  buildRoadmap,
  compactSessionLabel,
  horizonForWeek,
  sessionTotalMinutes,
  sessionsOnDate,
  summarizeWeek,
  tomorrowDate,
  weekStartOf,
  workoutContribution,
} from "../lib/training-horizon";
import {
  localDateString,
  normalizeTrainingPlan,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  type PlannedSession,
} from "../lib/training-plan";
import { TrainingFocusBanner } from "../training/planner-horizon";

export function TomorrowWorkout() {
  const { profile } = useAthleteProfile();
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [today, setToday] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const loadPlan = () => {
      setToday(localDateString(new Date()));
      try {
        const stored = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
        const normalized = stored === null ? [] : normalizeTrainingPlan(JSON.parse(stored));
        if (!normalized) throw new Error("invalid plan");
        setSessions(normalized);
        setLoadError("");
      } catch {
        setSessions([]);
        setLoadError("Tomorrow's workout could not be loaded from your training plan.");
      }
    };
    const timeout = window.setTimeout(loadPlan, 0);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
    window.addEventListener("storage", loadPlan);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
      window.removeEventListener("storage", loadPlan);
    };
  }, []);

  const tomorrow = today ? tomorrowDate(today) : "";
  const workouts = tomorrow ? sessionsOnDate(sessions, tomorrow) : [];
  const horizon = tomorrow ? horizonForWeek(profile, tomorrow) : null;
  const goal = profile?.primaryGoal === "Custom" ? profile.customGoalName : profile?.primaryGoal ?? "";
  const todayWorkouts = today ? sessionsOnDate(sessions, today) : [];
  const roadmap = today ? buildRoadmap(profile, today) : null;
  const thisWeekStart = today ? weekStartOf(today) : "";
  const nextWeek = thisWeekStart ? summarizeWeek(sessions, addDays(thisWeekStart, 7)) : null;
  const nextWeekHorizon = thisWeekStart ? horizonForWeek(profile, addDays(thisWeekStart, 7)) : null;
  const month = thisWeekStart
    ? [0, 1, 2, 3].map((index) => {
        const weekStart = addDays(thisWeekStart, index * 7);
        return { weekStart, summary: summarizeWeek(sessions, weekStart), horizon: horizonForWeek(profile, weekStart) };
      })
    : [];
  const monthMax = Math.max(1, ...month.map((week) => week.summary.minutes));

  return (
    <section aria-labelledby="tomorrow-heading" className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">Look ahead</p>
          <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#eef2ed]" id="tomorrow-heading">
            Tomorrow
          </h2>
        </div>
        <Link className="text-[10px] font-medium text-[#b8f36b] hover:text-[#d0f79d]" href="/training">
          Open planner
        </Link>
      </div>
      <div className="mt-4 grid gap-3">
        {loadError ? (
          <p className="text-xs text-[#f0b47c]" role="alert">{loadError}</p>
        ) : !today ? (
          <p className="text-xs text-[#78857d]">Loading plan…</p>
        ) : workouts.length === 0 ? (
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#8dd7e5]/10 text-[#8dd7e5]">
              <Moon size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#dce4dd]">Rest / nothing planned</p>
              <p className="mt-1 text-[11px] text-[#87938b]">
                {horizon
                  ? `Recovery supports your ${horizon.focus} focus.`
                  : "Generate a week in the Training Planner to see what's next."}
              </p>
            </div>
          </div>
        ) : (
          workouts.map((workout) => (
            <article className="rounded-md border border-white/[0.06] bg-[#0b100e] p-3" key={workout.id}>
              <p className="text-sm font-semibold text-[#dce4dd]">{workout.title}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#8a968e]">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} /> {workout.day}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock3 size={13} /> {sessionTotalMinutes(workout)} min
                </span>
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#9aa69e]">
                <span className="font-semibold">Purpose:</span>{" "}
                {workoutContribution(workout, horizon, goal) || workout.reason || "Keeps your plan on track."}
              </p>
            </article>
          ))
        )}
        {today && <TrainingFocusBanner date={today} profile={profile} />}
        {today && !loadError && (
          <div className="grid gap-3 border-t border-white/[0.07] pt-4 md:grid-cols-2">
            <div className="rounded-md border border-white/[0.06] bg-[#0b100e] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">Next week</p>
              {nextWeek && nextWeek.sessionCount > 0 ? (
                <>
                  <p className="mt-1.5 text-sm font-semibold text-[#dce4dd]">
                    {(nextWeek.minutes / 60).toFixed(1)} hrs · {nextWeek.sessionCount} sessions
                    {nextWeek.recovery ? " · Recovery week" : ""}
                  </p>
                  {nextWeekHorizon && (
                    <p className="mt-0.5 text-[11px] text-[#87938b]">
                      {nextWeekHorizon.phase} · {nextWeekHorizon.focus}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-[#9aa69e]">
                    {nextWeek.sessions.map((session) => compactSessionLabel(session)).join(" · ")}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-[11px] text-[#87938b]">
                  Not planned yet.{" "}
                  <Link className="text-[#b8f36b] hover:text-[#d0f79d]" href="/training">
                    Generate a training block
                  </Link>
                </p>
              )}
            </div>
            <div className="rounded-md border border-white/[0.06] bg-[#0b100e] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">This month</p>
              <ol className="mt-2 grid gap-1.5">
                {month.map(({ weekStart, summary, horizon: weekHorizon }, index) => (
                  <li className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-[10px]" key={weekStart}>
                    <span className="text-[#87938b]">{index === 0 ? "This week" : `Week ${index + 1}`}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[#a6b1a9]">
                        {weekHorizon ? weekHorizon.focus : "—"}
                        {summary.recovery ? " · Recovery" : ""}
                      </span>
                      <span
                        className={`mt-0.5 block h-1 rounded-full ${summary.recovery ? "bg-[#8dd7e5]/60" : "bg-[#b8f36b]/70"}`}
                        style={{ width: `${Math.round((summary.minutes / monthMax) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right text-[#dce4dd]">
                      {summary.sessionCount > 0 ? `${(summary.minutes / 60).toFixed(1)} hrs` : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-md border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.04] p-3 md:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">
                How today gets you to race day
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#b9e5eb]">
                {roadmap
                  ? `${roadmap.eventName || roadmap.goal} is in ${roadmap.daysRemaining} days (${roadmap.weeksRemaining} weeks). `
                  : ""}
                {workoutContribution(todayWorkouts[0], horizonForWeek(profile, today), goal) ||
                  "Add a target event date in your profile to connect each workout to race day."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
