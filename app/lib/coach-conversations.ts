import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CoachConversation, CoachMessage } from "./coach-chat-types";

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

function toMessage(row: MessageRow): CoachMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
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
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new CoachRequestError("Messages could not be loaded.", 500);
  return (data as MessageRow[]).reverse().map(toMessage);
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
): Promise<void> {
  const { error } = await supabase
    .from("coach_messages")
    .insert({ conversation_id: conversationId, role: "assistant", content });
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
