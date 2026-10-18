import {
  authenticateCoachRequest,
  CoachRequestError,
} from "../../../lib/coach-conversations";
import { MAX_PROPOSAL_LINES } from "../../../lib/coach-chat-types";
import {
  findAmbiguousWording,
  findAmbiguousSessionTitle,
  targetWorkoutKey,
  canApproveStatus,
} from "../../../lib/coach-recommendation-logic";
import {
  approvalMessage,
  assertRecommendationApprovable,
  RecommendationSupersededError,
  restoreSuperseded,
  supersedePendingForTarget,
  type SupersededRecords,
  approveRecommendation,
  buildTrainingPlanChanges,
  createRecommendation,
  expireRecommendation,
  recordRecommendationApplied,
  rejectRecommendation,
  REJECTION_MESSAGE,
} from "../../../lib/coach-recommendations";
import { catalogEntry, findUnsafeMedicalClaim, normalizeWorkoutStructure } from "../../../lib/workout-catalog";
import { isMissingStorageError } from "../../../lib/planner-storage-check";
import type {
  CoachPlannerAction,
  CoachPlannerActionStatus,
  CoachPlannerProposal,
  SavedCoachPlannerAction,
} from "../../../lib/coach-chat-types";
import type { PlannedActivity, PlannedSession } from "../../../lib/training-plan";

type PlannerActionRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  source_message_id: string;
  action: CoachPlannerAction;
  rationale: string;
  assumptions: string[];
  trade_offs: string[];
  expected_effects: string[];
  before_snapshot: PlannedSession[];
  after_snapshot: PlannedSession[];
  status: CoachPlannerActionStatus;
  created_at: string;
  approved_at: string | null;
  applied_at: string | null;
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const activities = ["Run", "Ride", "Swim", "Strength", "Other"] as const;
const intensities = ["Recovery", "Easy", "Moderate", "Hard", "Rest"] as const;
const statuses = ["Planned", "Completed", "Missed", "Skipped"] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(body: object, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function errorResponse(error: unknown) {
  if (error instanceof CoachRequestError) {
    return jsonResponse({ error: error.message }, { status: error.status });
  }
  console.error("Coach planner action failed:", error);
  return jsonResponse(
    { error: "The planner proposal could not be processed. Please try again." },
    { status: 500 },
  );
}

type SupabaseFailure = { code?: string; message?: string; details?: string; hint?: string };

// Logs the real Supabase error and maps it to an actionable message.
function describeDatabaseError(step: string, error: SupabaseFailure | null, fallback: string) {
  console.error(`Coach planner step "${step}" failed:`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
  switch (error?.code) {
    case "42P01":
    case "PGRST205":
      return "The planner storage is not set up yet. Apply the latest Supabase migrations and try again.";
    case "42703":
    case "PGRST204":
      return "The planner storage schema is out of date. Apply the latest Supabase migrations and try again.";
    case "42501":
      return "You do not have permission to save this planner preview. Sign in again and retry; if it persists, the proposal no longer matches the saved Coach message.";
    case "23502":
      return "The planner preview is missing required information. Ask the Coach for a fresh proposal.";
    case "23503":
      return "The Coach message for this preview could not be found. Ask the Coach for a fresh proposal.";
    case "23505":
      return "This planner preview was already saved. Refresh the conversation.";
    case "22P02":
    case "23514":
      return "The planner preview contains invalid data. Ask the Coach for a fresh proposal.";
    default:
      return fallback;
  }
}

// Recommendation history is secondary to the planner action. If its table has
// not been migrated yet, log loudly and continue so previews, approvals and
// rejections still work; any other failure is surfaced to the athlete.
async function recommendationStep(
  step: string,
  run: () => Promise<void>,
  fallback: string,
) {
  try {
    await run();
  } catch (error) {
    if (error instanceof RecommendationSupersededError) {
      throw new CoachRequestError(error.message, 409);
    }
    const failure = error as SupabaseFailure;
    if (isMissingStorageError(failure)) {
      console.error(
        `Coach recommendation history unavailable (${step}); apply migration 20261019000000_create_coach_recommendations.sql.`,
        { code: failure.code, message: failure.message },
      );
      return;
    }
    throw new CoachRequestError(describeDatabaseError(step, failure, fallback), 500);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parsePlan(value: unknown): PlannedSession[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new CoachRequestError("The planner snapshot is invalid.", 400);
  }
  const sessions = value.map((raw) => {
    if (!isRecord(raw)) throw new CoachRequestError("A planner session is invalid.", 400);
    const day = days.find((item) => item === raw.day);
    const status = statuses.find((item) => item === raw.status);
    if (
      typeof raw.id !== "string" ||
      !raw.id ||
      !day ||
      !status ||
      !validDate(raw.date) ||
      typeof raw.title !== "string" ||
      typeof raw.notes !== "string" ||
      typeof raw.reason !== "string" ||
      !Array.isArray(raw.activities) ||
      raw.activities.length === 0 ||
      raw.activities.length > 6
    ) {
      throw new CoachRequestError("A planner session is invalid.", 400);
    }
    const parsedActivities = raw.activities.map((entry) => {
      if (!isRecord(entry)) throw new CoachRequestError("A planner activity is invalid.", 400);
      const activityType = activities.find((item) => item === entry.activityType);
      const intensity = intensities.find((item) => item === entry.intensity);
      if (
        typeof entry.id !== "string" ||
        !entry.id ||
        !activityType ||
        !intensity ||
        typeof entry.durationMinutes !== "number" ||
        !Number.isFinite(entry.durationMinutes) ||
        entry.durationMinutes < 0 ||
        entry.durationMinutes > 600 ||
        typeof entry.instructions !== "string" ||
        typeof entry.purpose !== "string" ||
        (entry.distance !== undefined &&
          (typeof entry.distance !== "number" || !Number.isFinite(entry.distance)))
      ) {
        throw new CoachRequestError("A planner activity is invalid.", 400);
      }
      return entry as unknown as PlannedActivity;
    });
    return { ...raw, day, status, activities: parsedActivities } as unknown as PlannedSession;
  });
  const ids = sessions.map((session) => session.id);
  if (new Set(ids).size !== ids.length) {
    throw new CoachRequestError("Planner session IDs must be unique.", 400);
  }
  return sessions;
}

function parseProposal(value: unknown): CoachPlannerProposal {
  if (!isRecord(value) || !isRecord(value.action)) {
    throw new CoachRequestError("This Coach message has no planner proposal.", 400);
  }
  const action = value.action;
  if (
    typeof value.rationale !== "string" ||
    !value.rationale.trim() ||
    value.rationale.length > 1000 ||
    !Array.isArray(value.assumptions) ||
    !Array.isArray(value.tradeOffs) ||
    !Array.isArray(value.expectedEffects) ||
    [value.assumptions, value.tradeOffs, value.expectedEffects].some(
      (items) =>
        items.length > MAX_PROPOSAL_LINES ||
        items.some(
          (item) =>
            typeof item !== "string" ||
            !item.trim() ||
            item.length > 300,
        ),
    )
  ) {
    throw new CoachRequestError("The Coach planner proposal is invalid.", 400);
  }
  let parsedAction: CoachPlannerAction;
  if (
    action.type === "move_session" &&
    typeof action.sessionId === "string" &&
    validDate(action.targetDate)
  ) {
    parsedAction = {
      type: action.type,
      sessionId: action.sessionId,
      targetDate: action.targetDate,
    };
  } else if (
    action.type === "adjust_activity" &&
    typeof action.sessionId === "string" &&
    typeof action.activityId === "string" &&
    (action.durationMinutes === undefined ||
      (typeof action.durationMinutes === "number" &&
        Number.isFinite(action.durationMinutes))) &&
    (action.intensity === undefined ||
      intensities.some((item) => item === action.intensity)) &&
    (action.durationMinutes !== undefined || action.intensity !== undefined)
  ) {
    const intensity = intensities.find((item) => item === action.intensity);
    parsedAction = {
      type: action.type,
      sessionId: action.sessionId,
      activityId: action.activityId,
      ...(typeof action.durationMinutes === "number"
        ? { durationMinutes: action.durationMinutes }
        : {}),
      ...(intensity ? { intensity } : {}),
    };
  } else if (
    action.type === "replace_session" &&
    typeof action.sessionId === "string" &&
    typeof action.title === "string" &&
    typeof action.reason === "string" &&
    Array.isArray(action.activities) &&
    action.activities.length > 0 &&
    action.activities.length <= 6
  ) {
    const parsedActivities = action.activities.map((entry) => {
      if (
        !isRecord(entry) ||
        !activities.some((item) => item === entry.activityType) ||
        !intensities.some((item) => item === entry.intensity) ||
        typeof entry.durationMinutes !== "number" ||
        !Number.isFinite(entry.durationMinutes) ||
        entry.durationMinutes < 5 ||
        entry.durationMinutes > 600 ||
        typeof entry.instructions !== "string" ||
        entry.instructions.length > 500 ||
        typeof entry.purpose !== "string" ||
        entry.purpose.length > 500
      ) {
        throw new CoachRequestError("The proposed replacement activities are invalid.", 400);
      }
      const structure = normalizeWorkoutStructure(entry);
      return {
        id: "",
        ...structure,
        activityType: (catalogEntry(structure.workoutType)?.activityType ?? entry.activityType) as PlannedActivity["activityType"],
        intensity: entry.intensity as PlannedActivity["intensity"],
        durationMinutes: entry.durationMinutes,
        instructions: entry.instructions,
        purpose: entry.purpose,
      };
    });
    parsedAction = {
      type: action.type,
      sessionId: action.sessionId,
      title: action.title,
      reason: action.reason,
      activities: parsedActivities,
    };
  } else if (
    action.type === "regenerate_rest_of_week" &&
    validDate(action.weekStarting)
  ) {
    parsedAction = { type: action.type, weekStarting: action.weekStarting };
  } else {
    throw new CoachRequestError("The proposed planner action is not supported.", 400);
  }
  const ambiguity =
    findAmbiguousWording(parsedAction) ??
    findUnsafeMedicalClaim(value.rationale) ??
    (value.assumptions as string[]).map((line) => findUnsafeMedicalClaim(line)).find((issue) => issue !== null) ??
    null;
  if (ambiguity) {
    throw new CoachRequestError(
      `The Coach proposed an unclear workout (${ambiguity}). Ask the Coach for a specific workout.`,
      400,
    );
  }
  return {
    action: parsedAction,
    rationale: value.rationale.trim(),
    assumptions: value.assumptions as string[],
    tradeOffs: value.tradeOffs as string[],
    expectedEffects: value.expectedEffects as string[],
  };
}

function assertUnchanged(
  before: PlannedSession[],
  after: PlannedSession[],
  exceptIds: ReadonlySet<string>,
) {
  const afterById = new Map(after.map((session) => [session.id, session]));
  for (const session of before) {
    if (exceptIds.has(session.id)) continue;
    if (stableJson(session) !== stableJson(afterById.get(session.id))) {
      throw new CoachRequestError("The preview changes sessions outside the proposed action.", 400);
    }
  }
  if (before.some((session) => session.status === "Completed" &&
      stableJson(session) !== stableJson(afterById.get(session.id)))) {
    throw new CoachRequestError("Completed sessions cannot be changed.", 400);
  }
}

function assertPlanMatchesAction(
  proposal: CoachPlannerProposal,
  before: PlannedSession[],
  after: PlannedSession[],
  availableDays: string[],
  today: string,
) {
  const action = proposal.action;
  if (action.type === "regenerate_rest_of_week") {
    const start = new Date(`${action.weekStarting}T00:00:00Z`);
    if (
      !validDate(action.weekStarting) ||
      start.getUTCDay() !== 1
    ) {
      throw new CoachRequestError("The regenerated week must start on a current or future Monday.", 400);
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);
    if (weekEnd < today) {
      throw new CoachRequestError("Past weeks cannot be regenerated.", 400);
    }
    const windowStart = today > action.weekStarting ? today : action.weekStarting;
    const inWeek = (session: PlannedSession) =>
      session.date >= windowStart && session.date <= weekEnd;
    for (const session of after) {
      if (inWeek(session) && session.status !== "Completed" && session.status !== "Skipped" &&
          !availableDays.includes(session.day)) {
        throw new CoachRequestError(`${session.day} is not an available training day.`, 400);
      }
      if (!inWeek(session) && !before.some((item) => item.id === session.id)) {
        throw new CoachRequestError("Regeneration added a session outside the selected week.", 400);
      }
    }
    for (const session of before) {
      if (inWeek(session) && (session.status === "Completed" || session.status === "Skipped") &&
          stableJson(session) !== stableJson(after.find((item) => item.id === session.id))) {
        throw new CoachRequestError("Regeneration cannot change completed or skipped sessions.", 400);
      }
      if (!inWeek(session) &&
          stableJson(session) !== stableJson(after.find((item) => item.id === session.id))) {
        throw new CoachRequestError("Regeneration cannot change sessions outside the selected week.", 400);
      }
    }
    if (after.some((session) =>
      inWeek(session) &&
      !before.some((item) => item.id === session.id) &&
      (session.status === "Completed" || session.status === "Skipped")
    )) {
      throw new CoachRequestError("Regeneration cannot add completed or skipped sessions.", 400);
    }
    return;
  }

  const beforeTarget = before.find((session) => session.id === action.sessionId);
  const afterTarget = after.find((session) => session.id === action.sessionId);
  if (
    !beforeTarget ||
    !afterTarget ||
    beforeTarget.status === "Completed" ||
    beforeTarget.status === "Skipped" ||
    beforeTarget.date < today ||
    before.length !== after.length
  ) {
    throw new CoachRequestError("The target must be an existing future, editable session.", 400);
  }
  assertUnchanged(before, after, new Set([action.sessionId]));

  if (action.type === "move_session") {
    const target = new Date(`${action.targetDate}T00:00:00Z`);
    if (!validDate(action.targetDate) || action.targetDate < today) {
      throw new CoachRequestError("A session can only be moved to a valid date from today onward.", 400);
    }
    const day = days[(target.getUTCDay() + 6) % 7];
    if (afterTarget.date !== action.targetDate || afterTarget.day !== day ||
        !availableDays.includes(day)) {
      throw new CoachRequestError("The moved session must be on an available day matching its date.", 400);
    }
    const expected = {
      ...beforeTarget,
      day,
      date: action.targetDate,
      rescheduledFromDay: beforeTarget.day,
      modified: true,
      updatedAt: afterTarget.updatedAt,
    };
    if (stableJson(expected) !== stableJson(afterTarget)) {
      throw new CoachRequestError("The preview includes changes beyond the proposed move.", 400);
    }
  } else if (action.type === "adjust_activity") {
    const oldActivity = beforeTarget.activities.find((item) => item.id === action.activityId);
    const newActivity = afterTarget.activities.find((item) => item.id === action.activityId);
    if (!oldActivity || !newActivity) {
      throw new CoachRequestError("The adjusted activity no longer exists.", 400);
    }
    const expectedActivities = beforeTarget.activities.map((activity) =>
      activity.id === action.activityId
        ? {
            ...activity,
            ...(action.durationMinutes === undefined
              ? {}
              : { durationMinutes: action.durationMinutes }),
            ...(action.intensity === undefined
              ? {}
              : { intensity: action.intensity }),
          }
        : activity,
    );
    if (
      (action.durationMinutes !== undefined &&
        (action.durationMinutes < 5 || action.durationMinutes > 600)) ||
      stableJson(expectedActivities) !== stableJson(afterTarget.activities) ||
      afterTarget.title !== beforeTarget.title ||
      afterTarget.day !== beforeTarget.day ||
      afterTarget.date !== beforeTarget.date ||
      afterTarget.reason !== beforeTarget.reason ||
      afterTarget.notes !== beforeTarget.notes ||
      afterTarget.modified !== true
    ) {
      throw new CoachRequestError("The preview includes changes beyond the proposed activity adjustment.", 400);
    }
  } else {
    if (
      afterTarget.title !== action.title.trim() ||
      afterTarget.reason !== action.reason.trim() ||
      action.title.trim().length === 0 ||
      action.title.length > 120 ||
      action.reason.trim().length === 0 ||
      action.reason.length > 240 ||
      afterTarget.activities.length !== action.activities.length ||
      afterTarget.activities.some((activity, index) => {
        const proposed = action.activities[index];
        return (
          activity.activityType !== proposed.activityType ||
          activity.durationMinutes !== proposed.durationMinutes ||
          activity.intensity !== proposed.intensity ||
          activity.instructions !== proposed.instructions ||
          activity.purpose !== proposed.purpose
        );
      }) ||
      afterTarget.day !== beforeTarget.day ||
      afterTarget.date !== beforeTarget.date ||
      afterTarget.status !== beforeTarget.status ||
      afterTarget.modified !== true
    ) {
      throw new CoachRequestError("The preview includes changes beyond the proposed replacement.", 400);
    }
  }
}

function toAction(row: PlannerActionRow): SavedCoachPlannerAction {
  return {
    action: row.action,
    rationale: row.rationale,
    assumptions: row.assumptions,
    tradeOffs: row.trade_offs,
    expectedEffects: row.expected_effects,
    id: row.id,
    sourceMessageId: row.source_message_id,
    status: row.status,
    beforePlan: row.before_snapshot,
    afterPlan: row.after_snapshot,
    createdAt: row.created_at,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.applied_at ? { appliedAt: row.applied_at } : {}),
  };
}

async function loadAction(
  supabase: Awaited<ReturnType<typeof authenticateCoachRequest>>["supabase"],
  userId: string,
  actionId: string,
): Promise<PlannerActionRow> {
  const { data, error } = await supabase
    .from("coach_planner_actions")
    .select("id,user_id,conversation_id,source_message_id,action,rationale,assumptions,trade_offs,expected_effects,before_snapshot,after_snapshot,status,created_at,approved_at,applied_at")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new CoachRequestError(
      describeDatabaseError("load coach_planner_actions", error, "The planner proposal could not be loaded."),
      500,
    );
  }
  if (!data) throw new CoachRequestError("This planner proposal was not found.", 404);
  return data as PlannerActionRow;
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 1_000_000) {
    throw new CoachRequestError("The planner proposal is too large.", 413);
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new CoachRequestError("The planner request must be valid JSON.", 400);
  }
  if (!isRecord(payload)) throw new CoachRequestError("The planner request is invalid.", 400);
  return payload;
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await authenticateCoachRequest(request);
    const payload = await readPayload(request);
    if (payload.operation === "create") {
      if (
        typeof payload.sourceMessageId !== "string" ||
        !uuidPattern.test(payload.sourceMessageId) ||
        !validDate(payload.today)
      ) {
        throw new CoachRequestError("The planner proposal request is invalid.", 400);
      }
      const { data: message, error: messageError } = await supabase
        .from("coach_messages")
        .select("role,content,conversation_id,created_at,planner_proposal")
        .eq("id", payload.sourceMessageId)
        .maybeSingle();
      if (messageError) {
        throw new CoachRequestError(
          describeDatabaseError("load coach_messages", messageError, "The Coach proposal could not be loaded."),
          500,
        );
      }
      if (!message || message.role !== "assistant") {
        throw new CoachRequestError("This Coach message cannot propose a planner action.", 400);
      }
      const proposal = parseProposal(message.planner_proposal);
      const storedProposal = message.planner_proposal as CoachPlannerProposal;
      const beforePlan = parsePlan(payload.beforePlan);
      const afterPlan = parsePlan(payload.afterPlan);
      assertPlanMatchesAction(
        proposal,
        beforePlan,
        afterPlan,
        (() => {
          if (!isRecord(payload.profile) || !Array.isArray(payload.profile.availableTrainingDays)) {
            throw new CoachRequestError("Athlete availability is required to validate this change.", 400);
          }
          return payload.profile.availableTrainingDays.filter(
            (day): day is string => typeof day === "string" && days.some((item) => item === day),
          );
        })(),
        payload.today,
      );
      const { data: existing, error: existingError } = await supabase
        .from("coach_planner_actions")
        .select("id,user_id,conversation_id,source_message_id,action,rationale,assumptions,trade_offs,expected_effects,before_snapshot,after_snapshot,status,created_at,approved_at,applied_at")
        .eq("source_message_id", payload.sourceMessageId)
        .maybeSingle();
      if (existingError) {
        throw new CoachRequestError(
          describeDatabaseError("load existing planner action", existingError, "Planner proposal state could not be loaded."),
          500,
        );
      }
      if (existing) {
        const row = existing as PlannerActionRow;
        if (row.status === "pending" && stableJson(row.before_snapshot) === stableJson(beforePlan)) {
          await recommendationStep("save coach_recommendations", () => createRecommendation(supabase, {
              userId,
              plannerActionId: row.id,
              proposal,
              coachMessage: typeof message.content === "string" ? message.content : "",
              beforePlan,
              afterPlan: row.after_snapshot,
          }), "The recommendation could not be saved.");
          return jsonResponse({ action: toAction(row) });
        }
        throw new CoachRequestError("This Coach proposal has already been reviewed or its plan has changed.", 409);
      }
      // A newer proposal for the same workout replaces this one.
      const { data: newer, error: newerError } = await supabase
        .from("coach_messages")
        .select("id,planner_proposal")
        .eq("conversation_id", message.conversation_id)
        .eq("role", "assistant")
        .gt("created_at", message.created_at)
        .not("planner_proposal", "is", null);
      if (newerError) {
        throw new CoachRequestError(
          describeDatabaseError("load newer proposals", newerError, "Newer Coach proposals could not be checked."),
          500,
        );
      }
      const thisTarget = targetWorkoutKey(proposal.action);
      const replacedByNewer = (newer ?? []).some((row) => {
        const candidate = (row as { planner_proposal: { action?: CoachPlannerAction } }).planner_proposal;
        return candidate?.action ? targetWorkoutKey(candidate.action) === thisTarget : false;
      });
      if (replacedByNewer) {
        throw new CoachRequestError(
          "This recommendation was replaced by a newer one and can no longer be approved.",
          409,
        );
      }

      let superseded: SupersededRecords = { plannerActionIds: [], recommendationIds: [] };
      try {
        superseded = await supersedePendingForTarget(supabase, userId, proposal.action);
      } catch (supersedeError) {
        throw new CoachRequestError(
          describeDatabaseError(
            "supersede earlier recommendation",
            supersedeError as SupabaseFailure,
            "The earlier recommendation could not be replaced. Apply the latest Supabase migrations and try again.",
          ),
          500,
        );
      }
      try {
        const { data, error } = await supabase
          .from("coach_planner_actions")
          .insert({
            user_id: userId,
            conversation_id: message.conversation_id,
            source_message_id: payload.sourceMessageId,
            // Must equal coach_messages.planner_proposal exactly for the RLS check.
            action: storedProposal.action,
            rationale: storedProposal.rationale,
            assumptions: storedProposal.assumptions,
            trade_offs: storedProposal.tradeOffs,
            expected_effects: storedProposal.expectedEffects,
            before_snapshot: beforePlan,
            after_snapshot: afterPlan,
            status: "pending",
          })
          .select("id,user_id,conversation_id,source_message_id,action,rationale,assumptions,trade_offs,expected_effects,before_snapshot,after_snapshot,status,created_at,approved_at,applied_at")
          .single();
        if (error || !data) {
          throw new CoachRequestError(
            describeDatabaseError("insert coach_planner_actions", error, "The planner preview could not be saved."),
            500,
          );
        }
        await recommendationStep("save coach_recommendations", () => createRecommendation(supabase, {
            superseded,
            userId,
            plannerActionId: (data as PlannerActionRow).id,
            proposal,
            coachMessage: typeof message.content === "string" ? message.content : "",
            beforePlan,
            afterPlan,
          }), "The recommendation could not be saved.");
        return jsonResponse({ action: toAction(data as PlannerActionRow) });
      } catch (saveError) {
        await restoreSuperseded(supabase, userId, superseded).catch((restoreError) =>
          console.error("Superseded recommendations could not be restored:", restoreError),
        );
        throw saveError;
      }
    }

    if (
      typeof payload.actionId !== "string" ||
      !uuidPattern.test(payload.actionId)
    ) {
      throw new CoachRequestError("The planner action ID is invalid.", 400);
    }
    const row = await loadAction(supabase, userId, payload.actionId);
    if (payload.operation === "approve") {
      if (row.status === "superseded") {
        const verdict = canApproveStatus(row.status);
        throw new CoachRequestError(verdict.ok ? "" : verdict.reason, 409);
      }
      const currentPlan = parsePlan(payload.currentPlan);
      if (stableJson(currentPlan) !== stableJson(row.before_snapshot)) {
        if (row.status === "pending") {
          await supabase
            .from("coach_planner_actions")
            .update({ status: "stale" })
            .eq("id", row.id)
            .eq("user_id", userId)
            .eq("status", "pending");
          await expireRecommendation(supabase, userId, row.id).catch((expireError) =>
            console.error("Coach recommendation could not be expired:", expireError),
          );
        }
        throw new CoachRequestError("The planner changed since this preview. Ask the Coach to prepare a fresh proposal.", 409);
      }
      if (row.status === "applied") {
        throw new CoachRequestError("This planner action has already been applied.", 409);
      }
      if (row.status === "stale" || row.status === "rejected") {
        throw new CoachRequestError("This planner proposal is no longer available.", 409);
      }
      const ambiguity =
        findAmbiguousWording(row.action) ??
        (row.action.type === "replace_session"
          ? findAmbiguousSessionTitle(
              row.after_snapshot.find((session) => session.id === (row.action as { sessionId: string }).sessionId)?.title ?? "",
            )
          : null);
      if (ambiguity) {
        throw new CoachRequestError(
          `This recommendation is not specific enough to apply (${ambiguity}). Ask the Coach for a specific workout.`,
          409,
        );
      }
      await recommendationStep(
        "check coach_recommendations",
        () => assertRecommendationApprovable(supabase, userId, row.id),
        "The recommendation state could not be checked. Please try again.",
      );
      if (row.status === "pending") {
        const { data, error } = await supabase
          .from("coach_planner_actions")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", userId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (error) throw new CoachRequestError(describeDatabaseError("approve update", error, "The planner approval could not be recorded."), 500);
        if (!data) throw new CoachRequestError("This planner proposal has already been processed.", 409);
      }
      const planChanges = buildTrainingPlanChanges(
        row.action,
        row.before_snapshot,
        row.after_snapshot,
      );
      await recommendationStep(
        "approve coach_recommendations",
        () => approveRecommendation(supabase, userId, row.id, planChanges),
        "The recommendation approval could not be saved. Please try again.",
      );
      return jsonResponse({
        afterPlan: row.after_snapshot,
        status: "approved",
        message: approvalMessage(planChanges),
      });
    }
    if (payload.operation === "applied") {
      const currentPlan = parsePlan(payload.currentPlan);
      if (stableJson(currentPlan) !== stableJson(row.after_snapshot)) {
        throw new CoachRequestError("The saved planner does not match the approved preview.", 409);
      }
      if (row.status === "applied") return jsonResponse({ status: row.status });
      if (row.status !== "approved") {
        throw new CoachRequestError("Approve this planner proposal before applying it.", 409);
      }
      const { data, error } = await supabase
        .from("coach_planner_actions")
        .update({ status: "applied", applied_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId)
        .eq("status", "approved")
        .select("id")
        .maybeSingle();
      if (error) throw new CoachRequestError(describeDatabaseError("applied update", error, "The planner update could not be recorded."), 500);
      if (!data) throw new CoachRequestError("This planner proposal has already been processed.", 409);
      await recordRecommendationApplied(
        supabase,
        userId,
        row.id,
        buildTrainingPlanChanges(
          row.action,
          row.before_snapshot,
          row.after_snapshot,
          new Date().toISOString(),
        ),
      ).catch((appliedError) =>
        console.error("Coach recommendation applied state could not be saved:", appliedError),
      );
      return jsonResponse({ status: "applied" });
    }
    if (payload.operation === "reject") {
      if (row.status !== "pending") {
        throw new CoachRequestError(
          row.status === "superseded"
            ? "This recommendation was replaced by a newer one."
            : "Only pending planner proposals can be rejected.",
          409,
        );
      }
      await recommendationStep(
        "reject coach_recommendations",
        () => rejectRecommendation(supabase, userId, row.id),
        "The rejection could not be fully saved. Please try again.",
      );
      const { data, error } = await supabase
        .from("coach_planner_actions")
        .update({ status: "rejected" })
        .eq("id", row.id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw new CoachRequestError(describeDatabaseError("reject update", error, "The planner proposal could not be dismissed."), 500);
      if (!data) throw new CoachRequestError("This planner proposal has already been processed.", 409);
      return jsonResponse({ status: "rejected", message: REJECTION_MESSAGE });
    }
    throw new CoachRequestError("The planner action operation is not supported.", 400);
  } catch (error) {
    return errorResponse(error);
  }
}
