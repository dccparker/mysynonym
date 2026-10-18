import {
  addAssistantMessage,
  addUserMessage,
  authenticateCoachRequest,
  claimConversation,
  CoachRequestError,
  createConversation,
  listConversations,
  loadConversationMessages,
  releaseConversation,
} from "../../../lib/coach-conversations";
import { loadCoachContext } from "../../../lib/coach-context";
import { CoachModelError, generateCoachReply } from "../../../lib/coach-model";

function jsonResponse(body: object, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function errorResponse(error: unknown, conversationId?: string) {
  if (error instanceof CoachRequestError) {
    return jsonResponse(
      { error: error.message, ...(conversationId ? { conversationId } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof CoachModelError) {
    return jsonResponse(
      { error: error.message, ...(conversationId ? { conversationId } : {}) },
      { status: error.status },
    );
  }
  console.error("Coach chat request failed:", error);
  return jsonResponse(
    {
      error: "The Coach could not complete this request. Please try again.",
      ...(conversationId ? { conversationId } : {}),
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const { supabase } = await authenticateCoachRequest(request);
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (conversationId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
        throw new CoachRequestError("The conversation ID is invalid.", 400);
      }
      const messages = await loadConversationMessages(supabase, conversationId);
      return jsonResponse({ messages });
    }
    const conversations = await listConversations(supabase);
    return jsonResponse({ conversations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let conversationId: string | undefined;
  let supabase: Awaited<ReturnType<typeof authenticateCoachRequest>>["supabase"] | undefined;
  let claimed = false;
  try {
    const authenticated = await authenticateCoachRequest(request);
    supabase = authenticated.supabase;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 50_000) {
      throw new CoachRequestError("The request body is too large.", 413);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new CoachRequestError("The request body must be valid JSON.", 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new CoachRequestError("The request body is invalid.", 400);
    }
    const payload = body as Record<string, unknown>;
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    const clientMessageId =
      typeof payload.clientMessageId === "string" ? payload.clientMessageId : "";
    if (!content || content.length > 4000) {
      throw new CoachRequestError("Messages must contain 1 to 4,000 characters.", 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)) {
      throw new CoachRequestError("The message ID is invalid.", 400);
    }

    if (typeof payload.conversationId === "string") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.conversationId)) {
        throw new CoachRequestError("The conversation ID is invalid.", 400);
      }
      conversationId = payload.conversationId;
    } else {
      const title = content.replace(/\s+/g, " ").slice(0, 80);
      conversationId = (await createConversation(supabase, authenticated.userId, title)).id;
    }

    await claimConversation(supabase, conversationId);
    claimed = true;
    await addUserMessage(supabase, conversationId, clientMessageId, content);

    const transcript = await loadConversationMessages(supabase, conversationId);
    const promptMessages = transcript.slice(-30).map(({ role, content: text }) => ({
      role,
      content: text,
    }));
    const athleteContext = await loadCoachContext(
      supabase,
      authenticated.userId,
      payload.planner ?? [],
      payload.plannerToday,
    );
    const reply = await generateCoachReply(promptMessages, athleteContext);
    await addAssistantMessage(
      supabase,
      conversationId,
      reply.content,
      reply.memoryObservation,
      reply.plannerProposal,
    );
    await releaseConversation(supabase, conversationId);
    claimed = false;

    const [messages, conversations] = await Promise.all([
      loadConversationMessages(supabase, conversationId),
      listConversations(supabase),
    ]);
    return jsonResponse({ conversationId, messages, conversations });
  } catch (error) {
    if (claimed && supabase && conversationId) {
      try {
        await releaseConversation(supabase, conversationId);
      } catch (releaseError) {
        console.error("Coach conversation lock could not be released:", releaseError);
      }
    }
    return errorResponse(error, conversationId);
  }
}
