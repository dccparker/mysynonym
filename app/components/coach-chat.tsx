"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import type {
  CoachConversation,
  CoachMessage,
  SavedCoachMemory,
} from "../lib/coach-chat-types";
import {
  localDateString,
  normalizeTrainingPlan,
  TRAINING_PLAN_STORAGE_KEY,
} from "../lib/training-plan";

type ApiResponse<T> = T & { error?: string };

class CoachApiError extends Error {
  constructor(message: string, readonly conversationId?: string) {
    super(message);
    this.name = "CoachApiError";
  }
}

function readCurrentPlanner() {
  const storedPlan = window.localStorage.getItem(TRAINING_PLAN_STORAGE_KEY);
  if (storedPlan === null) return [];
  let parsedPlan: unknown;
  try {
    parsedPlan = JSON.parse(storedPlan);
  } catch {
    throw new Error("Your current planner could not be read. Review or refresh your training plan and try again.");
  }
  const planner = normalizeTrainingPlan(parsedPlan);
  if (!planner) {
    throw new Error("Your current planner has an invalid format. Review or refresh your training plan and try again.");
  }
  return planner;
}

async function requestCoach<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result)
  ) {
    throw new Error("The Coach returned an invalid response.");
  }
  const payload = result as ApiResponse<T>;
  if (!response.ok) {
    throw new CoachApiError(
      payload.error || "The Coach request failed.",
      "conversationId" in payload && typeof payload.conversationId === "string"
        ? payload.conversationId
        : undefined,
    );
  }
  return payload;
}

export function CoachChat() {
  const [accessToken, setAccessToken] = useState("");
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [memories, setMemories] = useState<SavedCoachMemory[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [memoryActionId, setMemoryActionId] = useState("");
  const [error, setError] = useState("");
  const pendingSend = useRef(false);
  const pendingMessageId = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeToken = useRef("");
  const activeConversation = useRef("");
  const messageRequestId = useRef(0);

  const loadConversations = useCallback(async (token: string) => {
    try {
      const result = await requestCoach<{ conversations: CoachConversation[] }>(
        token,
        "/api/coach/chat",
      );
      if (activeToken.current !== token) return;
      setConversations(result.conversations);
      setError("");
    } catch (loadError) {
      if (activeToken.current !== token) return;
      setError(loadError instanceof Error ? loadError.message : "Conversations could not be loaded.");
    }
  }, []);

  const loadMemories = useCallback(async (token: string) => {
    try {
      const result = await requestCoach<{ memories: SavedCoachMemory[] }>(
        token,
        "/api/coach/memory",
      );
      if (activeToken.current !== token) return;
      setMemories(result.memories);
    } catch (loadError) {
      if (activeToken.current !== token) return;
      setError(loadError instanceof Error ? loadError.message : "Saved Coach memories could not be loaded.");
    }
  }, []);

  const loadMessages = useCallback(async (token: string, conversationId: string) => {
    const requestId = ++messageRequestId.current;
    activeConversation.current = conversationId;
    setIsLoading(true);
    setMessages([]);
    setError("");
    try {
      const result = await requestCoach<{ messages: CoachMessage[] }>(
        token,
        `/api/coach/chat?conversationId=${encodeURIComponent(conversationId)}`,
      );
      if (
        activeToken.current !== token ||
        activeConversation.current !== conversationId ||
        messageRequestId.current !== requestId
      ) return;
      setMessages(result.messages);
    } catch (loadError) {
      if (
        activeToken.current !== token ||
        activeConversation.current !== conversationId ||
        messageRequestId.current !== requestId
      ) return;
      setError(loadError instanceof Error ? loadError.message : "This conversation could not be loaded.");
    } finally {
      if (messageRequestId.current === requestId) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const updateSession = (token: string) => {
      if (!active) return;
      activeToken.current = token;
      activeConversation.current = "";
      messageRequestId.current += 1;
      setAccessToken(token);
      setIsAuthLoaded(true);
      setIsLoading(false);
      setIsSending(false);
      pendingSend.current = false;
      pendingMessageId.current = "";
      setConversations([]);
      setMemories([]);
      setMessages([]);
      setSelectedConversationId("");
      setError("");
      if (token) {
        void loadConversations(token);
        void loadMemories(token);
      }
    };

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      updateSession(data.session?.access_token ?? "");
      if (sessionError) {
        setError("Your sign-in status could not be checked. Please refresh and try again.");
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      updateSession(session?.access_token ?? "");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [loadConversations, loadMemories]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!accessToken || !content || pendingSend.current) return;

    pendingSend.current = true;
    setIsSending(true);
    setError("");
    if (!pendingMessageId.current) pendingMessageId.current = window.crypto.randomUUID();
    const clientMessageId = pendingMessageId.current;
    try {
      const planner = readCurrentPlanner();
      const result = await requestCoach<{
        conversationId: string;
        conversations: CoachConversation[];
        messages: CoachMessage[];
      }>(accessToken, "/api/coach/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: selectedConversationId || undefined,
          clientMessageId,
          content,
          planner,
          plannerToday: localDateString(new Date()),
        }),
      });
        if (activeToken.current !== accessToken) return;
        activeConversation.current = result.conversationId;
        messageRequestId.current += 1;
        setSelectedConversationId(result.conversationId);
      setConversations(result.conversations);
      setMessages(result.messages);
      setDraft("");
      pendingMessageId.current = "";
    } catch (sendError) {
      if (activeToken.current !== accessToken) return;
      if (sendError instanceof CoachApiError && sendError.conversationId) {
        activeConversation.current = sendError.conversationId;
        setSelectedConversationId(sendError.conversationId);
      }
      setError(sendError instanceof Error ? sendError.message : "The Coach could not respond.");
      await loadConversations(accessToken);
    } finally {
      pendingSend.current = false;
      setIsSending(false);
    }
  }

  async function saveMemory(messageId: string) {
    if (!accessToken || memoryActionId) return;
    setMemoryActionId(messageId);
    setError("");
    try {
      const result = await requestCoach<{ memory: SavedCoachMemory }>(
        accessToken,
        "/api/coach/memory",
        {
          method: "POST",
          body: JSON.stringify({ messageId }),
        },
      );
      if (activeToken.current !== accessToken) return;
      setMemories((current) => [
        result.memory,
        ...current.filter((memory) => memory.id !== result.memory.id),
      ]);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, memorySaved: true } : message,
        ),
      );
    } catch (saveError) {
      if (activeToken.current !== accessToken) return;
      setError(saveError instanceof Error ? saveError.message : "The Coach memory could not be saved.");
    } finally {
      setMemoryActionId("");
    }
  }

  async function removeMemory(memory: SavedCoachMemory) {
    if (!accessToken || memoryActionId) return;
    setMemoryActionId(memory.id);
    setError("");
    try {
      await requestCoach<{ deleted: boolean }>(
        accessToken,
        "/api/coach/memory",
        {
          method: "DELETE",
          body: JSON.stringify({ memoryId: memory.id }),
        },
      );
      if (activeToken.current !== accessToken) return;
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setMessages((current) =>
        current.map((message) =>
          message.id === memory.sourceMessageId
            ? { ...message, memorySaved: false }
            : message,
        ),
      );
    } catch (removeError) {
      if (activeToken.current !== accessToken) return;
      setError(removeError instanceof Error ? removeError.message : "The Coach memory could not be removed.");
    } finally {
      setMemoryActionId("");
    }
  }

  function startConversation() {
    if (isSending) return;
    activeConversation.current = "";
    messageRequestId.current += 1;
    setSelectedConversationId("");
    setIsLoading(false);
    setMessages([]);
    setDraft("");
    setError("");
    pendingMessageId.current = "";
  }

  function selectConversation(conversationId: string) {
    if (isSending || !accessToken) return;
    activeConversation.current = conversationId;
    setSelectedConversationId(conversationId);
    void loadMessages(accessToken, conversationId);
  }

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  return (
    <section
      aria-labelledby="coach-chat-heading"
      className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8"
    >
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111714]">
        <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#b8f36b]/10 text-[#b8f36b]">
              <MessageCircle aria-hidden="true" size={19} />
            </div>
            <div>
              <h2 id="coach-chat-heading" className="text-base font-semibold text-[#e5ebe6]">
                Talk with your AI Coach
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#9ba79f]">
                Get advice informed by your athlete profile, training and recovery history, and current plan. This data is shared with the AI provider to answer you; the Coach cannot edit your plan.
              </p>
            </div>
          </div>
        </div>

        {!isAuthLoaded ? (
          <div className="grid min-h-64 place-items-center text-sm text-[#9ba79f]">
            <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} /> Checking sign-in…</span>
          </div>
        ) : !accessToken ? (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-[#c2cdc5]">Sign in to start and save a private Coach conversation.</p>
              <Link className="mt-4 inline-flex rounded-lg bg-[#b8f36b] px-4 py-2 text-sm font-semibold text-[#182014]" href="/login">
                Sign in
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[32rem] flex-col sm:flex-row">
            <aside className="border-b border-white/[0.07] p-3 sm:w-60 sm:shrink-0 sm:border-b-0 sm:border-r">
              <button
                type="button"
                onClick={startConversation}
                disabled={isSending}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#b8f36b]/25 bg-[#b8f36b]/[0.08] px-3 text-sm font-medium text-[#c7f59a] transition hover:bg-[#b8f36b]/[0.14] disabled:opacity-50"
              >
                <Plus aria-hidden="true" size={16} />
                New conversation
              </button>
              <div aria-label="Saved conversations" className="mt-3 flex max-h-32 gap-2 overflow-x-auto sm:max-h-[27rem] sm:flex-col sm:overflow-y-auto">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                      onClick={() => selectConversation(conversation.id)}
                    disabled={isSending}
                    aria-current={conversation.id === selectedConversationId ? "true" : undefined}
                    className={`min-w-44 rounded-lg px-3 py-2 text-left text-xs transition sm:min-w-0 ${
                      conversation.id === selectedConversationId
                        ? "bg-white/[0.08] text-[#e5ebe6]"
                        : "text-[#9ba79f] hover:bg-white/[0.04] hover:text-[#e5ebe6]"
                    }`}
                  >
                    <span className="block truncate">{conversation.title}</span>
                    <span className="mt-1 block text-[10px] text-[#68756c]">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
                {!conversations.length && (
                  <p className="px-2 py-3 text-xs text-[#77837a]">No saved conversations yet.</p>
                )}
              </div>
              <section aria-labelledby="coach-memories-heading" className="mt-5 border-t border-white/[0.07] pt-4">
                <h3 id="coach-memories-heading" className="px-2 text-xs font-semibold text-[#d6ded8]">
                  Coach memory
                </h3>
                <p className="px-2 pt-1 text-[10px] leading-relaxed text-[#77837a]">
                  Only details you explicitly save are used in future coaching.
                </p>
                {memories.length ? (
                  <ul className="mt-2 space-y-2">
                    {memories.map((memory) => (
                      <li key={memory.id} className="rounded-lg bg-white/[0.04] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[9px] font-medium uppercase tracking-wide text-[#9ba79f]">
                            {memory.category === "recurring_preference" ? "Preference" : "Profile detail"}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove saved memory: ${memory.detail}`}
                            disabled={Boolean(memoryActionId)}
                            onClick={() => void removeMemory(memory)}
                            className="shrink-0 rounded p-0.5 text-[#87938b] hover:text-red-300 disabled:opacity-50"
                          >
                            {memoryActionId === memory.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={12} />
                              : <Trash2 aria-hidden="true" size={12} />}
                          </button>
                        </div>
                        <p className="mt-1 break-words text-[11px] leading-relaxed text-[#c2cdc5]">
                          {memory.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-2 text-[10px] text-[#77837a]">No saved Coach memories.</p>
                )}
              </section>
            </aside>

            <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col">
              <div className="border-b border-white/[0.06] px-4 py-3 text-xs text-[#9ba79f] sm:px-5">
                {selectedConversation?.title ?? "New conversation"}
              </div>
              <div
                aria-live="polite"
                aria-relevant="additions text"
                className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5"
              >
                {isLoading ? (
                  <p className="flex items-center gap-2 text-sm text-[#9ba79f]"><LoaderCircle className="animate-spin" size={15} /> Loading conversation…</p>
                ) : messages.length ? (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[90%] sm:max-w-[80%]">
                        <p
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            message.role === "user"
                              ? "rounded-br-md bg-[#b8f36b] text-[#182014]"
                              : "rounded-bl-md border border-white/[0.07] bg-[#171f1a] text-[#d6ded8]"
                          }`}
                        >
                          {message.content}
                        </p>
                        {message.role === "assistant" && message.memoryObservation && (
                          <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#0b100e] p-3 text-xs">
                            {message.memoryObservation.category === "temporary" ? (
                              <>
                                <p className="font-semibold text-[#a6b1a9]">Temporary information · not saved as Coach memory</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-[#c2cdc5]">
                                  {message.memoryObservation.detail}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-[#d6ded8]">
                                  {message.memorySaved
                                    ? "Saved to Coach memory"
                                    : "Would you like me to save this to your profile?"}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-[#a6b1a9]">
                                  {message.memoryObservation.detail}
                                </p>
                                {!message.memorySaved && (
                                  <>
                                    <p className="mt-2 text-[10px] leading-relaxed text-[#77837a]">
                                      This saves the exact detail as Coach memory for future conversations. It will not change your athlete profile fields.
                                    </p>
                                    <button
                                      type="button"
                                      disabled={Boolean(memoryActionId)}
                                      onClick={() => void saveMemory(message.id)}
                                      className="mt-3 rounded-lg bg-[#b8f36b] px-3 py-2 text-xs font-semibold text-[#182014] disabled:opacity-50"
                                    >
                                      {memoryActionId === message.id
                                        ? "Saving…"
                                        : "Save this detail"}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="mx-auto mt-10 max-w-md text-center">
                    <p className="text-sm font-medium text-[#d6ded8]">What would you like to talk about?</p>
                    <p className="mt-2 text-xs leading-relaxed text-[#8c9990]">
                      Ask about your profile, progress, today&apos;s training, workout difficulty, or recovery trends.
                    </p>
                  </div>
                )}
                {isSending && (
                  <p className="flex items-center gap-2 text-xs text-[#9ba79f]">
                    <LoaderCircle aria-hidden="true" className="animate-spin text-[#b8f36b]" size={15} />
                    Coach is responding…
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {error && (
                <p role="alert" className="mx-4 mb-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200 sm:mx-5">
                  {error}
                </p>
              )}
              <form onSubmit={sendMessage} className="border-t border-white/[0.07] p-3 sm:p-4">
                <label htmlFor="coach-chat-input" className="sr-only">Message your Coach</label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="coach-chat-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    disabled={isSending}
                    maxLength={4000}
                    rows={2}
                    placeholder="Write a message…"
                    className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-white/[0.09] bg-[#0b100e] px-3 py-3 text-sm text-[#e5ebe6] outline-none placeholder:text-[#647168] focus:border-[#b8f36b]/40 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    aria-label={isSending ? "Waiting for Coach response" : "Send message"}
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#b8f36b] text-[#182014] transition hover:bg-[#c8fa82] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <Send aria-hidden="true" size={17} />}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-[#68756c]">Enter to send · Shift+Enter for a new line · 4,000 character limit</p>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
