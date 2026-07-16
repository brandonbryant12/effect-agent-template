import type { AgentRuntimeError } from "@repo/agent-runtime";
import type { Effect, Redacted } from "effect";

export interface OpenCodeConnection {
  readonly baseUrl: string;
  readonly password: Redacted.Redacted;
  readonly directory: string;
}

export interface OpenCodeDriver {
  readonly createSession: (connection: OpenCodeConnection) => Promise<string>;
  readonly send: (
    connection: OpenCodeConnection,
    sessionId: string,
    message: string,
  ) => Promise<void>;
  readonly events: (
    connection: OpenCodeConnection,
    sessionId: string,
  ) => AsyncIterable<unknown>;
  readonly replyPermission: (
    connection: OpenCodeConnection,
    sessionId: string,
    requestId: string,
    decision: "once" | "always" | "reject",
  ) => Promise<void>;
  readonly cancel: (
    connection: OpenCodeConnection,
    sessionId: string,
  ) => Promise<void>;
  readonly close: (
    connection: OpenCodeConnection,
    sessionId: string,
  ) => Promise<void>;
}

export interface OpenCodeRuntimeOptions {
  readonly driver: OpenCodeDriver;
  readonly connectionForWorkspace: (
    workspaceRef: string,
  ) => Effect.Effect<OpenCodeConnection, AgentRuntimeError>;
}
