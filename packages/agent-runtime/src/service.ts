import type { Effect, Stream } from "effect";
import type {
  AgentRuntimeError,
  AgentRuntimeEvent,
  CreateRuntimeSession,
  RuntimePermissionReply,
  RuntimeSessionRef,
  SendRuntimeMessage,
} from "./model.js";

export interface AgentRuntime {
  readonly createSession: (
    input: CreateRuntimeSession,
  ) => Effect.Effect<RuntimeSessionRef, AgentRuntimeError>;
  readonly send: (
    input: SendRuntimeMessage,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly events: (
    session: RuntimeSessionRef,
  ) => Stream.Stream<AgentRuntimeEvent, AgentRuntimeError>;
  readonly replyPermission: (
    input: RuntimePermissionReply,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly cancel: (
    session: RuntimeSessionRef,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly close: (
    session: RuntimeSessionRef,
  ) => Effect.Effect<void, AgentRuntimeError>;
}
