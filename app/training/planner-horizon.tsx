"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { AthleteProfile } from "../lib/athlete-profile";
import {
  buildRoadmap,
  compactSessionLabel,
  horizonForWeek,
  addDays,
  sessionTotalMinutes,
  summarizeWeek,
  weekStartsForView,
  workoutContribution,
  type PlannerViewMode,
} from "../lib/training-horizon";
import type { BlockWeek } from "../lib/training-block";
import type { PlannedSession } from "../lib/training-plan";
import { WorkoutStructureDetails } from "./workout-structure";

const viewOptions: Array<{ mode: PlannerViewMode; label: string }> = [
  { mode: "1w", label: "1 Week" },
  { mode: "2w", label: "2 Weeks" },
  { mode: "4w", label: "4 Weeks" },
  { mode: "roadmap", label: "Roadmap" },
];

const dayLetters = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, options);
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function PlannerViewSelector({
  mode,
  onChange,
}: {
  mode: PlannerViewMode;
  onChange: (mode: PlannerViewMode) => void;
}) {
  return (
    <div aria-label="Planner view" className="flex flex-wrap gap-1.5" role="group">
      {viewOptions.map((option) => (
        <button
          aria-pressed={mode === option.mode}
          className={`min-h-9 rounded-lg border px-3 py-2 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] ${
            mode === option.mode
              ? "border-[#b8f36b]/40 bg-[#b8f36b]/10 text-[#c5ef97]"
              : "border-white/[0.09] text-[#a6b1a9] hover:border-[#b8f36b]/25 hover:text-[#c5ef97]"
          }`}
          key={option.mode}
          onClick={() => onChange(option.mode)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TrainingFocusBanner({
  profile,
  date,
  label = "Current training focus",
}: {
  profile: AthleteProfile | null;
  date: string;
  label?: string;
}) {
  const horizon = date ? horizonForWeek(profile, date) : null;
  if (!horizon) {
    return (
      <p className="rounded-lg border border-white/[0.07] bg-[#0b100e] px-3 py-2 text-[11px] text-[#87938b]">
        Add a target event date in your profile to see your training phase and focus.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#b8f36b]/20 bg-[#b8f36b]/[0.04] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">{label}</p>
      <p className="text-xs font-semibold text-[#c5ef97]">{horizon.focus}</p>
      <p className="text-[11px] text-[#a6b1a9]">
        {horizon.phase} phase
        {horizon.weeksToRace > 0
          ? ` · ${horizon.weeksToRace} week${horizon.weeksToRace === 1 ? "" : "s"} to race week`
          : horizon.weeksToRace === 0
            ? " · Race week"
            : ""}
      </p>
    </div>
  );
}

function WorkoutDetailDialog({
  session,
  profile,
  onClose,
}: {
  session: PlannedSession;
  profile: AthleteProfile | null;
  onClose: () => void;
}) {
  const horizon = horizonForWeek(profile, session.date);
  const goal =
    profile?.primaryGoal === "Custom" ? profile.customGoalName : profile?.primaryGoal ?? "";
  const contribution = workoutContribution(session, horizon, goal);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <section
        aria-labelledby="horizon-workout-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#111714] p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#748078]">
              {session.day} · {formatDate(session.date, { month: "short", day: "numeric" })}
            </p>
            <h3 className="mt-1 text-base font-semibold text-[#eef2ed]" id="horizon-workout-title">
              {session.title}
            </h3>
            <p className="mt-1 text-[11px] text-[#87938b]">
              {formatMinutes(sessionTotalMinutes(session))} · {session.status}
              {horizon ? ` · ${horizon.phase} · ${horizon.focus}` : ""}
            </p>
          </div>
          <button
            aria-label="Close workout details"
            autoFocus
            className="rounded-md p-1 text-[#87938b] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-2">
          {session.activities.map((activity) => (
            <div className="rounded-md border border-white/[0.06] bg-[#0b100e] p-3" key={activity.id}>
              <p className="text-xs font-medium text-[#dce4dd]">
                {activity.workoutType ?? activity.activityType} · {formatMinutes(activity.durationMinutes)} · {activity.intensity}
              </p>
              {activity.instructions && !activity.workoutType && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#9aa69e]">{activity.instructions}</p>
              )}
              {activity.purpose && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#87938b]">
                  <span className="font-semibold">Purpose:</span> {activity.purpose}
                </p>
              )}
              <WorkoutStructureDetails activity={activity} />
            </div>
          ))}
        </div>
        {session.reason && (
          <p className="mt-3 text-[11px] leading-relaxed text-[#c5ef97]">
            <span className="font-semibold">Why this workout:</span> {session.reason}
          </p>
        )}
        {contribution && (
          <p className="mt-3 text-[11px] leading-relaxed text-[#b9e5eb]">
            <span className="font-semibold">Toward your goal:</span> {contribution}
          </p>
        )}
        {session.notes && (
          <p className="mt-3 whitespace-pre-wrap text-[11px] leading-relaxed text-[#78857d]">{session.notes}</p>
        )}
        <p className="mt-4 text-[10px] text-[#68756d]">Switch to the 1 Week view to edit or move this workout.</p>
      </section>
    </div>
  );
}

function statusClass(session: PlannedSession): string {
  if (session.status === "Completed") return "border-[#b8f36b]/25 bg-[#b8f36b]/[0.08] text-[#c5ef97]";
  if (session.status === "Missed") return "border-[#f0b47c]/25 bg-[#f0b47c]/[0.06] text-[#f0c49d]";
  return "border-white/[0.08] bg-[#111714] text-[#dce4dd]";
}

export function PlannerHorizonCalendar({
  mode,
  sessions,
  today,
  profile,
  onGenerate,
}: {
  mode: "2w" | "4w";
  sessions: PlannedSession[];
  today: string;
  profile: AthleteProfile | null;
  onGenerate?: () => void;
}) {
  const [selected, setSelected] = useState<PlannedSession | null>(null);
  const compact = mode === "4w";
  const weekStarts = weekStartsForView(today, mode);
  return (
    <div className="mt-4 grid gap-3">
      {weekStarts.map((weekStart) => {
        const horizon = horizonForWeek(profile, weekStart);
        const weekSessions = sessions.filter(
          (session) => session.date >= weekStart && session.date <= addDays(weekStart, 6) && session.status !== "Skipped",
        );
        const minutes = weekSessions.reduce((sum, session) => sum + sessionTotalMinutes(session), 0);
        const isRecoveryWeek = weekSessions.some((session) => session.weekType === "Recovery");
        const isFuture = weekStart > weekStartsForView(today, "1w")[0];
        return (
          <section
            aria-label={`Week of ${formatDate(weekStart, { month: "long", day: "numeric" })}`}
            className="rounded-lg border border-white/[0.07] bg-[#0b100e] p-3"
            key={weekStart}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[#e5ebe6]">
                {weekStart === weekStartsForView(today, "1w")[0] ? "This week" : "Week of"}{" "}
                {formatDate(weekStart, { month: "short", day: "numeric" })}
              </h3>
              <p className="text-[10px] text-[#87938b]">
                {horizon ? <span className="text-[#c5ef97]">{horizon.focus}</span> : null}
                {horizon ? ` · ${horizon.phase}` : ""}
                {isRecoveryWeek ? " · Recovery week" : ""}
                {" · "}
                {(minutes / 60).toFixed(1)} hrs planned
              </p>
            </div>
            {isFuture && weekSessions.length === 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-white/[0.1] p-3">
                <p className="text-[11px] text-[#87938b]">
                  Nothing planned yet{horizon ? ` for this ${horizon.phase.toLowerCase()} week` : ""}. Generate a training block to fill the weeks ahead.
                </p>
                {onGenerate && (
                  <button
                    className="rounded-lg bg-[#b8f36b] px-3 py-1.5 text-[11px] font-semibold text-[#102010] hover:bg-[#c8f78b]"
                    onClick={onGenerate}
                    type="button"
                  >
                    Generate Training Block
                  </button>
                )}
              </div>
            ) : (
            <ul className="mt-2 grid grid-cols-7 gap-1.5">
              {dayLetters.map((letter, index) => {
                const date = addDays(weekStart, index);
                const daySessions = weekSessions.filter((session) => session.date === date);
                const isToday = date === today;
                const isTomorrow = date === addDays(today, 1);
                return (
                  <li
                    className={`min-w-0 rounded-md border p-1.5 ${
                      isToday
                        ? "border-[#b8f36b]/40"
                        : isTomorrow
                          ? "border-[#8dd7e5]/30"
                          : "border-white/[0.05]"
                    }`}
                    key={date}
                  >
                    <p className="text-[9px] font-medium text-[#78857d]">
                      {letter} {formatDate(date, { day: "numeric" })}
                      {isToday ? " · Today" : isTomorrow ? " · Tmrw" : ""}
                    </p>
                    {daySessions.length === 0 ? (
                      <p className="mt-1 text-[10px] text-[#56625b]">Rest</p>
                    ) : (
                      daySessions.map((session) => (
                        <button
                          aria-label={`Open ${session.title} on ${session.day}`}
                          className={`mt-1 block w-full min-w-0 rounded border px-1.5 py-1 text-left hover:border-[#b8f36b]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b] ${statusClass(session)}`}
                          key={session.id}
                          onClick={() => setSelected(session)}
                          type="button"
                        >
                          <span className="block truncate text-[10px] font-semibold">
                            {compactSessionLabel(session)}
                          </span>
                          {!compact && (
                            <span className="block truncate text-[9px] text-[#87938b]">{session.title}</span>
                          )}
                        </button>
                      ))
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </section>
        );
      })}
      {selected && (
        <WorkoutDetailDialog onClose={() => setSelected(null)} profile={profile} session={selected} />
      )}
    </div>
  );
}

const phaseColors: Record<string, string> = {
  Foundation: "bg-[#8dd7e5]/25",
  Base: "bg-[#8dd7e5]/45",
  Build: "bg-[#f0b47c]/45",
  Peak: "bg-[#f0b47c]/70",
  Taper: "bg-[#b8f36b]/40",
  Race: "bg-[#b8f36b]/80",
  Recovery: "bg-white/20",
};

export function RoadmapSummary({ profile, today }: { profile: AthleteProfile | null; today: string }) {
  const roadmap = today ? buildRoadmap(profile, today) : null;
  if (!roadmap) {
    return (
      <p className="rounded-lg border border-white/[0.07] bg-[#0b100e] p-3 text-xs text-[#87938b]">
        Set a target event and date in your profile to see your roadmap.
      </p>
    );
  }
  const dateLabel = formatDate(roadmap.targetDate, { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Goal event", roadmap.eventName || roadmap.goal],
          ["Target date", dateLabel],
          [
            "Weeks remaining",
            roadmap.daysRemaining < 0 ? "Event complete" : `${roadmap.weeksRemaining} (${roadmap.daysRemaining} days)`,
          ],
        ].map(([label, value]) => (
          <div className="rounded-md border border-white/[0.06] bg-[#0b100e] px-3 py-2" key={label}>
            <p className="text-[9px] text-[#78857d]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[#dce4dd]">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-[#b8f36b]/20 bg-[#b8f36b]/[0.04] px-3 py-2">
          <p className="text-[9px] text-[#78857d]">Current phase</p>
          <p className="mt-1 text-sm font-semibold text-[#c5ef97]">{roadmap.current.phase}</p>
        </div>
        <div className="rounded-md border border-white/[0.06] bg-[#0b100e] px-3 py-2">
          <p className="text-[9px] text-[#78857d]">Current focus</p>
          <p className="mt-1 text-sm font-semibold text-[#dce4dd]">{roadmap.current.focus}</p>
        </div>
        <div className="rounded-md border border-white/[0.06] bg-[#0b100e] px-3 py-2">
          <p className="text-[9px] text-[#78857d]">Next phase</p>
          <p className="mt-1 text-sm font-semibold text-[#dce4dd]">
            {roadmap.next ? `${roadmap.next.phase} · ${roadmap.next.focus}` : "—"}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-[#9aa69e]">{roadmap.contribution}</p>
    </div>
  );
}

export function BlockPreview({ weeks }: { weeks: BlockWeek[] }) {
  if (weeks.length === 0) return null;
  const max = Math.max(...weeks.map((week) => week.plannedMinutes), 1);
  return (
    <section aria-label="Training block preview" className="mt-3 rounded-md border border-white/[0.06] bg-[#111714] p-3">
      <h4 className="text-xs font-semibold text-[#dce4dd]">Training block · next {weeks.length} weeks</h4>
      <ol className="mt-2 grid gap-1.5">
        {weeks.map((week) => (
          <li className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2 text-[10px]" key={week.weekStart}>
            <span className="text-[#87938b]">{formatDate(week.weekStart, { month: "short", day: "numeric" })}</span>
            <span className="min-w-0">
              <span className="block truncate text-[#a6b1a9]">
                {week.phase} · {week.focus}
                {week.weekType === "Recovery" ? " · Recovery week" : ""}
              </span>
              <span
                className={`mt-0.5 block h-1 rounded-full ${week.weekType === "Recovery" ? "bg-[#8dd7e5]/60" : "bg-[#b8f36b]/70"}`}
                style={{ width: `${Math.round((week.plannedMinutes / max) * 100)}%` }}
              />
            </span>
            <span className="text-right text-[#dce4dd]">{(week.plannedMinutes / 60).toFixed(1)} hrs</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WeeklyProgression({
  sessions,
  today,
  profile,
  onGenerate,
}: {
  sessions: PlannedSession[];
  today: string;
  profile: AthleteProfile | null;
  onGenerate?: () => void;
}) {
  const [selected, setSelected] = useState<PlannedSession | null>(null);
  const start = weekStartsForView(today, "1w")[0];
  const weeks = Array.from({ length: 12 }, (_, index) => addDays(start, index * 7))
    .map((weekStart) => ({ weekStart, summary: summarizeWeek(sessions, weekStart), horizon: horizonForWeek(profile, weekStart) }))
    .filter((week) => profile?.targetEventDate ? week.horizon !== null : true);
  const max = Math.max(...weeks.map((week) => week.summary.minutes), 1);
  const unplanned = weeks.some((week) => week.weekStart > start && week.summary.sessionCount === 0);
  return (
    <section aria-labelledby="weekly-progression-heading" className="rounded-lg border border-white/[0.07] bg-[#0b100e] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-[#e5ebe6]" id="weekly-progression-heading">
          Weekly progression
        </h3>
        {unplanned && onGenerate && (
          <button
            className="rounded-lg bg-[#b8f36b] px-3 py-1.5 text-[11px] font-semibold text-[#102010] hover:bg-[#c8f78b]"
            onClick={onGenerate}
            type="button"
          >
            Generate Training Block
          </button>
        )}
      </div>
      <ol className="mt-3 grid gap-2">
        {weeks.map(({ weekStart, summary, horizon }) => (
          <li className="rounded-md border border-white/[0.06] bg-[#111714] px-3 py-2" key={weekStart}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#dce4dd]">
                {weekStart === start ? "This week" : formatDate(weekStart, { month: "short", day: "numeric" })}
                {horizon && <span className="ml-2 font-normal text-[#87938b]">{horizon.phase} · {horizon.focus}</span>}
                {summary.recovery && <span className="ml-2 text-[10px] font-medium text-[#8dd7e5]">Recovery week</span>}
              </p>
              <p className="text-[10px] text-[#a6b1a9]">
                {summary.sessionCount > 0
                  ? `${(summary.minutes / 60).toFixed(1)} hrs · ${summary.sessionCount} sessions`
                  : "Not planned yet"}
              </p>
            </div>
            {summary.sessionCount > 0 && (
              <>
                <div
                  className={`mt-1.5 h-1 rounded-full ${summary.recovery ? "bg-[#8dd7e5]/60" : "bg-[#b8f36b]/70"}`}
                  style={{ width: `${Math.round((summary.minutes / max) * 100)}%` }}
                />
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {summary.sessions.map((session) => (
                    <button
                      className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-[#c9d3cc] hover:border-[#b8f36b]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
                      key={session.id}
                      onClick={() => setSelected(session)}
                      type="button"
                    >
                      {formatDate(session.date, { weekday: "short" })} {compactSessionLabel(session)}
                    </button>
                  ))}
                </p>
              </>
            )}
          </li>
        ))}
      </ol>
      {selected && <WorkoutDetailDialog onClose={() => setSelected(null)} profile={profile} session={selected} />}
    </section>
  );
}

export function RoadmapView({
  profile,
  today,
  sessions,
  onGenerate,
}: {
  profile: AthleteProfile | null;
  today: string;
  sessions: PlannedSession[];
  onGenerate?: () => void;
}) {
  const roadmap = today ? buildRoadmap(profile, today) : null;
  return (
    <div className="mt-4 grid gap-4">
      <RoadmapSummary profile={profile} today={today} />
      {today && <WeeklyProgression onGenerate={onGenerate} profile={profile} sessions={sessions} today={today} />}
      {roadmap && (
        <section aria-labelledby="roadmap-timeline-heading" className="rounded-lg border border-white/[0.07] bg-[#0b100e] p-3.5">
          <h3 className="text-xs font-semibold text-[#e5ebe6]" id="roadmap-timeline-heading">
            Roadmap timeline
          </h3>
          {roadmap.current.progress !== null && roadmap.current.weekInPhase !== null ? (
            <div className="mt-3">
              <p className="text-[10px] text-[#87938b]">
                {roadmap.current.phase} phase progress · week {roadmap.current.weekInPhase} of{" "}
                {roadmap.current.totalWeeks}
              </p>
              <div
                aria-label={`${roadmap.current.phase} phase progress`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={roadmap.current.progress}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                role="progressbar"
              >
                <div className="h-full bg-[#b8f36b]" style={{ width: `${roadmap.current.progress}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-[#87938b]">
              {roadmap.current.phase === "Recovery"
                ? "Event complete. Recover well before planning your next goal."
                : `${roadmap.current.weeksLeftInPhase} weeks remain in the ${roadmap.current.phase} phase.`}
            </p>
          )}
          <ol className="mt-3 grid gap-2">
            {roadmap.blocks.map((block) => (
              <li
                aria-current={block.isCurrent ? "step" : undefined}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                  block.isCurrent ? "border-[#b8f36b]/30 bg-[#b8f36b]/[0.05]" : "border-white/[0.06] bg-[#111714]"
                }`}
                key={`${block.phase}-${block.startWeek}`}
              >
                <span aria-hidden="true" className={`h-8 w-1.5 shrink-0 rounded-full ${phaseColors[block.phase]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#dce4dd]">
                    {block.phase === "Race"
                      ? "Race Week"
                      : block.weeks === 1
                        ? `Week ${block.startWeek} · ${block.phase}`
                        : `Weeks ${block.startWeek}-${block.endWeek} · ${block.phase}`}
                    {block.isCurrent && <span className="ml-2 text-[10px] font-medium text-[#b8f36b]">You are here</span>}
                  </p>
                  <p className="text-[10px] text-[#87938b]">{block.focus}</p>
                </div>
                <p className="shrink-0 text-[10px] text-[#78857d]">
                  {block.weeks} wk{block.weeks === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
