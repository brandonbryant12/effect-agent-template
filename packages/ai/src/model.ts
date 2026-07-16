import { Schema } from "effect";

export interface AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface AiInput {
  readonly prompt: string;
  readonly instructions?: string;
  readonly tools?: ReadonlyArray<AiTool>;
  readonly signal?: AbortSignal;
}

export const AiTextResult = Schema.Struct({
  responseId: Schema.String,
  text: Schema.String,
});
export type AiTextResult = typeof AiTextResult.Type;

export const AiTextDelta = Schema.TaggedStruct("AiTextDelta", {
  text: Schema.String,
});
export const AiToolCall = Schema.TaggedStruct("AiToolCall", {
  callId: Schema.String,
  name: Schema.String,
  argumentsJson: Schema.String,
});
export const AiCompleted = Schema.TaggedStruct("AiCompleted", {
  responseId: Schema.String,
});
export const AiStreamEvent = Schema.Union([
  AiTextDelta,
  AiToolCall,
  AiCompleted,
]);
export type AiStreamEvent = typeof AiStreamEvent.Type;

export class AiError extends Schema.TaggedErrorClass<AiError>()("AiError", {
  code: Schema.Literals([
    "authentication",
    "rate_limited",
    "unavailable",
    "invalid_response",
    "cancelled",
  ]),
  retryable: Schema.Boolean,
}) {}
