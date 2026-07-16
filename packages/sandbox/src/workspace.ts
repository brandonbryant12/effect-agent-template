import type { AgentSessionId } from "@repo/contracts";
import type { Effect } from "effect";
import type {
  ExecResult,
  ExposedPort,
  SandboxError,
  WorkspaceRef,
} from "./model.js";

export interface SandboxWorkspace {
  readonly create: (input: {
    readonly sessionId: AgentSessionId;
  }) => Effect.Effect<WorkspaceRef, SandboxError>;
  readonly resume: (
    workspace: WorkspaceRef,
  ) => Effect.Effect<void, SandboxError>;
  readonly exec: (
    workspace: WorkspaceRef,
    command: ReadonlyArray<string>,
  ) => Effect.Effect<ExecResult, SandboxError>;
  readonly writeFile: (
    workspace: WorkspaceRef,
    path: string,
    content: string,
  ) => Effect.Effect<void, SandboxError>;
  readonly readFile: (
    workspace: WorkspaceRef,
    path: string,
  ) => Effect.Effect<string, SandboxError>;
  readonly expose: (
    workspace: WorkspaceRef,
    port: number,
  ) => Effect.Effect<ExposedPort, SandboxError>;
  readonly pause: (
    workspace: WorkspaceRef,
  ) => Effect.Effect<void, SandboxError>;
  readonly terminate: (
    workspace: WorkspaceRef,
  ) => Effect.Effect<void, SandboxError>;
}
