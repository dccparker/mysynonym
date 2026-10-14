"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, Utensils, Waves, Zap } from "lucide-react";
import Link from "next/link";
import {
  useAthleteProfile,
  weekDays,
  type AthleteProfile,
} from "../lib/athlete-profile";
import { WORKOUTS_UPDATED_EVENT, WORKOUT_STORAGE_KEY } from "../lib/workout-storage";
import {
  matchPlannedSessions,
  normalizeTrainingPlan,
  plannedSessionDuration,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  type CompletedSession,
  type PlannedActivity,
  type PlannedSession,
} from "../lib/training-plan";

type Workout = {
  id: string;
  sessionId: string;
  activityType: string;
  workoutDate: string;
  duration: number;
  distance?: number;
  distanceUnit?: "km" | "m";
  workoutTitle?: string;
  sessionTitle?: string;
  startTime?: string;
};

type Recommendation = {
  title: string;
  duration: string;
  why: string;
  nutrition: string;
  recovery: string;
  confidence: number;
  reasoning: string[];
  activities?: PlannedActivity[];
  plannerBased?: boolean;
  instructions?: string;
  purpose?: string;
};

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function goalLabel(profile: AthleteProfile): string {
  return profile.primaryGoal === "Custom"
    ? profile.customGoalName || "Custom goal"
    : profile.primaryGoal || "Goal not set";
}

function formatWorkoutDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeeklyDistance(workouts: Workout[], profile: AthleteProfile): string {
  const runRideKm = workouts.reduce(
    (total, workout) =>
      total +
      (workout.distance !== undefined && workout.distanceUnit !== "m" &&
      ["Run", "Ride"].includes(workout.activityType)
        ? workout.distance
        : 0),
    0,
  );
  const swimMeters = workouts.reduce(
    (total, workout) =>
      total +
      (workout.distance !== undefined && workout.activityType === "Swim"
        ? workout.distanceUnit === "m"
          ? workout.distance
          : workout.distance * 1000
        : 0),
    0,
  );
  const distances: string[] = [];
  if (runRideKm > 0) {
    distances.push(
      `${(profile.units === "Imperial" ? runRideKm * 0.621371 : runRideKm).toFixed(1)} ${profile.units === "Imperial" ? "mi" : "km"} running/cycling`,
    );
  }
  if (swimMeters > 0) {
    distances.push(
      `${Math.round(profile.units === "Imperial" ? swimMeters / 0.9144 : swimMeters)} ${profile.units === "Imperial" ? "yd" : "m"} swimming`,
    );
  }
  return distances.length ? distances.join(", ") : "no distance recorded";
}

function countSessions(workouts: Workout[]): number {
  return new Set(workouts.map((workout) => workout.sessionId)).size;
}

function recommendedActivity(profile: AthleteProfile, recentTypes: string[]): string {
  if (profile.primaryGoal === "Strength") return "Strength";
  if (profile.primaryGoal === "Cycling Event") return "Ride";
  if (profile.primaryGoal === "Marathon" || profile.primaryGoal === "Half Marathon") return "Run";
  if (profile.primaryGoal === "Ironman" || profile.primaryGoal === "Half Ironman" || profile.primaryGoal === "Triathlon") {
    const activitySequence = ["Run", "Ride", "Swim"];
    const preferred = profile.preferredActivities
      .map((activity) =>
        activity === "Running"
          ? "Run"
          : activity === "Cycling"
            ? "Ride"
            : activity === "Swimming"
              ? "Swim"
              : activity,
      )
      .filter((activity) => activitySequence.includes(activity));
    const sequence = preferred.length ? preferred : activitySequence;
    return sequence.find((activity) => !recentTypes.includes(activity)) ?? sequence[0];
  }
  if (profile.primaryGoal === "HYROX") return "Run";
  if (profile.preferredActivities.length > 0) {
    const preferred = profile.preferredActivities[0];
    if (preferred === "Running") return "Run";
    if (preferred === "Cycling") return "Ride";
    if (preferred === "Swimming") return "Swim";
    if (preferred === "Strength training") return "Strength";
    return preferred;
  }
  return "Run";
}

function buildRecommendation(
  profile: AthleteProfile,
  workouts: Workout[],
  plannedWorkouts: PlannedSession[],
  today: Date,
): Recommendation {
  const currentDay = weekDays[(today.getDay() + 6) % 7];
  const weekStart = localDateString(startOfWeek(today));
  const thisWeekWorkouts = workouts.filter(
    (workout) => workout.workoutDate >= weekStart && workout.workoutDate <= localDateString(today),
  );
  const sortedHistory = workouts
    .filter((workout) => workout.workoutDate <= localDateString(today))
    .sort((left, right) =>
      right.workoutDate.localeCompare(left.workoutDate) ||
      (right.startTime ?? "").localeCompare(left.startTime ?? ""),
    );
  const lastWorkout = sortedHistory[0];
  const totalMinutes = thisWeekWorkouts.reduce((sum, workout) => sum + workout.duration, 0);
  const availableMinutes =
    profile.weeklyTrainingHours === null ? null : profile.weeklyTrainingHours * 60;
  const availabilityReached =
    availableMinutes !== null && availableMinutes > 0 && totalMinutes >= availableMinutes * 0.8;
  const todayString = localDateString(today);
  const lastWorkoutAgeDays = lastWorkout
    ? Math.floor(
        (new Date(`${todayString}T00:00:00`).getTime() -
          new Date(`${lastWorkout.workoutDate}T00:00:00`).getTime()) /
          86_400_000,
      )
    : null;
  const recentTypes = thisWeekWorkouts.map((workout) => workout.activityType);
  const thisWeekSessionCount = countSessions(thisWeekWorkouts);
  const completedSessionMap = new Map<string, CompletedSession>();
  for (const workout of workouts) {
    const session: CompletedSession = completedSessionMap.get(workout.sessionId) ?? {
      id: workout.sessionId,
      date: workout.workoutDate,
      title: workout.sessionTitle || workout.workoutTitle || "",
      activities: [],
    };
    session.activities.push({
      activityType: workout.activityType,
      durationMinutes: workout.duration,
    });
    completedSessionMap.set(workout.sessionId, session);
  }
  const completedSessions = [...completedSessionMap.values()];
  const currentWeekStart = localDateString(startOfWeek(today));
  const currentWeekEnd = localDateString(
    new Date(startOfWeek(today).getFullYear(), startOfWeek(today).getMonth(), startOfWeek(today).getDate() + 6),
  );
  const plansWithStatus = matchPlannedSessions(
    plannedWorkouts,
    completedSessions,
    localDateString(today),
  );
  const currentWeekPlans = plansWithStatus.filter(
    (session) =>
      session.date >= currentWeekStart &&
      session.date <= currentWeekEnd &&
      (session.status === "Completed" ||
        session.status === "Skipped" ||
        profile.availableTrainingDays.includes(session.day)),
  );
  const plannedMinutes = currentWeekPlans.reduce(
    (sum, plannedSession) => sum + plannedSessionDuration(plannedSession),
    0,
  );
  const duePlans = currentWeekPlans.filter(
    (session) =>
      session.date <= localDateString(today) &&
      (session.status === "Completed" || session.status === "Missed"),
  );
  const completedPlannedCount = duePlans.filter((session) => session.status === "Completed").length;
  const plannerAdherence =
    duePlans.length === 0
      ? null
      : Math.round((completedPlannedCount / duePlans.length) * 100);
  const todaysPlannedWorkouts = currentWeekPlans.filter(
    (plannedSession) => plannedSession.date === todayString,
  );
  const pendingTodayPlan = todaysPlannedWorkouts.find(
    (plannedSession) => plannedSession.status !== "Completed" && plannedSession.status !== "Skipped",
  );
  const rescheduledPlan = !pendingTodayPlan
    ? currentWeekPlans
        .filter(
          (plannedSession) =>
            plannedSession.date < todayString &&
            plannedSession.status === "Missed",
        )
        .sort((left, right) => right.date.localeCompare(left.date))[0]
    : undefined;
  const selectedPlan = pendingTodayPlan ?? rescheduledPlan;
  const plannerReasoning = [
    `Weekly planner: ${currentWeekPlans.filter((session) => session.status !== "Skipped").length} planned sessions totaling ${(plannedMinutes / 60).toFixed(1)} planned hours; ${completedPlannedCount} completed sessions matched.`,
    plannerAdherence === null
      ? "Planner adherence: no planned sessions are due yet."
      : `Planner adherence so far: ${plannerAdherence}% across ${duePlans.length} planned sessions due this week.`,
    todaysPlannedWorkouts.length
      ? `Today's planned sessions: ${todaysPlannedWorkouts.map((plannedSession) => `${plannedSession.title} (${plannedSession.activities.map((activity) => `${activity.activityType} ${activity.durationMinutes} min`).join(", ")})`).join("; ")}.`
      : `No workouts are planned for ${currentDay}.`,
  ];
  const recentStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const previousStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
  const recentStartString = localDateString(recentStart);
  const previousStartString = localDateString(previousStart);
  const recentSevenDays = sortedHistory.filter(
    (workout) => workout.workoutDate >= recentStartString,
  );
  const previousSevenDays = sortedHistory.filter(
    (workout) =>
      workout.workoutDate >= previousStartString && workout.workoutDate < recentStartString,
  );
  const recentSevenDayMinutes = recentSevenDays.reduce((sum, workout) => sum + workout.duration, 0);
  const previousSevenDayMinutes = previousSevenDays.reduce((sum, workout) => sum + workout.duration, 0);
  const recentSevenDaySessionCount = countSessions(recentSevenDays);
  const previousSevenDaySessionCount = countSessions(previousSevenDays);
  const volumeRising =
    previousSevenDayMinutes > 0 && recentSevenDayMinutes >= previousSevenDayMinutes * 1.25;
  const weekDistance = formatWeeklyDistance(thisWeekWorkouts, profile);
  const weeklyProgressReason =
    availableMinutes === null
      ? `Weekly duration: ${(totalMinutes / 60).toFixed(1)} hours completed; weekly availability is not set.`
      : availableMinutes === 0
        ? `Weekly duration: ${(totalMinutes / 60).toFixed(1)} hours completed; weekly availability is set to 0 hours.`
        : `Weekly duration progress: ${(totalMinutes / 60).toFixed(1)} of ${profile.weeklyTrainingHours} available hours (${Math.round((totalMinutes / availableMinutes) * 100)}%).`;
  const historyReasoning = [
    `This week (Monday–today): ${thisWeekSessionCount} training session${thisWeekSessionCount === 1 ? "" : "s"} across ${thisWeekWorkouts.length} activities, ${(totalMinutes / 60).toFixed(1)} hours, ${weekDistance}.`,
    "Weekly distance is shown as recorded; the athlete profile does not define a weekly distance target.",
    weeklyProgressReason,
    lastWorkout
      ? `Most recent completed workout: ${lastWorkout.workoutTitle || lastWorkout.activityType} on ${formatWorkoutDate(lastWorkout.workoutDate)}${lastWorkout.startTime ? ` at ${lastWorkout.startTime}` : ""} (${lastWorkoutAgeDays === 0 ? "today" : `${lastWorkoutAgeDays} day${lastWorkoutAgeDays === 1 ? "" : "s"} ago`}).`
      : "No completed workout is recorded before today.",
    previousSevenDayMinutes > 0
      ? `Recent trend: ${recentSevenDaySessionCount} training session${recentSevenDaySessionCount === 1 ? "" : "s"} in the last 7 days (${(recentSevenDayMinutes / 60).toFixed(1)} hours) versus ${previousSevenDaySessionCount} session${previousSevenDaySessionCount === 1 ? "" : "s"} and ${(previousSevenDayMinutes / 60).toFixed(1)} hours in the preceding 7 days.`
      : `Recent activity: ${recentSevenDaySessionCount} training session${recentSevenDaySessionCount === 1 ? "" : "s"} recorded in the last 7 days; there is not enough preceding-week duration for a volume comparison.`,
  ];
  const profileData = [
    `Primary goal: ${goalLabel(profile)}.`,
    `Training experience: ${profile.trainingExperience}.`,
    `Available training: ${profile.weeklyTrainingHours} hours per week across ${profile.availableTrainingDays.join(", ")}.`,
  ];
  if (profile.targetEventName) {
    profileData.push(
      `Target event: ${profile.targetEventName}${profile.targetEventDate ? ` on ${profile.targetEventDate}` : ""}.`,
    );
  }
  if (profile.longWorkoutDay) {
    profileData.push(`Preferred long-workout day: ${profile.longWorkoutDay}.`);
  }
  if (profile.equipment.length > 0 || profile.otherEquipment.trim()) {
    profileData.push(
      `Available equipment: ${[...profile.equipment, profile.otherEquipment].filter(Boolean).join(", ")}.`,
    );
  }

  if (selectedPlan) {
    const totalMinutes = plannedSessionDuration(selectedPlan);
    const isRescheduled = selectedPlan.id === rescheduledPlan?.id;
    const allInstructions = selectedPlan.activities.map((activity) => activity.instructions).filter(Boolean);
    const allPurposes = selectedPlan.activities.map((activity) => activity.purpose).filter(Boolean);
    return {
      title: `${isRescheduled ? "Rescheduled: " : ""}${selectedPlan.title}`,
      duration: `${totalMinutes} minutes`,
      why: isRescheduled
        ? `This ${selectedPlan.activities.map((activity) => activity.activityType).join(" and ")} session was planned for ${selectedPlan.day} and remains unmatched to a completed training session. Rescheduling it is the next plan-aligned option.`
        : "This session was saved in your Training Planner for today.",
      nutrition: "Eat your usual meals, include familiar carbohydrate and protein sources, and drink to thirst.",
      recovery: "Keep to the planned intensity. Recovery, sleep, and sensor data were not used unless entered separately.",
      confidence: 92,
      plannerBased: true,
      activities: selectedPlan.activities,
      instructions: allInstructions.join(" "),
      purpose: allPurposes.join(" "),
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        `Selected ${selectedPlan.title} from the Training Planner${isRescheduled ? `, originally planned for ${selectedPlan.day} (${selectedPlan.date})` : " for today"}.`,
        `Session contains ${selectedPlan.activities.map((activity) => `${activity.activityType} for ${activity.durationMinutes} minutes at ${activity.intensity.toLowerCase()} effort`).join("; ")}.`,
        `Why it fits the goal: ${allPurposes.join(" ") || `It was planned to support ${goalLabel(profile)}.`}`,
      ],
    };
  }

  if (currentWeekPlans.some((session) => session.generated)) {
    return {
      title: "Rest or easy recovery",
      duration: "Rest day",
      why: `The generated Training Planner has no remaining workout scheduled for ${currentDay}. Keep today free rather than adding unplanned intensity.`,
      nutrition: "Follow your usual meals and drink to thirst.",
      recovery: "Use the day for rest or comfortable everyday movement. No readiness or sensor data was used.",
      confidence: 90,
      plannerBased: true,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        `The generated week has no remaining session scheduled for ${currentDay}.`,
      ],
    };
  }

  const recoveryReasons: string[] = [];
  if (thisWeekSessionCount >= 3) {
    recoveryReasons.push(`${thisWeekSessionCount} training sessions have already been completed this week`);
  }
  if (availabilityReached) {
    recoveryReasons.push("completed duration is at least 80% of weekly training availability");
  }
  if (volumeRising) {
    recoveryReasons.push("recorded duration is up at least 25% against the previous 7 days");
  }
  if (lastWorkoutAgeDays === 0) {
    recoveryReasons.push("the latest completed workout was today");
  }

  if (recoveryReasons.length > 0) {
    return {
      title: lastWorkoutAgeDays === 0 ? "Recovery walk or easy mobility" : "Recovery or easy mobility",
      duration: "20–30 minutes",
      why: `A recovery-focused session is recommended because ${recoveryReasons.join(", ")}. This keeps today's load appropriate to the work already recorded.`,
      nutrition: "Prioritize regular meals, fluids, and carbohydrate and protein sources that fit your usual routine.",
      recovery: "Keep movement gentle and make time for your usual sleep and recovery routine.",
      confidence: 88,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        `Training sessions influencing the decision this week: ${thisWeekWorkouts.length ? [...new Map(thisWeekWorkouts.map((workout) => [workout.sessionId, workout])).values()].map((workout) => `${workout.workoutTitle || workout.activityType} (${formatWorkoutDate(workout.workoutDate)})`).join("; ") : "none recorded"}.`,
        `Rule applied: ${recoveryReasons.join("; ")}.`,
      ],
    };
  }

  const activity = recommendedActivity(profile, recentTypes);
  const isNoWorkouts = thisWeekSessionCount === 0;
  const isLongDay = currentDay === profile.longWorkoutDay;
  const goalSupportsEndurance = [
    "Ironman",
    "Half Ironman",
    "Marathon",
    "Half Marathon",
    "Triathlon",
    "Cycling Event",
  ].includes(profile.primaryGoal);
  const durationMinutes = isLongDay && goalSupportsEndurance ? 75 : 45;
  const duration = `${durationMinutes} minutes`;
  const goalAlignedRecommendation =
    activity === "Run"
      ? isLongDay && goalSupportsEndurance
        ? "Steady long run"
        : "Easy aerobic run"
      : activity === "Ride"
        ? isLongDay && goalSupportsEndurance
          ? "Steady endurance ride"
          : "Easy aerobic ride"
        : activity === "Swim"
          ? "Technique-focused swim"
          : activity === "Strength"
            ? "Full-body strength session"
            : `${activity} session`;
  const recommendationName = goalAlignedRecommendation;
  const matchingEquipment =
    activity === "Ride"
      ? profile.equipment.find((item) => ["Road bike", "Indoor bike trainer"].includes(item))
      : activity === "Run"
        ? profile.equipment.find((item) => ["Treadmill", "Running access"].includes(item))
        : activity === "Swim"
          ? profile.equipment.find((item) => ["Pool access", "Open-water swimming access"].includes(item))
          : activity === "Strength"
            ? profile.equipment.find((item) => ["Gym access", "Strength equipment"].includes(item))
            : undefined;
  const whyParts = [
    `your ${goalLabel(profile)} goal`,
    isNoWorkouts
      ? "no completed workouts recorded this week"
      : `${thisWeekSessionCount} completed training session${thisWeekSessionCount === 1 ? "" : "s"} this week`,
  ];
  if (isLongDay) whyParts.push("today is your preferred long-workout day");
  if (matchingEquipment) whyParts.push(`you have ${matchingEquipment.toLowerCase()}`);
  const historyReason = isNoWorkouts
    ? "No completed workouts were found for the current Monday–Sunday week."
    : `This week includes ${thisWeekSessionCount} training session${thisWeekSessionCount === 1 ? "" : "s"} across ${thisWeekWorkouts.length} activities: ${thisWeekWorkouts.map((workout) => `${workout.workoutTitle || workout.activityType} on ${formatWorkoutDate(workout.workoutDate)}`).join(", ")}.`;
  return {
    title: recommendationName,
    duration,
    instructions:
      activity === "Run"
        ? "Run at a comfortable effort where you can speak in full sentences."
        : activity === "Ride"
          ? "Ride at a comfortable effort where conversation remains easy."
          : activity === "Swim"
            ? "Swim relaxed lengths and pause as needed to keep your technique comfortable."
            : activity === "Strength"
              ? "Use familiar strength movements with controlled, comfortable repetitions."
              : "Choose familiar movement and keep the effort controlled.",
    purpose: `Support your ${goalLabel(profile)} goal with a manageable session.`,
    why: `Selected to match ${whyParts.join(", ")}.`,
    nutrition: activity === "Strength"
      ? "Include a protein-containing meal or snack as part of your normal daily eating."
      : "Include familiar carbohydrate and protein sources around the session, and drink to thirst.",
    recovery: "Keep the effort controlled and leave room for your next planned session.",
    confidence: isNoWorkouts ? 78 : 84,
    reasoning: [
      ...profileData,
      ...historyReasoning,
      ...plannerReasoning,
      historyReason,
      `Rule applied: ${isNoWorkouts ? "with no training sessions this week, choose an activity aligned with the primary goal" : `with ${thisWeekSessionCount} training session${thisWeekSessionCount === 1 ? "" : "s"} completed and no recovery threshold reached, continue with a goal-aligned session`}.`,
      ...(lastWorkout ? [`Last workout type was ${lastWorkout.activityType}${lastWorkoutAgeDays === 0 ? " today" : ` ${lastWorkoutAgeDays} day${lastWorkoutAgeDays === 1 ? "" : "s"} ago`}; recent logged types: ${[...new Set(recentTypes)].join(", ") || "none this week"}.`] : []),
      ...(isLongDay ? [`Today is ${currentDay}, the preferred long-workout day.`] : []),
      ...(matchingEquipment ? [`Equipment supports this activity: ${matchingEquipment}.`] : []),
    ],
  };
}

function DecisionItem({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Utensils;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-[#0b100e]/70 p-3.5">
      <span className="mt-0.5 text-[#b8f36b]">
        <Icon aria-hidden="true" size={15} />
      </span>
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b9790]">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[#dce4dd]">{text}</p>
      </div>
    </div>
  );
}

export function TodaysDecision() {
  const { profile, isProfileLoaded } = useAthleteProfile();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedSession[]>([]);
  const [isWorkoutHistoryLoaded, setIsWorkoutHistoryLoaded] = useState(false);
  const [isPlannerLoaded, setIsPlannerLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [plannerError, setPlannerError] = useState("");
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    const loadWorkouts = () => {
      try {
        const stored = window.localStorage.getItem(WORKOUT_STORAGE_KEY);
        if (stored === null) {
          setWorkouts([]);
          setHistoryError("");
          return;
        }
        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed)) throw new Error("Workout history has an invalid format.");
        const safeWorkouts: Workout[] = [];
        for (const [index, item] of parsed.entries()) {
          if (typeof item !== "object" || item === null || !("activityType" in item) ||
            !("workoutDate" in item) || !("duration" in item) ||
            typeof item.activityType !== "string" ||
            typeof item.workoutDate !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(item.workoutDate) ||
            typeof item.duration !== "number" ||
            !Number.isFinite(item.duration)
          ) {
            throw new Error("Workout history contains an invalid workout record.");
          }
          const workoutId =
            "id" in item && typeof item.id === "string" ? item.id : `legacy-workout-${index}`;
          safeWorkouts.push({
            id: workoutId,
            sessionId:
              "sessionId" in item && typeof item.sessionId === "string"
                ? item.sessionId
                : workoutId,
            activityType: item.activityType,
            workoutDate: item.workoutDate,
            duration: item.duration,
            ...(typeof item.distance === "number" && Number.isFinite(item.distance)
              ? { distance: item.distance }
              : {}),
            ...(item.distanceUnit === "m" || item.distanceUnit === "km"
              ? { distanceUnit: item.distanceUnit }
              : {}),
            ...(typeof item.workoutTitle === "string" && item.workoutTitle.trim()
              ? { workoutTitle: item.workoutTitle }
              : {}),
            ...(typeof item.sessionTitle === "string" && item.sessionTitle.trim()
              ? { sessionTitle: item.sessionTitle }
              : {}),
            ...(typeof item.startTime === "string" && /^\d{2}:\d{2}$/.test(item.startTime)
              ? { startTime: item.startTime }
              : {}),
          });
        }
        setWorkouts(safeWorkouts);
        setHistoryError("");
      } catch {
        setWorkouts([]);
        setHistoryError(
          "Saved workout history is unavailable or contains invalid records. Check the saved workout data before generating a history-based recommendation.",
        );
      } finally {
        setIsWorkoutHistoryLoaded(true);
      }
    };
    const loadPlanner = () => {
      try {
        const stored = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
        if (stored === null) {
          setPlannedWorkouts([]);
          setPlannerError("");
          setIsPlannerLoaded(true);
          return;
        }
        const parsed: unknown = JSON.parse(stored);
        const normalized = normalizeTrainingPlan(parsed);
        if (!normalized) throw new Error("Weekly plan has an invalid format.");
        setPlannedWorkouts(normalized);
        setPlannerError("");
      } catch {
        setPlannerError("Saved weekly plan is unavailable. Check the planner data before using it.");
      } finally {
        setIsPlannerLoaded(true);
      }
    };
    const updateDate = () => setToday(new Date());
    const loadAll = () => {
      loadWorkouts();
      loadPlanner();
    };
    loadAll();
    updateDate();
    window.addEventListener("storage", loadAll);
    window.addEventListener(WORKOUTS_UPDATED_EVENT, loadWorkouts);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlanner);
    window.addEventListener("focus", loadAll);
    window.addEventListener("visibilitychange", loadAll);
    return () => {
      window.removeEventListener("storage", loadAll);
      window.removeEventListener(WORKOUTS_UPDATED_EVENT, loadWorkouts);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlanner);
      window.removeEventListener("focus", loadAll);
      window.removeEventListener("visibilitychange", loadAll);
    };
  }, []);

  const supportedEquipment = new Set(profile?.equipment ?? []);
  const hasSupportedEquipment =
    supportedEquipment.has("Running access") ||
    supportedEquipment.has("Treadmill") ||
    supportedEquipment.has("Road bike") ||
    supportedEquipment.has("Indoor bike trainer") ||
    supportedEquipment.has("Pool access") ||
    supportedEquipment.has("Open-water swimming access") ||
    supportedEquipment.has("Gym access") ||
    supportedEquipment.has("Strength equipment");
  const hasSpecificGoal = Boolean(
    profile &&
      profile.primaryGoal &&
      (profile.primaryGoal !== "Custom" || profile.customGoalName.trim()),
  );
  const isProfileComplete = Boolean(
    profile &&
      hasSpecificGoal &&
      profile.weeklyTrainingHours !== null &&
      profile.weeklyTrainingHours > 0 &&
      profile.availableTrainingDays.length > 0 &&
      hasSupportedEquipment,
  );
  const missingDecisionFields = [
    ...(profile?.primaryGoal && (profile.primaryGoal !== "Custom" || profile.customGoalName.trim())
      ? []
      : ["primary goal"]),
    ...(profile?.weeklyTrainingHours !== null && profile?.weeklyTrainingHours !== undefined && profile.weeklyTrainingHours > 0 ? [] : ["weekly availability"]),
    ...(profile?.availableTrainingDays.length ? [] : ["available training days"]),
    ...(hasSupportedEquipment ? [] : ["available equipment"]),
  ];
  const recommendation = useMemo(
    () =>
      isProfileComplete && profile && today && isPlannerLoaded && !plannerError
        ? buildRecommendation(profile, workouts, plannedWorkouts, today)
        : null,
    [isProfileComplete, isPlannerLoaded, plannerError, plannedWorkouts, profile, today, workouts],
  );
  const generatedDate = today
    ? today.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Preparing recommendation";

  return (
    <section
      aria-labelledby="todays-decision-heading"
      className="relative mb-5 overflow-hidden rounded-xl border border-[#b8f36b]/20 p-5 sm:p-7 lg:p-8"
      style={{
        background:
          "radial-gradient(ellipse at 8% 0%, rgba(184,243,107,0.15), transparent 48%), linear-gradient(135deg, #141c17 0%, #0f1512 62%, #111714 100%)",
      }}
    >
      <div className="absolute right-0 top-0 size-52 rounded-full bg-[#b8f36b]/[0.025] blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b8f36b]">
              <Zap aria-hidden="true" size={13} />
              Daily decision · Rule-based, not AI
            </p>
            <h2
              className="mt-2 text-[23px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[28px]"
              id="todays-decision-heading"
            >
              Today&apos;s Decision
            </h2>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/10 px-3 py-2 text-[10px] text-[#a6b1a9]">
            <CalendarDays aria-hidden="true" size={12} />
            {generatedDate}
          </div>
        </div>

        {!isProfileLoaded || !isWorkoutHistoryLoaded || !isPlannerLoaded ? (
          <p className="mt-6 text-xs text-[#87938b]" role="status">
            Loading your profile, training plan, and workout history…
          </p>
        ) : !isProfileComplete ? (
          <div className="mt-6 rounded-lg border border-[#b8f36b]/15 bg-[#0b100e]/65 p-4 sm:p-5">
            <p className="text-sm font-medium leading-relaxed text-[#dce4dd]">
              Complete your athlete profile to unlock personalized recommendations.
            </p>
            <p className="mt-2 text-xs text-[#87938b]">
              {profile
                ? `Still needed: ${missingDecisionFields.join(", ")}.`
                : "Add your goals, experience, and availability to get a recommendation based on your profile and workout history."}
            </p>
            <Link
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#c5ef97] hover:text-[#d0f79d]"
              href="/settings"
            >
              Complete athlete profile <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        ) : historyError || plannerError ? (
          <p className="mt-6 text-xs text-[#f0c49d]" role="alert">
            {historyError || plannerError}
          </p>
        ) : recommendation ? (
          <>
            <div className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-[#b8f36b]/15 bg-[#0b100e]/65 p-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#839087]">
                  Recommended workout
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[22px] font-semibold tracking-[-0.035em] text-[#f0f4ef]">
                    {recommendation.title}
                  </h3>
                  <span className="flex items-center gap-1 text-xs text-[#b8f36b]">
                    <Clock3 aria-hidden="true" size={13} />
                    {recommendation.duration}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#a6b1a9]">
                  {recommendation.why}
                </p>
                {recommendation.plannerBased && (
                  <p className="mt-3 inline-flex rounded-full border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.05] px-2.5 py-1 text-[9px] font-medium text-[#b9e5eb]">
                    From your Training Planner
                  </p>
                )}
                {recommendation.activities && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {recommendation.activities.map((activity) => (
                      <div className="rounded-md border border-white/[0.06] bg-[#111714]/75 p-2.5" key={activity.id}>
                        <p className="text-[10px] font-semibold text-[#dce4dd]">
                          {activity.activityType} · {activity.durationMinutes} min · {activity.intensity}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">{activity.instructions}</p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#78857d]">{activity.purpose}</p>
                      </div>
                    ))}
                  </div>
                )}
                {recommendation.instructions && !recommendation.activities && (
                  <p className="mt-3 text-xs leading-relaxed text-[#c2cdc5]">{recommendation.instructions}</p>
                )}
                {recommendation.purpose && (
                  <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">
                    Purpose: {recommendation.purpose}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-3">
                  <span className="rounded-full border border-[#b8f36b]/15 bg-[#b8f36b]/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#c5ef97]">
                    Rule-based confidence · {recommendation.confidence}%
                  </span>
                  <Link
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-[#a6b1a9] hover:text-[#c5ef97]"
                    href="/training"
                  >
                    Open Training <ArrowRight aria-hidden="true" size={12} />
                  </Link>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <DecisionItem
                  icon={Utensils}
                  title="Nutrition focus"
                  text={recommendation.nutrition}
                />
                <DecisionItem
                  icon={Waves}
                  title="Recovery focus"
                  text={recommendation.recovery}
                />
              </div>
            </div>
            <details className="mt-4 rounded-lg border border-white/[0.07] bg-[#0b100e]/40 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-[#dce4dd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8f36b]">
                Reasoning
              </summary>
              <p className="mt-2 text-[10px] leading-relaxed text-[#78857d]">
                This recommendation comes from simple rules and stored data. It is not AI-generated or a medical assessment.
              </p>
              <ul className="mt-3 grid gap-2 text-[11px] leading-relaxed text-[#a6b1a9]">
                {recommendation.reasoning.map((reason) => (
                  <li className="flex gap-2" key={reason}>
                    <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-[#b8f36b]" />
                    {reason}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="mt-6 text-xs text-[#87938b]" role="status">
            Your recommendation is not available yet.
          </p>
        )}
      </div>
    </section>
  );
}
