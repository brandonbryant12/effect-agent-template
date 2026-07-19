import { Schema } from "effect";

export const RuntimeSessionRef = Schema.Struct({ id: Schema.String });
export type RuntimeSessionRef = typeof RuntimeSessionRef.Type;

export const CreateRuntimeSession = Schema.Struct({
  workspaceRef: Schema.String,
});
export type CreateRuntimeSession = typeof CreateRuntimeSession.Type;

export const SendRuntimeMessage = Schema.Struct({
  session: RuntimeSessionRef,
  message: Schema.String,
});
export type SendRuntimeMessage = typeof SendRuntimeMessage.Type;

export const RuntimePermissionReply = Schema.Struct({
  session: RuntimeSessionRef,
  permissionId: Schema.String,
  decision: Schema.Literals(["once", "always", "reject"]),
});
export type RuntimePermissionReply = typeof RuntimePermissionReply.Type;

export const RuntimeReady = Schema.TaggedStruct("RuntimeReady", {
  session: RuntimeSessionRef,
});
export const RuntimeTextDelta = Schema.TaggedStruct("RuntimeTextDelta", {
  text: Schema.String,
});
export const RuntimePermissionRequested = Schema.TaggedStruct(
  "RuntimePermissionRequested",
  {
    permissionId: Schema.String,
    toolName: Schema.String,
    safeSummary: Schema.String,
  },
);
export const RuntimeCompleted = Schema.TaggedStruct("RuntimeCompleted", {});
export const RuntimeCancelled = Schema.TaggedStruct("RuntimeCancelled", {});
export const RuntimeFailed = Schema.TaggedStruct("RuntimeFailed", {
  code: Schema.String,
  message: Schema.String,
});

export const AgentRuntimeEvent = Schema.Union([
  RuntimeReady,
  RuntimeTextDelta,
  RuntimePermissionRequested,
  RuntimeCompleted,
  RuntimeCancelled,
  RuntimeFailed,
]);
export type AgentRuntimeEvent = typeof AgentRuntimeEvent.Type;

export const isTerminalRuntimeEvent = (event: AgentRuntimeEvent): boolean =>
  event._tag === "RuntimeCompleted" ||
  event._tag === "RuntimeCancelled" ||
  event._tag === "RuntimeFailed";

export class AgentRuntimeError extends Schema.TaggedErrorClass<AgentRuntimeError>()(
  "AgentRuntimeError",
  {
    operation: Schema.String,
    reason: Schema.Literals([
      "not-found",
      "forbidden",
      "rate-limited",
      "unavailable",
      "invalid-event",
      "permission-mismatch",
      "cancelled",
    ]),
    retryable: Schema.Boolean,
    detail: Schema.optionalKey(Schema.String),
  },
) {}
