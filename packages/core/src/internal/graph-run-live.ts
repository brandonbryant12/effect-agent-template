import type {
  GraphRun,
  GraphRunDetail,
  GraphRunId,
  GraphRunNode,
} from "@repo/contracts";
import {
  GraphRun as GraphRunSchema,
  GraphRunId as GraphRunIdSchema,
  GraphRunNode as GraphRunNodeSchema,
  JobId,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import { PersistenceError } from "../errors.js";
import {
  GraphNotFound,
  GraphRunNotFound,
  InvalidGraphRunTransition,
} from "../graph-errors.js";
import { GraphRunService } from "../graph-run-service.js";
import { allowedGraphRunTransitions } from "../graph-run-transitions.js";
import {
  normalizeTimestamps,
  nowTimestamp,
  persistence,
} from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;

const makeRunId = (): GraphRunId =>
  Schema.decodeUnknownSync(GraphRunIdSchema)(`graphrun_${ulid()}`);
const makeJobId = () => Schema.decodeUnknownSync(JobId)(`job_${ulid()}`);

const decodeRun = (row: Row): Effect.Effect<GraphRun, PersistenceError> =>
  Schema.decodeUnknownEffect(GraphRunSchema)(normalizeTimestamps(row)).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-graph-run" }),
    ),
  );

const decodeNode = (row: Row): Effect.Effect<GraphRunNode, PersistenceError> =>
  Schema.decodeUnknownEffect(GraphRunNodeSchema)({
    ...row,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  }).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-graph-run-node" }),
    ),
  );

export const GraphRunServiceLive = Layer.effect(
  GraphRunService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const runProjection = sql.literal(
      'graph_runs.id, graph_runs.graph_id AS "graphId", graph_runs.project_id AS "projectId", graph_runs.status, graph_runs.input, graph_runs.nodes, graph_runs.edges, graph_runs.created_at AS "createdAt", graph_runs.updated_at AS "updatedAt"',
    );
    const nodeProjection = sql.literal(
      'graph_run_nodes.graph_run_id AS "graphRunId", graph_run_nodes.node_id AS "nodeId", graph_run_nodes.status, graph_run_nodes.agent_run_id AS "agentRunId", graph_run_nodes.session_id AS "sessionId", graph_run_nodes.updated_at AS "updatedAt"',
    );

    const loadDetail = (
      id: GraphRunId,
      scoped: boolean,
      tenantId?: string,
      userId?: string,
    ): Effect.Effect<GraphRunDetail, GraphRunNotFound | PersistenceError> =>
      Effect.gen(function* () {
        const runs = yield* persistence(
          "get-graph-run",
          scoped
            ? sql<Row>`
                SELECT ${runProjection} FROM graph_runs
                WHERE id = ${id} AND tenant_id = ${tenantId ?? ""}
                  AND owner_user_id = ${userId ?? ""}
              `
            : sql<Row>`SELECT ${runProjection} FROM graph_runs WHERE id = ${id}`,
        );
        const runRow = runs[0];
        if (!runRow)
          return yield* Effect.fail(new GraphRunNotFound({ graphRunId: id }));
        const run = yield* decodeRun(runRow);
        const nodeRows = yield* persistence(
          "get-graph-run-nodes",
          sql<Row>`
            SELECT ${nodeProjection} FROM graph_run_nodes
            WHERE graph_run_id = ${id}
            ORDER BY node_id
          `,
        );
        const nodes = yield* Effect.forEach(nodeRows, decodeNode);
        return { run, nodes };
      });

    return GraphRunService.of({
      start: (scope, graphId, commandId, input) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* sql<Row>`
                SELECT ${runProjection} FROM graph_runs
                WHERE command_id = ${commandId}
                  AND tenant_id = ${scope.tenantId}
                  AND owner_user_id = ${scope.userId}
              `;
              if (existing[0]) return yield* decodeRun(existing[0]);

              const now = yield* nowTimestamp;
              const id = makeRunId();
              const inserted = yield* sql<Row>`
                INSERT INTO graph_runs (
                  id, graph_id, project_id, tenant_id, owner_user_id, status,
                  input, nodes, edges, command_id, created_at, updated_at
                )
                SELECT ${id}, graphs.id, graphs.project_id, ${scope.tenantId},
                       ${scope.userId}, 'queued', ${input}, graphs.nodes,
                       graphs.edges, ${commandId}, ${now}, ${now}
                FROM graphs
                WHERE graphs.id = ${graphId}
                  AND graphs.tenant_id = ${scope.tenantId}
                  AND graphs.owner_user_id = ${scope.userId}
                RETURNING ${runProjection}
              `;
              const row = inserted[0];
              if (!row)
                return yield* Effect.fail(new GraphNotFound({ graphId }));
              const run = yield* decodeRun(row);
              yield* sql`
                INSERT INTO graph_run_nodes (graph_run_id, node_id, status, updated_at)
                SELECT ${run.id}, node->>'id', 'pending', ${now}
                FROM jsonb_array_elements(${JSON.stringify(run.nodes)}::jsonb) AS node
              `;
              yield* sql`
                INSERT INTO jobs (
                  id, kind, payload, status, attempts, max_attempts,
                  available_at, created_at, updated_at
                ) VALUES (
                  ${makeJobId()}, 'graph-run',
                  ${JSON.stringify({ graphRunId: run.id })}::jsonb,
                  'queued', 0, 5, ${now}, ${now}, ${now}
                )
              `;
              return run;
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({ operation: "start-graph-run" }),
              ),
            ),
          ),
      get: (scope, id) => loadDetail(id, true, scope.tenantId, scope.userId),
      listByGraph: (scope, graphId) =>
        persistence(
          "list-graph-runs",
          sql<Row>`
            SELECT ${runProjection} FROM graph_runs
            WHERE graph_id = ${graphId} AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
            ORDER BY created_at DESC, id DESC
          `,
        ).pipe(Effect.flatMap(Effect.forEach(decodeRun))),
      cancel: (scope, id) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const locked = yield* sql<Row>`
                SELECT ${runProjection} FROM graph_runs
                WHERE id = ${id} AND tenant_id = ${scope.tenantId}
                  AND owner_user_id = ${scope.userId}
                FOR UPDATE
              `;
              const row = locked[0];
              if (!row)
                return yield* Effect.fail(
                  new GraphRunNotFound({ graphRunId: id }),
                );
              const run = yield* decodeRun(row);
              if (!allowedGraphRunTransitions[run.status].has("cancelled")) {
                return yield* Effect.fail(
                  new InvalidGraphRunTransition({
                    from: run.status,
                    to: "cancelled",
                  }),
                );
              }
              const now = yield* nowTimestamp;
              yield* sql`
                UPDATE graph_runs SET status = 'cancelled', updated_at = ${now}
                WHERE id = ${id}
              `;
              yield* sql`
                UPDATE graph_run_nodes SET status = 'skipped', updated_at = ${now}
                WHERE graph_run_id = ${id} AND status IN ('pending', 'ready')
              `;
              return yield* loadDetail(id, false);
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({ operation: "cancel-graph-run" }),
              ),
            ),
          ),
    });
  }),
);
