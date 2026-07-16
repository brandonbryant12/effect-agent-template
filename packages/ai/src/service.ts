import type { Effect, Schema, Stream } from "effect";
import type { AiError, AiInput, AiStreamEvent, AiTextResult } from "./model.js";

export interface AiService {
  readonly complete: (input: AiInput) => Effect.Effect<AiTextResult, AiError>;
  readonly stream: (input: AiInput) => Stream.Stream<AiStreamEvent, AiError>;
  readonly structured: <S extends Schema.ConstraintDecoder<unknown, never>>(
    input: AiInput,
    name: string,
    schema: S,
  ) => Effect.Effect<S["Type"], AiError>;
}
