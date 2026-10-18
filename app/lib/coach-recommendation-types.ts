export const RECOMMENDATION_TYPES = [
  "missed_workout",
  "recovery_adjustment",
  "volume_reduction",
  "volume_increase",
  "schedule_conflict",
  "race_preparation",
  "injury_prevention",
  "recovery_week",
  "training_load_adjustment",
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  missed_workout: "Missed Workout",
  recovery_adjustment: "Recovery Adjustment",
  volume_reduction: "Volume Reduction",
  volume_increase: "Volume Increase",
  schedule_conflict: "Schedule Conflict",
  race_preparation: "Race Preparation",
  injury_prevention: "Injury Prevention",
  recovery_week: "Recovery Week",
  training_load_adjustment: "Training Load Adjustment",
};

export const RECOMMENDATION_CONFIDENCES = ["high", "medium", "low"] as const;
export type RecommendationConfidence = (typeof RECOMMENDATION_CONFIDENCES)[number];

export type RecommendationStatus = "pending" | "approved" | "rejected" | "expired" | "superseded";

export type RecommendationImpact = {
  weeklyVolume: string;
  recovery: string;
  fitnessProgression: string;
  goalProgression: string;
};

export const IMPACT_LABELS: Record<keyof RecommendationImpact, string> = {
  weeklyVolume: "Weekly volume",
  recovery: "Recovery",
  fitnessProgression: "Fitness progression",
  goalProgression: "Goal progression",
};

/**
 * What a recommendation changes. Only "training_plan" is applied today; the
 * other targets are reserved so new apply handlers can be added without a
 * schema change.
 */
export const RECOMMENDATION_TARGETS = [
  "training_plan",
  "workout",
  "recovery_plan",
  "nutrition_plan",
  "race_plan",
  "calendar_availability",
] as const;
export type RecommendationTarget = (typeof RECOMMENDATION_TARGETS)[number];

/** A single before/after change, generic enough for any target. */
export type RecommendationChange = {
  target: RecommendationTarget;
  entityId: string;
  summary: string;
  before: string | null;
  after: string | null;
};

export type RecommendationPlanChanges = {
  target: RecommendationTarget;
  action: unknown;
  changes: RecommendationChange[];
  appliedAt?: string;
};

export type CoachRecommendation = {
  id: string;
  userId: string;
  plannerActionId: string | null;
  recommendationType: RecommendationType;
  recommendation: string;
  reasoning: string[];
  impact: RecommendationImpact;
  confidence: RecommendationConfidence;
  status: RecommendationStatus;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  planChanges: RecommendationPlanChanges | null;
  supersededAt: string | null;
  supersededByRecommendationId: string | null;
  sourceRecommendationId: string | null;
  targetWorkoutId: string | null;
  targetWorkoutDate: string | null;
};

export function isRecommendationType(value: unknown): value is RecommendationType {
  return RECOMMENDATION_TYPES.some((type) => type === value);
}

export function isRecommendationConfidence(value: unknown): value is RecommendationConfidence {
  return RECOMMENDATION_CONFIDENCES.some((level) => level === value);
}
