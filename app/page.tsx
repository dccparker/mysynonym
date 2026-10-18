"use client";

import {
  ArrowRight,
  Bell,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Footprints,
  Heart,
  Sparkles,
  Target,
  Utensils,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatTargetEvent,
  isAthleteProfileComplete,
  useAthleteProfile,
  type AthleteProfile,
} from "./lib/athlete-profile";
import { TodaysDecision } from "./components/todays-decision";
import { DailyCoachingPlan } from "./components/daily-coaching-plan";
import { TomorrowWorkout } from "./components/tomorrow-workout";
import { CoachInsights } from "./components/coach-insights";
import { greetingFor } from "./lib/daily-briefing";
import { DailyRecoveryCheckIn } from "./components/daily-recovery-check-in";
import {
  localDateString,
  normalizeTrainingPlan,
  plannedSessionDuration,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  type PlannedSession,
} from "./lib/training-plan";

const weekDays = [
  { label: "Mon", fullName: "Monday" },
  { label: "Tue", fullName: "Tuesday" },
  { label: "Wed", fullName: "Wednesday" },
  { label: "Thu", fullName: "Thursday" },
  { label: "Fri", fullName: "Friday" },
  { label: "Sat", fullName: "Saturday" },
  { label: "Sun", fullName: "Sunday" },
];

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#748078]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[#eef2ed]">
          {title}
        </h2>
      </div>
      {action && (
        <a
          className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#a6b1a9] transition-colors hover:text-[#c2f680]"
          href="#training"
        >
          {action}
          <ArrowRight size={14} />
        </a>
      )}
    </div>
  );
}

function WeeklyProgress({ profile }: { profile: AthleteProfile | null }) {
  const availableDays = profile?.availableTrainingDays ?? [];
  const weeklyHours = profile?.weeklyTrainingHours;
  return (
    <article id="training" className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#a6b1a9]">Weekly availability</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.05em] text-[#f1f4f0]">
              {weeklyHours ?? "—"}
            </span>
            <span className="text-xs text-[#849088]">{weeklyHours === null || weeklyHours === undefined ? "hours not set" : "hours per week"}</span>
          </div>
        </div>
        <div className="rounded-md border border-white/[0.07] bg-[#171e1a] px-2.5 py-1.5 text-[10px] text-[#a2ada5]">
          {availableDays.length} available {availableDays.length === 1 ? "day" : "days"}
          <ChevronRight size={12} className="ml-1 inline" />
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-[10px] text-[#7f8c83]">
        <span className="size-1.5 rounded-full bg-[#b8f36b]" />
        {profile
          ? profile.longWorkoutDay
            ? `Long workout: ${profile.longWorkoutDay}`
            : "Long workout day not set"
          : "Complete your athlete profile to personalize MySynonym."}
      </div>
      <div
        aria-label={`Available training days: ${availableDays.length ? availableDays.join(", ") : "not set"}`}
        className="mt-4 grid h-[116px] grid-cols-7 items-end gap-2 sm:gap-3"
        role="img"
      >
        {weekDays.map(({ label, fullName }) => {
          const isAvailable = availableDays.includes(fullName);
          return (
            <div key={label} className="flex h-full flex-col items-center justify-end gap-2">
              <div className="flex h-[91px] w-full items-end overflow-hidden rounded-[3px] bg-[#1c2520]">
                {isAvailable && (
                  <div
                    className={`w-full rounded-[3px] ${profile?.longWorkoutDay === fullName ? "bg-[#d0f79d]" : "bg-[#769c52]"}`}
                    style={{ height: profile?.longWorkoutDay === fullName ? "100%" : "65%" }}
                  />
                )}
              </div>
              <span className={`text-[9px] ${isAvailable ? "font-semibold text-[#d4e9ba]" : "text-[#758178]"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function GoalCard({ profile }: { profile: AthleteProfile | null }) {
  const profileComplete = isAthleteProfileComplete(profile);
  const targetEvent = profile ? formatTargetEvent(profile) : "Not set";
  const weeklyAvailability = profile?.weeklyTrainingHours !== null && profile?.weeklyTrainingHours !== undefined
    ? `${profile.weeklyTrainingHours} hours per week`
    : "Not set";
  const primaryGoal =
    profile?.primaryGoal === "Custom"
      ? profile.customGoalName || "Custom goal"
      : profile?.primaryGoal || "Goal not set";
  const availableEquipment = profile
    ? [...profile.equipment, profile.otherEquipment].filter(Boolean)
    : [];
  return (
    <article className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[#a6b1a9]">Current goal</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#8dd7e5]/10 text-[#8dd7e5]">
          <Target size={16} />
        </span>
      </div>
      {!profileComplete && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#f0c49d]">
          Complete your athlete profile to personalize MySynonym.{" "}
          <Link className="font-medium text-[#c5ef97] hover:text-[#d0f79d]" href="/settings">
            Complete profile
          </Link>
        </p>
      )}
      <h3 className="mt-4 text-[21px] font-semibold tracking-[-0.03em] text-[#f0f4ef]">
        {primaryGoal}
      </h3>
      <p className="mt-1 text-[11px] text-[#849088]">
        {profile?.goalDescription || "Your primary goal"}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-white/[0.07] py-4">
        <div>
          <p className="text-[10px] text-[#78857d]">Training experience</p>
          <p className="mt-1 text-sm font-medium text-[#dce4dd]">
            {profile?.trainingExperience || "Not set"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Available training hours</p>
          <p className="mt-1 text-sm font-medium text-[#dce4dd]">{weeklyAvailability}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Preferred name</p>
          <p className="mt-1 text-xs font-medium text-[#dce4dd]">{profile?.preferredName || "Not set"}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Target event</p>
          <p className="mt-1 text-xs font-medium text-[#dce4dd]">{targetEvent}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Available training days</p>
          <p className="mt-1 text-xs font-medium text-[#dce4dd]">
            {profile?.availableTrainingDays.join(", ") || "Not set"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Long workout day</p>
          <p className="mt-1 text-xs font-medium text-[#dce4dd]">{profile?.longWorkoutDay || "Not set"}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Available equipment</p>
          <p className="mt-1 text-xs leading-relaxed text-[#dce4dd]">
            {availableEquipment.length ? availableEquipment.join(", ") : "Not set"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[#7e8a82]">
          <CalendarDays size={13} />
          Preferred units · {profile?.units || (profile ? "Not set" : "—")}
        </span>
        <Link className="text-[10px] font-medium text-[#b8f36b] hover:text-[#d0f79d]" href="/settings">
          Edit profile
        </Link>
      </div>
    </article>
  );
}

function WorkoutCard() {
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [today, setToday] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const loadPlan = () => {
      try {
        const stored = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
        if (stored === null) {
          setSessions([]);
        } else {
          const normalized = normalizeTrainingPlan(JSON.parse(stored));
          if (!normalized) throw new Error("The saved training plan has an invalid format.");
          setSessions(normalized);
        }
        setLoadError("");
      } catch {
        setSessions([]);
        setLoadError("The upcoming workout could not be loaded from your training plan.");
      } finally {
        setIsLoaded(true);
      }
    };
    const timeout = window.setTimeout(() => {
      setToday(localDateString(new Date()));
      loadPlan();
    }, 0);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
    window.addEventListener("storage", loadPlan);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlan);
      window.removeEventListener("storage", loadPlan);
    };
  }, []);

  const upcoming = sessions
    .filter(
      (session) =>
        session.date >= today &&
        session.status === "Planned",
    )
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  const upcomingActivity = upcoming?.activities[0]?.activityType ?? "Run";
  const upcomingIcon =
    upcomingActivity === "Swim" ? Waves : upcomingActivity === "Ride" ? Bike : Footprints;
  const UpcomingIcon = upcomingIcon;
  const upcomingDate = upcoming
    ? new Date(`${upcoming.date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <article className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#a6b1a9]">Next planned session</p>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.025em] text-[#eef2ed]">
            {!isLoaded
              ? "Loading plan…"
              : loadError
                ? "Plan unavailable"
                : upcoming?.title ?? "No upcoming workout"}
          </h3>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0b47c]/10 text-[#f0b47c]">
          <UpcomingIcon size={17} />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-[#8a968e]">
        {upcoming && (
          <>
            <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {upcoming.day}, {upcomingDate}</span>
            <span className="flex items-center gap-1.5"><Clock3 size={13} /> {plannedSessionDuration(upcoming)} min</span>
            <span className="flex items-center gap-1.5"><Heart size={13} /> {upcoming.activities.map((activity) => activity.intensity).join(" · ")}</span>
          </>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
        <p className="max-w-[330px] text-[11px] leading-relaxed text-[#869289]">
          {loadError
            ? loadError
            : upcoming
            ? upcoming.rescheduledFromDay
              ? `Moved from ${upcoming.rescheduledFromDay}. ${upcoming.reason}`
              : upcoming.reason
            : "Generate a week in the Training Planner to see your next planned workout here."}
        </p>
        <a
          aria-label="View training plan"
          className="ml-3 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-[#aab5ad] transition-colors hover:border-[#b8f36b]/30 hover:text-[#c5ef97]"
          href="#training"
        >
          <ArrowRight size={15} />
        </a>
      </div>
    </article>
  );
}

function CoachCard() {
  return (
    <article id="coach" className="rounded-lg border border-[#8dd7e5]/15 bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[#8dd7e5]">
        <Sparkles size={15} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Coach&apos;s note</p>
      </div>
      <p className="mt-4 text-[13px] font-medium leading-relaxed text-[#e5ebe6]">
        Recovery remains strong. The fastest path forward is steady execution, not extra intensity.
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px] text-[#78857d]">
        <span>Based on your last 7 days</span>
        <span className="flex items-center gap-1 text-[#8dd7e5]">View insight <ArrowRight size={12} /></span>
      </div>
    </article>
  );
}

function NutritionCard() {
  return (
    <article id="nutrition" className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#a6b1a9]">Today&apos;s fueling</p>
        <Utensils size={15} className="text-[#f0b47c]" />
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[25px] font-semibold leading-none tracking-[-0.04em] text-[#f1f4f0]">1,840</span>
        <span className="text-[10px] text-[#7f8b83]">/ 2,600 kcal</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#222c26]">
        <div className="h-full w-[71%] rounded-full bg-[#dca775]" />
      </div>
      <div className="mt-4 flex justify-between text-[10px]">
        <span className="text-[#8c9890]">Protein <strong className="ml-1 font-medium text-[#d9e0da]">118g</strong></span>
        <span className="text-[#8c9890]">Carbs <strong className="ml-1 font-medium text-[#d9e0da]">206g</strong></span>
      </div>
    </article>
  );
}

export default function Home() {
  const { profile, isProfileLoaded, profileError } = useAthleteProfile();
  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">Athlete dashboard</p>
              <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
                {profile?.preferredName
                  ? greetingFor(new Date().getHours(), profile.preferredName)
                  : "Your dashboard"}
                <span className="text-[#b8f36b]">.</span>
              </h1>
              <p className="mt-1.5 text-xs text-[#87938b]">Your training data, translated into today&apos;s decisions.</p>
              {isProfileLoaded && !profile && (
                <Link className="mt-1 inline-block text-[10px] text-[#b8f36b] hover:text-[#d0f79d]" href="/settings">
                  Complete your athlete profile to personalize MySynonym.
                </Link>
              )}
              {isProfileLoaded && profile && (
                <p className="mt-1 text-[10px] text-[#87938b]">
                  {profile.primaryGoal === "Custom"
                    ? profile.customGoalName || "Custom goal"
                    : profile.primaryGoal || "Goal not set"}
                  {profile.targetEventName ? ` · ${profile.targetEventName}` : ""}
                  {profile.targetEventDate
                    ? ` · ${new Date(`${profile.targetEventDate}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : ""}
                </p>
              )}
              {profileError && (
                <p className="mt-1 text-[10px] text-[#f0b47c]" role="alert">
                  {profileError}
                </p>
              )}
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#111714] px-3 py-2 text-[10px] text-[#a4afa7]">
                <span className="size-1.5 rounded-full bg-[#b8f36b]" />
                {profile ? "Athlete profile" : "Profile not set"}
              </span>
              <button
                aria-label="Notifications"
                className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#111714] text-[#aab5ad] transition-colors hover:text-white"
                type="button"
              >
                <Bell size={15} />
              </button>
            </div>
          </header>

          <div className="mb-5"><DailyCoachingPlan /></div>

          <div className="mb-5"><TomorrowWorkout /></div>

          <div className="mb-5"><CoachInsights /></div>

          <TodaysDecision />

          <div id="dashboard" className="mt-5">
            <DailyRecoveryCheckIn />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <SectionHeading eyebrow="The big picture" title="Training This Week" action="Training plan" />
              <WeeklyProgress profile={profile} />
            </section>
            <section className="lg:col-span-5">
              <SectionHeading eyebrow="Your north star" title="Current Focus" />
              <GoalCard profile={profile} />
            </section>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <SectionHeading eyebrow="Up next" title="Upcoming workout" action="View schedule" />
              <WorkoutCard />
            </section>
            <section className="lg:col-span-5">
              <SectionHeading eyebrow="Daily guidance" title="In your corner" />
              <CoachCard />
            </section>
          </div>

          <section className="mt-8" aria-label="Nutrition">
            <SectionHeading eyebrow="Eat for the work" title="Nutrition Today" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <NutritionCard />
              <article className="flex items-center justify-between gap-5 rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#8dd7e5]/10 text-[#8dd7e5]"><Waves size={17} /></span>
                  <div>
                    <p className="text-xs font-medium text-[#e3eae4]">Hydration</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#839087]">1.6 L logged · aim for another 1.2 L today</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#b8f36b]"><Check size={13} /> On pace</div>
              </article>
            </div>
          </section>

          <footer id="settings" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] py-5 text-[10px] text-[#68756d]">
            <p>
              {profile
                ? [
                    profile.preferredName,
                    profile.trainingExperience,
                    profile.weeklyTrainingHours !== null
                      ? `${profile.weeklyTrainingHours} available hrs/week`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Athlete profile"
                : "Complete your athlete profile to personalize MySynonym."}
            </p>
            <Link className="inline-flex items-center gap-1.5 transition-colors hover:text-[#b8f36b]" href="/settings">
              <CircleHelp size={13} /> Profile & settings <ChevronRight size={12} />
            </Link>
          </footer>
    </div>
  );
}