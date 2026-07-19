import type {
  AgentRun,
  AgentRunEvent,
  AgentRunId,
  JobId,
} from "@repo/contracts";
import {
  AgentRun as AgentRunSchema,
  AgentRunEvent as AgentRunEventSchema,
  AgentRunId as AgentRunIdSchema,
  JobId as JobIdSchema,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  AgentRunNotFound,
  AgentRunService,
  type AdmitAgentRun,
} from "../agent-run-service.js";
import type { AccessScope } from "../access-scope.js";
import { PersistenceError } from "../errors.js";
import { nowTimestamp, persistence } from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;

const makeRunId = (): AgentRunId =>
  Schema.decodeUnknownSync(AgentRunIdSchema)(`run_${ulid()}`);
const makeJobId = (): JobId =>
  Schema.decodeUnknownSync(JobIdSchema)(`job_${ulid()}`);
const iso = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

const decodeRun = (row: Row) =>
  Schema.decodeUnknownEffect(AgentRunSchema)({
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-agent-run" }),
    ),
  );

const decodeFirst = (
  id: AgentRunId,
  rows: ReadonlyArray<Row>,
): Effect.Effect<AgentRun, AgentRunNotFound | PersistenceError> => {
  const row = rows[0];
  return row
    ? decodeRun(row)
    : Effect.fail(new AgentRunNotFound({ runId: id }));
};

export const AgentRunServiceLive = Layer.effect(
  AgentRunService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'agent_runs.id, agent_runs.session_id AS "sessionId", agent_runs.project_id AS "projectId", agent_runs.conversation_id AS "conversationId", agent_runs.task_id AS "taskId", agent_runs.status, agent_runs.created_at AS "createdAt", agent_runs.updated_at AS "updatedAt"',
    );

    const get = (
      scope: AccessScope,
      id: AgentRunId,
    ): Effect.Effect<AgentRun, AgentRunNotFound | PersistenceError> =>
      persistence(
        "get-agent-run",
        sql<Row>`
          SELECT ${projection}
          FROM agent_runs
          INNER JOIN agent_sessions ON agent_sessions.id = agent_runs.session_id
          WHERE agent_runs.id = ${id}
            AND agent_sessions.tenant_id = ${scope.tenantId}
            AND agent_sessions.user_id = ${scope.userId}
        `,
      ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows)));

    const findByCommand = (
      scope: AccessScope,
      commandId: AdmitAgentRun["commandId"],
    ) =>
      persistence(
        "find-agent-run-command",
        sql<Row>`
          SELECT ${projection}
          FROM agent_run_commands
          INNER JOIN agent_runs ON agent_runs.id = agent_run_commands.run_id
          INNER JOIN agent_sessions ON agent_sessions.id = agent_runs.session_id
          WHERE agent_run_commands.id = ${commandId}
            AND agent_sessions.tenant_id = ${scope.tenantId}
            AND agent_sessions.user_id = ${scope.userId}
        `,
      ).pipe(
        Effect.flatMap((rows) => {
          const row = rows[0];
          return row
            ? Effect.map(decodeRun(row), (run) => run as AgentRun | undefined)
            : Effect.succeed(undefined);
        }),
      );

    return AgentRunService.of({
      admit: (scope, input) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* findByCommand(scope, input.commandId);
              if (existing) return existing;

              const id = makeRunId();
              const jobId = makeJobId();
              const now = yield* nowTimestamp;
              const created = yield* persistence(
                "admit-agent-run",
                sql<Row>`
                INSERT INTO agent_runs (
                  id, session_id, project_id, conversation_id, task_id, status, created_at, updated_at
                )
                SELECT
                  ${id}, agent_sessions.id, agent_sessions.project_id,
                  agent_sessions.conversation_id, ${input.taskId}, 'queued', ${now}, ${now}
                FROM agent_sessions
                WHERE agent_sessions.id = ${input.sessionId}
                  AND agent_sessions.project_id = ${input.projectId}
                  AND agent_sessions.conversation_id = ${input.conversationId}
                  AND agent_sessions.tenant_id = ${scope.tenantId}
                  AND agent_sessions.user_id = ${scope.userId}
                RETURNING ${projection}
              `,
              );
              const run = yield* decodeFirst(id, created).pipe(
                Effect.mapError(
                  () =>
                    new PersistenceError({
                      operation: "admit-agent-run-scope",
                    }),
                ),
              );
              const started: AgentRunEvent = {
                _tag: "RunStarted",
                protocolVersion: 1,
                runId: run.id,
                sequence: 1,
                occurredAt: now,
              };
              yield* persistence(
                "admit-agent-run-records",
                Effect.all([
                  sql`
                  INSERT INTO agent_run_commands (id, run_id, kind, payload, admitted_at)
                  VALUES (
                    ${input.commandId}, ${run.id}, 'prompt',
                    ${JSON.stringify({ sessionId: input.sessionId, prompt: input.prompt })}::jsonb, ${now}
                  )
                `,
                  sql`
                  INSERT INTO agent_run_events (run_id, sequence, event, occurred_at)
                  VALUES (${run.id}, 1, ${JSON.stringify(started)}::jsonb, ${now})
                `,
                  sql`
                  INSERT INTO jobs (
                    id, kind, payload, status, attempts, max_attempts, available_at, created_at, updated_at
                  ) VALUES (
                    ${jobId}, 'agent-run',
                    ${JSON.stringify({ runId: run.id, sessionId: run.sessionId, prompt: input.prompt })}::jsonb,
                    'queued', 0, 5, ${now}, ${now}, ${now}
                  )
                `,
                ]),
              );
              return run;
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({
                  operation: "admit-agent-run-transaction",
                }),
              ),
            ),
          ),
      get,
      events: (scope, id, afterSequence) =>
        Effect.flatMap(get(scope, id), () =>
          persistence(
            "list-agent-run-events",
            sql<{ readonly event: unknown }>`
              SELECT event
              FROM agent_run_events
              WHERE run_id = ${id} AND sequence > ${afterSequence}
              ORDER BY sequence ASC
            `,
          ).pipe(
            Effect.flatMap(
              Effect.forEach((row) =>
                Schema.decodeUnknownEffect(AgentRunEventSchema)(row.event).pipe(
                  Effect.mapError(
                    () =>
                      new PersistenceError({
                        operation: "decode-agent-run-event",
                      }),
                  ),
                ),
              ),
            ),
          ),
        ),
    });
  }),
);
