"use client";

import {
  Activity,
  Bike,
  CalendarDays,
  Clock3,
  Dumbbell,
  Footprints,
  ImagePlus,
  MapPin,
  Plus,
  Search,
  X,
  Waves,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  useAthleteProfile,
  type PreferredUnits,
} from "../lib/athlete-profile";
import {
  notifyWorkoutHistoryUpdated,
  WORKOUT_STORAGE_KEY,
} from "../lib/workout-storage";
import { WeeklyTrainingPlan } from "./weekly-training-plan";

const STORAGE_KEY = WORKOUT_STORAGE_KEY;
const LEGACY_DATABASE_NAME = "mysynonym-training";
const LEGACY_SCREENSHOTS_STORE = "workout-screenshots";
const activities = ["Run", "Ride", "Swim", "Strength", "Other"] as const;
const sources = [
  "Manual Entry",
  "Screenshot Import",
  "Garmin",
  "Strava",
  "COROS",
  "Whoop",
  "Apple Health",
  "Other",
] as const;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

type ActivityType = (typeof activities)[number];
type WorkoutSource = (typeof sources)[number];
type Workout = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionNotes: string;
  activityType: ActivityType;
  workoutTitle?: string;
  workoutDate: string;
  startTime?: string;
  duration: number;
  distance?: number;
  distanceUnit?: "km" | "m";
  notes?: string;
  averageHeartRate?: number;
  maximumHeartRate?: number;
  averagePace?: string;
  averageSpeed?: number;
  calories?: number;
  elevationGain?: number;
  trainingLoad?: number;
  averagePower?: number;
  maximumPower?: number;
  cadence?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  recoveryTime?: number;
  source: WorkoutSource;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
};

type WorkoutFormValues = Partial<Workout>;
type SortMode = "newest" | "oldest" | "duration" | "distance";
type TrainingSession = {
  id: string;
  date: string;
  title: string;
  notes: string;
  activities: Workout[];
};

const optionalNumberFields = [
  ["averageHeartRate", "Average heart rate", "bpm"],
  ["maximumHeartRate", "Maximum heart rate", "bpm"],
  ["averageSpeed", "Average speed", "km/h"],
  ["calories", "Calories", "kcal"],
  ["elevationGain", "Elevation gain", "m"],
  ["trainingLoad", "Training load", ""],
  ["averagePower", "Average power", "W"],
  ["maximumPower", "Maximum power", "W"],
  ["cadence", "Cadence", "spm"],
  ["aerobicTrainingEffect", "Aerobic training effect", ""],
  ["anaerobicTrainingEffect", "Anaerobic training effect", ""],
  ["recoveryTime", "Recovery time", "hours"],
] as const satisfies ReadonlyArray<readonly [keyof Workout, string, string]>;

const statistics = [
  ["averageHeartRate", "Average heart rate", " bpm"],
  ["maximumHeartRate", "Maximum heart rate", " bpm"],
  ["averagePace", "Average pace", ""],
  ["averageSpeed", "Average speed", " km/h"],
  ["calories", "Calories", " kcal"],
  ["elevationGain", "Elevation gain", " m"],
  ["trainingLoad", "Training load", ""],
  ["averagePower", "Average power", " W"],
  ["maximumPower", "Maximum power", " W"],
  ["cadence", "Cadence", " spm"],
  ["aerobicTrainingEffect", "Aerobic training effect", ""],
  ["anaerobicTrainingEffect", "Anaerobic training effect", ""],
  ["recoveryTime", "Recovery time", " hours"],
] as const satisfies ReadonlyArray<readonly [keyof Workout, string, string]>;

const inputClass =
  "min-h-10 rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 text-sm text-[#e5ebe6] outline-none placeholder:text-[#56625b] focus:border-[#b8f36b]/50";
const labelClass = "grid gap-2 text-xs font-medium text-[#a6b1a9]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  return localDateString(new Date(year, month - 1, day)) === value;
}

function normalizeWorkout(value: unknown): Workout | null {
  if (!isRecord(value)) {
    return null;
  }

  const activityType = activities.find((activity) => activity === value.activityType);
  const dateFromSavedAt =
    typeof value.savedAt === "string" && !Number.isNaN(Date.parse(value.savedAt))
      ? localDateString(new Date(value.savedAt))
      : undefined;
  const workoutDate =
    typeof value.workoutDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.workoutDate)
      ? value.workoutDate
      : dateFromSavedAt;
  const duration =
    typeof value.duration === "number" && Number.isFinite(value.duration)
      ? value.duration
      : null;
  const source: WorkoutSource =
    value.source === "Screenshot Upload"
      ? "Screenshot Import"
      : sources.find((item) => item === value.source) ?? "Manual Entry";

  if (
    typeof value.id !== "string" ||
    !activityType ||
    !workoutDate ||
    duration === null ||
    typeof value.savedAt !== "string"
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : value.savedAt;
  const updatedAt =
    typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt))
      ? value.updatedAt
      : createdAt;
  const workout: Workout = {
    id: value.id,
    sessionId:
      typeof value.sessionId === "string" && value.sessionId
        ? value.sessionId
        : value.id,
    sessionTitle:
      typeof value.sessionTitle === "string"
        ? value.sessionTitle
        : typeof value.workoutTitle === "string"
          ? value.workoutTitle
          : "",
    sessionNotes:
      typeof value.sessionNotes === "string"
        ? value.sessionNotes
        : typeof value.notes === "string"
          ? value.notes
          : "",
    activityType,
    workoutDate,
    duration,
    source,
    savedAt: value.savedAt,
    createdAt,
    updatedAt,
  };

  if (typeof value.workoutTitle === "string" && value.workoutTitle) {
    workout.workoutTitle = value.workoutTitle;
  }
  if (typeof value.startTime === "string" && value.startTime) {
    workout.startTime = value.startTime;
  }
  if (typeof value.distance === "number" && Number.isFinite(value.distance)) {
    workout.distance = value.distance;
    workout.distanceUnit = value.distanceUnit === "m" ? "m" : "km";
  }
  if (typeof value.notes === "string" && value.notes) {
    workout.notes = value.notes;
  }
  if (typeof value.averagePace === "string" && value.averagePace) {
    workout.averagePace = value.averagePace;
  }
  for (const [field] of optionalNumberFields) {
    const fieldValue = value[field];
    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
      workout[field] = fieldValue;
    }
  }

  return workout;
}

function formNumber(formData: FormData, name: string): number | undefined {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formText(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

function parsePace(pace: string): { seconds: number; suffix: string } | null {
  const match = /^(\d+):([0-5]\d)(?:\s*\/\s*(km|mile|100m|100yd))?$/i.exec(pace.trim());
  if (!match) return null;
  return {
    seconds: Number(match[1]) * 60 + Number(match[2]),
    suffix: match[3]?.toLowerCase() ?? "",
  };
}

function formatPace(seconds: number, suffix: string): string {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")} /${suffix}`;
}

function paceToMetric(pace: string, activityType: ActivityType, units: PreferredUnits): string {
  const parsed = parsePace(pace);
  if (!parsed || units === "Metric") return pace;
  return activityType === "Swim"
    ? formatPace(parsed.seconds / 0.9144, "100m")
    : formatPace(parsed.seconds / 1.609344, "km");
}

function numberToMetric(
  value: number | undefined,
  field: (typeof optionalNumberFields)[number][0],
  units: PreferredUnits,
): number | undefined {
  if (value === undefined || units === "Metric") return value;
  if (field === "averageSpeed") return value / 0.6213711922;
  if (field === "elevationGain") return value / 3.280839895;
  return value;
}

function numberForDisplay(
  value: number | undefined,
  field: (typeof optionalNumberFields)[number][0],
  units: PreferredUnits,
): number | undefined {
  if (value === undefined || units === "Metric") return value;
  if (field === "averageSpeed") return value * 0.6213711922;
  if (field === "elevationGain") return value * 3.280839895;
  return value;
}

function paceForDisplay(pace: string, activityType: ActivityType, units: PreferredUnits): string {
  const parsed = parsePace(pace);
  if (!parsed) return pace;
  if (units === "Metric") {
    const suffix = activityType === "Swim" ? "100m" : "km";
    const seconds =
      activityType === "Swim" && parsed.suffix === "100yd"
        ? parsed.seconds / 0.9144
        : parsed.suffix === "mile"
          ? parsed.seconds / 1.609344
          : parsed.seconds;
    return formatPace(seconds, suffix);
  }
  const seconds =
    activityType === "Swim"
      ? parsed.suffix === "100yd"
        ? parsed.seconds
        : parsed.seconds * 0.9144
      : parsed.suffix === "mile"
        ? parsed.seconds
        : parsed.seconds * 1.609344;
  return formatPace(seconds, activityType === "Swim" ? "100yd" : "mile");
}

function distanceForDisplay(workout: Workout, units: PreferredUnits): string | undefined {
  if (workout.distance === undefined) return undefined;
  if (workout.distanceUnit === "m") {
    const value = units === "Imperial" ? workout.distance * 1.0936132983 : workout.distance;
    return `${Number(value.toFixed(1))} ${units === "Imperial" ? "yd" : "m"}`;
  }
  const value = units === "Imperial" ? workout.distance * 0.6213711922 : workout.distance;
  return `${Number(value.toFixed(2))} ${units === "Imperial" ? "mi" : "km"}`;
}

function displayOptionalValue(
  workout: Workout,
  field: (typeof statistics)[number][0],
  units: PreferredUnits,
): string | undefined {
  const value = workout[field];
  if (value === undefined || value === "") return undefined;
  if (field === "averagePace" && typeof value === "string") {
    return paceForDisplay(value, workout.activityType, units);
  }
  if (typeof value !== "number") return String(value);
  if (field === "averageSpeed") {
    const speed = units === "Imperial" ? value * 0.6213711922 : value;
    return `${Number(speed.toFixed(1))} ${units === "Imperial" ? "mph" : "km/h"}`;
  }
  if (field === "elevationGain") {
    const elevation = units === "Imperial" ? value * 3.280839895 : value;
    return `${Number(elevation.toFixed(0))} ${units === "Imperial" ? "ft" : "m"}`;
  }
  const statistic = statistics.find(([statisticField]) => statisticField === field);
  return `${value}${statistic?.[2] ?? ""}`;
}

function readWorkoutForm(
  formData: FormData,
  previous?: Workout,
  units: PreferredUnits = "Metric",
): Workout {
  const sourceValue = String(formData.get("source"));
  const activityType = String(formData.get("activityType")) as ActivityType;
  const enteredDistance = formNumber(formData, "distance");
  const enteredSpeed = formNumber(formData, "averageSpeed");
  const enteredElevation = formNumber(formData, "elevationGain");
  const enteredPace = formText(formData, "averagePace");
  const id = previous?.id ?? window.crypto.randomUUID();
  return {
    id,
    sessionId: previous?.sessionId ?? id,
    sessionTitle: formText(formData, "workoutTitle") ?? "",
    sessionNotes: formText(formData, "notes") ?? "",
    activityType,
    workoutTitle: formText(formData, "workoutTitle"),
    workoutDate: String(formData.get("workoutDate")),
    startTime: formText(formData, "startTime"),
    duration: Number(formData.get("duration")),
    distance:
      enteredDistance === undefined
        ? undefined
        : activityType === "Swim"
          ? units === "Imperial"
            ? enteredDistance * 0.9144
            : enteredDistance
          : units === "Imperial"
            ? enteredDistance / 0.6213711922
            : enteredDistance,
    distanceUnit: activityType === "Swim" ? "m" : "km",
    notes: formText(formData, "notes"),
    averageHeartRate: formNumber(formData, "averageHeartRate"),
    maximumHeartRate: formNumber(formData, "maximumHeartRate"),
    averagePace: enteredPace ? paceToMetric(enteredPace, activityType, units) : undefined,
    averageSpeed:
      enteredSpeed === undefined
        ? undefined
        : units === "Imperial"
          ? enteredSpeed / 0.6213711922
          : enteredSpeed,
    calories: formNumber(formData, "calories"),
    elevationGain:
      enteredElevation === undefined
        ? undefined
        : units === "Imperial"
          ? enteredElevation / 3.280839895
          : enteredElevation,
    trainingLoad: formNumber(formData, "trainingLoad"),
    averagePower: formNumber(formData, "averagePower"),
    maximumPower: formNumber(formData, "maximumPower"),
    cadence: formNumber(formData, "cadence"),
    aerobicTrainingEffect: formNumber(formData, "aerobicTrainingEffect"),
    anaerobicTrainingEffect: formNumber(formData, "anaerobicTrainingEffect"),
    recoveryTime: formNumber(formData, "recoveryTime"),
    source: sources.find((item) => item === sourceValue) ?? "Manual Entry",
    savedAt: previous?.savedAt ?? new Date().toISOString(),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function clearLegacyScreenshots(): Promise<void> {
  if (!window.indexedDB) {
    return;
  }
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(LEGACY_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LEGACY_SCREENSHOTS_STORE)) {
        request.result.createObjectStore(LEGACY_SCREENSHOTS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not access legacy screenshot storage."));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LEGACY_SCREENSHOTS_STORE, "readwrite");
      transaction.objectStore(LEGACY_SCREENSHOTS_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not clear legacy screenshot storage."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Legacy screenshot cleanup was aborted."));
    });
  } finally {
    database.close();
  }
}

function WorkoutFields({
  workout,
  units = "Metric",
  activityOnly = false,
  includeScreenshotImport = false,
  onImageChange,
  onAnalyze,
  onRemoveImage,
  imagePreview,
  imageName,
  analysisState,
  analyzing,
  today,
  onValidityChange,
  initialSource,
  analysisSuccess = false,
}: {
  workout?: WorkoutFormValues;
  units?: PreferredUnits;
  activityOnly?: boolean;
  includeScreenshotImport?: boolean;
  onImageChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze?: () => void;
  onRemoveImage?: () => void;
  imagePreview?: string;
  imageName?: string;
  analysisState?: "idle" | "unavailable" | "success" | "error";
  analyzing?: boolean;
  today: string;
  onValidityChange: (isValid: boolean) => void;
  initialSource?: WorkoutSource;
  analysisSuccess?: boolean;
}) {
  const [activityType, setActivityType] = useState<ActivityType>(
    workout?.activityType ?? "Run",
  );
  const [workoutDate, setWorkoutDate] = useState(workout?.workoutDate ?? today);
  const [duration, setDuration] = useState(
    workout?.duration === undefined ? "" : String(workout.duration),
  );
  const [enteredValues, setEnteredValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "distance",
        ...optionalNumberFields.map(([field]) => field),
      ].map((field) => [field, String(workout?.[field as keyof Workout] ?? "")]),
    ),
  );
  const [source, setSource] = useState<WorkoutSource>(
    initialSource ?? workout?.source ?? "Manual Entry",
  );
  const [touched, setTouched] = useState({
    activityType: false,
    workoutDate: false,
    duration: false,
  });
  const hasSavedStatistics =
    workout !== undefined &&
    statistics.some(([field]) => workout[field] !== undefined && workout[field] !== "");
  const [statisticsExpanded, setStatisticsExpanded] = useState(
    hasSavedStatistics || analysisSuccess,
  );
  const showStatistics = (field: keyof Workout): boolean => {
    const hasExistingValue = workout?.[field] !== undefined && workout[field] !== "";
    if (activityType === "Strength") {
      return (
        hasExistingValue ||
        field === "averageHeartRate" ||
        field === "maximumHeartRate" ||
        field === "calories" ||
        field === "trainingLoad" ||
        field === "cadence" ||
        field === "aerobicTrainingEffect" ||
        field === "anaerobicTrainingEffect" ||
        field === "recoveryTime"
      );
    }
    if (activityType === "Run") {
      return field !== "averageSpeed" || hasExistingValue;
    }
    if (activityType === "Ride") {
      return field !== "averagePace" || hasExistingValue;
    }
    if (activityType === "Swim") {
      return (
        field !== "averageSpeed" &&
        field !== "averagePower" &&
        field !== "maximumPower" &&
        field !== "elevationGain"
      ) || hasExistingValue;
    }
    return true;
  };
  const isDateValid = isValidDate(workoutDate);
  const isDurationValid =
    duration !== "" && Number.isInteger(Number(duration)) && Number(duration) >= 1;
  const hasUnusualValue = (field: string): boolean => {
    const rawValue = field === "duration" ? duration : enteredValues[field];
    if (rawValue === undefined || rawValue.trim() === "") {
      return false;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return false;
    }
    if (field === "duration") {
      return value > 1440 || value <= 0;
    }
    if (field === "distance") {
      const maximumDistance =
        activityType === "Run" ? 100 : activityType === "Ride" ? 500 : activityType === "Swim" ? 20000 : undefined;
      return (
        ["Run", "Ride", "Swim"].includes(activityType) &&
        (value < 0 || (maximumDistance !== undefined && value > maximumDistance))
      );
    }
    if (field === "averageHeartRate") {
      const maximumHeartRate = Number(enteredValues.maximumHeartRate);
      return value > 220 || (Number.isFinite(maximumHeartRate) && enteredValues.maximumHeartRate !== "" && value > maximumHeartRate);
    }
    if (field === "maximumHeartRate") {
      return value > 240;
    }
    return (
      ["calories", "elevationGain", "trainingLoad", "averagePower", "maximumPower", "cadence"].includes(field) &&
      value < 0
    );
  };
  const unusualValueWarning = (field: string) =>
    hasUnusualValue(field) ? (
      <span className="text-[10px] text-[#f0b47c]" role="note">
        This value looks unusual. Check that it was entered correctly.
      </span>
    ) : null;

  return (
    <>
      {includeScreenshotImport && (
        <section
          aria-labelledby="import-workout-heading"
          className="mb-5 border-b border-white/[0.07] pb-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-[#dce4dd]" id="import-workout-heading">
                Import Workout Data
              </h3>
              <p className="mt-1.5 text-[11px] text-[#87938b]">
                Upload a fitness-app screenshot to extract its workout data. Your image will not be saved.
              </p>
              <p className="mt-1 text-[10px] text-[#69766e]">
                Garmin, Strava, COROS, Whoop, Apple Health, or another platform · JPG, JPEG, PNG, WEBP
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b100e] px-3.5 py-2.5 text-xs font-medium text-[#dce4dd] transition-colors hover:border-[#b8f36b]/30 hover:text-[#c5ef97]">
              <ImagePlus size={15} />
              {imagePreview ? "Choose another image" : "Upload image"}
              <input
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={analyzing}
                onChange={onImageChange}
                type="file"
              />
            </label>
          </div>

          {imagePreview && (
            <div className="mt-4 flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`Temporary preview of ${imageName ?? "workout screenshot"}`}
                className="max-h-56 max-w-full rounded-lg border border-white/[0.08] object-contain"
                src={imagePreview}
              />
              <div className="min-w-0 flex-1">
                {imageName && (
                  <p className="break-all text-xs font-medium text-[#dce4dd]">{imageName}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-[#b8f36b] px-3.5 py-2 text-xs font-semibold text-[#102010] transition-colors hover:bg-[#c8f78b] disabled:opacity-60"
                    disabled={analyzing}
                    onClick={onAnalyze}
                    type="button"
                  >
                    {analyzing ? "Checking..." : "Analyze Screenshot"}
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3.5 py-2 text-xs text-[#a6b1a9] transition-colors hover:border-white/20 hover:text-white"
                    disabled={analyzing}
                    onClick={onRemoveImage}
                    type="button"
                  >
                    <X size={13} />
                    Remove Image
                  </button>
                </div>
              </div>
            </div>
          )}

          {analyzing && (
            <p className="mt-3 text-xs text-[#8dd7e5]" role="status" aria-live="polite">
              Checking screenshot analysis availability...
            </p>
          )}
          {analysisState === "unavailable" && (
            <p className="mt-3 rounded-lg border border-[#f0b47c]/15 bg-[#f0b47c]/[0.05] p-3 text-xs text-[#f0c49d]" role="status">
              Screenshot analysis is not connected yet. Enter the workout details manually.
            </p>
          )}
          {analysisState === "success" && (
            <p className="mt-3 rounded-lg border border-[#b8f36b]/15 bg-[#b8f36b]/[0.05] p-3 text-xs text-[#c5ef97]" role="status">
              Workout data extracted. Review the information below before saving.
            </p>
          )}
          {analysisState === "error" && (
            <p className="mt-3 rounded-lg border border-[#f0b47c]/15 bg-[#f0b47c]/[0.05] p-3 text-xs text-[#f0c49d]" role="alert">
              Screenshot could not be analyzed. Enter the workout details manually.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="essential-workout-heading">
        <h3 className="mb-4 text-xs font-semibold text-[#dce4dd]" id="essential-workout-heading">
          {activityOnly ? "Activity Details" : "Session Details and First Activity"}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Activity Type
            <select
              aria-invalid={touched.activityType && !activityType}
              className={inputClass}
              name="activityType"
              onBlur={() => setTouched((current) => ({ ...current, activityType: true }))}
              onChange={(event) => {
                const value = event.currentTarget.value as ActivityType;
                setActivityType(value);
                setTouched((current) => ({ ...current, activityType: true }));
                onValidityChange(Boolean(value) && isDateValid && isDurationValid);
              }}
              required
              value={activityType}
            >
              {activities.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
            {touched.activityType && !activityType && (
              <span className="text-[10px] text-[#f0b47c]" role="alert">
                Choose an activity type.
              </span>
            )}
          </label>
          {activityOnly ? (
            <input name="workoutDate" type="hidden" value={workoutDate} />
          ) : (
            <label className={labelClass}>
              Session Date
              <input
                aria-invalid={touched.workoutDate && !isDateValid}
                className={inputClass}
                name="workoutDate"
                onBlur={() => setTouched((current) => ({ ...current, workoutDate: true }))}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setWorkoutDate(value);
                  setTouched((current) => ({ ...current, workoutDate: true }));
                  onValidityChange(Boolean(activityType) && isValidDate(value) && isDurationValid);
                }}
                required
                type="date"
                value={workoutDate}
              />
              {touched.workoutDate && !isDateValid && (
                <span className="text-[10px] text-[#f0b47c]" role="alert">
                  Enter a valid session date.
                </span>
              )}
            </label>
          )}
          <label className={labelClass}>
            Start Time (optional)
            <input
              className={inputClass}
              defaultValue={workout?.startTime ?? ""}
              name="startTime"
              type="time"
            />
          </label>
          <label className={labelClass}>
            Duration (minutes)
            <input
              aria-invalid={touched.duration && !isDurationValid}
              className={inputClass}
              min="1"
              name="duration"
              onBlur={() => setTouched((current) => ({ ...current, duration: true }))}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDuration(value);
                setTouched((current) => ({ ...current, duration: true }));
                setEnteredValues((current) => ({ ...current, duration: value }));
                onValidityChange(
                  Boolean(activityType) &&
                    isDateValid &&
                    value !== "" &&
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 1,
                );
              }}
              placeholder="e.g. 45"
              required
              step="1"
              type="number"
              value={duration}
            />
            {touched.duration && !isDurationValid && (
              <span className="text-[10px] text-[#f0b47c]" role="alert">
                Enter a duration greater than 0 minutes.
              </span>
            )}
            {unusualValueWarning("duration")}
          </label>
          <label
            className={`${labelClass} ${
              activityType !== "Strength" || workout?.distance !== undefined ? "" : "hidden"
            }`}
          >
            {activityType === "Swim"
              ? `Distance (${units === "Imperial" ? "yards" : "metres"}, optional)`
              : `Distance (${units === "Imperial" ? "miles" : "kilometres"}, optional)`}
            <input
              className={inputClass}
              defaultValue={
                workout?.distance === undefined
                  ? ""
                  : workout.distanceUnit === "m"
                    ? units === "Imperial"
                      ? workout.distance * 1.0936132983
                      : workout.distance
                    : units === "Imperial"
                      ? workout.distance * 0.6213711922
                      : workout.distance
              }
              name="distance"
              onChange={(event) => {
                const entered = event.currentTarget.value;
                const value = Number(entered);
                const canonicalValue =
                  entered === ""
                    ? ""
                    : activityType === "Swim"
                      ? units === "Imperial"
                        ? String(value * 0.9144)
                        : entered
                      : units === "Imperial"
                        ? String(value / 0.6213711922)
                        : entered;
                setEnteredValues((current) => ({
                  ...current,
                  distance: canonicalValue,
                }));
              }}
              placeholder={
                activityType === "Swim"
                  ? units === "Imperial" ? "e.g. 1640" : "e.g. 1500"
                  : units === "Imperial" ? "e.g. 5.3" : "e.g. 8.5"
              }
              step="any"
              type="number"
            />
            {unusualValueWarning("distance")}
          </label>
          {!activityOnly && (
            <label className={labelClass}>
              Session Title (optional)
              <input
                className={inputClass}
                defaultValue={workout?.workoutTitle ?? ""}
                maxLength={120}
                name="workoutTitle"
                placeholder="e.g. Saturday Brick"
                type="text"
              />
            </label>
          )}
          <label className={labelClass}>
            Data Source
            <select
              className={inputClass}
              onChange={(event) =>
                setSource(sources.find((item) => item === event.currentTarget.value) ?? "Manual Entry")
              }
              name="source"
              value={
                analysisSuccess &&
                !["Garmin", "Strava", "COROS", "Whoop", "Apple Health"].includes(source)
                  ? "Screenshot Import"
                  : source
              }
            >
              {sources.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            {activityOnly ? "Activity Notes (optional)" : "Session Notes (optional)"}
            <textarea
              className="min-h-20 resize-y rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 py-2.5 text-sm text-[#e5ebe6] outline-none placeholder:text-[#56625b] focus:border-[#b8f36b]/50"
              defaultValue={activityOnly ? workout?.notes ?? "" : workout?.notes ?? ""}
              maxLength={2000}
              name="notes"
              placeholder={activityOnly ? "Notes about this activity" : "Notes about this training session"}
              rows={3}
            />
          </label>
        </div>
      </section>

      <details
        className="mt-5 border-t border-white/[0.07] pt-4"
        open={statisticsExpanded}
        onToggle={(event) => setStatisticsExpanded(event.currentTarget.open)}
      >
        <summary className="w-fit cursor-pointer text-xs font-semibold text-[#c5ef97] marker:text-[#b8f36b]">
          Add workout statistics
        </summary>
        <p className="mt-2 text-[10px] text-[#78857d]">
          Optional details; add only values you know.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {optionalNumberFields.map(([field, label, unit]) => {
            const visible = showStatistics(field);
            const statisticUnit =
              field === "averageSpeed"
                ? units === "Imperial" ? "mph" : "km/h"
                : field === "elevationGain"
                  ? units === "Imperial" ? "ft" : "m"
                  : field === "averagePower" || field === "maximumPower"
                  ? "W"
                  : unit;
            return (
              <label
                className={`${labelClass} ${visible ? "" : "hidden"}`}
                key={field}
              >
                {statisticUnit ? `${label} (${statisticUnit})` : label}
                <input
                  className={inputClass}
                  defaultValue={numberForDisplay(workout?.[field] as number | undefined, field, units) ?? ""}
                  name={field}
                  onChange={(event) => {
                    const entered = event.currentTarget.value;
                    const parsed = entered === "" ? undefined : Number(entered);
                    const canonicalValue = numberToMetric(parsed, field, units);
                    setEnteredValues((current) => ({
                      ...current,
                      [field]: canonicalValue === undefined ? "" : String(canonicalValue),
                    }));
                  }}
                  step="any"
                  type="number"
                />
                {unusualValueWarning(field)}
              </label>
            );
          })}
          <label
            className={`${labelClass} ${
              activityType === "Strength" && workout?.averagePace === undefined
                ? "hidden"
                : activityType === "Ride" && workout?.averagePace === undefined
                  ? "hidden"
                  : ""
            }`}
          >
            {activityType === "Swim"
              ? `Average pace per 100 ${units === "Imperial" ? "yards" : "metres"}`
              : activityType === "Run"
                ? `Average pace (min/${units === "Imperial" ? "mile" : "km"})`
                : "Average pace"}
            <input
              className={inputClass}
              defaultValue={
                workout?.averagePace
                  ? paceForDisplay(workout.averagePace, activityType, units)
                  : ""
              }
              name="averagePace"
              placeholder={
                activityType === "Swim"
                  ? units === "Imperial" ? "e.g. 1:50 /100yd" : "e.g. 2:00 /100m"
                  : units === "Imperial" ? "e.g. 8:51 /mile" : "e.g. 5:30 /km"
              }
              type="text"
            />
          </label>
        </div>
      </details>
    </>
  );
}

function dateTimeValue(workout: Workout): number {
  return Date.parse(
    `${workout.workoutDate}T${workout.startTime ?? "23:59"}:00`,
  );
}

function groupTrainingSessions(workouts: Workout[]): TrainingSession[] {
  const sessions = new Map<string, TrainingSession>();
  for (const workout of workouts) {
    let session = sessions.get(workout.sessionId);
    if (!session) {
      session = {
        id: workout.sessionId,
        date: workout.workoutDate,
        title: workout.sessionTitle,
        notes: workout.sessionNotes,
        activities: [],
      };
      sessions.set(workout.sessionId, session);
    }
    session.activities.push(workout);
    if (workout.workoutDate < session.date) session.date = workout.workoutDate;
    if (!session.title && workout.sessionTitle) session.title = workout.sessionTitle;
    if (!session.notes && workout.sessionNotes) session.notes = workout.sessionNotes;
  }
  return [...sessions.values()];
}

function sessionDuration(session: TrainingSession): number {
  return session.activities.reduce((total, workout) => total + workout.duration, 0);
}

function sessionDistance(session: TrainingSession): number {
  return session.activities.reduce(
    (total, workout) => total + (distanceInKilometres(workout) ?? 0),
    0,
  );
}

function displayDate(workout: Workout): string {
  return new Date(`${workout.workoutDate}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes} min`;
}

function distanceInKilometres(workout: Workout): number | undefined {
  if (workout.distance === undefined) {
    return undefined;
  }
  return workout.distanceUnit === "m" ? workout.distance / 1000 : workout.distance;
}

function ActivityIcon({ activity }: { activity: ActivityType }) {
  const Icon =
    activity === "Run"
      ? Footprints
      : activity === "Ride"
        ? Bike
        : activity === "Swim"
          ? Waves
          : activity === "Strength"
            ? Dumbbell
            : Activity;

  return <Icon aria-hidden="true" size={15} />;
}

function headlineStats(
  workout: Workout,
  units: PreferredUnits,
): Array<{ label: string; value: string }> {
  const candidates = [
    workout.averageHeartRate !== undefined
      ? { label: "Avg HR", value: `${workout.averageHeartRate} bpm` }
      : undefined,
    workout.averagePace
      ? { label: "Pace", value: paceForDisplay(workout.averagePace, workout.activityType, units) }
      : undefined,
    workout.averageSpeed !== undefined
      ? {
          label: "Avg speed",
          value: displayOptionalValue(workout, "averageSpeed", units) ?? "",
        }
      : undefined,
    workout.trainingLoad !== undefined
      ? { label: "Load", value: String(workout.trainingLoad) }
      : undefined,
    workout.averagePower !== undefined
      ? { label: "Avg power", value: `${workout.averagePower} W` }
      : undefined,
  ];
  return candidates.filter((item): item is { label: string; value: string } => item !== undefined).slice(0, 3);
}

function paceValue(
  pace: string,
  activityType: ActivityType,
): { seconds: number; unit: "km" | "100m" } | null {
  const match = /^(\d+):([0-5]\d)(?:\s*\/\s*(km|100m))?$/i.exec(pace.trim());
  if (!match) {
    return null;
  }
  return {
    seconds: Number(match[1]) * 60 + Number(match[2]),
    unit: match[3]?.toLowerCase() === "100m" || activityType === "Swim" ? "100m" : "km",
  };
}

function getWorkoutInsights(
  workout: Workout,
  history: Workout[],
  units: PreferredUnits,
): string[] {
  const previous = history
    .filter((item) => item.id !== workout.id && dateTimeValue(item) < dateTimeValue(workout))
    .sort((left, right) => dateTimeValue(right) - dateTimeValue(left));
  const insights: string[] = [];

  const sameActivityHistory = previous.filter(
    (item) => item.activityType === workout.activityType,
  );
  const recentDurations = sameActivityHistory.slice(0, 5);
  if (recentDurations.length >= 2) {
    const average =
      recentDurations.reduce((total, item) => total + item.duration, 0) /
      recentDurations.length;
    const difference = workout.duration - average;
    insights.push(
      `This workout was ${Math.abs(Math.round(difference))} minutes ${
        difference >= 0 ? "longer" : "shorter"
      } than your recent ${Math.round(average)}-minute average.`,
    );
  }

  const sameActivity = sameActivityHistory[0];
  if (sameActivity && workout.distance !== undefined && sameActivity.distance !== undefined) {
    const currentDistance = distanceInKilometres(workout) ?? 0;
    const previousDistance = distanceInKilometres(sameActivity) ?? 0;
    const distanceMultiplier = workout.activityType === "Swim" ? 1000 : 1;
    const difference =
      (currentDistance - previousDistance) *
      distanceMultiplier *
      (units === "Imperial"
        ? workout.activityType === "Swim"
          ? 1.0936132983
          : 0.6213711922
        : 1);
    insights.push(
      `Distance was ${Math.abs(difference).toFixed(1)} ${
        workout.activityType === "Swim"
          ? units === "Imperial" ? "yd" : "m"
          : units === "Imperial" ? "mi" : "km"
      } ${
        difference >= 0 ? "more" : "less"
      } than your previous ${workout.activityType.toLowerCase()}.`,
    );
  }
  if (sameActivity) {
    const difference = workout.duration - sameActivity.duration;
    insights.push(
      `Duration was ${Math.abs(difference)} minutes ${
        difference >= 0 ? "longer" : "shorter"
      } than your previous ${workout.activityType.toLowerCase()}.`,
    );
    if (workout.averagePace && sameActivity.averagePace) {
      const currentPace = paceValue(workout.averagePace, workout.activityType);
      const previousPace = paceValue(sameActivity.averagePace, sameActivity.activityType);
      if (
        currentPace !== null &&
        previousPace !== null &&
        currentPace.unit === previousPace.unit &&
        currentPace.seconds !== previousPace.seconds
      ) {
        const differenceSeconds = Math.abs(currentPace.seconds - previousPace.seconds);
        const displayDifferenceSeconds =
          differenceSeconds *
          (units === "Imperial"
            ? currentPace.unit === "100m" ? 0.9144 : 1.609344
            : 1);
        const paceUnit =
          currentPace.unit === "100m"
            ? units === "Imperial" ? "100 yd" : "100 m"
            : units === "Imperial" ? "mile" : "km";
        const difference = formatPace(displayDifferenceSeconds, paceUnit).replace(" /", " per ");
        insights.push(
          `Average pace was ${difference} ${
            currentPace.seconds < previousPace.seconds ? "faster" : "slower"
          } than your previous ${workout.activityType.toLowerCase()}.`,
        );
      }
    }
    if (workout.averageSpeed !== undefined && sameActivity.averageSpeed !== undefined) {
      const difference = workout.averageSpeed - sameActivity.averageSpeed;
      if (difference !== 0) {
        const displayDifference =
          units === "Imperial" ? Math.abs(difference) * 0.6213711922 : Math.abs(difference);
        insights.push(
          `Average speed was ${displayDifference.toFixed(1)} ${units === "Imperial" ? "mph" : "km/h"} ${
            difference >= 0 ? "faster" : "slower"
          } than your previous ${workout.activityType.toLowerCase()}.`,
        );
      }
    }
  }

  const similarHeartRates = previous.filter(
    (item) =>
      item.activityType === workout.activityType && item.averageHeartRate !== undefined,
  );
  if (workout.averageHeartRate !== undefined && similarHeartRates.length >= 2) {
    const recentHeartRates = similarHeartRates.slice(0, 5);
    const average =
      recentHeartRates.reduce((total, item) => total + (item.averageHeartRate ?? 0), 0) /
      recentHeartRates.length;
    const difference = workout.averageHeartRate - average;
    insights.push(
      `Average heart rate was ${Math.abs(Math.round(difference))} bpm ${
        difference >= 0 ? "higher" : "lower"
      } than your recent similar workouts.`,
    );
  }

  return insights;
}

function WorkoutDetail({
  workout,
  sessionWorkouts,
  history,
  units,
  feedback,
  onClose,
  onDelete,
  onEditActivity,
  onDeleteActivity,
  onAddActivity,
}: {
  workout: Workout;
  sessionWorkouts: Workout[];
  history: Workout[];
  units: PreferredUnits;
  feedback: string;
  onClose: () => void;
  onDelete: () => void;
  onEditActivity: (id: string) => void;
  onDeleteActivity: (id: string) => void;
  onAddActivity: (formData: FormData) => void;
}) {
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [isAddActivityValid, setIsAddActivityValid] = useState(false);
  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(
    () => new Set(),
  );
  const insights = getWorkoutInsights(workout, history, units);

  return (
    <>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">
              Training session
            </p>
            <h2
              className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#eef2ed]"
              id="workout-detail-title"
            >
              {workout.sessionTitle || workout.activityType}
            </h2>
            <p className="mt-1 text-[11px] text-[#87938b]">
              {displayDate(workout)} · {sessionWorkouts.length}{" "}
              {sessionWorkouts.length === 1 ? "activity" : "activities"}
            </p>
          </div>
          <button
            aria-label="Close workout details"
            autoFocus
            className="rounded-lg border border-white/[0.08] p-2 text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        {feedback && (
          <p className="mt-4 rounded-lg border border-[#b8f36b]/15 bg-[#b8f36b]/[0.05] p-3 text-xs text-[#c5ef97]" role="status">
            {feedback}
          </p>
        )}

        {workout.sessionNotes && (
          <section className="mt-5 rounded-lg border border-white/[0.07] bg-[#111714] p-3">
            <h3 className="text-xs font-semibold text-[#dce4dd]">Session Notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#a6b1a9]">
              {workout.sessionNotes}
            </p>
          </section>
        )}
        <section className="mt-6" aria-labelledby="session-activities-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-[#dce4dd]" id="session-activities-heading">
              Activities
            </h3>
            <button
              className="rounded-lg border border-[#b8f36b]/20 px-3 py-2 text-[10px] font-medium text-[#c5ef97] hover:bg-[#b8f36b]/[0.06]"
              onClick={() => setIsAddingActivity((current) => !current)}
              type="button"
            >
              {isAddingActivity ? "Cancel" : "Add Activity"}
            </button>
          </div>
          {isAddingActivity && (
            <form
              className="mt-3 rounded-lg border border-[#b8f36b]/15 bg-[#0b100e] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!event.currentTarget.reportValidity()) return;
                onAddActivity(new FormData(event.currentTarget));
                setIsAddingActivity(false);
              }}
            >
              <p className="mb-3 text-xs font-semibold text-[#dce4dd]">Add Activity to Session</p>
              <WorkoutFields
                activityOnly
                today={workout.workoutDate}
                workout={{ workoutDate: workout.workoutDate }}
                units={units}
                onValidityChange={setIsAddActivityValid}
              />
              <button
                className="mt-4 rounded-lg bg-[#b8f36b] px-4 py-2.5 text-xs font-semibold text-[#102010] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!isAddActivityValid}
                type="submit"
              >
                Save Activity
              </button>
            </form>
          )}
          <ul className="mt-3 grid gap-3">
            {sessionWorkouts.map((activity) => {
              const activityStats = statistics.flatMap(([field, label]) => {
                const value = displayOptionalValue(activity, field, units);
                return value === undefined ? [] : [{ label, value }];
              });
              const isExpanded = expandedActivityIds.has(activity.id);
              return (
                <li
                  className="rounded-lg border border-white/[0.07] bg-[#111714] p-4"
                  key={activity.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-[#b8f36b]/10 text-[#b8f36b]">
                        <ActivityIcon activity={activity.activityType} />
                      </span>
                      <div>
                        <h4 className="text-xs font-semibold text-[#e5ebe6]">{activity.activityType}</h4>
                        <p className="mt-1 text-[10px] text-[#87938b]">
                          {formatDuration(activity.duration)}
                          {distanceForDisplay(activity, units)
                            ? ` · ${distanceForDisplay(activity, units)}`
                            : ""}
                          {" · "}{activity.source}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    aria-controls={`activity-details-${activity.id}`}
                    aria-expanded={isExpanded}
                    className="mt-3 rounded-md px-1 py-1 text-[10px] font-medium text-[#c5ef97] hover:text-[#dcf7bd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
                    onClick={() =>
                      setExpandedActivityIds((current) => {
                        const next = new Set(current);
                        if (next.has(activity.id)) next.delete(activity.id);
                        else next.add(activity.id);
                        return next;
                      })
                    }
                    type="button"
                  >
                    {isExpanded ? "▲ Hide Details" : "▼ View Details"}
                  </button>
                  {isExpanded && (
                    <div
                      className="mt-3 border-t border-white/[0.06] pt-3"
                      id={`activity-details-${activity.id}`}
                    >
                      {activity.notes && (
                        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#87938b]">
                          <span className="font-medium text-[#a6b1a9]">Notes: </span>
                          {activity.notes}
                        </p>
                      )}
                      {activityStats.length > 0 ? (
                        <dl
                          className={`grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 ${
                            activity.notes ? "mt-3 border-t border-white/[0.06] pt-3" : ""
                          }`}
                        >
                          {activityStats.map(({ label, value }) => (
                            <div key={label}>
                              <dt className="text-[9px] text-[#78857d]">{label}</dt>
                              <dd className="mt-1 text-[11px] text-[#dce4dd]">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : !activity.notes ? (
                        <p className="text-[10px] text-[#78857d]">
                          No additional details saved for this activity.
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
                      <button
                        className="rounded border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-[#c5ef97]"
                        onClick={() => onEditActivity(activity.id)}
                        type="button"
                      >
                        Edit Activity
                      </button>
                      <button
                        className="rounded border border-[#f0b47c]/20 px-2.5 py-1.5 text-[10px] text-[#f0c49d]"
                        onClick={() => onDeleteActivity(activity.id)}
                        type="button"
                      >
                        Delete Activity
                      </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-6 border-t border-white/[0.07] pt-5" aria-labelledby="workout-insights-heading">
          <h3 className="text-xs font-semibold text-[#dce4dd]" id="workout-insights-heading">
            Workout Insights
          </h3>
          {insights.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {insights.map((insight) => (
                <li
                  className="rounded-lg border border-[#b8f36b]/10 bg-[#b8f36b]/[0.04] p-3 text-xs leading-relaxed text-[#c8d5c9]"
                  key={insight}
                >
                  {insight}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-[#87938b]">
              More workout history is needed to generate useful insights.
            </p>
          )}
          <p className="mt-3 rounded-lg border border-white/[0.07] bg-[#111714] p-3 text-[11px] leading-relaxed text-[#78857d]">
            AI coaching insights will appear here when screenshot analysis and the coaching engine are enabled.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[#f0b47c]/25 px-4 py-2.5 text-xs font-medium text-[#f0b47c] hover:bg-[#f0b47c]/[0.06]"
              onClick={onDelete}
              type="button"
            >
              Delete Session
            </button>
          </div>
          <button
            className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs text-[#a6b1a9] hover:text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
    </>
  );
}

export default function TrainingPage() {
  const { profile, profileError } = useAthleteProfile();
  const units = profile?.units ?? "Metric";
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [today, setToday] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [analysisState, setAnalysisState] = useState<
    "idle" | "unavailable" | "success" | "error"
  >("idle");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [sessionActivityIds, setSessionActivityIds] = useState<string[]>(["activity-1"]);
  const [sessionActivityValidity, setSessionActivityValidity] = useState<Record<string, boolean>>({
    "activity-1": false,
  });
  const [isEditValid, setIsEditValid] = useState(true);
  const [formVersion, setFormVersion] = useState(0);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"activity" | "session">("session");
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All Sources");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const selectedWorkout = workouts.find((item) => item.id === selectedWorkoutId);
  const selectedSessionWorkouts = selectedWorkout
    ? workouts.filter((item) => item.sessionId === selectedWorkout.sessionId)
    : [];

  useEffect(() => {
    if (!selectedWorkoutId && !isCreateSessionOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isCreateSessionOpen) {
          setIsCreateSessionOpen(false);
          setSelectedImage(null);
          setImagePreview("");
          setAnalysisState("idle");
          setIsAnalyzing(false);
          setSessionActivityIds(["activity-1"]);
          setSessionActivityValidity({ "activity-1": false });
          setFormVersion((version) => version + 1);
        } else {
          setSelectedWorkoutId(null);
          setIsEditing(false);
          setConfirmDelete(false);
        }
        return;
      }
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
        const focusableElements = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateSessionOpen, selectedWorkoutId]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        setToday(localDateString(new Date()));
        const storedWorkouts = window.localStorage.getItem(STORAGE_KEY);
        if (storedWorkouts !== null) {
          const parsed: unknown = JSON.parse(storedWorkouts);
          if (!Array.isArray(parsed)) {
            throw new Error("Saved workout data has an invalid format.");
          }
          const normalized = parsed.map(normalizeWorkout);
          const loaded = normalized.filter((workout): workout is Workout => workout !== null);
          if (loaded.length !== parsed.length) {
            throw new Error("Saved workout data has an invalid format.");
          }
          setWorkouts(loaded);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
        }
        await clearLegacyScreenshots();
      } catch {
        setError("Saved workouts could not be loaded or secured in this browser.");
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!imagePreview.startsWith("blob:")) {
      return;
    }
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sessions = groupTrainingSessions(workouts);
    const filtered = sessions.filter((session) => {
      const matchesSearch =
        !query ||
        [
          session.title,
          session.notes,
          ...session.activities.flatMap((item) => [
            item.activityType,
            item.workoutTitle,
            item.notes,
            item.source,
          ]),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      const matchesActivity =
        activityFilter === "All" ||
        session.activities.some((workout) => workout.activityType === activityFilter);
      const matchesSource =
        sourceFilter === "All Sources" ||
        session.activities.some((workout) => workout.source === sourceFilter);
      return matchesSearch && matchesActivity && matchesSource;
    });

    return filtered.sort((left, right) => {
      if (sortMode === "oldest") {
        return (
          left.date.localeCompare(right.date) ||
          Date.parse(left.activities[0].createdAt) - Date.parse(right.activities[0].createdAt)
        );
      }
      if (sortMode === "duration") {
        return sessionDuration(right) - sessionDuration(left);
      }
      if (sortMode === "distance") {
        return sessionDistance(right) - sessionDistance(left);
      }
      return (
        right.date.localeCompare(left.date) ||
        Date.parse(right.activities[0].createdAt) - Date.parse(left.activities[0].createdAt)
      );
    });
  }, [workouts, search, activityFilter, sourceFilter, sortMode]);

  function clearImage() {
    setSelectedImage(null);
    setImagePreview("");
    setAnalysisState("idle");
    setIsAnalyzing(false);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const image = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!image) {
      return;
    }
    const extension = image.name.split(".").pop()?.toLowerCase() ?? "";
    if (
      !acceptedImageExtensions.has(extension) ||
      (image.type !== "" && !acceptedImageTypes.has(image.type))
    ) {
      setAnalysisState("error");
      setError("Choose a JPG, JPEG, PNG, or WEBP image.");
      return;
    }
    setError("");
    setAnalysisState("idle");
    clearImage();
    setSelectedImage(image);
    setImagePreview(URL.createObjectURL(image));
  }

  function analyzeScreenshot() {
    if (!selectedImage) {
      return;
    }
    setError("");
    setAnalysisState("idle");
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysisState("unavailable");
    }, 350);
  }

  function persist(nextWorkouts: Workout[]): boolean {
    try {
      const structuredWorkouts = nextWorkouts.map(normalizeWorkout);
      if (structuredWorkouts.some((workout) => workout === null)) {
        throw new Error("Workout data could not be normalized.");
      }
      const safeWorkouts = structuredWorkouts.filter(
        (workout): workout is Workout => workout !== null,
      );
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeWorkouts));
      setWorkouts(safeWorkouts);
      notifyWorkoutHistoryUpdated();
      setError("");
      return true;
    } catch {
      setError("Workout could not be saved. Check browser storage and try again.");
      return false;
    }
  }

  function saveTrainingSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    const form = event.currentTarget;
    if (!form.reportValidity()) {
      return;
    }
    const sessionDate = String(new FormData(form).get("sessionDate") ?? "");
    const sessionTitle = formText(new FormData(form), "sessionTitle") ?? "";
    const sessionNotes = formText(new FormData(form), "sessionNotes") ?? "";
    const sessionId = window.crypto.randomUUID();
    const activityElements = Array.from(
      form.querySelectorAll<HTMLElement>("[data-session-activity]"),
    );
    if (!activityElements.length) return;

    const sessionActivities = activityElements.map((element) => {
      const activityData = new FormData();
      element
        .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input[name], select[name], textarea[name]",
        )
        .forEach((field) => activityData.append(field.name, field.value));
      activityData.set("workoutDate", sessionDate);
      const activity = readWorkoutForm(activityData, undefined, units);
      return {
        ...activity,
        sessionId,
        sessionTitle,
        sessionNotes,
      };
    });

    if (persist([...sessionActivities, ...workouts])) {
      clearImage();
      form.reset();
      setIsCreateSessionOpen(false);
      setSessionActivityIds(["activity-1"]);
      setSessionActivityValidity({ "activity-1": false });
      setFormVersion((version) => version + 1);
      setSuccessMessage("Training session saved.");
    }
  }

  function editWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    if (!selectedWorkout) {
      return;
    }
    const form = event.currentTarget;
    if (!form.reportValidity()) {
      return;
    }
    const updated = readWorkoutForm(new FormData(form), selectedWorkout, units);
    const sessionUpdated = workouts.map((item) =>
      item.sessionId === selectedWorkout.sessionId
        ? {
            ...item,
            workoutDate: updated.workoutDate,
            sessionTitle: updated.sessionTitle,
            sessionNotes: updated.sessionNotes,
            ...(item.id === updated.id ? updated : {}),
          }
        : item,
    );
    if (persist(sessionUpdated)) {
      setIsEditing(false);
      setSuccessMessage("Activity and session updated.");
    }
  }

  function addActivityToSelectedSession(formData: FormData) {
    if (!selectedWorkout) return;
    const activity = readWorkoutForm(formData, undefined, units);
    const nextActivity: Workout = {
      ...activity,
      sessionId: selectedWorkout.sessionId,
      workoutDate: selectedWorkout.workoutDate,
      sessionTitle: selectedWorkout.sessionTitle,
      sessionNotes: selectedWorkout.sessionNotes,
      workoutTitle: undefined,
      notes: undefined,
    };
    if (persist([...workouts, nextActivity])) {
      setSelectedWorkoutId(nextActivity.id);
      setSuccessMessage("Activity added to training session.");
    }
  }

  function requestDeleteSessionActivity(activityId: string) {
    if (!workouts.some((item) => item.id === activityId)) return;
    setSelectedWorkoutId(activityId);
    setDeleteTarget("activity");
    setConfirmDelete(true);
  }

  function deleteWorkout() {
    setSuccessMessage("");
    if (!selectedWorkout) {
      return;
    }
    const remaining = workouts.filter((item) =>
      deleteTarget === "session"
        ? item.sessionId !== selectedWorkout.sessionId
        : item.id !== selectedWorkout.id,
    );
    if (persist(remaining)) {
      if (deleteTarget === "session") {
        setSelectedWorkoutId(null);
        setSuccessMessage("Training session deleted.");
      } else {
        setSelectedWorkoutId(
          remaining.find((item) => item.sessionId === selectedWorkout.sessionId)?.id ?? null,
        );
        setSuccessMessage("Activity deleted.");
      }
      setConfirmDelete(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <header className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">
          MySynonym
        </p>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
          Training
        </h1>
        <p className="mt-1.5 text-xs text-[#87938b]">
          Turn your weekly training into clear, practical decisions.
        </p>
        {profileError && (
          <p className="mt-2 text-xs text-[#f0b47c]" role="alert">
            {profileError} Showing metric units.
          </p>
        )}
      </header>

      <WeeklyTrainingPlan />

      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#b8f36b] px-4 py-2.5 text-sm font-semibold text-[#102010] transition-colors hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
        onClick={() => {
          setError("");
          setSuccessMessage("");
          setSessionActivityIds(["activity-1"]);
          setSessionActivityValidity({ "activity-1": false });
          setFormVersion((version) => version + 1);
          clearImage();
          setIsCreateSessionOpen(true);
        }}
        type="button"
      >
        <Plus aria-hidden="true" size={17} />
        Log Training Session
      </button>

      {isCreateSessionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setIsCreateSessionOpen(false);
            clearImage();
            setSessionActivityIds(["activity-1"]);
            setSessionActivityValidity({ "activity-1": false });
            setFormVersion((version) => version + 1);
          }}
        >
          <section
            aria-labelledby="create-training-session-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0b100e] p-5 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">
                  Training log
                </p>
                <h2
                  className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#eef2ed]"
                  id="create-training-session-title"
                >
                  Log Training Session
                </h2>
              </div>
              <button
                aria-label="Close training session form"
                autoFocus
                className="rounded-lg border border-white/[0.08] p-2 text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
                onClick={() => {
                  setIsCreateSessionOpen(false);
                  clearImage();
                  setSessionActivityIds(["activity-1"]);
                  setSessionActivityValidity({ "activity-1": false });
                  setFormVersion((version) => version + 1);
                }}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <form className="mt-5" onSubmit={saveTrainingSession}>
              <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-[#dce4dd]">Session Details</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Session Date
                    <input
                      className={inputClass}
                      defaultValue={today}
                      max={today}
                      name="sessionDate"
                      required
                      type="date"
                    />
                  </label>
                  <label className={labelClass}>
                    Session Title (optional)
                    <input
                      className={inputClass}
                      maxLength={120}
                      name="sessionTitle"
                      placeholder="e.g. Saturday Brick"
                      type="text"
                    />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>
                    Session Notes (optional)
                    <textarea
                      className={`${inputClass} min-h-20 py-2.5`}
                      maxLength={2000}
                      name="sessionNotes"
                      placeholder="Notes about the full session"
                      rows={3}
                    />
                  </label>
                </div>
              </section>

              <section aria-labelledby="session-activities-form-heading" className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3
                      className="text-sm font-semibold text-[#eef2ed]"
                      id="session-activities-form-heading"
                    >
                      Activities
                    </h3>
                    <p className="mt-1 text-[10px] text-[#78857d]">
                      Add each activity completed as part of this session.
                    </p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#b8f36b]/20 px-3 py-2 text-[11px] font-medium text-[#c5ef97] hover:bg-[#b8f36b]/[0.06]"
                    onClick={() => {
                      const id = `activity-${window.crypto.randomUUID()}`;
                      setSessionActivityIds((current) => [...current, id]);
                      setSessionActivityValidity((current) => ({ ...current, [id]: false }));
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={13} /> Add Activity
                  </button>
                </div>
                <div className="mt-3 grid gap-3">
                  {sessionActivityIds.map((id, index) => (
                    <fieldset
                      className="min-w-0 rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
                      data-session-activity
                      key={`${today}-${formVersion}-${id}`}
                    >
                      <legend className="px-1 text-xs font-semibold text-[#dce4dd]">
                        Activity {index + 1}
                      </legend>
                      <WorkoutFields
                        activityOnly
                        analysisState={index === 0 ? analysisState : "idle"}
                        analysisSuccess={index === 0 && analysisState === "success"}
                        analyzing={index === 0 && isAnalyzing}
                        imageName={index === 0 ? selectedImage?.name : undefined}
                        imagePreview={index === 0 ? imagePreview : undefined}
                        includeScreenshotImport={index === 0}
                        key={`${today}-${formVersion}-${id}`}
                        onAnalyze={index === 0 ? analyzeScreenshot : undefined}
                        onImageChange={index === 0 ? handleImageChange : undefined}
                        onRemoveImage={index === 0 ? clearImage : undefined}
                        onValidityChange={(valid) =>
                          setSessionActivityValidity((current) => ({
                            ...current,
                            [id]: valid,
                          }))
                        }
                        today={today}
                      />
                      {sessionActivityIds.length > 1 && (
                        <button
                          className="mt-3 rounded border border-[#f0b47c]/20 px-2.5 py-1.5 text-[10px] text-[#f0c49d] hover:bg-[#f0b47c]/[0.05]"
                          onClick={() => {
                            setSessionActivityIds((current) =>
                              current.filter((activityId) => activityId !== id),
                            );
                            setSessionActivityValidity((current) => {
                              const next = { ...current };
                              delete next[id];
                              return next;
                            });
                            if (index === 0) clearImage();
                          }}
                          type="button"
                        >
                          Delete Activity
                        </button>
                      )}
                    </fieldset>
                  ))}
                </div>
              </section>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
                <button
                  className="rounded-lg bg-[#b8f36b] px-4 py-2.5 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!sessionActivityIds.every((id) => sessionActivityValidity[id])}
                  type="submit"
                >
                  Save Training Session
                </button>
                <button
                  className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs text-[#a6b1a9] hover:text-white"
                  onClick={() => {
                    setIsCreateSessionOpen(false);
                    clearImage();
                    setSessionActivityIds(["activity-1"]);
                    setSessionActivityValidity({ "activity-1": false });
                    setFormVersion((version) => version + 1);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                {error && <p className="text-xs text-[#f0b47c]" role="alert">{error}</p>}
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="mt-8" aria-labelledby="recent-training-sessions-heading">
        {successMessage && (
          <p className="mb-4 rounded-lg border border-[#b8f36b]/15 bg-[#b8f36b]/[0.05] p-3 text-xs text-[#c5ef97]" role="status">
            {successMessage}
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#748078]">
              Your activity
            </p>
            <h2
              className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[#eef2ed]"
              id="recent-training-sessions-heading"
            >
              Recent Training Sessions
            </h2>
          </div>
          <span className="text-[10px] text-[#78857d]">
            {visibleSessions.length} of {groupTrainingSessions(workouts).length}{" "}
            {groupTrainingSessions(workouts).length === 1 ? "session" : "sessions"}
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className={`${labelClass} sm:col-span-2 xl:col-span-1`}>
            Search training sessions
            <span className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78857d]"
                size={15}
              />
              <input
                className={`${inputClass} w-full pl-9`}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Title, notes, source..."
                type="search"
                value={search}
              />
            </span>
          </label>
          <label className={labelClass}>
            Activity
            <select
              className={inputClass}
              onChange={(event) => setActivityFilter(event.currentTarget.value)}
              value={activityFilter}
            >
              <option>All</option>
              {activities.map((activity) => (
                <option key={activity}>{activity}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Source
            <select
              className={inputClass}
              onChange={(event) => setSourceFilter(event.currentTarget.value)}
              value={sourceFilter}
            >
              <option>All Sources</option>
              {sources.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Sort by
            <select
              className={inputClass}
              onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}
              value={sortMode}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration">Longest Duration</option>
              <option value="distance">Longest Distance</option>
            </select>
          </label>
        </div>

        {!isLoaded ? (
          <p className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 text-xs text-[#87938b]">
            Loading saved training sessions...
          </p>
        ) : visibleSessions.length === 0 ? (
          <p className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 text-xs text-[#87938b]">
            {workouts.length === 0
              ? "No training sessions yet. Log your first session."
              : "No training sessions match your search or filters."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleSessions.map((session) => (
              <article
                className="rounded-lg border border-white/[0.07] bg-[#111714] transition-colors hover:border-[#b8f36b]/20"
                key={session.id}
              >
                <button
                  aria-label={`View training session ${session.title || session.activities[0].activityType} on ${session.date}`}
                  className="block w-full rounded-lg p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] sm:p-5"
                  onClick={() => {
                    setSelectedWorkoutId(session.activities[0].id);
                    setIsEditing(false);
                    setIsEditValid(true);
                    setConfirmDelete(false);
                    setSuccessMessage("");
                  }}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#b8f36b]/10 text-[#b8f36b]">
                        <ActivityIcon activity={session.activities[0].activityType} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-[#eef2ed]">
                          {session.title || session.activities.map((item) => item.activityType).join(" + ")}
                        </h3>
                        <p className="mt-1 text-[10px] text-[#8b9790]">
                          {session.activities.map((item) => item.activityType).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-[#a6b1a9]">
                      {session.activities.length} {session.activities.length === 1 ? "activity" : "activities"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#a6b1a9]">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-[#78857d]" />
                      {new Date(`${session.date}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={13} className="text-[#b8f36b]" />
                      {formatDuration(sessionDuration(session))}
                    </span>
                    {session.activities.some((activity) => activity.distance !== undefined) && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-[#8dd7e5]" />
                                {session.activities
                                  .flatMap((activity) =>
                                    activity.distance === undefined
                                      ? []
                                      : [`${activity.activityType} ${distanceForDisplay(activity, units)}`],
                                  )
                                  .join(" · ")}
                              </span>
                              )}
                  </div>
                  {session.notes && (
                    <p className="mt-3 line-clamp-2 text-[10px] leading-relaxed text-[#87938b]">
                      {session.notes}
                    </p>
                  )}
                  {session.activities.some((activity) => headlineStats(activity, units).length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#87938b]">
                      {session.activities.flatMap((activity) =>
                        headlineStats(activity, units).map(({ label, value }) => (
                          <span key={`${activity.id}-${label}`}>
                            <span className="text-[#68756d]">{activity.activityType} {label}</span> {value}
                          </span>
                        )),
                      )}
                    </div>
                  )}
                  <span className="mt-4 inline-block rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-[#c5ef97] transition-colors group-hover:border-[#b8f36b]/30">
                    View Details
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}

        <p className="mt-4 text-[10px] text-[#68756d]">
          Training session records are currently stored only in this browser and on this device.
        </p>
      </section>

      {selectedWorkout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setSelectedWorkoutId(null);
            setIsEditing(false);
            setConfirmDelete(false);
          }}
        >
          <section
            aria-labelledby={
              isEditing
                ? "edit-workout-title"
                : confirmDelete
                  ? "confirm-delete-title"
                  : "workout-detail-title"
            }
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0b100e] p-5 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            {isEditing ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-semibold text-[#eef2ed]" id="edit-workout-title">
                    Edit Activity
                  </h2>
                  <button
                    aria-label="Close edit workout"
                    autoFocus
                    className="rounded-lg border border-white/[0.08] p-2 text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]"
                    onClick={() => setIsEditing(false)}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
                <form
                  className="mt-5"
                  key={`edit-${selectedWorkout.id}`}
                  onSubmit={editWorkout}
                >
                  <WorkoutFields
                    units={units}
                    onValidityChange={setIsEditValid}
                    today={today}
                    workout={{
                      ...selectedWorkout,
                      workoutTitle: selectedWorkout.sessionTitle,
                      notes: selectedWorkout.sessionNotes,
                    }}
                  />
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                    <button
                      className="rounded-lg bg-[#b8f36b] px-4 py-2.5 text-xs font-semibold text-[#102010] hover:bg-[#c8f78b] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!isEditValid}
                      type="submit"
                    >
                      Save Changes
                    </button>
                    <button
                      className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs text-[#a6b1a9] hover:text-white"
                      onClick={() => setIsEditing(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : confirmDelete ? (
              <div>
                <h2 className="text-lg font-semibold text-[#eef2ed]" id="confirm-delete-title">
                  {deleteTarget === "session"
                    ? "Delete this training session and all its activities? This action cannot be undone."
                    : "Delete this activity? This action cannot be undone."}
                </h2>
                {error && (
                  <p className="mt-3 text-xs text-[#f0b47c]" role="alert">
                    {error}
                  </p>
                )}
                <div className="mt-5 flex gap-2">
                  <button
                    className="rounded-lg border border-[#f0b47c]/25 px-4 py-2.5 text-xs font-medium text-[#f0b47c] hover:bg-[#f0b47c]/[0.06]"
                    onClick={deleteWorkout}
                    type="button"
                  >
                    {deleteTarget === "session" ? "Delete Session" : "Delete Activity"}
                  </button>
                  <button
                    autoFocus
                    className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs text-[#a6b1a9] hover:text-white"
                    onClick={() => setConfirmDelete(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <WorkoutDetail
                  feedback={successMessage}
                  history={workouts}
                  sessionWorkouts={selectedSessionWorkouts}
                  units={units}
                  onClose={() => setSelectedWorkoutId(null)}
                  onDelete={() => {
                    setDeleteTarget("session");
                    setConfirmDelete(true);
                  }}
                  onDeleteActivity={requestDeleteSessionActivity}
                  onEditActivity={(id) => {
                    setSelectedWorkoutId(id);
                    setIsEditValid(true);
                    setIsEditing(true);
                  }}
                  onAddActivity={addActivityToSelectedSession}
                  workout={selectedWorkout}
                />
                {error && (
                  <p className="mt-3 text-xs text-[#f0b47c]" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
