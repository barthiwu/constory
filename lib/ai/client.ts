import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Lazily-constructed, server-only OpenAI client. Never import this file from
 * a Client Component — the API key must never reach the browser bundle.
 */
export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIConfigError("OPENAI_API_KEY is not configured on the server.");
  }

  _client = new OpenAI({ apiKey });
  return _client;
}

/** Fast, inexpensive model for high-volume generation: topics, hooks, hashtags, ideas. */
export const AI_MODEL_FAST = "gpt-4o-mini";

/** Stronger model reserved for the highest-stakes generation: overall content strategy. */
export const AI_MODEL_STRATEGY = "gpt-4o";

export class AIConfigError extends Error {}

/**
 * Raised whenever a generation cannot be completed. `userMessage` is safe to
 * show directly in the UI; `cause` carries the underlying error for logging
 * only (into ai_generations.error_message), never for display.
 */
export class AIGenerationError extends Error {
  userMessage: string;
  retryable: boolean;

  constructor(userMessage: string, options?: { cause?: unknown; retryable?: boolean }) {
    super(userMessage);
    this.name = "AIGenerationError";
    this.userMessage = userMessage;
    this.retryable = options?.retryable ?? true;
    if (options?.cause) this.cause = options.cause;
  }
}

export function toAIGenerationError(err: unknown, fallbackMessage: string): AIGenerationError {
  if (err instanceof AIGenerationError) return err;

  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      return new AIGenerationError("Our AI provider is receiving too many requests right now. Please try again in a moment.", {
        cause: err,
      });
    }
    if (err.status && err.status >= 500) {
      return new AIGenerationError("Our AI provider is temporarily unavailable. Please try again shortly.", { cause: err });
    }
    if (err.status === 401 || err.status === 403) {
      return new AIGenerationError("The AI service isn't configured correctly. Please contact support.", {
        cause: err,
        retryable: false,
      });
    }
    return new AIGenerationError(fallbackMessage, { cause: err });
  }

  if (err instanceof Error && err.name === "ZodError") {
    return new AIGenerationError(
      "The AI returned an unexpected response. Please try again — your existing information is safe.",
      { cause: err },
    );
  }

  return new AIGenerationError(fallbackMessage, { cause: err });
}
