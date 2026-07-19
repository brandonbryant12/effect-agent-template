import type { Graph, GraphId } from "@repo/contracts";
import {
  Graph as GraphSchema,
  GraphId as GraphIdSchema,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import { PersistenceError } from "../errors.js";
import { GraphNotFound } from "../graph-errors.js";
import { GraphService } from "../graph-service.js";
import { validateGraph } from "../graph-validation.js";
import {
  normalizeTimestamps,
  nowTimestamp,
  persistence,
} from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;

const makeId = (): GraphId =>
  Schema.decodeUnknownSync(GraphIdSchema)(`graph_${ulid()}`);

const decode = (row: Row): Effect.Effect<Graph, PersistenceError> =>
  Schema.decodeUnknownEffect(GraphSchema)(normalizeTimestamps(row)).pipe(
    Effect.mapError(() => new PersistenceError({ operation: "decode-graph" })),
  );

const decodeFirst = (
  id: GraphId,
  rows: ReadonlyArray<Row>,
): Effect.Effect<Graph, GraphNotFound | PersistenceError> => {
  const row = rows[0];
  return row ? decode(row) : Effect.fail(new GraphNotFound({ graphId: id }));
};

export const GraphServiceLive = Layer.effect(
  GraphService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'graphs.id, graphs.project_id AS "projectId", graphs.name, graphs.nodes, graphs.edges, graphs.created_at AS "createdAt", graphs.updated_at AS "updatedAt"',
    );

    return GraphService.of({
      create: (scope, projectId, input) => {
        const violation = validateGraph(input);
        if (violation) return Effect.fail(violation);
        return Effect.flatMap(nowTimestamp, (now) => {
          const id = makeId();
          return persistence(
            "create-graph",
            sql<Row>`
              INSERT INTO graphs (
                id, tenant_id, owner_user_id, project_id, name, nodes, edges,
                created_at, updated_at
              )
              SELECT ${id}, ${scope.tenantId}, ${scope.userId}, projects.id,
                     ${input.name}, ${JSON.stringify(input.nodes)}::jsonb,
                     ${JSON.stringify(input.edges)}::jsonb, ${now}, ${now}
              FROM projects
              WHERE projects.id = ${projectId}
                AND projects.tenant_id = ${scope.tenantId}
                AND projects.owner_user_id = ${scope.userId}
              RETURNING ${projection}
            `,
          ).pipe(
            Effect.flatMap((rows) =>
              rows[0]
                ? decode(rows[0])
                : Effect.fail(
                    new PersistenceError({ operation: "create-graph-scope" }),
                  ),
            ),
          );
        });
      },
      get: (scope, id) =>
        persistence(
          "get-graph",
          sql<Row>`
            SELECT ${projection} FROM graphs
            WHERE id = ${id} AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
          `,
        ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows))),
      listByProject: (scope, projectId) =>
        persistence(
          "list-graphs",
          sql<Row>`
            SELECT ${projection} FROM graphs
            WHERE project_id = ${projectId} AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
            ORDER BY created_at DESC, id DESC
          `,
        ).pipe(Effect.flatMap(Effect.forEach(decode))),
      update: (scope, id, input) => {
        const violation = validateGraph(input);
        if (violation) return Effect.fail(violation);
        return Effect.flatMap(nowTimestamp, (now) =>
          persistence(
            "update-graph",
            sql<Row>`
              UPDATE graphs
              SET name = ${input.name}, nodes = ${JSON.stringify(input.nodes)}::jsonb,
                  edges = ${JSON.stringify(input.edges)}::jsonb, updated_at = ${now}
              WHERE id = ${id} AND tenant_id = ${scope.tenantId}
                AND owner_user_id = ${scope.userId}
              RETURNING ${projection}
            `,
          ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows))),
        );
      },
      remove: (scope, id) =>
        persistence(
          "remove-graph",
          sql<{ readonly id: string }>`
            DELETE FROM graphs
            WHERE id = ${id} AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
            RETURNING id
          `,
        ).pipe(
          Effect.flatMap((rows) =>
            rows.length === 0
              ? Effect.fail(new GraphNotFound({ graphId: id }))
              : Effect.void,
          ),
        ),
    });
  }),
);
