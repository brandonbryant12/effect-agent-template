import {
  AgentRun,
  AgentRunId,
  AgentRunEvent,
  ApprovalRequest,
  JobId,
  type ApprovalId,
  type ApprovalRequest as ApprovalRequestType,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  ApprovalNotFound,
  ApprovalService,
  RunControlRejected,
} from "../approval-service.js";
import type { AccessScope } from "../access-scope.js";
import { PersistenceError } from "../errors.js";
import { nowTimestamp, persistence } from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value;
const jobId = () => Schema.decodeUnknownSync(JobId)(`job_${ulid()}`);

const decodeApproval = (row: Row) =>
  Schema.decodeUnknownEffect(ApprovalRequest)({
    ...row,
    createdAt: iso(row.createdAt),
    resolvedAt: iso(row.resolvedAt),
  }).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-approval" }),
    ),
  );

const decodeRun = (row: Row) =>
  Schema.decodeUnknownEffect(AgentRun)({
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-cancelled-run" }),
    ),
  );

export const ApprovalServiceLive = Layer.effect(
  ApprovalService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const get = (
      scope: AccessScope,
      id: ApprovalId,
    ): Effect.Effect<
      ApprovalRequestType,
      ApprovalNotFound | PersistenceError
    > =>
      Effect.gen(function* () {
        const rows = yield* persistence(
          "get-approval",
          sql<Row>`
        SELECT approval_requests.id, approval_requests.run_id AS "runId",
          approval_requests.tool_name AS "toolName",
          approval_requests.action AS "safeSummary", approval_requests.status,
          approval_requests.created_at AS "createdAt", approval_requests.resolved_at AS "resolvedAt"
        FROM approval_requests
        INNER JOIN agent_runs ON agent_runs.id = approval_requests.run_id
        INNER JOIN agent_sessions ON agent_sessions.id = agent_runs.session_id
        WHERE approval_requests.id = ${id}
          AND agent_sessions.tenant_id = ${scope.tenantId}
          AND agent_sessions.user_id = ${scope.userId}
          `,
        );
        const row = rows[0];
        if (!row)
          return yield* Effect.fail(new ApprovalNotFound({ approvalId: id }));
        return yield* decodeApproval(row);
      });

    return ApprovalService.of({
      get,
      resolve: (scope, id, decision) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const rows = yield* persistence(
                "lock-approval",
                sql<Row>`
          SELECT approval_requests.run_id AS "runId", approval_requests.tool_call_id AS "permissionId",
            approval_requests.status, agent_sessions.opencode_session_ref AS "runtimeSessionId"
          FROM approval_requests
          INNER JOIN agent_runs ON agent_runs.id = approval_requests.run_id
          INNER JOIN agent_sessions ON agent_sessions.id = agent_runs.session_id
          WHERE approval_requests.id = ${id}
            AND agent_sessions.tenant_id = ${scope.tenantId}
            AND agent_sessions.user_id = ${scope.userId}
          FOR UPDATE OF approval_requests, agent_runs
        `,
              );
              const row = rows[0];
              if (!row)
                return yield* Effect.fail(
                  new ApprovalNotFound({ approvalId: id }),
                );
              const runId = yield* Schema.decodeUnknownEffect(AgentRunId)(
                row.runId,
              ).pipe(
                Effect.mapError(
                  () =>
                    new PersistenceError({
                      operation: "decode-approval-run-id",
                    }),
                ),
              );
              if (row.status !== "pending") return yield* get(scope, id);
              if (typeof row.runtimeSessionId !== "string") {
                return yield* Effect.fail(
                  new RunControlRejected({
                    runId,
                    reason: "runtime-not-ready",
                  }),
                );
              }
              const now = yield* nowTimestamp;
              const status =
                decision === "once"
                  ? "approved-once"
                  : decision === "always"
                    ? "approved-session"
                    : "rejected";
              yield* persistence(
                "resolve-approval",
                sql`
          UPDATE approval_requests SET status = ${status}, resolved_at = ${now} WHERE id = ${id}
        `,
              );
              const sequenceRows = yield* sql<{ readonly sequence: number }>`
          SELECT (COALESCE(MAX(sequence), 0) + 1)::int AS sequence FROM agent_run_events WHERE run_id = ${runId}
        `;
              const event = Schema.decodeUnknownSync(AgentRunEvent)({
                _tag: "ApprovalResolved",
                protocolVersion: 1,
                runId,
                sequence: sequenceRows[0]?.sequence ?? 1,
                occurredAt: now,
                approvalId: id,
                decision,
              });
              yield* persistence(
                "enqueue-approval-control",
                Effect.all([
                  sql`INSERT INTO agent_run_events (run_id, sequence, event, occurred_at)
              VALUES (${runId}, ${event.sequence}, ${JSON.stringify(event)}::jsonb, ${now})`,
                  sql`INSERT INTO jobs (id, kind, payload, status, attempts, max_attempts, available_at, created_at, updated_at)
              VALUES (${jobId()}, 'agent-permission', ${JSON.stringify({ runId, runtimeSessionId: row.runtimeSessionId, permissionId: row.permissionId, decision })}::jsonb,
                'queued', 0, 5, ${now}, ${now}, ${now})`,
                ]),
              );
              return yield* get(scope, id);
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({
                  operation: "resolve-approval-transaction",
                }),
              ),
            ),
          ),
      cancelRun: (scope, runId) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const rows = yield* persistence(
                "lock-run-for-cancel",
                sql<Row>`
          SELECT agent_runs.id, agent_runs.session_id AS "sessionId", agent_runs.project_id AS "projectId",
            agent_runs.conversation_id AS "conversationId", agent_runs.task_id AS "taskId", agent_runs.status,
            agent_runs.created_at AS "createdAt", agent_runs.updated_at AS "updatedAt",
            agent_sessions.opencode_session_ref AS "runtimeSessionId"
          FROM agent_runs INNER JOIN agent_sessions ON agent_sessions.id = agent_runs.session_id
          WHERE agent_runs.id = ${runId} AND agent_sessions.tenant_id = ${scope.tenantId}
            AND agent_sessions.user_id = ${scope.userId} FOR UPDATE OF agent_runs
        `,
              );
              const row = rows[0];
              if (!row)
                return yield* Effect.fail(
                  new PersistenceError({ operation: "cancel-run-not-found" }),
                );
              if (
                row.status === "completed" ||
                row.status === "failed" ||
                row.status === "cancelled"
              ) {
                return yield* Effect.fail(
                  new RunControlRejected({ runId, reason: "terminal" }),
                );
              }
              const now = yield* nowTimestamp;
              const sequenceRows = yield* sql<{ readonly sequence: number }>`
                SELECT (COALESCE(MAX(sequence), 0) + 1)::int AS sequence
                FROM agent_run_events WHERE run_id = ${runId}
              `;
              const cancelled = Schema.decodeUnknownSync(AgentRunEvent)({
                _tag: "RunCancelled",
                protocolVersion: 1,
                runId,
                sequence: sequenceRows[0]?.sequence ?? 1,
                occurredAt: now,
              });
              yield* persistence(
                "request-run-cancel",
                Effect.all([
                  sql`UPDATE agent_runs SET status = 'cancelled', updated_at = ${now} WHERE id = ${runId}`,
                  sql`UPDATE agent_sessions SET status = 'ready', updated_at = ${now}
                      WHERE id = ${row.sessionId}`,
                  sql`INSERT INTO agent_run_events (run_id, sequence, event, occurred_at)
                      VALUES (${runId}, ${cancelled.sequence}, ${JSON.stringify(cancelled)}::jsonb, ${now})`,
                  ...(typeof row.runtimeSessionId === "string"
                    ? [
                        sql`
            INSERT INTO jobs (id, kind, payload, status, attempts, max_attempts, available_at, created_at, updated_at)
            VALUES (${jobId()}, 'agent-cancel', ${JSON.stringify({ runId, runtimeSessionId: row.runtimeSessionId })}::jsonb,
              'queued', 0, 5, ${now}, ${now}, ${now})`,
                      ]
                    : []),
                ]),
              );
              return yield* decodeRun({
                ...row,
                status: "cancelled",
                updatedAt: now,
              });
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({ operation: "cancel-run-transaction" }),
              ),
            ),
          ),
    });
  }),
);
