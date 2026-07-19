import type {
  AgentRuntime,
  AgentRuntimeEvent,
  RuntimeSessionRef,
} from "@repo/agent-runtime";
import {
  AgentRunId,
  AgentSessionId,
  type AgentRunId as AgentRunIdType,
  type AgentSessionId as AgentSessionIdType,
} from "@repo/contracts";
import type { SandboxWorkspace, WorkspaceRef } from "@repo/sandbox";
import { Effect, Schema, Stream } from "effect";
import type { JobHandler } from "./runtime.js";
import { JobHandlerError } from "./runtime.js";

const AgentRunPayload = Schema.Struct({
  runId: AgentRunId,
  sessionId: AgentSessionId,
  prompt: Schema.String.check(Schema.isMinLength(1)),
});

export class JournalError extends Schema.TaggedErrorClass<JournalError>()(
  "JournalError",
  { operation: Schema.String, retryable: Schema.Boolean },
) {}

export class RunNotFound extends Schema.TaggedErrorClass<RunNotFound>()(
  "RunNotFound",
  { runId: AgentRunId },
) {}

export type AgentRunJournalError = JournalError | RunNotFound;

export interface AgentRunJournal {
  readonly begin: (
    runId: AgentRunIdType,
    sessionId: AgentSessionIdType,
    workspace: WorkspaceRef,
    runtimeSession: RuntimeSessionRef,
  ) => Effect.Effect<void, AgentRunJournalError>;
  readonly record: (
    runId: AgentRunIdType,
    event: AgentRuntimeEvent,
  ) => Effect.Effect<void, AgentRunJournalError>;
}

export const journalFailure = (error: AgentRunJournalError): JobHandlerError =>
  error._tag === "RunNotFound"
    ? new JobHandlerError({ code: "run_not_found", retryable: false })
    : new JobHandlerError({
        code: "journal_unavailable",
        retryable: error.retryable,
      });

export interface AgentRunHandlerOptions {
  readonly runtime: AgentRuntime;
  readonly workspace: SandboxWorkspace;
  readonly journal: AgentRunJournal;
  readonly prepareWorkspace?: (
    sessionId: AgentSessionIdType,
    workspace: WorkspaceRef,
  ) => Effect.Effect<void, unknown>;
}

const handlerError = (code: string, retryable: boolean) =>
  new JobHandlerError({ code, retryable });

export const makeAgentRunHandler =
  (options: AgentRunHandlerOptions): JobHandler =>
  (job) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeUnknownEffect(AgentRunPayload)(
        job.payload,
      ).pipe(
        Effect.mapError(() => handlerError("invalid_agent_run_job", false)),
      );
      const workspace = yield* options.workspace
        .create({ sessionId: payload.sessionId })
        .pipe(
          Effect.mapError((error) =>
            handlerError("sandbox_unavailable", error.retryable),
          ),
        );
      if (options.prepareWorkspace) {
        yield* options
          .prepareWorkspace(payload.sessionId, workspace)
          .pipe(
            Effect.mapError(() =>
              handlerError("workspace_preparation_failed", false),
            ),
          );
      }
      const runtimeSession = yield* options.runtime
        .createSession({ workspaceRef: workspace.id })
        .pipe(
          Effect.mapError((error) =>
            handlerError("runtime_unavailable", error.retryable),
          ),
        );
      yield* options.journal
        .begin(payload.runId, payload.sessionId, workspace, runtimeSession)
        .pipe(Effect.mapError(journalFailure));
      yield* options.runtime
        .send({ session: runtimeSession, message: payload.prompt })
        .pipe(
          Effect.mapError((error) =>
            handlerError("runtime_send_failed", error.retryable),
          ),
        );
      yield* options.runtime.events(runtimeSession).pipe(
        Stream.runForEach((event) =>
          options.journal
            .record(payload.runId, event)
            .pipe(Effect.mapError(journalFailure)),
        ),
        Effect.mapError((error) =>
          error instanceof JobHandlerError
            ? error
            : handlerError("runtime_events_failed", error.retryable),
        ),
      );
    });
