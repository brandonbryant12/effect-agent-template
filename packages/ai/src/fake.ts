import { Effect, Stream } from "effect";
import { AiError } from "./model.js";
import type { AiService } from "./service.js";

export const makeAiServiceFake = (
  text = "Deterministic AI response",
): AiService => ({
  complete: () => Effect.succeed({ responseId: "response_fake", text }),
  stream: () =>
    Stream.fromIterable([
      { _tag: "AiTextDelta" as const, text },
      { _tag: "AiCompleted" as const, responseId: "response_fake" },
    ]),
  structured: (_input, _name, _schema) =>
    Effect.fail(new AiError({ code: "invalid_response", retryable: false })),
});
