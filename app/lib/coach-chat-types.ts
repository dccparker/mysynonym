import type {
  PlannedActivity,
  PlannedIntensity,
  PlannedSession,
} from "./training-plan";

export type CoachConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  memoryObservation?: CoachMemoryObservation | null;
  memorySaved?: boolean;
  plannerProposal?: CoachPlannerProposal | null;
  plannerAction?: SavedCoachPlannerAction | null;
};

export type CoachMemoryCategory =
  | "temporary"
  | "recurring_preference"
  | "profile_information";

export type CoachMemoryObservation = {
  category: CoachMemoryCategory;
  detail: string;
};

export type SavedCoachMemory = {
  id: string;
  sourceMessageId: string;
  category: Exclude<CoachMemoryCategory, "temporary">;
  detail: string;
  createdAt: string;
};

export type CoachPlannerAction =
  | { type: "move_session"; sessionId: string; targetDate: string }
  | {
      type: "adjust_activity";
      sessionId: string;
      activityId: string;
      durationMinutes?: number;
      intensity?: PlannedIntensity;
    }
  | {
      type: "replace_session";
      sessionId: string;
      title: string;
      reason: string;
      activities: Omit<PlannedActivity, "id">[];
    }
  | { type: "regenerate_rest_of_week"; weekStarting: string };

export type CoachPlannerProposal = {
  action: CoachPlannerAction;
  rationale: string;
  assumptions: string[];
  tradeOffs: string[];
  expectedEffects: string[];
};

export type CoachPlannerActionStatus =
  | "pending"
  | "approved"
  | "applied"
  | "stale"
  | "rejected";

export type SavedCoachPlannerAction = CoachPlannerProposal & {
  id: string;
  sourceMessageId: string;
  status: CoachPlannerActionStatus;
  beforePlan: PlannedSession[];
  afterPlan: PlannedSession[];
  createdAt: string;
  approvedAt?: string;
  appliedAt?: string;
};
