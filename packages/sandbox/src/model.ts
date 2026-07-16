import { AgentSessionId } from "@repo/contracts";
import { Schema } from "effect";

export const WorkspaceRef = Schema.Struct({
  id: Schema.String,
  sessionId: AgentSessionId,
});
export type WorkspaceRef = typeof WorkspaceRef.Type;

export const ExecResult = Schema.Struct({
  exitCode: Schema.Number.check(Schema.isInt()),
  stdout: Schema.String,
  stderr: Schema.String,
});
export type ExecResult = typeof ExecResult.Type;

export const ExposedPort = Schema.Struct({
  port: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  url: Schema.String,
});
export type ExposedPort = typeof ExposedPort.Type;

export class SandboxError extends Schema.TaggedErrorClass<SandboxError>()(
  "SandboxError",
  {
    operation: Schema.String,
    reason: Schema.Literals([
      "not-found",
      "terminated",
      "unavailable",
      "invalid-path",
    ]),
    retryable: Schema.Boolean,
  },
) {}
