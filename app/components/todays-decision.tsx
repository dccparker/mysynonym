"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bike,
  CalendarDays,
  Clock3,
  Dumbbell,
  Footprints,
  HeartPulse,
  Target,
  UserRound,
  X,
  Utensils,
  Waves,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  useAthleteProfile,
  weekDays,
  type AthleteProfile,
} from "../lib/athlete-profile";
import {
  completePlannedSession,
  loadWorkoutHistory,
  updatePlannedSession,
  WORKOUTS_UPDATED_EVENT,
  type CompletedSessionChanges,
} from "../lib/workout-storage";
import { supabase } from "../lib/supabase";
import {
  matchPlannedSessions,
  normalizeTrainingPlan,
  plannedSessionDuration,
  TRAINING_PLAN_STORAGE_KEY,
  TRAINING_PLAN_UPDATED_EVENT,
  type CompletedSession,
  type PlannedActivity,
  type PlannedActivityType,
  type PlannedIntensity,
  type PlannedSession,
} from "../lib/training-plan";
import {
  loadRecoveryCheckIns,
  RECOVERY_CHECKINS_UPDATED_EVENT,
  type RecoveryCheckIn,
} from "../lib/recovery-checkin";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  plannedSessionId?: string;
  instructions?: string;
  purpose?: string;
  recoveryAdjustment?: string;
};

type ActivityEdit = {
  id: string;
  activityType: PlannedActivityType;
  durationMinutes: string;
  distance: string;
  intensity: PlannedIntensity;
  instructions: string;
  purpose: string;
};

type SessionStatistics = {
  averageHeartRate: string;
  maximumHeartRate: string;
  averagePace: string;
  averagePower: string;
  calories: string;
};

const activityOptions: PlannedActivityType[] = ["Run", "Ride", "Swim", "Strength", "Other"];
const intensityOptions: PlannedIntensity[] = ["Recovery", "Easy", "Moderate", "Hard", "Rest"];

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

function effortExplanation(intensity: PlannedIntensity): string {
  if (intensity === "Recovery") return "Very light movement. Finish feeling comfortable.";
  if (intensity === "Easy") return "Comfortable effort; you should be able to speak in complete sentences.";
  if (intensity === "Moderate") return "Steady, controlled effort. You can speak in short sentences.";
  if (intensity === "Hard") return "Challenging but controlled. Ease off if you cannot maintain good form.";
  return "Rest or very light movement.";
}

function activityDistanceUnit(activityType: PlannedActivityType, profile: AthleteProfile): string {
  if (activityType === "Swim") return profile.units === "Imperial" ? "yd" : "m";
  return profile.units === "Imperial" ? "mi" : "km";
}

function activityIcon(activityType: PlannedActivityType) {
  if (activityType === "Run") return Footprints;
  if (activityType === "Ride") return Bike;
  if (activityType === "Swim") return Waves;
  if (activityType === "Strength") return Dumbbell;
  return Zap;
}

function workoutTimeSegments(duration: number) {
  const warmup = duration >= 20 ? 5 : duration >= 10 ? 2 : 0;
  const cooldown = warmup;
  return {
    warmup,
    main: Math.max(0, duration - warmup - cooldown),
    cooldown,
  };
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

function recommendedActivity(
  profile: AthleteProfile,
  recentTypes: string[],
): { activity: string; avoidedDisliked: boolean } {
  const activityByPreference: Record<string, string> = {
    Running: "Run",
    Cycling: "Ride",
    Swimming: "Swim",
    "Strength training": "Strength",
    Other: "Other",
  };
  const goalOrder: Record<string, string[]> = {
    Strength: ["Strength", "Run", "Ride", "Swim", "Other"],
    "Cycling Event": ["Ride", "Run", "Swim", "Strength", "Other"],
    Marathon: ["Run", "Ride", "Strength", "Swim", "Other"],
    "Half Marathon": ["Run", "Ride", "Strength", "Swim", "Other"],
    Ironman: ["Run", "Ride", "Swim", "Strength", "Other"],
    "Half Ironman": ["Run", "Ride", "Swim", "Strength", "Other"],
    Triathlon: ["Run", "Ride", "Swim", "Strength", "Other"],
    HYROX: ["Run", "Strength", "Ride", "Swim", "Other"],
  };
  const goalActivities = goalOrder[profile.primaryGoal] ?? [];
  const preferredActivities = profile.preferredActivities
    .map((activity) => activityByPreference[activity])
    .filter((activity): activity is string => activity !== undefined);
  const candidates = [
    ...new Set([...goalActivities, ...preferredActivities, "Run", "Ride", "Swim", "Strength", "Other"]),
  ];
  const disliked = new Set(
    profile.dislikedActivities
      .map((activity) => activityByPreference[activity])
      .filter((activity): activity is string => activity !== undefined),
  );
  const equipmentForActivity: Record<string, string[]> = {
    Run: ["Running access", "Treadmill"],
    Ride: ["Road bike", "Indoor bike trainer"],
    Swim: ["Pool access", "Open-water swimming access"],
    Strength: ["Gym access", "Strength equipment"],
  };
  const hasEquipmentPreferences = profile.equipment.length > 0;
  const available = candidates.filter((activity) => {
    if (!hasEquipmentPreferences || activity === "Other") return true;
    return (equipmentForActivity[activity] ?? []).some((item) => profile.equipment.includes(item));
  });
  const liked = available.filter((activity) => !disliked.has(activity));
  const choices = liked.length > 0 ? liked : available;
  const avoidedDisliked = liked.length === 0 && choices.some((activity) => disliked.has(activity));
  return {
    activity:
      choices.find((activity) => !recentTypes.includes(activity)) ??
      choices[0] ??
      "Run",
    avoidedDisliked,
  };
}

function buildRecommendation(
  profile: AthleteProfile,
  workouts: Workout[],
  plannedWorkouts: PlannedSession[],
  today: Date,
  recoveryHistory: RecoveryCheckIn[],
): Recommendation {
  const currentDay = weekDays[(today.getDay() + 6) % 7];
  const todayString = localDateString(today);
  const dailyPreferredDurationLimit =
    today.getDay() === 0 || today.getDay() === 6
      ? profile.maxWeekendWorkoutMinutes
      : profile.maxWeekdayWorkoutMinutes;
  const weekStart = localDateString(startOfWeek(today));
  const recentStartString = localDateString(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
  );
  const recovery = recoveryHistory.find((record) => record.date === todayString);
  const recentRecovery = recoveryHistory.filter(
    (record) => record.date >= recentStartString && record.date <= todayString,
  );
  const averageRecentReadiness = recentRecovery.length
    ? Math.round(
        recentRecovery.reduce((total, record) => total + record.readinessScore, 0) /
          recentRecovery.length,
      )
    : null;
  const persistentLowReadiness =
    recentRecovery.length >= 2 &&
    averageRecentReadiness !== null &&
    averageRecentReadiness < 45;
  const thisWeekWorkouts = workouts.filter(
    (workout) => workout.workoutDate >= weekStart && workout.workoutDate <= todayString,
  );
  const sortedHistory = workouts
    .filter((workout) => workout.workoutDate <= todayString)
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
  const lastWorkoutAgeDays = lastWorkout
    ? Math.floor(
        (new Date(`${todayString}T00:00:00`).getTime() -
          new Date(`${lastWorkout.workoutDate}T00:00:00`).getTime()) /
          86_400_000,
      )
    : null;
  const recentTypes = sortedHistory
    .filter((workout) => workout.workoutDate >= recentStartString)
    .map((workout) => workout.activityType);
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
  const previousStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
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
  if (profile.preferredActivities.length > 0) {
    profileData.push(`Preferred activities: ${profile.preferredActivities.join(", ")}.`);
  }
  if (profile.dislikedActivities.length > 0) {
    profileData.push(`Activities to avoid: ${profile.dislikedActivities.join(", ")}.`);
  }
  if (profile.equipment.length > 0 || profile.otherEquipment.trim()) {
    profileData.push(
      `Available equipment: ${[...profile.equipment, profile.otherEquipment].filter(Boolean).join(", ")}.`,
    );
  }

  const recoveryConcerns = recovery
    ? [
        ...(recovery.energy <= 2 ? ["low energy"] : []),
        ...(recovery.soreness >= 4 ? ["high soreness"] : []),
        ...(recovery.stress >= 4 ? ["high stress"] : []),
        ...(recovery.motivation <= 2 ? ["low motivation"] : []),
        ...(recovery.sleepQuality <= 2 ? ["poor sleep quality"] : []),
        ...(recovery.sleepDurationHours !== undefined && recovery.sleepDurationHours < 6
          ? ["short sleep duration"]
          : []),
      ]
    : [];
  const recoveryPriority =
    recoveryConcerns.length >= 3 ||
    Boolean(recovery?.painNotes?.trim()) ||
    persistentLowReadiness;
  const recoveryConcern =
    recoveryConcerns.length > 0 ||
    Boolean(recovery?.painNotes?.trim()) ||
    persistentLowReadiness;
  const availableSessionMinutes = [
    recovery?.availableTrainingMinutes,
    dailyPreferredDurationLimit ?? undefined,
  ].filter((minutes): minutes is number => minutes !== undefined);
  const effectiveSessionLimit = availableSessionMinutes.length
    ? Math.min(...availableSessionMinutes)
    : undefined;
  const timeLimited = Boolean(
    selectedPlan &&
      effectiveSessionLimit !== undefined &&
      effectiveSessionLimit < plannedSessionDuration(selectedPlan),
  );
  const needsRecoveryAdjustment = recoveryConcern || timeLimited;
  const recentReadinessExplanation = recentRecovery.length > 0
    ? `Recent recovery check-ins average ${averageRecentReadiness}/100 across ${recentRecovery.length} entries in the last 7 days.`
    : "";
  const recoveryExplanation = recoveryConcern
    ? `${recovery && (recoveryConcerns.length > 0 || recovery.painNotes?.trim())
      ? `Today's workout was reduced because today's check-in reported ${[
          ...recoveryConcerns,
          ...(recovery.painNotes?.trim() ? ["pain or a limitation"] : []),
        ].join(" and ")}.`
      : "A recovery-focused option is recommended based on your recent check-ins."}${persistentLowReadiness ? ` ${recentReadinessExplanation} Keep today's training light while readiness remains low.` : ""}${timeLimited ? ` It was also shortened to fit your ${effectiveSessionLimit}-minute available training limit.` : ""}`
    : timeLimited
      ? `Today's workout was shortened to fit your ${effectiveSessionLimit}-minute available training limit. Your saved weekly plan has not been changed.`
      : !recovery
        ? recentReadinessExplanation
          ? `No check-in was recorded today. ${recentReadinessExplanation}`
          : "No recovery check-in was available for this recommendation."
        : "Your planned workout remains appropriate based on today's check-in.";
  const recoveryReasoning = [
    recoveryExplanation,
    ...(recentReadinessExplanation
      ? [recentReadinessExplanation]
      : []),
    ...(recovery
      ? [
          `Estimated readiness from the check-in is ${recovery.readinessCategory} (${recovery.readinessScore}/100); energy ${recovery.energy}/5, soreness ${recovery.soreness}/5, stress ${recovery.stress}/5, motivation ${recovery.motivation}/5, and sleep quality ${recovery.sleepQuality}/5.`,
        ]
      : []),
  ];

  if (recovery?.availableTrainingMinutes === 0) {
    return {
      title: "Rest day",
      duration: "No training time available",
      why: selectedPlan
        ? "No training time was available in today's check-in. The workout remains in your saved weekly plan and can be moved or adjusted there."
        : "No training time was available in today's check-in. Keep today free of planned training.",
      nutrition: "Follow your usual meals and drink to thirst.",
      recovery: "Keep today free of planned training.",
      confidence: 92,
      plannerBased: true,
      recoveryAdjustment: "No training time was available in today's check-in; the saved plan remains unchanged.",
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        ...recoveryReasoning,
        ...(selectedPlan
          ? ["Today's planned workout remains unchanged in the Weekly Training Planner."]
          : []),
      ],
    };
  }

  if (selectedPlan) {
    const activities = needsRecoveryAdjustment
      ? selectedPlan.activities.map((activity) => ({
          ...activity,
          durationMinutes: Math.max(
            1,
            Math.floor(
              activity.durationMinutes *
                Math.min(
                  recoveryPriority
                    ? 0.6
                    : recoveryConcern
                      ? 0.8
                      : 1,
                  timeLimited && effectiveSessionLimit !== undefined
                    ? effectiveSessionLimit /
                        Math.max(plannedSessionDuration(selectedPlan), 1)
                    : 1,
                ),
            ),
          ),
          intensity: recoveryPriority
            ? "Recovery" as const
            : recoveryConcern
              ? activity.intensity === "Hard"
                ? "Moderate" as const
                : "Easy" as const
              : activity.intensity,
          instructions: `${activity.instructions} ${recoveryPriority ? "Use this shorter, very light recovery option today." : recoveryConcern ? "Use this shorter, easier version today." : "Shorten today's version to fit the time you have available."} The saved weekly plan itself has not been changed.`,
        }))
      : selectedPlan.activities;
    const totalMinutes = activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
    const isRescheduled = selectedPlan.id === rescheduledPlan?.id;
    const allInstructions = activities.map((activity) => activity.instructions).filter(Boolean);
    const allPurposes = activities.map((activity) => activity.purpose).filter(Boolean);
    return {
      title: `${needsRecoveryAdjustment ? (recoveryPriority ? "Recovery option: " : "Adjusted: ") : isRescheduled ? "Rescheduled: " : ""}${selectedPlan.title}`,
      duration: `${totalMinutes} minutes`,
      why: `${isRescheduled
        ? `Why this workout: ${selectedPlan.reason || `It supports your ${goalLabel(profile)} goal.`} This session was originally planned for ${selectedPlan.day} and remains unmatched to a completed training session.`
        : `Why this workout: ${selectedPlan.reason || `It supports your ${goalLabel(profile)} goal and follows your weekly plan.`}${selectedPlan.rescheduledFromDay ? ` This workout was moved from ${selectedPlan.rescheduledFromDay} to ${selectedPlan.day}.` : ""}`} ${recoveryExplanation}${recovery?.painNotes?.trim() ? " Consider reducing training and seeking qualified professional advice if the issue is significant or persistent." : ""}`,
      nutrition: "Eat your usual meals, include familiar carbohydrate and protein sources, and drink to thirst.",
      recovery: needsRecoveryAdjustment
        ? "The adjusted suggestion lowers today's duration and effort. Your saved workout remains unchanged; use Completed With Changes to record what you actually did."
        : "Keep to the planned intensity. Recovery metrics are considered only when provided in your check-in.",
      confidence: 92,
      plannerBased: true,
      ...(pendingTodayPlan?.id === selectedPlan.id
        ? { plannedSessionId: selectedPlan.id }
        : {}),
      activities,
      instructions: allInstructions.join(" "),
      purpose: allPurposes.join(" "),
      recoveryAdjustment: recoveryExplanation,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        ...recoveryReasoning,
        `Selected ${selectedPlan.title} from the Training Planner${isRescheduled ? `, originally planned for ${selectedPlan.day} (${selectedPlan.date})` : " for today"}.`,
        ...(selectedPlan.rescheduledFromDay
          ? [`This workout was moved from ${selectedPlan.rescheduledFromDay} to ${selectedPlan.day}.`]
          : []),
        `Session contains ${activities.map((activity) => `${activity.activityType} for ${activity.durationMinutes} minutes at ${activity.intensity.toLowerCase()} effort`).join("; ")}.`,
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
      recoveryAdjustment: recoveryExplanation,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        ...recoveryReasoning,
        `The generated week has no remaining session scheduled for ${currentDay}.`,
      ],
    };
  }

  if (!profile.availableTrainingDays.includes(currentDay)) {
    return {
      title: "Rest day",
      duration: "No training scheduled",
      why: `${currentDay} is not one of your available training days in your athlete profile, so no extra workout is suggested.${recoveryConcern ? ` ${recoveryExplanation}` : ""}`,
      nutrition: "Follow your usual meals and drink to thirst.",
      recovery: "Keep today free of planned training and return to your next available training day.",
      confidence: 92,
      recoveryAdjustment: recoveryExplanation,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        ...recoveryReasoning,
        `Today's date is ${currentDay}, which is not listed among your available training days.`,
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
  if (recoveryPriority) {
    recoveryReasons.push(
      persistentLowReadiness && !recovery
        ? "multiple recent recovery check-ins show low readiness"
        : "today's recovery check-in indicates several recovery concerns",
    );
  } else if (needsRecoveryAdjustment) {
    recoveryReasons.push("today's recovery check-in indicates reduced readiness");
  }

  if (recoveryReasons.length > 0) {
    return {
      title: lastWorkoutAgeDays === 0 ? "Recovery walk or easy mobility" : "Recovery or easy mobility",
      duration: "20–30 minutes",
      why: `A recovery-focused session is recommended because ${recoveryReasons.join(", ")}. This keeps today's load appropriate to the work already recorded.`,
      nutrition: "Prioritize regular meals, fluids, and carbohydrate and protein sources that fit your usual routine.",
      recovery: "Keep movement gentle and make time for your usual sleep and recovery routine.",
      confidence: 88,
      recoveryAdjustment: recoveryExplanation,
      reasoning: [
        ...profileData,
        ...historyReasoning,
        ...plannerReasoning,
        ...recoveryReasoning,
        `Training sessions influencing the decision this week: ${thisWeekWorkouts.length ? [...new Map(thisWeekWorkouts.map((workout) => [workout.sessionId, workout])).values()].map((workout) => `${workout.workoutTitle || workout.activityType} (${formatWorkoutDate(workout.workoutDate)})`).join("; ") : "none recorded"}.`,
        `Rule applied: ${recoveryReasons.join("; ")}.`,
      ],
    };
  }

  const { activity, avoidedDisliked } = recommendedActivity(profile, recentTypes);
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
  const plannedDurationMinutes = isLongDay && goalSupportsEndurance
    ? profile.trainingExperience === "Beginner"
      ? 60
      : 75
    : 45;
  const durationMinutes = Math.min(
    plannedDurationMinutes,
    dailyPreferredDurationLimit ?? plannedDurationMinutes,
    recovery?.availableTrainingMinutes ?? plannedDurationMinutes,
  );
  const fallbackTimeLimited = durationMinutes < plannedDurationMinutes;
  const fallbackTimeLimit = Math.min(
    dailyPreferredDurationLimit ?? plannedDurationMinutes,
    recovery?.availableTrainingMinutes ?? plannedDurationMinutes,
  );
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
  if (profile.trainingExperience) {
    whyParts.push(`your ${profile.trainingExperience.toLowerCase()} training experience`);
  }
  if (isLongDay) whyParts.push("today is your preferred long-workout day");
  if (matchingEquipment) whyParts.push(`you have ${matchingEquipment.toLowerCase()}`);
  if (avoidedDisliked) {
    whyParts.push("your preferred activities and available equipment left no non-disliked option");
  } else if (profile.dislikedActivities.length > 0) {
    whyParts.push("activities you marked as disliked were excluded");
  }
  if (
    dailyPreferredDurationLimit !== null &&
    dailyPreferredDurationLimit !== undefined &&
    dailyPreferredDurationLimit < plannedDurationMinutes
  ) {
    whyParts.push(`your preferred ${dailyPreferredDurationLimit}-minute ${today.getDay() === 0 || today.getDay() === 6 ? "weekend" : "weekday"} workout limit`);
  }
  if (recentTypes.includes(activity)) {
    whyParts.push(`${activity.toLowerCase()} is still the best goal-aligned option among your recent activities`);
  } else if (recentTypes.length > 0) {
    whyParts.push(`${activity.toLowerCase()} adds variety to your recent training`);
  }
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
    why: `Selected to match ${whyParts.join(", ")}.${fallbackTimeLimited ? ` Shortened to fit your ${fallbackTimeLimit}-minute available training limit.` : ""}`,
    nutrition: activity === "Strength"
      ? "Include a protein-containing meal or snack as part of your normal daily eating."
      : "Include familiar carbohydrate and protein sources around the session, and drink to thirst.",
    recovery: "Keep the effort controlled and leave room for your next planned session.",
    confidence: isNoWorkouts ? 78 : 84,
    recoveryAdjustment: fallbackTimeLimited
      ? `Today's recommendation was shortened to fit your ${fallbackTimeLimit}-minute available training limit.`
      : recoveryExplanation,
    reasoning: [
      ...profileData,
      ...historyReasoning,
      ...plannerReasoning,
      ...recoveryReasoning,
      ...(fallbackTimeLimited ? [`Duration reduced from ${plannedDurationMinutes} to ${durationMinutes} minutes to fit your available training limit.`] : []),
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

export function TodaysDecision({
  presentation = "dashboard",
}: {
  presentation?: "dashboard" | "coach";
}) {
  const { profile, isProfileLoaded, profileError } = useAthleteProfile();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedSession[]>([]);
  const [recoveryHistory, setRecoveryHistory] = useState<RecoveryCheckIn[]>([]);
  const [recoveryError, setRecoveryError] = useState("");
  const [isWorkoutHistoryLoaded, setIsWorkoutHistoryLoaded] = useState(false);
  const [isRecoveryHistoryLoaded, setIsRecoveryHistoryLoaded] = useState(false);
  const [isPlannerLoaded, setIsPlannerLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [plannerError, setPlannerError] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [completionFeedback, setCompletionFeedback] = useState("");
  const [completingPlanId, setCompletingPlanId] = useState("");
  const [workoutDetailsOpen, setWorkoutDetailsOpen] = useState(false);
  const [detailWorkoutId, setDetailWorkoutId] = useState("");
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [showModificationForm, setShowModificationForm] = useState(false);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [showLongWorkoutWarning, setShowLongWorkoutWarning] = useState(false);
  const [targetMoveDay, setTargetMoveDay] = useState("");
  const [activityEdits, setActivityEdits] = useState<ActivityEdit[]>([]);
  const [actualDuration, setActualDuration] = useState("");
  const [actualNotes, setActualNotes] = useState("");
  const [completedActivityIds, setCompletedActivityIds] = useState<string[]>([]);
  const [actualDistances, setActualDistances] = useState<Record<string, string>>({});
  const [sessionStatistics, setSessionStatistics] = useState<SessionStatistics>({
    averageHeartRate: "",
    maximumHeartRate: "",
    averagePace: "",
    averagePower: "",
    calories: "",
  });
  const [today, setToday] = useState<Date | null>(null);

  function openWorkoutDetails() {
    if (!plannedWorkout) return;
    setCompletionError("");
    setDetailWorkoutId(plannedWorkout.id);
    setCompletedActivityIds(plannedWorkout.activities.map((activity) => activity.id));
    setActualDuration(String(plannedSessionDuration(plannedWorkout)));
    setActualNotes("");
    setActualDistances(
      Object.fromEntries(
        plannedWorkout.activities
          .filter((activity) => activity.distance !== undefined)
          .map((activity) => [activity.id, String(activity.distance)]),
      ),
    );
    setSessionStatistics({
      averageHeartRate: "",
      maximumHeartRate: "",
      averagePace: "",
      averagePower: "",
      calories: "",
    });
    setShowCompletionForm(false);
    setShowModificationForm(false);
    setShowMoveForm(false);
    setShowLongWorkoutWarning(false);
    setWorkoutDetailsOpen(true);
  }

  function beginWorkoutModification() {
    if (!detailedWorkout) return;
    setActivityEdits(
      detailedWorkout.activities.map((activity) => ({
        id: activity.id,
        activityType: activity.activityType,
        durationMinutes: String(activity.durationMinutes),
        distance: activity.distance === undefined ? "" : String(activity.distance),
        intensity: activity.intensity,
        instructions: activity.instructions,
        purpose: activity.purpose,
      })),
    );
    setShowModificationForm(true);
    setShowCompletionForm(false);
    setShowMoveForm(false);
    setShowLongWorkoutWarning(false);
    setCompletionError("");
  }

  function saveWorkoutModification() {
    if (!detailedWorkout || activityEdits.length === 0) return;
    const updatedActivities: PlannedActivity[] = activityEdits.map((activity) => ({
      id: activity.id,
      activityType: activity.activityType,
      durationMinutes: Number(activity.durationMinutes),
      ...(activity.distance.trim() ? { distance: Number(activity.distance) } : {}),
      intensity: activity.intensity,
      instructions: activity.instructions,
      purpose: activity.purpose,
    }));
    if (
      updatedActivities.some(
        (activity) =>
          !Number.isFinite(activity.durationMinutes) ||
          activity.durationMinutes <= 0 ||
          (activity.distance !== undefined &&
            (!Number.isFinite(activity.distance) || activity.distance < 0)),
      )
    ) {
      setCompletionError("Enter a valid duration and non-negative distance for each activity.");
      return;
    }
    const title = updatedActivities.map((activity) => activity.activityType).join(" + ");
    try {
      updatePlannedSession(detailedWorkout.id, {
        activities: updatedActivities,
        title,
        modified: true,
      });
      setShowModificationForm(false);
      setCompletionFeedback("Today's planned workout was updated.");
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "The workout changes could not be saved.",
      );
    }
  }

  function moveTodaysWorkout() {
    if (!detailedWorkout || !targetMoveDay) return;
    const targetDay = weekDays.find((day) => day === targetMoveDay);
    if (!targetDay) return;
    const nextDate = new Date(`${detailedWorkout.date}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + weekDays.indexOf(targetDay) - weekDays.indexOf(detailedWorkout.day));
    const nextDateString = localDateString(nextDate);
    try {
      updatePlannedSession(detailedWorkout.id, {
        day: targetDay,
        date: nextDateString,
        rescheduledFromDay: detailedWorkout.rescheduledFromDay ?? detailedWorkout.day,
        status: "Planned",
      });
      setShowMoveForm(false);
      setShowLongWorkoutWarning(false);
      setTargetMoveDay("");
      setCompletionFeedback(`Workout moved from ${detailedWorkout.day} to ${targetDay}.`);
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "The planned workout could not be moved.",
      );
    }
  }

  function skipTodaysWorkout() {
    if (!detailedWorkout) return;
    try {
      updatePlannedSession(detailedWorkout.id, { status: "Skipped" });
      setWorkoutDetailsOpen(false);
      setCompletionFeedback("Workout skipped. Your completed training history is unchanged.");
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "The planned workout could not be skipped.",
      );
    }
  }

  function requestWorkoutMove() {
    setShowCompletionForm(false);
    setShowModificationForm(false);
    setShowMoveForm(false);
    if (isDetailedWorkoutLongest && detailedWorkout?.day === profile?.longWorkoutDay) {
      setShowLongWorkoutWarning(true);
      return;
    }
    setShowLongWorkoutWarning(false);
    setShowMoveForm(true);
  }

  async function markWorkoutComplete(session: PlannedSession) {
    setCompletingPlanId(session.id);
    setCompletionError("");
    setCompletionFeedback("");
    try {
      const sessionForCompletion =
        recommendation?.plannedSessionId === session.id && recommendation.activities
          ? { ...session, activities: recommendation.activities }
          : session;
      await completePlannedSession(sessionForCompletion, undefined, profile?.units ?? "Metric");
      setCompletionFeedback("Workout marked complete. Your plan, adherence, and training history are updated.");
      setWorkoutDetailsOpen(false);
    } catch (error) {
      setCompletionError(
        error instanceof Error
          ? error.message
          : "The workout could not be marked complete. Try again.",
      );
    } finally {
      setCompletingPlanId("");
    }
  }

  async function markWorkoutCompleteWithChanges() {
    if (!detailedWorkout) return;
    const numeric = (value: string) => (value.trim() ? Number(value) : undefined);
    const statistics = {
      averageHeartRate: numeric(sessionStatistics.averageHeartRate),
      maximumHeartRate: numeric(sessionStatistics.maximumHeartRate),
      averagePace: sessionStatistics.averagePace.trim() || undefined,
      averagePower: numeric(sessionStatistics.averagePower),
      calories: numeric(sessionStatistics.calories),
    };
    const invalidStats = Object.values(statistics).some(
      (value) => typeof value === "number" && (!Number.isFinite(value) || value < 0),
    );
    if (invalidStats) {
      setCompletionError("Optional statistics must be valid non-negative values.");
      return;
    }
    const changes: CompletedSessionChanges = {
      durationMinutes: Number(actualDuration),
      notes: actualNotes,
      completedActivityIds,
      distanceByActivity: Object.fromEntries(
        Object.entries(actualDistances)
          .filter(([activityId, value]) => completedActivityIds.includes(activityId) && value.trim())
          .map(([activityId, value]) => [activityId, Number(value)]),
      ),
      ...(statistics.averageHeartRate === undefined ? {} : { averageHeartRate: statistics.averageHeartRate }),
      ...(statistics.maximumHeartRate === undefined ? {} : { maximumHeartRate: statistics.maximumHeartRate }),
      ...(statistics.averagePace === undefined ? {} : { averagePace: statistics.averagePace }),
      ...(statistics.averagePower === undefined ? {} : { averagePower: statistics.averagePower }),
      ...(statistics.calories === undefined ? {} : { calories: statistics.calories }),
    };
    if (!Number.isFinite(changes.durationMinutes) || changes.durationMinutes <= 0) {
      setCompletionError("Enter the total actual workout duration in minutes.");
      return;
    }
    if (
      Object.values(changes.distanceByActivity ?? {}).some(
        (distance) => !Number.isFinite(distance) || distance < 0,
      )
    ) {
      setCompletionError("Actual distances must be valid non-negative values.");
      return;
    }
    setCompletingPlanId(detailedWorkout.id);
    setCompletionError("");
    try {
      await completePlannedSession(detailedWorkout, changes, profile?.units ?? "Metric");
      setCompletionFeedback("Workout saved with your changes and linked to Training Sessions.");
      setWorkoutDetailsOpen(false);
      setShowCompletionForm(false);
    } catch (error) {
      setCompletionError(
        error instanceof Error
          ? error.message
          : "The completed session could not be saved. Try again.",
      );
    } finally {
      setCompletingPlanId("");
    }

  }

  useEffect(() => {
    if (!workoutDetailsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkoutDetailsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [workoutDetailsOpen]);

  useEffect(() => {
    let active = true;
    let workoutRequestId = 0;
    let recoveryRequestId = 0;
    const loadWorkouts = async () => {
      const currentRequest = ++workoutRequestId;
      try {
        const parsed = await loadWorkoutHistory();
        if (!Array.isArray(parsed)) throw new Error("Workout history has an invalid format.");
        const safeWorkouts: Workout[] = [];
        for (const [index, item] of parsed.entries()) {
          if (!isRecord(item) ||
            !("activityType" in item) ||
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
        if (!active || currentRequest !== workoutRequestId) return;
        setWorkouts(safeWorkouts);
        setHistoryError("");
      } catch (loadError) {
        if (!active || currentRequest !== workoutRequestId) return;
        setWorkouts([]);
        setHistoryError(
          loadError instanceof Error
            ? `Saved workout history is unavailable: ${loadError.message}`
            : "Saved workout history is unavailable.",
        );
      } finally {
        if (active && currentRequest === workoutRequestId) setIsWorkoutHistoryLoaded(true);
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
    const loadRecovery = async (userId?: string | null) => {
      const currentRequest = ++recoveryRequestId;
      setIsRecoveryHistoryLoaded(false);
      try {
        const records = await loadRecoveryCheckIns(userId);
        if (!active || currentRequest !== recoveryRequestId) return;
        setRecoveryHistory(records);
        setRecoveryError("");
      } catch (loadError) {
        if (!active || currentRequest !== recoveryRequestId) return;
        setRecoveryHistory([]);
        setRecoveryError(
          loadError instanceof Error
            ? loadError.message
            : "Saved recovery check-in is unavailable.",
        );
      } finally {
        if (active && currentRequest === recoveryRequestId) {
          setIsRecoveryHistoryLoaded(true);
        }
      }
    };
    const updateDate = () => setToday(new Date());
    const loadAll = () => {
      void loadWorkouts();
      loadPlanner();
      void loadRecovery();
    };
    const reloadRecovery = () => void loadRecovery();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        setWorkouts([]);
        setIsWorkoutHistoryLoaded(false);
        setRecoveryHistory([]);
        setIsRecoveryHistoryLoaded(false);
        setRecoveryError("");
        void loadWorkouts();
        void loadRecovery(session?.user.id ?? null);
      });
    });
    loadAll();
    updateDate();
    window.addEventListener("storage", loadAll);
    window.addEventListener(WORKOUTS_UPDATED_EVENT, loadWorkouts);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlanner);
    window.addEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadRecovery);
    window.addEventListener("focus", loadAll);
    window.addEventListener("visibilitychange", loadAll);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("storage", loadAll);
      window.removeEventListener(WORKOUTS_UPDATED_EVENT, loadWorkouts);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, loadPlanner);
      window.removeEventListener(RECOVERY_CHECKINS_UPDATED_EVENT, reloadRecovery);
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
  const recommendation =
    isProfileComplete &&
    profile &&
    today &&
    isPlannerLoaded &&
    isWorkoutHistoryLoaded &&
    isRecoveryHistoryLoaded &&
    !plannerError
      ? buildRecommendation(profile, workouts, plannedWorkouts, today, recoveryHistory)
      : null;
  const plannedWorkout = recommendation?.plannedSessionId
    ? plannedWorkouts.find((session) => session.id === recommendation.plannedSessionId)
    : undefined;
  const detailedWorkout = detailWorkoutId
    ? plannedWorkouts.find((session) => session.id === detailWorkoutId)
    : undefined;
  const generatedDate = today
    ? today.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Preparing recommendation";
  const workoutSource = detailedWorkout
      ? detailedWorkout.rescheduledFromDay
        ? "Rescheduled Workout"
        : detailedWorkout.generated
          ? "Generated Weekly Plan"
          : "Manual Plan"
      : "";
  const workoutWeekStart = today
      ? localDateString(startOfWeek(today))
      : "";
  const detailedWeekSessions = detailedWorkout
      ? plannedWorkouts.filter(
          (session) =>
            session.date >= workoutWeekStart &&
            session.date <=
              localDateString(
                new Date(
                  startOfWeek(today ?? new Date()).getFullYear(),
                  startOfWeek(today ?? new Date()).getMonth(),
                  startOfWeek(today ?? new Date()).getDate() + 6,
                ),
              ) &&
            session.status !== "Skipped",
        )
      : [];
  const isDetailedWorkoutLongest =
      Boolean(detailedWorkout) &&
      (detailedWorkout
        ? plannedSessionDuration(detailedWorkout)
        : 0) >=
        detailedWeekSessions.reduce(
          (longest, session) => Math.max(longest, plannedSessionDuration(session)),
          0,
        );

  if (presentation === "coach") {
    const asOfDate = today ? localDateString(today) : "";
    const weekStart = today ? localDateString(startOfWeek(today)) : "";
    const recentStart = today
      ? localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
      : "";
    const coachWeekWorkouts = workouts.filter(
      (workout) => workout.workoutDate >= weekStart && workout.workoutDate <= asOfDate,
    );
    const coachRecentWorkouts = workouts.filter(
      (workout) => workout.workoutDate >= recentStart && workout.workoutDate <= asOfDate,
    );
    const recentRecovery = recoveryHistory.filter(
      (entry) => entry.date >= recentStart && entry.date <= asOfDate,
    );
    const latestRecovery = recoveryHistory[0];
    const meanReadiness = recentRecovery.length
      ? Math.round(
          recentRecovery.reduce((sum, entry) => sum + entry.readinessScore, 0) /
            recentRecovery.length,
        )
      : null;
    const latestWorkout = workouts.filter((workout) => workout.workoutDate <= asOfDate).sort(
      (left, right) =>
        right.workoutDate.localeCompare(left.workoutDate) ||
        (right.startTime ?? "").localeCompare(left.startTime ?? ""),
    )[0];
    const activityMinutes = new Map<string, number>();
    coachRecentWorkouts.forEach((workout) =>
      activityMinutes.set(
        workout.activityType,
        (activityMinutes.get(workout.activityType) ?? 0) + workout.duration,
      ),
    );
    const weeklyMinutes = coachWeekWorkouts.reduce((sum, workout) => sum + workout.duration, 0);
    const goalActivity = profile ? recommendedActivity(profile, coachRecentWorkouts.map((workout) => workout.activityType)).activity : "";

    return (
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        <header className="mb-7">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b8f36b]">
            <Zap aria-hidden="true" size={13} /> Rule-based coaching · Uses your saved data
          </p>
          <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
            AI Coach
          </h1>
          <p className="mt-1.5 text-xs text-[#87938b]">
            A clear view of today’s recommendation and the profile, training, and recovery data behind it.
          </p>
        </header>

        {!isProfileLoaded ||
        !isWorkoutHistoryLoaded ||
        !isRecoveryHistoryLoaded ||
        !isPlannerLoaded ? (
          <p className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 text-xs text-[#87938b]" role="status">
            Loading your profile, workout history, and recovery history…
          </p>
        ) : (
          <>
            {(profileError || historyError || recoveryError || plannerError) && (
              <div className="mb-4 grid gap-2" role="alert">
                {[profileError, historyError, recoveryError, plannerError]
                  .filter(Boolean)
                  .map((message) => (
                    <p
                      className="rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] p-3 text-xs text-[#f0c49d]"
                      key={message}
                    >
                      {message}
                    </p>
                  ))}
              </div>
            )}

            {recommendation ? (
              <>
                <section className="rounded-xl border border-[#b8f36b]/20 p-5 sm:p-7" style={{
                  background: "radial-gradient(ellipse at 8% 0%, rgba(184,243,107,0.15), transparent 48%), linear-gradient(135deg, #141c17 0%, #0f1512 62%, #111714 100%)",
                }}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b8f36b]">
                    Today’s recommendation · {generatedDate}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#f0f4ef]">
                      {recommendation.title}
                    </h2>
                    <span className="flex items-center gap-1 text-xs text-[#b8f36b]">
                      <Clock3 aria-hidden="true" size={13} /> {recommendation.duration}
                    </span>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#c2cdc5]">
                    {recommendation.why}
                  </p>
                  {recommendation.instructions && (
                    <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#a6b1a9]">
                      {recommendation.instructions}
                    </p>
                  )}
                  {recommendation.purpose && (
                    <p className="mt-2 text-[11px] text-[#87938b]">
                      Purpose: {recommendation.purpose}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#b8f36b]/15 bg-[#b8f36b]/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#c5ef97]">
                      Rule-based confidence · {recommendation.confidence}%
                    </span>
                    {recommendation.plannerBased && (
                      <span className="rounded-full border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.05] px-2.5 py-1 text-[10px] font-medium text-[#b9e5eb]">
                        From your Training Planner
                      </span>
                    )}
                  </div>
                </section>

                {recommendation.activities && (
                  <section className="mt-4 rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                    <h2 className="text-sm font-semibold text-[#e5ebe6]">Workout details</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {recommendation.activities.map((activity) => (
                        <article className="rounded-lg border border-white/[0.06] bg-[#0b100e] p-3" key={activity.id}>
                          <h3 className="text-xs font-semibold text-[#dce4dd]">
                            {activity.activityType} · {activity.durationMinutes} min · {activity.intensity}
                          </h3>
                          <p className="mt-2 text-[11px] leading-relaxed text-[#a6b1a9]">{activity.instructions}</p>
                          <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">
                            <span className="font-semibold">Purpose:</span> {activity.purpose}
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-[#87938b]">
                            <span className="font-semibold">Effort:</span> {effortExplanation(activity.intensity)}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                    <div className="flex items-center gap-2">
                      <HeartPulse aria-hidden="true" className="text-[#8dd7e5]" size={15} />
                      <h2 className="text-sm font-semibold text-[#e5ebe6]">Recovery analysis</h2>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#c2cdc5]">
                      {recommendation.recoveryAdjustment || recommendation.recovery}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["Check-ins · last 7 days", String(recentRecovery.length)],
                        ["Average readiness", meanReadiness === null ? "No data" : `${meanReadiness}/100`],
                        ["Latest readiness", latestRecovery ? `${latestRecovery.readinessCategory} · ${latestRecovery.readinessScore}/100` : "No recent check-in"],
                        ["Sleep quality", latestRecovery ? `${latestRecovery.sleepQuality}/5` : "No data"],
                        ["Energy", latestRecovery ? `${latestRecovery.energy}/5` : "No data"],
                        ["Soreness", latestRecovery ? `${latestRecovery.soreness}/5` : "No data"],
                      ].map(([label, value]) => (
                        <div className="rounded-md border border-white/[0.05] bg-[#0b100e] p-2.5" key={label}>
                          <p className="text-[9px] text-[#78857d]">{label}</p>
                          <p className="mt-1 text-[11px] font-medium text-[#dce4dd]">{value}</p>
                        </div>
                      ))}
                    </div>
                    {latestRecovery?.painNotes && (
                      <p className="mt-3 text-[10px] leading-relaxed text-[#f0c49d]">
                        Limitation noted: {latestRecovery.painNotes}
                      </p>
                    )}
                    {latestRecovery?.recoveryNotes && (
                      <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">
                        Check-in note: {latestRecovery.recoveryNotes}
                      </p>
                    )}
                    <p className="mt-3 text-[10px] leading-relaxed text-[#78857d]">
                      Recovery scores are simple estimates based on your recorded check-ins, not a medical assessment.
                    </p>
                  </section>

                  <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                    <div className="flex items-center gap-2">
                      <Activity aria-hidden="true" className="text-[#b8f36b]" size={15} />
                      <h2 className="text-sm font-semibold text-[#e5ebe6]">Workout analysis</h2>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#c2cdc5]">
                      {coachRecentWorkouts.length
                        ? `${countSessions(coachRecentWorkouts)} training sessions across ${coachRecentWorkouts.length} recorded activities in the last 7 days, totaling ${coachRecentWorkouts.reduce((sum, workout) => sum + workout.duration, 0)} minutes.`
                        : "No completed workouts are recorded in the last 7 days."}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["Sessions this week", String(countSessions(coachWeekWorkouts))],
                        ["Time this week", `${Math.round(weeklyMinutes)} min`],
                        ["Latest workout", latestWorkout ? formatWorkoutDate(latestWorkout.workoutDate) : "No data"],
                        ["Latest activity", latestWorkout?.activityType ?? "No data"],
                      ].map(([label, value]) => (
                        <div className="rounded-md border border-white/[0.05] bg-[#0b100e] p-2.5" key={label}>
                          <p className="text-[9px] text-[#78857d]">{label}</p>
                          <p className="mt-1 text-[11px] font-medium text-[#dce4dd]">{value}</p>
                        </div>
                      ))}
                    </div>
                    {activityMinutes.size > 0 && (
                      <p className="mt-3 text-[10px] leading-relaxed text-[#a6b1a9]">
                        Recent activity mix: {[...activityMinutes.entries()]
                          .map(([activity, minutes]) => `${activity} ${Math.round(minutes)} min`)
                          .join(" · ")}.
                      </p>
                    )}
                    {recommendation.recovery && (
                      <p className="mt-3 text-[10px] leading-relaxed text-[#87938b]">
                        Training focus: {recommendation.recovery}
                      </p>
                    )}
                  </section>

                  <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                    <div className="flex items-center gap-2">
                      <Target aria-hidden="true" className="text-[#b8f36b]" size={15} />
                      <h2 className="text-sm font-semibold text-[#e5ebe6]">Goal alignment</h2>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#c2cdc5]">
                      {profile
                        ? `${recommendation.title} is selected to support your ${goalLabel(profile)} goal${profile.targetEventName ? ` and your ${profile.targetEventName} event${profile.targetEventDate ? ` on ${formatWorkoutDate(profile.targetEventDate)}` : ""}` : ""}.`
                        : "Complete your athlete profile to align recommendations with a training goal."}
                    </p>
                    {profile?.goalDescription && (
                      <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">{profile.goalDescription}</p>
                    )}
                    {goalActivity && (
                      <p className="mt-2 text-[10px] text-[#a6b1a9]">
                        Goal-aligned activity considered: {goalActivity}.
                      </p>
                    )}
                    {recommendation.purpose && (
                      <p className="mt-2 text-[10px] leading-relaxed text-[#a6b1a9]">{recommendation.purpose}</p>
                    )}
                  </section>

                  <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                    <div className="flex items-center gap-2">
                      <UserRound aria-hidden="true" className="text-[#b8f36b]" size={15} />
                      <h2 className="text-sm font-semibold text-[#e5ebe6]">Athlete profile</h2>
                    </div>
                    {profile ? (
                      <dl className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["Athlete", profile.preferredName || "Name not set"],
                          ["Experience", profile.trainingExperience || "Not set"],
                          ["Goal", goalLabel(profile)],
                          ["Weekly availability", profile.weeklyTrainingHours === null ? "Not set" : `${profile.weeklyTrainingHours} hours`],
                          ["Training days", profile.availableTrainingDays.join(", ") || "Not set"],
                          ["Long workout day", profile.longWorkoutDay || "Not set"],
                          ["Target event", profile.targetEventName || "Not set"],
                          ["Preferred duration", `${profile.maxWeekdayWorkoutMinutes ?? "—"} min weekdays · ${profile.maxWeekendWorkoutMinutes ?? "—"} min weekends`],
                          ["Preferred activities", profile.preferredActivities.join(", ") || "No preference set"],
                          ["Activities to avoid", profile.dislikedActivities.join(", ") || "None listed"],
                          ["Equipment", [...profile.equipment, profile.otherEquipment].filter(Boolean).join(", ") || "Not set"],
                          ["Limitations", [profile.currentLimitations, profile.healthConsiderations].filter(Boolean).join(" · ") || "None noted"],
                        ].map(([label, value]) => (
                          <div className="rounded-md border border-white/[0.05] bg-[#0b100e] p-2.5" key={label}>
                            <dt className="text-[9px] text-[#78857d]">{label}</dt>
                            <dd className="mt-1 text-[11px] font-medium text-[#dce4dd]">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-3 text-xs text-[#87938b]">No athlete profile is saved yet.</p>
                    )}
                  </section>
                </div>

                <section className="mt-4 rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-[#e5ebe6]">Reasoning</h2>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#78857d]">
                    This is the same rule-based recommendation shown on your dashboard, using your saved profile, workout, and recovery data.
                  </p>
                  <ul className="mt-3 grid gap-2 text-[11px] leading-relaxed text-[#a6b1a9]">
                    {recommendation.reasoning.map((reason) => (
                      <li className="flex gap-2" key={reason}>
                        <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-[#b8f36b]" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : (
              <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-5">
                <h2 className="text-sm font-semibold text-[#e5ebe6]">Personalize your coaching</h2>
                <p className="mt-2 text-xs leading-relaxed text-[#87938b]">
                  Complete your athlete profile and training planner to get a recommendation based on your goals, recent workouts, and recovery check-ins.
                </p>
                {profile && (
                  <p className="mt-2 text-[10px] text-[#a6b1a9]">
                    Profile goal: {goalLabel(profile)} · {profile.trainingExperience || "Experience not set"} · {profile.availableTrainingDays.join(", ") || "Training days not set"}.
                  </p>
                )}
                <Link
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#c5ef97] hover:text-[#d0f79d]"
                  href="/settings"
                >
                  Update athlete profile <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
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

        {completionFeedback && (
          <p className="mt-4 text-xs text-[#c5ef97]" role="status">
            {completionFeedback}
          </p>
        )}

        {!isProfileLoaded ||
        !isWorkoutHistoryLoaded ||
        !isRecoveryHistoryLoaded ||
        !isPlannerLoaded ? (
          <p className="mt-6 text-xs text-[#87938b]" role="status">
            Loading your Supabase profile, workout history, and recovery history…
          </p>
        ) : profileError ? (
          <p className="mt-6 text-xs text-[#f0c49d]" role="alert">
            {profileError}
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
                <button
                  className="block w-full rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8f36b]"
                  disabled={!plannedWorkout}
                  onClick={openWorkoutDetails}
                  type="button"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#839087]">
                    Recommended workout
                  </span>
                  <span className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[22px] font-semibold tracking-[-0.035em] text-[#f0f4ef]">
                      {recommendation.title}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#b8f36b]">
                      <Clock3 aria-hidden="true" size={13} />
                      {recommendation.duration}
                    </span>
                  </span>
                  <span className="mt-2 block max-w-2xl text-xs leading-relaxed text-[#a6b1a9]">
                    {recommendation.why}
                  </span>
                  {recommendation.plannerBased && (
                    <span className="mt-3 inline-flex rounded-full border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.05] px-2.5 py-1 text-[9px] font-medium text-[#b9e5eb]">
                      From your Training Planner
                    </span>
                  )}
                </button>
                <p className="mt-3 text-[10px] leading-relaxed text-[#b9e5eb]">
                  {recoveryError
                    ? `Recovery check-in unavailable: ${recoveryError}`
                    : recommendation.recoveryAdjustment}
                </p>
                {recommendation.activities && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {recommendation.activities.map((activity) => (
                      <div className="rounded-md border border-white/[0.06] bg-[#111714]/75 p-2.5" key={activity.id}>
                        <p className="text-[10px] font-semibold text-[#dce4dd]">
                          {activity.activityType} · {activity.durationMinutes} min · {activity.intensity}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                          <span className="font-semibold">Plain-language explanation:</span> {activity.instructions}
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#78857d]">
                          <span className="font-semibold">Purpose:</span> {activity.purpose}
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#87938b]">
                          <span className="font-semibold">Expected effort:</span> {effortExplanation(activity.intensity)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {recommendation.instructions && !recommendation.activities && (
                  <p className="mt-3 text-xs leading-relaxed text-[#c2cdc5]">{recommendation.instructions}</p>
                )}
                {recommendation.purpose && !recommendation.activities && (
                  <p className="mt-2 text-[10px] leading-relaxed text-[#87938b]">
                    Purpose: {recommendation.purpose}
                  </p>
                )}
                {recommendation.plannedSessionId && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      className="rounded-lg border border-[#8dd7e5]/25 px-3 py-2 text-xs font-medium text-[#b9e5eb] hover:bg-[#8dd7e5]/[0.06]"
                      onClick={openWorkoutDetails}
                      type="button"
                    >
                      View Workout
                    </button>
                    <button
                      className="rounded-lg bg-[#b8f36b] px-3 py-2 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] disabled:cursor-wait disabled:opacity-60"
                      disabled={completingPlanId === recommendation.plannedSessionId}
                      onClick={() => {
                        const session = plannedWorkouts.find(
                          (item) => item.id === recommendation.plannedSessionId,
                        );
                        if (session) markWorkoutComplete(session);
                      }}
                      type="button"
                    >
                      {completingPlanId === recommendation.plannedSessionId
                        ? "Saving..."
                        : "Mark Complete"}
                    </button>
                    {completionFeedback && (
                      <p className="text-[10px] text-[#c5ef97]" role="status">
                        {completionFeedback}
                      </p>
                    )}
                    {completionError && (
                      <p className="text-[10px] text-[#f0b47c]" role="alert">
                        {completionError}
                      </p>
                    )}
                  </div>
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
    {workoutDetailsOpen && detailedWorkout && profile && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setWorkoutDetailsOpen(false);
        }}
      >
        <section
          aria-labelledby="todays-workout-guide-heading"
          aria-modal="true"
          className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-white/[0.09] bg-[#0d1310] p-5 shadow-2xl sm:rounded-xl sm:p-7"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b8f36b]">
                Today&apos;s Workout
              </p>
              <h2
                className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#eef2ed] sm:text-2xl"
                id="todays-workout-guide-heading"
              >
                {detailedWorkout.title}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#8dd7e5]/15 bg-[#8dd7e5]/[0.05] px-2.5 py-1 text-[9px] text-[#b9e5eb]">
                  {workoutSource}
                </span>
                {detailedWorkout.modified && (
                  <span className="rounded-full border border-[#f0b47c]/20 bg-[#f0b47c]/[0.06] px-2.5 py-1 text-[9px] text-[#f0c49d]">
                    Modified
                  </span>
                )}
                {detailedWorkout.status === "Completed" && (
                  <span className="rounded-full border border-[#b8f36b]/20 bg-[#b8f36b]/[0.06] px-2.5 py-1 text-[9px] text-[#c5ef97]">
                    Completed
                  </span>
                )}
              </div>
            </div>
            <button
              aria-label="Close workout details"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]"
              onClick={() => setWorkoutDetailsOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Activity", detailedWorkout.activities.map((activity) => activity.activityType).join(" + ")],
              ["Planned duration", `${plannedSessionDuration(detailedWorkout)} min`],
              [
                "Planned distance",
                detailedWorkout.activities
                  .filter((activity) => activity.distance !== undefined)
                  .map(
                    (activity) =>
                      `${activity.distance} ${activityDistanceUnit(activity.activityType, profile)}`,
                  )
                  .join(" + ") || "Not set",
              ],
              ["Planned for", `${detailedWorkout.day} · ${formatWorkoutDate(detailedWorkout.date)}`],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-white/[0.06] bg-[#141b17] p-3" key={label}>
                <p className="text-[9px] text-[#78857d]">{label}</p>
                <p className="mt-1 text-xs font-medium text-[#dce4dd]">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-[#b8f36b]/15 bg-[#b8f36b]/[0.035] p-4">
            <h3 className="text-xs font-semibold text-[#eef2ed]">Purpose</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#c2cdc5]">
              {detailedWorkout.activities.map((activity) => activity.purpose).filter(Boolean).join(" ")}
            </p>
            <h3 className="mt-3 text-xs font-semibold text-[#eef2ed]">Why today</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#c2cdc5]">
              {detailedWorkout.reason}
              {detailedWorkout.rescheduledFromDay
                ? ` This workout was moved from ${detailedWorkout.rescheduledFromDay} to ${detailedWorkout.day}.`
                : ` It is part of your ${goalLabel(profile)} plan.`}
            </p>
            {recommendation?.plannedSessionId === detailedWorkout.id &&
              recommendation.recoveryAdjustment && (
                <p className="mt-2 rounded-md border border-[#8dd7e5]/10 bg-[#8dd7e5]/[0.04] p-2.5 text-[10px] leading-relaxed text-[#b9e5eb]">
                  {recommendation.recoveryAdjustment} The saved planner workout has not been changed.
                </p>
              )}
          </div>

          <div className="mt-4 grid gap-3">
            {detailedWorkout.activities.map((activity, index) => {
              const ActivityIcon = activityIcon(activity.activityType);
              const segments = workoutTimeSegments(activity.durationMinutes);
              const isSwim = activity.activityType === "Swim";
              const isRun = activity.activityType === "Run";
              const isRide = activity.activityType === "Ride";
              const isStrength = activity.activityType === "Strength";
              const relevantEquipment = profile.equipment.filter((item) =>
                isRun
                  ? ["Running access", "Treadmill"].includes(item)
                  : isRide
                    ? ["Road bike", "Indoor bike trainer"].includes(item)
                    : isSwim
                      ? ["Pool access", "Open-water swimming access"].includes(item)
                      : isStrength
                        ? ["Gym access", "Strength equipment"].includes(item)
                        : false,
              );
              const distanceUnit = activityDistanceUnit(activity.activityType, profile);
              const activityDistance =
                activity.distance === undefined
                  ? ""
                  : `${activity.distance} ${distanceUnit}`;
              const hasIntervals = /\b(intervals?|repeats?|sets?)\b/i.test(activity.instructions);
              const swimDistance = activity.distance ?? 0;
              const swimWarmup = swimDistance ? Math.round(swimDistance * 0.17) : 0;
              const swimDrills = swimDistance ? Math.round(swimDistance * 0.17) : 0;
              const swimCooldown = swimDistance ? Math.round(swimDistance * 0.16) : 0;
              const swimMain = swimDistance
                ? swimDistance - swimWarmup - swimDrills - swimCooldown
                : 0;
              return (
                <article
                  className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
                  key={activity.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-[#b8f36b]/10 text-[#b8f36b]">
                      <ActivityIcon aria-hidden="true" size={14} />
                    </span>
                    <h3 className="text-sm font-semibold text-[#eef2ed]">
                      {index + 1}. {activity.activityType}
                    </h3>
                    <span className="ml-auto text-[10px] text-[#a6b1a9]">
                      {activity.durationMinutes} min{activityDistance ? ` · ${activityDistance}` : ""}
                    </span>
                  </div>
                  {index > 0 && (
                    <p className="mt-3 rounded-md border border-[#8dd7e5]/10 bg-[#8dd7e5]/[0.04] p-2.5 text-[10px] leading-relaxed text-[#b9e5eb]">
                      Transition from the previous activity at a calm, safe pace. The workout plan does not specify a transition duration.
                    </p>
                  )}
                  <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                    <li className="rounded-md border border-white/[0.05] bg-[#0b100e]/70 p-3">
                      <p className="text-[10px] font-semibold text-[#c5ef97]">1 · Warm-up</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                        {isSwim
                          ? swimDistance
                            ? `${swimWarmup} ${distanceUnit} of relaxed swimming.`
                            : "Begin with relaxed swimming as part of the planned time."
                          : segments.warmup
                            ? `Start with ${segments.warmup} minutes of easy movement${isRun ? ", such as walking and gentle jogging" : ""}.`
                            : `Begin gently as part of the planned ${activity.durationMinutes} minutes.`}
                      </p>
                    </li>
                    <li className="rounded-md border border-white/[0.05] bg-[#0b100e]/70 p-3 sm:col-span-1">
                      <p className="text-[10px] font-semibold text-[#c5ef97]">2 · Main workout</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                        {activity.instructions || `Complete ${segments.main} minutes at the planned effort.`}
                      </p>
                      {!isSwim && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                          Main portion: about {segments.main} minutes{activityDistance ? `, or ${activityDistance} total` : ""}.
                        </p>
                      )}
                      {isSwim && (
                        <>
                          <p className="mt-2 text-[10px] font-semibold text-[#c5ef97]">Drill set</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                            {swimDistance
                              ? `${swimDrills} ${distanceUnit} of relaxed technique practice. Rest briefly between lengths as needed.`
                              : "Practice a comfortable technique drill you already know; rest briefly between lengths as needed."}
                          </p>
                          <p className="mt-2 text-[10px] font-semibold text-[#c5ef97]">Main set</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                            {swimDistance
                              ? `${swimMain} ${distanceUnit} at the planned effort, resting briefly between repeats as needed.`
                              : `Swim steadily for about ${segments.main} minutes at the planned effort.`}
                          </p>
                        </>
                      )}
                      {isRide && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                          Cadence: no numeric target is saved; pedal smoothly at a comfortable rhythm. No power or heart-rate target is saved, so use the effort guidance below.
                        </p>
                      )}
                      {isRun && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                          {hasIntervals
                            ? "Follow only the intervals and recovery timing written in the saved workout instructions; no additional interval targets are assumed."
                            : "No intervals are specified in this plan. Keep to the steady effort described in the saved workout."}
                        </p>
                      )}
                      {isStrength && (
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold text-[#c5ef97]">Strength details</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                            Exercise names, sets, repetitions, rest periods, and technique are shown only when included in the saved workout instructions above. If they are not specified, use familiar movements you can perform comfortably; make it easier by reducing repetitions or using lighter resistance.
                          </p>
                        </div>
                      )}
                    </li>
                    <li className="rounded-md border border-white/[0.05] bg-[#0b100e]/70 p-3">
                      <p className="text-[10px] font-semibold text-[#c5ef97]">
                        {isSwim ? "3 · Cooldown" : "3 · Cooldown"}
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                        {isSwim
                          ? swimDistance
                            ? `${swimCooldown} ${distanceUnit} of relaxed swimming.`
                            : "Finish with relaxed swimming as part of the planned time."
                          : segments.cooldown
                            ? `Finish with ${segments.cooldown} minutes of easy movement.`
                            : "Finish at an easy effort within the remaining planned time."}
                      </p>
                    </li>
                  </ol>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-[#0b100e]/70 p-3">
                      <p className="text-[10px] font-semibold text-[#dce4dd]">Effort guidance</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                        {effortExplanation(activity.intensity)}
                      </p>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#78857d]">
                        No pace, power, or heart-rate target is saved. Use how the effort feels rather than guessing at sensor numbers.
                      </p>
                    </div>
                    <div className="rounded-md bg-[#0b100e]/70 p-3">
                      <p className="text-[10px] font-semibold text-[#dce4dd]">Equipment needed</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#a6b1a9]">
                        {relevantEquipment.length
                          ? relevantEquipment.join(", ")
                          : isStrength
                            ? "No specific equipment is required for the bodyweight options above."
                            : "No specific equipment is listed in your athlete profile."}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {detailedWorkout.notes && (
            <div className="mt-4 rounded-lg border border-white/[0.07] bg-[#111714] p-3">
              <p className="text-[10px] font-semibold text-[#dce4dd]">Workout notes / modification</p>
              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[#a6b1a9]">
                {detailedWorkout.notes}
              </p>
            </div>
          )}

          <details className="mt-4 rounded-lg border border-white/[0.07] bg-[#111714] p-3.5">
            <summary className="cursor-pointer text-xs font-semibold text-[#dce4dd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]">
              What does this mean?
            </summary>
            <ul className="mt-3 grid gap-2 text-[10px] leading-relaxed text-[#a6b1a9]">
              <li><strong className="text-[#dce4dd]">Aerobic:</strong> steady exercise that uses oxygen to keep you moving; conversational effort is a practical guide.</li>
              <li><strong className="text-[#dce4dd]">Zone 2:</strong> a common label for easy, steady effort. No heart-rate zone is prescribed here; use the talk test instead.</li>
              <li><strong className="text-[#dce4dd]">Tempo / threshold:</strong> sustained faster efforts that feel controlled-hard. Neither is assumed unless stated in your saved workout.</li>
              <li><strong className="text-[#dce4dd]">Intervals:</strong> repeated work periods with easier recovery between them. Follow only the timing in the planned instructions.</li>
              <li><strong className="text-[#dce4dd]">Brick:</strong> two activities done one after another, often bike then run. Allow an unhurried transition between them.</li>
              <li><strong className="text-[#dce4dd]">Recovery:</strong> an easier session or rest that gives your body time between harder efforts.</li>
              <li><strong className="text-[#dce4dd]">Effort levels:</strong> Easy = full sentences; Moderate = short sentences; Hard = challenging but controlled; Recovery = very light.</li>
            </ul>
          </details>

          <details className="mt-3 rounded-lg border border-[#8dd7e5]/10 bg-[#8dd7e5]/[0.035] p-3.5">
            <summary className="cursor-pointer text-xs font-semibold text-[#b9e5eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b8f36b]">
              Make It Easier
            </summary>
            <p className="mt-2 text-[10px] leading-relaxed text-[#a6b1a9]">
              Keep the warm-up and cooldown, and shorten the main portion by about 20% from the planned amount. For a multi-activity workout, shorten each activity and keep transitions relaxed. Stay at an easy conversational effort; skip any part that does not feel comfortable.
            </p>
          </details>

          {completionError && (
            <p className="mt-3 text-xs text-[#f0b47c]" role="alert">{completionError}</p>
          )}

          {showModificationForm && (
            <section className="mt-4 rounded-lg border border-[#b8f36b]/15 bg-[#111714] p-4" aria-labelledby="modify-workout-heading">
              <h3 className="text-xs font-semibold text-[#eef2ed]" id="modify-workout-heading">
                Modify Today&apos;s Workout
              </h3>
              <p className="mt-1 text-[10px] leading-relaxed text-[#87938b]">
                Changes apply to the planned activities only. Weekly planned hours recalculate automatically.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {activityEdits.map((activity, index) => (
                  <div className="grid gap-2 rounded-md border border-white/[0.06] bg-[#0b100e] p-3" key={activity.id}>
                    <p className="text-[10px] font-semibold text-[#dce4dd]">Activity {index + 1}</p>
                    <label className="grid gap-1 text-[9px] text-[#87938b]">
                      Activity type
                      <select
                        className="min-h-9 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                        onChange={(event) => {
                          const activityType = activityOptions.find((type) => type === event.currentTarget.value);
                          if (!activityType) return;
                          setActivityEdits((current) =>
                            current.map((item) =>
                              item.id === activity.id
                                ? {
                                    ...item,
                                    activityType,
                                    distance: "",
                                    instructions:
                                      activityType === "Run"
                                        ? "Run at a comfortable effort where you can speak in full sentences."
                                        : activityType === "Ride"
                                          ? "Ride at a comfortable effort where conversation remains easy."
                                          : activityType === "Swim"
                                            ? "Swim relaxed lengths and pause as needed to keep your technique comfortable."
                                            : activityType === "Strength"
                                              ? "Practice familiar strength movements with controlled, comfortable repetitions."
                                              : "Choose familiar movement that fits the planned effort and duration.",
                                    purpose:
                                      activityType === "Strength"
                                        ? "Maintain strength with manageable effort."
                                        : "Build consistency without making the next session harder.",
                                  }
                                : item,
                            ),
                          );
                        }}
                        value={activity.activityType}
                      >
                        {activityOptions.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[9px] text-[#87938b]">
                      Duration (minutes)
                      <input
                        className="min-h-9 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                        min="1"
                        onChange={(event) =>
                          setActivityEdits((current) =>
                            current.map((item) =>
                              item.id === activity.id
                                ? { ...item, durationMinutes: event.currentTarget.value }
                                : item,
                            ),
                          )
                        }
                        type="number"
                        value={activity.durationMinutes}
                      />
                    </label>
                    {activity.activityType !== "Strength" && (
                    <label className="grid gap-1 text-[9px] text-[#87938b]">
                      Distance ({activityDistanceUnit(activity.activityType, profile)}, optional)
                      <input
                        className="min-h-9 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                        min="0"
                        onChange={(event) =>
                          setActivityEdits((current) =>
                            current.map((item) =>
                              item.id === activity.id
                                ? { ...item, distance: event.currentTarget.value }
                                : item,
                            ),
                          )
                        }
                        step="any"
                        type="number"
                        value={activity.distance}
                      />
                    </label>
                    )}
                    <label className="grid gap-1 text-[9px] text-[#87938b]">
                      Intensity
                      <select
                        className="min-h-9 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                        onChange={(event) => {
                          const intensity = intensityOptions.find((item) => item === event.currentTarget.value);
                          if (!intensity) return;
                          setActivityEdits((current) =>
                            current.map((item) => item.id === activity.id ? { ...item, intensity } : item),
                          );
                        }}
                        value={activity.intensity}
                      >
                        {intensityOptions.map((intensity) => <option key={intensity}>{intensity}</option>)}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-md bg-[#b8f36b] px-3 py-2 text-[10px] font-semibold text-[#102010]" onClick={saveWorkoutModification} type="button">
                  Save Workout Changes
                </button>
                <button className="rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]" onClick={() => setShowModificationForm(false)} type="button">
                  Cancel
                </button>
              </div>
            </section>
          )}

          {showLongWorkoutWarning && (
            <section
              className="mt-4 rounded-lg border border-[#f0b47c]/20 bg-[#f0b47c]/[0.05] p-4"
              aria-labelledby="long-workout-move-warning"
            >
              <h3 className="text-xs font-semibold text-[#f0c49d]" id="long-workout-move-warning">
                Confirm long-workout move
              </h3>
              <p className="mt-2 text-[10px] leading-relaxed text-[#f0c49d]">
                This workout is currently your week&apos;s long workout and is scheduled on your preferred long-workout day. Are you sure you want to move it?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-[#f0b47c] px-3 py-2 text-[10px] font-semibold text-[#1b140e]"
                  onClick={() => {
                    setShowLongWorkoutWarning(false);
                    setShowMoveForm(true);
                  }}
                  type="button"
                >
                  Continue
                </button>
                <button
                  className="rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]"
                  onClick={() => setShowLongWorkoutWarning(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {showMoveForm && (
            <section className="mt-4 rounded-lg border border-[#8dd7e5]/10 bg-[#111714] p-4" aria-labelledby="move-workout-heading">
              <h3 className="text-xs font-semibold text-[#dce4dd]" id="move-workout-heading">Move Workout</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="today-workout-move-day">Move workout to day</label>
                <select
                  className="min-h-9 rounded-md border border-white/[0.08] bg-[#0b100e] px-2 text-xs text-[#dce4dd]"
                  id="today-workout-move-day"
                  onChange={(event) =>
                    setTargetMoveDay(weekDays.find((day) => day === event.currentTarget.value) ?? "")
                  }
                  value={targetMoveDay}
                >
                  <option value="">Select an available day</option>
                  {profile.availableTrainingDays
                    .filter((day) => day !== detailedWorkout.day)
                    .map((day) => <option key={day}>{day}</option>)}
                </select>
                <button
                  className="rounded-md bg-[#8dd7e5]/10 px-3 py-2 text-[10px] font-medium text-[#b9e5eb] disabled:opacity-50"
                  disabled={!targetMoveDay}
                  onClick={moveTodaysWorkout}
                  type="button"
                >
                  Move Workout
                </button>
                <button className="rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]" onClick={() => setShowMoveForm(false)} type="button">
                  Cancel
                </button>
              </div>
            </section>
          )}

          {showCompletionForm && (
            <section className="mt-4 rounded-lg border border-[#b8f36b]/15 bg-[#111714] p-4" aria-labelledby="completed-changes-heading">
              <h3 className="text-xs font-semibold text-[#eef2ed]" id="completed-changes-heading">
                Completed With Changes
              </h3>
              <p className="mt-1 text-[10px] leading-relaxed text-[#87938b]">
                Enter what you actually did. The completed session will be linked to this planned workout.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[9px] text-[#87938b]">
                  Actual total duration (minutes)
                  <input className="min-h-9 rounded-md border border-white/[0.08] bg-[#0b100e] px-2 text-xs text-[#dce4dd]" min="1" onChange={(event) => setActualDuration(event.currentTarget.value)} type="number" value={actualDuration} />
                </label>
                <label className="grid gap-1 text-[9px] text-[#87938b] sm:col-span-2">
                  Notes
                  <textarea className="min-h-16 rounded-md border border-white/[0.08] bg-[#0b100e] px-2 py-2 text-xs text-[#dce4dd]" onChange={(event) => setActualNotes(event.currentTarget.value)} value={actualNotes} />
                </label>
                <fieldset className="grid gap-2 sm:col-span-2">
                  <legend className="text-[10px] font-semibold text-[#dce4dd]">Activities completed and actual distance</legend>
                  {detailedWorkout.activities.map((activity) => (
                    <div className="flex flex-wrap items-center gap-3 rounded-md bg-[#0b100e] p-2" key={activity.id}>
                      <label className="flex items-center gap-2 text-[10px] text-[#dce4dd]">
                        <input
                          checked={completedActivityIds.includes(activity.id)}
                          onChange={(event) =>
                            setCompletedActivityIds((current) =>
                              event.currentTarget.checked
                                ? [...current, activity.id]
                                : current.filter((id) => id !== activity.id),
                            )
                          }
                          type="checkbox"
                        />
                        {activity.activityType}
                      </label>
                      {completedActivityIds.includes(activity.id) && activity.activityType !== "Strength" && (
                        <label className="ml-auto flex items-center gap-2 text-[9px] text-[#87938b]">
                          Distance ({activityDistanceUnit(activity.activityType, profile)})
                          <input
                            className="min-h-8 w-24 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                            min="0"
                            onChange={(event) =>
                              setActualDistances((current) => ({
                                ...current,
                                [activity.id]: event.currentTarget.value,
                              }))
                            }
                            step="any"
                            type="number"
                            value={actualDistances[activity.id] ?? ""}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </fieldset>
                <details className="rounded-md border border-white/[0.06] bg-[#0b100e] p-3 sm:col-span-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-[#dce4dd]">Optional statistics</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ["averageHeartRate", "Average heart rate (bpm)"],
                      ["maximumHeartRate", "Maximum heart rate (bpm)"],
                      ["averagePace", "Average pace (e.g. 6:00 /km)"],
                      ["averagePower", "Average power (watts)"],
                      ["calories", "Calories"],
                    ] as const).map(([field, label]) => (
                      <label className="grid gap-1 text-[9px] text-[#87938b]" key={field}>
                        {label}
                        <input
                          className="min-h-9 rounded-md border border-white/[0.08] bg-[#111714] px-2 text-xs text-[#dce4dd]"
                          min={field === "averagePace" ? undefined : "0"}
                          onChange={(event) =>
                            setSessionStatistics((current) => ({
                              ...current,
                              [field]: event.currentTarget.value,
                            }))
                          }
                          step={field === "averagePace" ? undefined : "any"}
                          type={field === "averagePace" ? "text" : "number"}
                          value={sessionStatistics[field]}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] text-[#78857d]">
                    Statistics are optional; blank fields stay blank. Session-level statistics are saved with the first completed activity.
                  </p>
                </details>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-[#b8f36b] px-3 py-2 text-[10px] font-semibold text-[#102010] disabled:opacity-50"
                  disabled={completingPlanId === detailedWorkout.id}
                  onClick={markWorkoutCompleteWithChanges}
                  type="button"
                >
                  {completingPlanId === detailedWorkout.id ? "Saving..." : "Save Completed Session"}
                </button>
                <button className="rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]" onClick={() => setShowCompletionForm(false)} type="button">
                  Cancel
                </button>
              </div>
            </section>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-4">
            {detailedWorkout.status !== "Completed" && (
              <>
                <button className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9] hover:text-white" onClick={beginWorkoutModification} type="button">
                  Modify Today&apos;s Workout
                </button>
                <button
                  className="rounded-lg border border-[#8dd7e5]/20 px-3 py-2 text-[10px] text-[#b9e5eb]"
                  onClick={requestWorkoutMove}
                  type="button"
                >
                  Move Workout
                </button>
                <button
                  className="rounded-lg border border-[#b8f36b]/20 px-3 py-2 text-[10px] text-[#c5ef97]"
                  onClick={() => {
                    setShowCompletionForm((shown) => !shown);
                    setShowMoveForm(false);
                    setShowModificationForm(false);
                    setShowLongWorkoutWarning(false);
                  }}
                  type="button"
                >
                  Completed With Changes
                </button>
                <button className="rounded-lg bg-[#b8f36b] px-3 py-2 text-[10px] font-semibold text-[#102010]" onClick={() => markWorkoutComplete(detailedWorkout)} type="button">
                  Mark Complete
                </button>
                <button className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]" onClick={skipTodaysWorkout} type="button">
                  Skip Workout
                </button>
              </>
            )}
            <button className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-[#a6b1a9]" onClick={() => setWorkoutDetailsOpen(false)} type="button">
              Close
            </button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
