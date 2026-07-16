import type { AgentRuntimeEvent } from "@repo/agent-runtime";
import { Schema } from "effect";

const TextEvent = Schema.Struct({
  type: Schema.Literal("message.part.updated"),
  properties: Schema.Struct({
    part: Schema.Struct({
      sessionID: Schema.String,
      type: Schema.Literal("text"),
      text: Schema.String,
      time: Schema.Struct({ end: Schema.Number }),
    }),
  }),
});
const PermissionEvent = Schema.Struct({
  type: Schema.Literal("permission.asked"),
  properties: Schema.Struct({
    id: Schema.String,
    sessionID: Schema.String,
    permission: Schema.String,
    patterns: Schema.Array(Schema.String),
  }),
});
const IdleEvent = Schema.Struct({
  type: Schema.Literal("session.status"),
  properties: Schema.Struct({
    sessionID: Schema.String,
    status: Schema.Struct({ type: Schema.Literal("idle") }),
  }),
});
const ErrorEvent = Schema.Struct({
  type: Schema.Literal("session.error"),
  properties: Schema.Struct({ sessionID: Schema.String }),
});

export const mapOpenCodeEvent = (
  value: unknown,
  sessionId: string,
): AgentRuntimeEvent | undefined => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    throw new Error("Unsupported OpenCode event");
  }
  if (value.type === "message.part.updated") {
    const event = Schema.decodeUnknownSync(TextEvent)(value);
    return event.properties.part.sessionID === sessionId
      ? { _tag: "RuntimeTextDelta", text: event.properties.part.text }
      : undefined;
  }
  if (value.type === "permission.asked") {
    const event = Schema.decodeUnknownSync(PermissionEvent)(value);
    return event.properties.sessionID === sessionId
      ? {
          _tag: "RuntimePermissionRequested",
          permissionId: event.properties.id,
          toolName: event.properties.permission,
          safeSummary: event.properties.patterns.join(", "),
        }
      : undefined;
  }
  if (value.type === "session.status") {
    const event = Schema.decodeUnknownSync(IdleEvent)(value);
    return event.properties.sessionID === sessionId
      ? { _tag: "RuntimeCompleted" }
      : undefined;
  }
  if (value.type === "session.error") {
    const event = Schema.decodeUnknownSync(ErrorEvent)(value);
    return event.properties.sessionID === sessionId
      ? {
          _tag: "RuntimeFailed",
          code: "opencode_session_error",
          message: "The agent runtime reported a session error",
        }
      : undefined;
  }
  return undefined;
};
