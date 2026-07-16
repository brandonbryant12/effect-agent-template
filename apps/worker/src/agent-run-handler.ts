import { AgentRunId, AgentSessionId } from "@repo/contracts";
import { type JobHandler, JobHandlerError } from "@repo/worker";
import { Effect, Schema } from "effect";

const AgentRunPayload = Schema.Struct({
  runId: AgentRunId,
  sessionId: AgentSessionId,
});

export const agentRunHandler: JobHandler = (job) =>
  Schema.decodeUnknownEffect(AgentRunPayload)(job.payload).pipe(
    Effect.mapError(
      () =>
        new JobHandlerError({
          code: "invalid_agent_run_job",
          retryable: false,
        }),
    ),
    Effect.tap((payload) =>
      Effect.logInfo("agent run admitted", {
        runId: payload.runId,
        sessionId: payload.sessionId,
      }),
    ),
    Effect.asVoid,
  );
