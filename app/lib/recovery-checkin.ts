export const RECOVERY_CHECKINS_STORAGE_KEY = "mysynonym-recovery-checkins";
export const RECOVERY_CHECKINS_UPDATED_EVENT = "mysynonym-recovery-checkins-updated";

export type RecoverySource =
  | "Manual Check-In"
  | "Screenshot Import"
  | "Garmin"
  | "Apple Health"
  | "Whoop"
  | "Oura"
  | "COROS"
  | "Other";

export type RecoveryCheckIn = {
  id: string;
  date: string;
  updatedAt: string;
  source: RecoverySource;
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  sleepQuality: number;
  sleepDurationHours?: number;
  bedtime?: string;
  wakeTime?: string;
  restingHeartRate?: number;
  hrv?: number;
  painNotes?: string;
  recoveryNotes?: string;
  availableTrainingMinutes?: number;
  readinessScore: number;
  readinessCategory: "Low" | "Moderate" | "Good" | "High";
  calculationUsed: string[];
  informationMissing: string[];
};

export type RecoveryCheckInInput = Omit<
  RecoveryCheckIn,
  | "id"
  | "updatedAt"
  | "readinessScore"
  | "readinessCategory"
  | "calculationUsed"
  | "informationMissing"
>;

const sources: readonly RecoverySource[] = [
  "Manual Check-In",
  "Screenshot Import",
  "Garmin",
  "Apple Health",
  "Whoop",
  "Oura",
  "COROS",
  "Other",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isOptionalNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function readinessFor(input: RecoveryCheckInInput): {
  score: number;
  category: RecoveryCheckIn["readinessCategory"];
  used: string[];
  missing: string[];
} {
  const subjective = [
    { label: "Energy", value: input.energy, positive: true },
    { label: "Muscle soreness", value: input.soreness, positive: false },
    { label: "Stress", value: input.stress, positive: false },
    { label: "Motivation to train", value: input.motivation, positive: true },
    { label: "Sleep quality", value: input.sleepQuality, positive: true },
  ];
  const points = subjective.map(({ value, positive }) =>
    ((positive ? value : 6 - value) - 1) * 25,
  );
  const used = subjective.map(({ label, value }) => `${label} (${value}/5)`);
  if (input.sleepDurationHours !== undefined) {
    points.push(Math.min(100, (input.sleepDurationHours / 8) * 100));
    used.push(`Sleep duration (${input.sleepDurationHours} hours)`);
  }
  const score = Math.round(points.reduce((sum, value) => sum + value, 0) / points.length);
  const category =
    score < 40 ? "Low" : score < 60 ? "Moderate" : score < 80 ? "Good" : "High";
  const missing = [
    ...(input.sleepDurationHours === undefined ? ["Sleep duration"] : []),
    ...(input.restingHeartRate === undefined ? ["Resting heart rate"] : []),
    ...(input.hrv === undefined ? ["HRV"] : []),
    ...(input.bedtime ? [] : ["Bedtime"]),
    ...(input.wakeTime ? [] : ["Wake time"]),
    "Personal resting-heart-rate and HRV baselines (needed to interpret those values)",
  ];
  return { score, category, used, missing };
}

export function createRecoveryCheckIn(
  input: RecoveryCheckInInput,
  existingId?: string,
  now = new Date(),
): RecoveryCheckIn {
  const readiness = readinessFor(input);
  return {
    ...input,
    id: existingId ?? `recovery-${input.date}`,
    updatedAt: now.toISOString(),
    readinessScore: readiness.score,
    readinessCategory: readiness.category,
    calculationUsed: readiness.used,
    informationMissing: readiness.missing,
  };
}

export function normalizeRecoveryCheckIns(value: unknown): RecoveryCheckIn[] | null {
  if (!Array.isArray(value)) return null;
  const entries: RecoveryCheckIn[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const source = sources.find((candidate) => candidate === raw.source);
    if (
      typeof raw.id !== "string" ||
      typeof raw.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
      typeof raw.updatedAt !== "string" ||
      Number.isNaN(Date.parse(raw.updatedAt)) ||
      !source ||
      !isRating(raw.energy) ||
      !isRating(raw.soreness) ||
      !isRating(raw.stress) ||
      !isRating(raw.motivation) ||
      !isRating(raw.sleepQuality)
    ) {
      return null;
    }
    const optionalNumbers: Array<[string, number, number]> = [
      ["sleepDurationHours", 0, 24],
      ["restingHeartRate", 20, 250],
      ["hrv", 1, 1000],
      ["availableTrainingMinutes", 0, 1440],
    ];
    for (const [key, min, max] of optionalNumbers) {
      const field = raw[key];
      if (field !== undefined && !isOptionalNumber(field, min, max)) return null;
    }
    if (
      (raw.bedtime !== undefined &&
        (typeof raw.bedtime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.bedtime))) ||
      (raw.wakeTime !== undefined &&
        (typeof raw.wakeTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.wakeTime))) ||
      (raw.painNotes !== undefined && typeof raw.painNotes !== "string") ||
      (raw.recoveryNotes !== undefined && typeof raw.recoveryNotes !== "string")
    ) {
      return null;
    }
    const input: RecoveryCheckInInput = {
      date: raw.date,
      source,
      energy: raw.energy,
      soreness: raw.soreness,
      stress: raw.stress,
      motivation: raw.motivation,
      sleepQuality: raw.sleepQuality,
      ...(typeof raw.sleepDurationHours === "number"
        ? { sleepDurationHours: raw.sleepDurationHours }
        : {}),
      ...(typeof raw.bedtime === "string" ? { bedtime: raw.bedtime } : {}),
      ...(typeof raw.wakeTime === "string" ? { wakeTime: raw.wakeTime } : {}),
      ...(typeof raw.restingHeartRate === "number"
        ? { restingHeartRate: raw.restingHeartRate }
        : {}),
      ...(typeof raw.hrv === "number" ? { hrv: raw.hrv } : {}),
      ...(typeof raw.painNotes === "string" ? { painNotes: raw.painNotes } : {}),
      ...(typeof raw.recoveryNotes === "string" ? { recoveryNotes: raw.recoveryNotes } : {}),
      ...(typeof raw.availableTrainingMinutes === "number"
        ? { availableTrainingMinutes: raw.availableTrainingMinutes }
        : {}),
    };
    entries.push(createRecoveryCheckIn(input, raw.id, new Date(raw.updatedAt)));
  }
  const latestByDate = new Map<string, RecoveryCheckIn>();
  for (const entry of entries) {
    const previous = latestByDate.get(entry.date);
    if (!previous || entry.updatedAt >= previous.updatedAt) latestByDate.set(entry.date, entry);
  }
  return [...latestByDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function localRecoveryDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readRecoveryCheckIns(): RecoveryCheckIn[] {
  const stored = window.localStorage.getItem(RECOVERY_CHECKINS_STORAGE_KEY);
  if (stored === null) return [];
  const parsed: unknown = JSON.parse(stored);
  const normalized = normalizeRecoveryCheckIns(parsed);
  if (!normalized) throw new Error("Saved recovery check-ins have an invalid format.");
  return normalized;
}

export function saveRecoveryCheckIn(input: RecoveryCheckInInput): RecoveryCheckIn[] {
  const existing = readRecoveryCheckIns();
  const previous = existing.find((item) => item.date === input.date);
  const updated = createRecoveryCheckIn(input, previous?.id);
  const next = [updated, ...existing.filter((item) => item.date !== input.date)].sort(
    (left, right) => right.date.localeCompare(left.date),
  );
  window.localStorage.setItem(RECOVERY_CHECKINS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(RECOVERY_CHECKINS_UPDATED_EVENT));
  return next;
}
