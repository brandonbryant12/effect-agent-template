// architecture-allow: raw-sql -- app-owned Postgres binding of the AgentRunJournal port
import type { AgentRuntimeEvent } from "@repo/agent-runtime";
import {
  AgentRunEvent,
  ApprovalId,
  runStatusForEvent,
  Timestamp,
  type AgentRunId,
} from "@repo/contracts";
import { Clock, Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import { JournalError, RunNotFound, type AgentRunJournal } from "@repo/worker";

const makeApprovalId = () =>
  Schema.decodeUnknownSync(ApprovalId)(`approval_${ulid()}`);

export const toDurableRunEvent = (
  runId: AgentRunId,
  sequence: number,
  occurredAt: Timestamp,
  event: AgentRuntimeEvent,
  approvalId: () => typeof ApprovalId.Type = makeApprovalId,
): AgentRunEvent | undefined => {
  const base = { protocolVersion: 1 as const, runId, sequence, occurredAt };
  switch (event._tag) {
    case "RuntimeReady":
      return undefined;
    case "RuntimeTextDelta":
      return {
        _tag: "AssistantTextCompleted",
        ...base,
        messageId: `runtime-message-${sequence}`,
        text: event.text,
      };
    case "RuntimePermissionRequested":
      return {
        _tag: "ApprovalRequested",
        ...base,
        approvalId: approvalId(),
        toolName: event.toolName,
        safeSummary: event.safeSummary,
      };
    case "RuntimeCompleted":
      return { _tag: "RunCompleted", ...base };
    case "RuntimeCancelled":
      return { _tag: "RunCancelled", ...base };
    case "RuntimeFailed":
      return {
        _tag: "RunFailed",
        ...base,
        code: event.code,
        message: event.message,
      };
  }
};

const nowTimestamp: Effect.Effect<Timestamp> = Effect.map(
  Clock.currentTimeMillis,
  (millis) =>
    Schema.decodeUnknownSync(Timestamp)(new Date(millis).toISOString()),
);

export const makeAgentRunJournalPostgres = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const nextSequence = (runId: AgentRunId) =>
    Effect.map(
      sql<{ readonly sequence: number }>`
        SELECT (COALESCE(MAX(sequence), 0) + 1)::int AS sequence
        FROM agent_run_events
        WHERE run_id = ${runId}
      `,
      (rows) => rows[0]?.sequence ?? 1,
    );
  const journal: AgentRunJournal = {
    begin: (runId, sessionId, workspace, runtimeSession) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const now = yield* nowTimestamp;
            const locked = yield* sql`
            SELECT id FROM agent_runs
            WHERE id = ${runId} AND session_id = ${sessionId}
            FOR UPDATE
          `;
            if (locked.length === 0)
              return yield* Effect.fail(new RunNotFound({ runId }));
            yield* sql`
            UPDATE agent_sessions
            SET status = 'running', sandbox_ref = ${workspace.id},
                opencode_session_ref = ${runtimeSession.id}, updated_at = ${now}
            WHERE id = ${sessionId}
          `;
            yield* sql`
            UPDATE agent_runs SET status = 'running', updated_at = ${now}
            WHERE id = ${runId}
          `;
            const sequence = yield* nextSequence(runId);
            const event = Schema.decodeUnknownSync(AgentRunEvent)({
              _tag: "RunStatusChanged",
              protocolVersion: 1,
              runId,
              sequence,
              occurredAt: now,
              status: "running",
            });
            yield* sql`
            INSERT INTO agent_run_events (run_id, sequence, event, occurred_at)
            VALUES (${runId}, ${sequence}, ${JSON.stringify(event)}::jsonb, ${now})
          `;
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", () =>
            Effect.fail(
              new JournalError({ operation: "begin-run", retryable: true }),
            ),
          ),
        ),
    record: (runId, runtimeEvent) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const locked = yield* sql`
            SELECT id FROM agent_runs WHERE id = ${runId} FOR UPDATE
          `;
            if (locked.length === 0)
              return yield* Effect.fail(new RunNotFound({ runId }));
            const sequence = yield* nextSequence(runId);
            const now = yield* nowTimestamp;
            const event = toDurableRunEvent(runId, sequence, now, runtimeEvent);
            if (!event) return;
            yield* sql`
            INSERT INTO agent_run_events (run_id, sequence, event, occurred_at)
            VALUES (${runId}, ${sequence}, ${JSON.stringify(event)}::jsonb, ${now})
          `;
            if (event._tag === "ApprovalRequested") {
              yield* sql`
              INSERT INTO approval_requests (
                id, run_id, tool_call_id, tool_name, action,
                resource_patterns, safe_metadata, status, created_at
              ) VALUES (
                ${event.approvalId}, ${runId}, ${runtimeEvent._tag === "RuntimePermissionRequested" ? runtimeEvent.permissionId : "unknown"},
                ${event.toolName}, ${event.safeSummary}, '[]'::jsonb,
                ${JSON.stringify({ summary: event.safeSummary })}::jsonb,
                'pending', ${now}
              )
            `;
            }
            const status = runStatusForEvent(event);
            if (status) {
              yield* sql`
              UPDATE agent_runs SET status = ${status}, updated_at = ${now}
              WHERE id = ${runId}
            `;
              yield* sql`
              UPDATE agent_sessions SET status = ${status === "completed" || status === "cancelled" ? "ready" : status}, updated_at = ${now}
              WHERE id = (SELECT session_id FROM agent_runs WHERE id = ${runId})
            `;
            }
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", () =>
            Effect.fail(
              new JournalError({
                operation: "record-run-event",
                retryable: true,
              }),
            ),
          ),
        ),
  };
  return journal;
});
