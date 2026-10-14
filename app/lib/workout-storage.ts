export const WORKOUT_STORAGE_KEY = "mysynonym-workouts";
export const WORKOUTS_UPDATED_EVENT = "mysynonym-workouts-updated";
export const TRAINING_PLAN_STORAGE_KEY = "mysynonym-weekly-training-plan";
export const TRAINING_PLAN_UPDATED_EVENT = "mysynonym-weekly-training-plan-updated";

export function notifyWorkoutHistoryUpdated(): void {
  window.dispatchEvent(new Event(WORKOUTS_UPDATED_EVENT));
}

export function notifyTrainingPlanUpdated(): void {
  window.dispatchEvent(new Event(TRAINING_PLAN_UPDATED_EVENT));
}
