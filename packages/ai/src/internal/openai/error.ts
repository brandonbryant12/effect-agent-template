import OpenAI from "openai";
import { AiError } from "../../model.js";

export const mapOpenAiError = (error: unknown): AiError => {
  if (error instanceof OpenAI.APIUserAbortError) {
    return new AiError({ code: "cancelled", retryable: false });
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AiError({ code: "authentication", retryable: false });
    }
    if (error.status === 429) {
      return new AiError({ code: "rate_limited", retryable: true });
    }
    return new AiError({
      code: "unavailable",
      retryable:
        error.status === 408 ||
        error.status === 409 ||
        (error.status !== undefined && error.status >= 500),
    });
  }
  return new AiError({ code: "invalid_response", retryable: false });
};
