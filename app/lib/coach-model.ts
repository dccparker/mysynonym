type ModelMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAIChatCompletion = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class CoachModelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CoachModelError";
  }
}

export async function generateCoachReply(messages: ModelMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    throw new CoachModelError(
      "Coach AI is not configured. Add OPENAI_API_KEY and OPENAI_MODEL to the server environment.",
      503,
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are MySynonym's conversational fitness coach. Be helpful, natural, concise, and ask a focused follow-up question when needed. In this version you have no access to the user's profile, workout history, recovery data, or training plan, and cannot make or save app changes. Do not claim otherwise. Give general fitness information, avoid medical diagnosis, and recommend professional care for pain, injury, or medical concerns.",
        },
        ...messages,
      ],
      max_completion_tokens: 800,
    }),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });

  const result: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CoachModelError("The Coach could not authenticate with the AI provider. Check the server API key.", 502);
    }
    if (response.status === 429) {
      throw new CoachModelError("The Coach is temporarily rate-limited. Please try again shortly.", 429);
    }
    throw new CoachModelError(`The AI provider could not complete the response (HTTP ${response.status}).`, 502);
  }

  if (
    typeof result !== "object" ||
    result === null ||
    !("choices" in result) ||
    !Array.isArray(result.choices)
  ) {
    throw new Error("The AI provider returned an invalid response.");
  }
  const content = (result as OpenAIChatCompletion).choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The AI provider returned an empty response.");
  }
  return content.trim();
}
