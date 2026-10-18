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

// Extra proposal detail is stored as prefixed lines in the existing
// rationale/assumptions columns, so no schema change is required.
export const PROPOSAL_DETAIL_PREFIXES = {
  evidence: "Evidence: ",
  uncertainty: "Uncertainty: ",
  alternative: "Alternative considered: ",
} as const;

export function splitProposalDetails(proposal: CoachPlannerProposal) {
  const details = {
    why: proposal.rationale
      .split("\n")
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3),
    evidence: [] as string[],
    assumptions: [] as string[],
    uncertainty: [] as string[],
    alternatives: [] as string[],
    tradeOffs: proposal.tradeOffs,
    expectedEffects: proposal.expectedEffects,
  };
  for (const line of proposal.assumptions) {
    if (line.startsWith(PROPOSAL_DETAIL_PREFIXES.evidence)) {
      details.evidence.push(line.slice(PROPOSAL_DETAIL_PREFIXES.evidence.length));
    } else if (line.startsWith(PROPOSAL_DETAIL_PREFIXES.uncertainty)) {
      details.uncertainty.push(line.slice(PROPOSAL_DETAIL_PREFIXES.uncertainty.length));
    } else if (line.startsWith(PROPOSAL_DETAIL_PREFIXES.alternative)) {
      details.alternatives.push(line.slice(PROPOSAL_DETAIL_PREFIXES.alternative.length));
    } else {
      details.assumptions.push(line);
    }
  }
  return details;
}
