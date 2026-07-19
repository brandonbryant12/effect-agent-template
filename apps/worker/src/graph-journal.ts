// architecture-allow: raw-sql -- app-owned Postgres binding of the GraphCoordinatorJournal port
import {
  AgentSessionId,
  CommandId,
  ConversationId,
  GraphRun as GraphRunSchema,
  GraphNodeRunStatus as GraphNodeRunStatusSchema,
  GraphRunNode as GraphRunNodeSchema,
  GraphRunStatus as GraphRunStatusSchema,
  JobId,
  ProjectId,
  TenantId,
  UserId,
  type GraphRunId,
  type GraphRunStatus,
  graphRunStatusForNodes,
  isTerminalGraphRunStatus,
} from "@repo/contracts";
import type { AgentRunService } from "@repo/core";
import {
  GraphJournalError,
  type GraphCoordinatorJournal,
  type GraphRunState,
} from "@repo/worker";
import { createHash } from "node:crypto";
import { Clock, Context, Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";

type Row = Readonly<Record<string, unknown>>;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Deterministic 26-character Crockford-base32 suffix so dispatch replays
 * always produce the same conversation, session, and command ids.
 */
const deterministicSuffix = (seed: string): string => {
  const digest = createHash("sha256").update(seed).digest();
  let out = "";
  for (let index = 0; index < 26; index += 1) {
    out += CROCKFORD[(digest[index] ?? 0) % 32];
  }
  return out;
};

const journalError = (operation: string, retryable = true) =>
  new GraphJournalError({ operation, retryable });

const failWith =
  (operation: string) =>
  <A, R>(effect: Effect.Effect<A, unknown, R>) =>
    Effect.mapError(effect, () => journalError(operation));

const nowTimestamp = Effect.map(Clock.currentTimeMillis, (millis) =>
  new Date(millis).toISOString(),
);

const iso = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export const makeGraphCoordinatorJournal = (
  runs: Context.Service.Shape<typeof AgentRunService>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const runProjection = sql.literal(
      'graph_runs.id, graph_runs.graph_id AS "graphId", graph_runs.project_id AS "projectId", graph_runs.tenant_id AS "tenantId", graph_runs.owner_user_id AS "ownerUserId", graph_runs.status, graph_runs.input, graph_runs.nodes, graph_runs.edges, graph_runs.created_at AS "createdAt", graph_runs.updated_at AS "updatedAt"',
    );

    const loadRunRow = (id: GraphRunId) =>
      failWith("load-graph-run")(
        sql<Row>`SELECT ${runProjection} FROM graph_runs WHERE id = ${id}`,
      ).pipe(
        Effect.flatMap((rows) =>
          rows[0]
            ? Effect.succeed(rows[0])
            : Effect.fail(journalError("graph-run-missing", false)),
        ),
      );

    const journal: GraphCoordinatorJournal = {
      load: (id) =>
        Effect.gen(function* () {
          const runRow = yield* loadRunRow(id);
          const run = yield* failWith("decode-graph-run")(
            Schema.decodeUnknownEffect(GraphRunSchema)({
              ...runRow,
              createdAt: iso(runRow.createdAt),
              updatedAt: iso(runRow.updatedAt),
            }),
          );
          const nodeRows = yield* failWith("load-graph-run-nodes")(
            sql<Row>`
              SELECT graph_run_id AS "graphRunId", node_id AS "nodeId", status,
                     agent_run_id AS "agentRunId", session_id AS "sessionId",
                     updated_at AS "updatedAt"
              FROM graph_run_nodes WHERE graph_run_id = ${id} ORDER BY node_id
            `,
          );
          const nodes = yield* failWith("decode-graph-run-nodes")(
            Effect.forEach(nodeRows, (row) =>
              Schema.decodeUnknownEffect(GraphRunNodeSchema)({
                ...row,
                updatedAt: iso(row.updatedAt),
              }),
            ),
          );
          const state: GraphRunState = { run, nodes };
          return state;
        }),
      reconcile: (id) =>
        Effect.gen(function* () {
          const now = yield* nowTimestamp;
          yield* failWith("reconcile-graph-run")(
            sql`
              UPDATE graph_run_nodes
              SET status = CASE agent_runs.status
                    WHEN 'awaiting-approval' THEN 'awaiting-approval'
                    WHEN 'running' THEN 'running'
                    WHEN 'completed' THEN 'completed'
                    WHEN 'failed' THEN 'failed'
                    WHEN 'cancelled' THEN 'failed'
                    ELSE graph_run_nodes.status
                  END,
                  updated_at = ${now}
              FROM agent_runs
              WHERE graph_run_nodes.graph_run_id = ${id}
                AND graph_run_nodes.agent_run_id = agent_runs.id
                AND graph_run_nodes.status IN ('running', 'awaiting-approval')
            `,
          );
        }),
      markReady: (id, nodeIds) =>
        Effect.gen(function* () {
          const now = yield* nowTimestamp;
          for (const nodeId of nodeIds) {
            yield* failWith("mark-node-ready")(
              sql`
                UPDATE graph_run_nodes SET status = 'ready', updated_at = ${now}
                WHERE graph_run_id = ${id} AND node_id = ${nodeId}
                  AND status = 'pending'
              `,
            );
          }
        }),
      dispatch: (id, nodeId, prompt) =>
        Effect.gen(function* () {
          const runRow = yield* loadRunRow(id);
          const now = yield* nowTimestamp;
          const scope = {
            tenantId: Schema.decodeUnknownSync(TenantId)(runRow.tenantId),
            userId: Schema.decodeUnknownSync(UserId)(runRow.ownerUserId),
          };
          const conversationId = Schema.decodeUnknownSync(ConversationId)(
            `conversation_${deterministicSuffix(`${id}/${nodeId}/conversation`)}`,
          );
          const sessionId = Schema.decodeUnknownSync(AgentSessionId)(
            `session_${deterministicSuffix(`${id}/${nodeId}/session`)}`,
          );
          const commandId = Schema.decodeUnknownSync(CommandId)(
            `command_${deterministicSuffix(`${id}/${nodeId}/command`)}`,
          );
          yield* failWith("create-node-conversation")(
            sql`
              INSERT INTO conversations (id, project_id, title, created_at, updated_at)
              VALUES (${conversationId}, ${runRow.projectId}, ${`Graph node ${nodeId}`}, ${now}, ${now})
              ON CONFLICT (id) DO NOTHING
            `,
          );
          yield* failWith("create-node-session")(
            sql`
              INSERT INTO agent_sessions (
                id, tenant_id, user_id, project_id, conversation_id, status,
                created_at, updated_at
              ) VALUES (
                ${sessionId}, ${scope.tenantId}, ${scope.userId},
                ${runRow.projectId}, ${conversationId}, 'ready', ${now}, ${now}
              )
              ON CONFLICT (id) DO NOTHING
            `,
          );
          const admitted = yield* failWith("admit-node-run")(
            runs.admit(scope, {
              commandId,
              sessionId,
              projectId: Schema.decodeUnknownSync(ProjectId)(runRow.projectId),
              conversationId,
              taskId: null,
              prompt,
            }),
          );
          yield* failWith("record-node-dispatch")(
            sql`
              UPDATE graph_run_nodes
              SET status = 'running', agent_run_id = ${admitted.id},
                  session_id = ${sessionId}, updated_at = ${now}
              WHERE graph_run_id = ${id} AND node_id = ${nodeId}
            `,
          );
          return { nodeId };
        }),
      failNode: (id, nodeId, code) =>
        Effect.gen(function* () {
          const now = yield* nowTimestamp;
          yield* failWith(`fail-node-${code}`)(
            sql`
              UPDATE graph_run_nodes SET status = 'failed', updated_at = ${now}
              WHERE graph_run_id = ${id} AND node_id = ${nodeId}
            `,
          );
        }),
      skip: (id, nodeIds) =>
        Effect.gen(function* () {
          const now = yield* nowTimestamp;
          for (const nodeId of nodeIds) {
            yield* failWith("skip-node")(
              sql`
                UPDATE graph_run_nodes SET status = 'skipped', updated_at = ${now}
                WHERE graph_run_id = ${id} AND node_id = ${nodeId}
                  AND status IN ('pending', 'ready')
              `,
            );
          }
        }),
      nodeOutput: (id, nodeId) =>
        failWith("node-output")(
          sql<{ readonly text: string | null }>`
            SELECT event->>'text' AS text
            FROM agent_run_events
            WHERE run_id = (
                SELECT agent_run_id FROM graph_run_nodes
                WHERE graph_run_id = ${id} AND node_id = ${nodeId}
              )
              AND event->>'_tag' = 'AssistantTextCompleted'
            ORDER BY sequence DESC
            LIMIT 1
          `,
        ).pipe(Effect.map((rows) => rows[0]?.text ?? "")),
      finalize: (id) =>
        Effect.gen(function* () {
          const runRow = yield* loadRunRow(id);
          const current = yield* failWith("decode-graph-run-status")(
            Schema.decodeUnknownEffect(GraphRunStatusSchema)(runRow.status),
          );
          if (isTerminalGraphRunStatus(current)) return current;
          const rows = yield* failWith("finalize-load-nodes")(
            sql<{ readonly status: string }>`
              SELECT status FROM graph_run_nodes WHERE graph_run_id = ${id}
            `,
          );
          const statuses = yield* failWith("decode-graph-node-statuses")(
            Effect.forEach(rows, (row) =>
              Schema.decodeUnknownEffect(GraphNodeRunStatusSchema)(row.status),
            ),
          );
          const next: GraphRunStatus = graphRunStatusForNodes(statuses);
          const now = yield* nowTimestamp;
          yield* failWith("finalize-graph-run")(
            sql`
              UPDATE graph_runs SET status = ${next}, updated_at = ${now}
              WHERE id = ${id} AND status NOT IN ('completed', 'failed', 'cancelled')
            `,
          );
          return next;
        }),
      requeue: (id) =>
        Effect.gen(function* () {
          const now = yield* nowTimestamp;
          const availableAt = new Date(
            new Date(now).getTime() + 5_000,
          ).toISOString();
          yield* failWith("requeue-graph-run")(
            sql`
              INSERT INTO jobs (
                id, kind, payload, status, attempts, max_attempts,
                available_at, created_at, updated_at
              ) VALUES (
                ${Schema.decodeUnknownSync(JobId)(`job_${ulid()}`)}, 'graph-run',
                ${JSON.stringify({ graphRunId: id })}::jsonb,
                'queued', 0, 5, ${availableAt}, ${now}, ${now}
              )
            `,
          );
        }),
    };
    return journal;
  });
