"use client";

import { useSyncExternalStore } from "react";

export const ATHLETE_PROFILE_STORAGE_KEY = "mysynonym-athlete-profile";
const PROFILE_UPDATED_EVENT = "mysynonym-athlete-profile-updated";

export const profileGoals = [
  "Ironman",
  "Half Ironman",
  "Marathon",
  "Half Marathon",
  "HYROX",
  "Triathlon",
  "Cycling Event",
  "General Fitness",
  "Strength",
  "Weight Loss",
  "Custom",
] as const;
export const profileActivities = ["Running", "Cycling", "Swimming", "Strength training", "Other"] as const;
export const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function normalizeAvailableTrainingDays(days: readonly string[]): Array<(typeof weekDays)[number]> {
  return weekDays.filter((day) => days.includes(day));
}

export type PreferredUnits = "Metric" | "Imperial";
export type AthleteSex = "Male" | "Female" | "Prefer not to say" | "";
export type AthleteProfile = {
  preferredName: string;
  sex: AthleteSex;
  dateOfBirth: string;
  heightCm: number | null;
  weightKg: number | null;
  units: PreferredUnits;
  primaryGoal: (typeof profileGoals)[number] | "";
  customGoalName: string;
  targetEventName: string;
  targetEventDate: string;
  goalDescription: string;
  trainingExperience: "Beginner" | "Intermediate" | "Advanced" | "Competitive" | "";
  weeklyTrainingHours: number | null;
  availableTrainingDays: string[];
  longWorkoutDay: string;
  equipment: string[];
  otherEquipment: string;
  preferredActivities: string[];
  dislikedActivities: string[];
  preferredRestDay: string;
  maxWeekdayWorkoutMinutes: number | null;
  maxWeekendWorkoutMinutes: number | null;
  currentLimitations: string;
  previousInjuries: string;
  recurringSoreness: string;
  healthConsiderations: string;
};

export const emptyAthleteProfile: AthleteProfile = {
  preferredName: "",
  sex: "",
  dateOfBirth: "",
  heightCm: null,
  weightKg: null,
  units: "Metric",
  primaryGoal: "",
  customGoalName: "",
  targetEventName: "",
  targetEventDate: "",
  goalDescription: "",
  trainingExperience: "",
  weeklyTrainingHours: null,
  availableTrainingDays: [],
  longWorkoutDay: "",
  equipment: [],
  otherEquipment: "",
  preferredActivities: [],
  dislikedActivities: [],
  preferredRestDay: "",
  maxWeekdayWorkoutMinutes: null,
  maxWeekendWorkoutMinutes: null,
  currentLimitations: "",
  previousInjuries: "",
  recurringSoreness: "",
  healthConsiderations: "",
};

export function getMissingAthleteProfileFields(profile: AthleteProfile | null): string[] {
  const requiredFields: Array<[string, boolean]> = [
    ["preferred name", Boolean(profile?.preferredName.trim())],
    ["date of birth", Boolean(profile?.dateOfBirth)],
    ["height", profile?.heightCm !== null && profile !== null],
    ["weight", profile?.weightKg !== null && profile !== null],
    ["unit preference", Boolean(profile?.units)],
    ["primary goal", Boolean(profile?.primaryGoal)],
    ["training experience", Boolean(profile?.trainingExperience)],
    ["weekly training hours", profile?.weeklyTrainingHours !== null && profile !== null],
    ["available training days", Boolean(profile?.availableTrainingDays.length)],
  ];
  return requiredFields.filter(([, isComplete]) => !isComplete).map(([label]) => label);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAthleteProfile(value: unknown): AthleteProfile | null {
  if (!isRecord(value)) {
    return null;
  }
  const text = (key: keyof AthleteProfile) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  const numberOrNull = (key: keyof AthleteProfile) => {
    const fieldValue = value[key];
    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) return fieldValue;
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      const parsed = Number(fieldValue);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };
  const stringArray = (key: keyof AthleteProfile) =>
    Array.isArray(value[key])
      ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string")
      : [];

  const availableTrainingDays = normalizeAvailableTrainingDays(stringArray("availableTrainingDays"));
  const savedLongWorkoutDay = text("longWorkoutDay");
  return {
    ...emptyAthleteProfile,
    preferredName: text("preferredName"),
    sex:
      value.sex === "Male" || value.sex === "Female" || value.sex === "Prefer not to say"
        ? value.sex
        : "",
    dateOfBirth: text("dateOfBirth"),
    heightCm: numberOrNull("heightCm"),
    weightKg: numberOrNull("weightKg"),
    units: value.units === "Imperial" ? "Imperial" : "Metric",
    primaryGoal:
      typeof value.primaryGoal === "string" &&
      profileGoals.some((goal) => goal === value.primaryGoal)
        ? (value.primaryGoal as AthleteProfile["primaryGoal"])
        : "",
    customGoalName: text("customGoalName"),
    targetEventName: text("targetEventName"),
    targetEventDate: text("targetEventDate"),
    goalDescription: text("goalDescription"),
    trainingExperience:
      ["Beginner", "Intermediate", "Advanced", "Competitive"].includes(
        String(value.trainingExperience),
      )
        ? (value.trainingExperience as AthleteProfile["trainingExperience"])
        : "",
    weeklyTrainingHours: numberOrNull("weeklyTrainingHours"),
    availableTrainingDays,
    longWorkoutDay:
      weekDays.includes(savedLongWorkoutDay as (typeof weekDays)[number]) &&
      availableTrainingDays.includes(savedLongWorkoutDay as (typeof weekDays)[number])
        ? savedLongWorkoutDay
        : "",
    equipment: stringArray("equipment"),
    otherEquipment: text("otherEquipment"),
    preferredActivities: stringArray("preferredActivities"),
    dislikedActivities: stringArray("dislikedActivities"),
    preferredRestDay: text("preferredRestDay"),
    maxWeekdayWorkoutMinutes: numberOrNull("maxWeekdayWorkoutMinutes"),
    maxWeekendWorkoutMinutes: numberOrNull("maxWeekendWorkoutMinutes"),
    currentLimitations: text("currentLimitations"),
    previousInjuries: text("previousInjuries"),
    recurringSoreness: text("recurringSoreness"),
    healthConsiderations: text("healthConsiderations"),
  };
}

export function isAthleteProfileComplete(profile: AthleteProfile | null): boolean {
  return getMissingAthleteProfileFields(profile).length === 0;
}

export function calculateAge(dateOfBirth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > today
  ) {
    return null;
  }
  let age = today.getFullYear() - year;
  if (
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

export function formatTargetEvent(profile: AthleteProfile): string {
  const name = profile.targetEventName.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(profile.targetEventDate)
    ? new Date(`${profile.targetEventDate}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  if (name && date) return `${name} · ${date}`;
  return name || date || "Target event not set";
}

export function saveAthleteProfile(profile: AthleteProfile): void {
  if (
    profile.longWorkoutDay &&
    !normalizeAvailableTrainingDays(profile.availableTrainingDays).includes(
      profile.longWorkoutDay as (typeof weekDays)[number],
    )
  ) {
    throw new Error("Preferred long-workout day must be one of the available training days.");
  }
  const normalizedProfile = normalizeAthleteProfile(profile);
  if (!normalizedProfile) throw new Error("Athlete profile has an invalid format.");
  window.localStorage.setItem(ATHLETE_PROFILE_STORAGE_KEY, JSON.stringify(normalizedProfile));
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

type AthleteProfileSnapshot = {
  profile: AthleteProfile | null;
  isProfileLoaded: boolean;
  profileError: string;
};

const serverSnapshot: AthleteProfileSnapshot = {
  profile: null,
  isProfileLoaded: false,
  profileError: "",
};

let profileSnapshot = serverSnapshot;
const profileSubscribers = new Set<() => void>();
let profileListenersAttached = false;

function notifyProfileSubscribers(): void {
  profileSubscribers.forEach((subscriber) => subscriber());
}

function loadProfileSnapshot(): void {
  let nextSnapshot: AthleteProfileSnapshot;
  try {
    const stored = window.localStorage.getItem(ATHLETE_PROFILE_STORAGE_KEY);
    const profile = stored === null ? null : normalizeAthleteProfile(JSON.parse(stored));
    if (stored !== null && profile === null) {
      throw new Error("Saved athlete profile has an invalid format.");
    }
    nextSnapshot = { profile, isProfileLoaded: true, profileError: "" };
  } catch {
    nextSnapshot = {
      profile: null,
      isProfileLoaded: true,
      profileError: "The saved athlete profile could not be loaded from this browser.",
    };
  }

  if (
    profileSnapshot.isProfileLoaded === nextSnapshot.isProfileLoaded &&
    profileSnapshot.profileError === nextSnapshot.profileError &&
    JSON.stringify(profileSnapshot.profile) === JSON.stringify(nextSnapshot.profile)
  ) {
    return;
  }
  profileSnapshot = nextSnapshot;
  notifyProfileSubscribers();
}

function handleProfileStorage(event: StorageEvent): void {
  if (event.key === null || event.key === ATHLETE_PROFILE_STORAGE_KEY) {
    loadProfileSnapshot();
  }
}

function subscribeToAthleteProfile(subscriber: () => void): () => void {
  profileSubscribers.add(subscriber);
  if (!profileListenersAttached) {
    window.addEventListener(PROFILE_UPDATED_EVENT, loadProfileSnapshot);
    window.addEventListener("storage", handleProfileStorage);
    profileListenersAttached = true;
  }
  loadProfileSnapshot();
  return () => {
    profileSubscribers.delete(subscriber);
    if (profileSubscribers.size === 0 && profileListenersAttached) {
      window.removeEventListener(PROFILE_UPDATED_EVENT, loadProfileSnapshot);
      window.removeEventListener("storage", handleProfileStorage);
      profileListenersAttached = false;
    }
  };
}

export function useAthleteProfile() {
  return useSyncExternalStore(
    subscribeToAthleteProfile,
    () => profileSnapshot,
    () => serverSnapshot,
  );
}
