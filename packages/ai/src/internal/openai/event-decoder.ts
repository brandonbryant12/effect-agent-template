import { Schema } from "effect";
import type { AiStreamEvent } from "../../model.js";
import { AiError } from "../../model.js";

const TextDelta = Schema.Struct({
  type: Schema.Literal("response.output_text.delta"),
  delta: Schema.String,
});
const Completed = Schema.Struct({
  type: Schema.Literal("response.completed"),
  response: Schema.Struct({ id: Schema.String }),
});
const ToolCall = Schema.Struct({
  type: Schema.Literal("response.output_item.done"),
  item: Schema.Struct({
    type: Schema.Literal("function_call"),
    call_id: Schema.String,
    name: Schema.String,
    arguments: Schema.String,
  }),
});

export const decodeOpenAiEvent = (
  value: unknown,
): AiStreamEvent | undefined => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    throw new AiError({ code: "invalid_response", retryable: false });
  }
  if (value.type === "response.output_text.delta") {
    const event = Schema.decodeUnknownSync(TextDelta)(value);
    return { _tag: "AiTextDelta", text: event.delta };
  }
  if (value.type === "response.completed") {
    const event = Schema.decodeUnknownSync(Completed)(value);
    return { _tag: "AiCompleted", responseId: event.response.id };
  }
  if (
    value.type === "response.output_item.done" &&
    "item" in value &&
    typeof value.item === "object" &&
    value.item !== null &&
    "type" in value.item &&
    value.item.type === "function_call"
  ) {
    const event = Schema.decodeUnknownSync(ToolCall)(value);
    return {
      _tag: "AiToolCall",
      callId: event.item.call_id,
      name: event.item.name,
      argumentsJson: event.item.arguments,
    };
  }
  return undefined;
};
