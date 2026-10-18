import {
  authenticateCoachRequest,
  CoachRequestError,
} from "../../../lib/coach-conversations";
import type {
  CoachMemoryCategory,
  CoachMemoryObservation,
  SavedCoachMemory,
} from "../../../lib/coach-chat-types";

type MemoryRow = {
  id: string;
  source_message_id: string;
  category: Exclude<CoachMemoryCategory, "temporary">;
  detail: string;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(body: object, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function responseError(error: unknown) {
  if (error instanceof CoachRequestError) {
    return jsonResponse({ error: error.message }, { status: error.status });
  }
  console.error("Coach memory request failed:", error);
  return jsonResponse(
    { error: "Coach memory could not be updated. Please try again." },
    { status: 500 },
  );
}

function toSavedMemory(row: MemoryRow): SavedCoachMemory {
  return {
    id: row.id,
    sourceMessageId: row.source_message_id,
    category: row.category,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function isMemoryObservation(value: unknown): value is CoachMemoryObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const observation = value as Record<string, unknown>;
  return (
    (observation.category === "recurring_preference" ||
      observation.category === "profile_information") &&
    typeof observation.detail === "string" &&
    observation.detail.trim().length > 0 &&
    observation.detail.trim().length <= 500
  );
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await authenticateCoachRequest(request);
    const { data, error } = await supabase
      .from("coach_memories")
      .select("id,source_message_id,category,detail,created_at")
      .eq("user_id", userId)
      .not("source_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new CoachRequestError("Saved Coach memories could not be loaded.", 500);
    return jsonResponse({ memories: (data as MemoryRow[]).map(toSavedMemory) });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await authenticateCoachRequest(request);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new CoachRequestError("The save request must be valid JSON.", 400);
    }
    if (
      !isRecord(payload) ||
      typeof payload.messageId !== "string" ||
      !uuidPattern.test(payload.messageId)
    ) {
      throw new CoachRequestError("The memory proposal is invalid.", 400);
    }

    const { data: message, error: messageError } = await supabase
      .from("coach_messages")
      .select("role,memory_observation")
      .eq("id", payload.messageId)
      .maybeSingle();
    if (messageError) throw new CoachRequestError("The memory proposal could not be loaded.", 500);
    if (
      !message ||
      message.role !== "assistant" ||
      !isMemoryObservation(message.memory_observation)
    ) {
      throw new CoachRequestError("This Coach message has no saveable memory proposal.", 400);
    }

    const observation = message.memory_observation;
    const { data, error } = await supabase
      .from("coach_memories")
      .upsert(
        {
          user_id: userId,
          category: observation.category,
          detail: observation.detail.trim(),
          source_message_id: payload.messageId,
        },
        { onConflict: "source_message_id", ignoreDuplicates: true },
      )
      .select("id,source_message_id,category,detail,created_at")
      .maybeSingle();
    if (error) throw new CoachRequestError("The Coach memory could not be saved.", 500);

    const savedMemory = data
      ? toSavedMemory(data as MemoryRow)
      : await loadExistingMemory(supabase, userId, payload.messageId);
    return jsonResponse({ memory: savedMemory });
  } catch (error) {
    return responseError(error);
  }
}

async function loadExistingMemory(
  supabase: Awaited<ReturnType<typeof authenticateCoachRequest>>["supabase"],
  userId: string,
  sourceMessageId: string,
): Promise<SavedCoachMemory> {
  const { data, error } = await supabase
    .from("coach_memories")
    .select("id,source_message_id,category,detail,created_at")
    .eq("user_id", userId)
    .eq("source_message_id", sourceMessageId)
    .single();
  if (error || !data) {
    throw new CoachRequestError("The saved Coach memory could not be verified.", 500);
  }
  return toSavedMemory(data as MemoryRow);
}

export async function DELETE(request: Request) {
  try {
    const { supabase, userId } = await authenticateCoachRequest(request);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new CoachRequestError("The delete request must be valid JSON.", 400);
    }
    if (
      !isRecord(payload) ||
      typeof payload.memoryId !== "string" ||
      !uuidPattern.test(payload.memoryId)
    ) {
      throw new CoachRequestError("The Coach memory ID is invalid.", 400);
    }
    const { data, error } = await supabase
      .from("coach_memories")
      .delete()
      .eq("id", payload.memoryId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new CoachRequestError("The Coach memory could not be removed.", 500);
    if (!data) throw new CoachRequestError("This Coach memory was not found.", 404);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return responseError(error);
  }
}
