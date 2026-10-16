"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, MessageCircle, Plus, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { CoachConversation, CoachMessage } from "../lib/coach-chat-types";

type ApiResponse<T> = T & { error?: string };

class CoachApiError extends Error {
  constructor(message: string, readonly conversationId?: string) {
    super(message);
    this.name = "CoachApiError";
  }
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
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
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
      setMessages([]);
      setSelectedConversationId("");
      setError("");
      if (token) void loadConversations(token);
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
  }, [loadConversations]);

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
                Start a conversation or continue a previous one. Chat is not connected to your profile or training data yet.
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
                      <p
                        className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                          message.role === "user"
                            ? "rounded-br-md bg-[#b8f36b] text-[#182014]"
                            : "rounded-bl-md border border-white/[0.07] bg-[#171f1a] text-[#d6ded8]"
                        }`}
                      >
                        {message.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="mx-auto mt-10 max-w-md text-center">
                    <p className="text-sm font-medium text-[#d6ded8]">What would you like to talk about?</p>
                    <p className="mt-2 text-xs leading-relaxed text-[#8c9990]">
                      This first version supports general conversation. It does not read your athlete profile, workout history, recovery data, or plan.
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
