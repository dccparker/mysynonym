import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CoachConversation,
  CoachMemoryObservation,
  CoachMessage,
  CoachPlannerProposal,
  SavedCoachPlannerAction,
} from "./coach-chat-types";

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  memory_observation?: CoachMemoryObservation | null;
  planner_proposal?: CoachPlannerProposal | null;
};

type PlannerActionRow = {
  id: string;
  source_message_id: string;
  action: SavedCoachPlannerAction["action"];
  rationale: string;
  assumptions: string[];
  trade_offs: string[];
  expected_effects: string[];
  before_snapshot: SavedCoachPlannerAction["beforePlan"];
  after_snapshot: SavedCoachPlannerAction["afterPlan"];
  status: SavedCoachPlannerAction["status"];
  created_at: string;
  approved_at: string | null;
  applied_at: string | null;
};

export class CoachRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CoachRequestError";
  }
}

function toConversation(row: ConversationRow): CoachConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow, memorySaved = false): CoachMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    ...(row.memory_observation
      ? { memoryObservation: row.memory_observation, memorySaved }
      : {}),
    ...(row.planner_proposal ? { plannerProposal: row.planner_proposal } : {}),
  };
}

export async function authenticateCoachRequest(request: Request): Promise<{
  supabase: SupabaseClient;
  userId: string;
}> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new CoachRequestError("Sign in to use the AI Coach.", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new CoachRequestError("Supabase is not configured for Coach conversations.", 500);
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) throw new CoachRequestError("Your session is invalid or expired. Sign in again.", 401);
  return { supabase, userId: data.user.id };
}

export async function listConversations(
  supabase: SupabaseClient,
): Promise<CoachConversation[]> {
  const { data, error } = await supabase
    .from("coach_conversations")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new CoachRequestError("Conversations could not be loaded.", 500);
  return (data as ConversationRow[]).map(toConversation);
}

export async function loadConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("id,role,content,created_at,memory_observation,planner_proposal")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new CoachRequestError("Messages could not be loaded.", 500);
  const rows = (data as MessageRow[]).reverse();
  const proposalIds = rows
    .filter((row) => row.memory_observation)
    .map((row) => row.id);
  const plannerProposalIds = rows
    .filter((row) => row.planner_proposal)
    .map((row) => row.id);
  let savedMessageIds = new Set<string>();
  if (proposalIds.length) {
    const { data: savedMemories, error: memoryError } = await supabase
      .from("coach_memories")
      .select("source_message_id")
      .in("source_message_id", proposalIds);
    if (memoryError) throw new CoachRequestError("Saved Coach memories could not be loaded.", 500);
    savedMessageIds = new Set(
      savedMemories.map((memory) => memory.source_message_id as string),
    );
  }
  let plannerActions = new Map<string, PlannerActionRow>();
  if (plannerProposalIds.length) {
    const { data: actionRows, error: actionError } = await supabase
      .from("coach_planner_actions")
      .select("id,source_message_id,action,rationale,assumptions,trade_offs,expected_effects,before_snapshot,after_snapshot,status,created_at,approved_at,applied_at")
      .in("source_message_id", plannerProposalIds);
    if (actionError) {
      throw new CoachRequestError("Planner proposals could not be loaded.", 500);
    }
    plannerActions = new Map(
      (actionRows as PlannerActionRow[]).map((action) => [
        action.source_message_id,
        action,
      ]),
    );
  }
  return rows.map((row) => {
    const message = toMessage(row, savedMessageIds.has(row.id));
    const action = plannerActions.get(row.id);
    if (!action) return message;
    message.plannerAction = {
      ...row.planner_proposal!,
      id: action.id,
      sourceMessageId: action.source_message_id,
      action: action.action,
      rationale: action.rationale,
      assumptions: action.assumptions,
      tradeOffs: action.trade_offs,
      expectedEffects: action.expected_effects,
      beforePlan: action.before_snapshot,
      afterPlan: action.after_snapshot,
      status: action.status,
      createdAt: action.created_at,
      ...(action.approved_at ? { approvedAt: action.approved_at } : {}),
      ...(action.applied_at ? { appliedAt: action.applied_at } : {}),
    };
    return message;
  });
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  title: string,
): Promise<CoachConversation> {
  const { data, error } = await supabase
    .from("coach_conversations")
    .insert({ user_id: userId, title })
    .select("id,title,created_at,updated_at")
    .single();
  if (error || !data) throw new CoachRequestError("A new conversation could not be saved.", 500);
  return toConversation(data as ConversationRow);
}

export async function claimConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const { data, error } = await supabase
    .from("coach_conversations")
    .update({ generation_started_at: new Date().toISOString() })
    .eq("id", conversationId)
    .or(`generation_started_at.is.null,generation_started_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (error) throw new CoachRequestError("The conversation could not be prepared.", 500);
  if (!data) throw new CoachRequestError("A Coach response is already being generated for this conversation.", 409);
}

export async function addUserMessage(
  supabase: SupabaseClient,
  conversationId: string,
  clientMessageId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from("coach_messages")
    .upsert(
      {
        id: clientMessageId,
        conversation_id: conversationId,
        role: "user",
        content,
      },
      { onConflict: "conversation_id,id", ignoreDuplicates: true },
    );
  if (error) throw new CoachRequestError("Your message could not be saved.", 500);
}

export async function addAssistantMessage(
  supabase: SupabaseClient,
  conversationId: string,
  content: string,
  memoryObservation: CoachMemoryObservation | null,
  plannerProposal: CoachPlannerProposal | null,
): Promise<void> {
  const { error } = await supabase
    .from("coach_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content,
      memory_observation: memoryObservation,
      planner_proposal: plannerProposal,
    });
  if (error) throw new CoachRequestError("The Coach response could not be saved.", 500);
}

export async function releaseConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("coach_conversations")
    .update({ generation_started_at: null, updated_at: updatedAt })
    .eq("id", conversationId);
  if (error) throw new CoachRequestError("The conversation state could not be saved.", 500);
}
