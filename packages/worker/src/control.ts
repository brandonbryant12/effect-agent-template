import { RuntimeSessionRef, type AgentRuntime } from "@repo/agent-runtime";
import { AgentRunId, ApprovalDecision } from "@repo/contracts";
import { Effect, Schema, Stream } from "effect";
import { journalFailure, type AgentRunJournal } from "./agent-run.js";
import type { JobHandler } from "./runtime.js";
import { JobHandlerError } from "./runtime.js";

const PermissionPayload = Schema.Struct({
  runId: AgentRunId,
  runtimeSessionId: Schema.String,
  permissionId: Schema.String,
  decision: ApprovalDecision,
});
const CancelPayload = Schema.Struct({
  runId: AgentRunId,
  runtimeSessionId: Schema.String,
});
const failure = (code: string, retryable: boolean) =>
  new JobHandlerError({ code, retryable });

export const makePermissionHandler =
  (runtime: AgentRuntime, journal: AgentRunJournal): JobHandler =>
  (job) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeUnknownEffect(PermissionPayload)(
        job.payload,
      ).pipe(Effect.mapError(() => failure("invalid_permission_job", false)));
      const session = Schema.decodeUnknownSync(RuntimeSessionRef)({
        id: payload.runtimeSessionId,
      });
      yield* runtime
        .replyPermission({
          session,
          permissionId: payload.permissionId,
          decision: payload.decision,
        })
        .pipe(
          Effect.mapError((error) =>
            failure("runtime_permission_failed", error.retryable),
          ),
        );
      yield* runtime.events(session).pipe(
        Stream.runForEach((event) =>
          journal
            .record(payload.runId, event)
            .pipe(Effect.mapError(journalFailure)),
        ),
        Effect.mapError((error) =>
          error instanceof JobHandlerError
            ? error
            : failure("runtime_events_failed", error.retryable),
        ),
      );
    });

export const makeCancelHandler =
  (runtime: AgentRuntime): JobHandler =>
  (job) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeUnknownEffect(CancelPayload)(
        job.payload,
      ).pipe(Effect.mapError(() => failure("invalid_cancel_job", false)));
      const session = Schema.decodeUnknownSync(RuntimeSessionRef)({
        id: payload.runtimeSessionId,
      });
      yield* runtime
        .cancel(session)
        .pipe(
          Effect.mapError((error) =>
            failure("runtime_cancel_failed", error.retryable),
          ),
        );
    });
