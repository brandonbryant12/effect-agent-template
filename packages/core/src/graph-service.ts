import type {
  CreateGraph,
  Graph,
  GraphId,
  ProjectId,
  UpdateGraph,
} from "@repo/contracts";
import { GraphId as GraphIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import type { PersistenceError } from "./errors.js";
import { GraphNotFound, type InvalidGraph } from "./graph-errors.js";
import { validateGraph } from "./graph-validation.js";

export class GraphService extends Context.Service<
  GraphService,
  {
    readonly create: (
      scope: AccessScope,
      projectId: ProjectId,
      input: CreateGraph,
    ) => Effect.Effect<Graph, InvalidGraph | PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: GraphId,
    ) => Effect.Effect<Graph, GraphNotFound | PersistenceError>;
    readonly listByProject: (
      scope: AccessScope,
      projectId: ProjectId,
    ) => Effect.Effect<ReadonlyArray<Graph>, PersistenceError>;
    readonly update: (
      scope: AccessScope,
      id: GraphId,
      input: UpdateGraph,
    ) => Effect.Effect<
      Graph,
      InvalidGraph | GraphNotFound | PersistenceError
    >;
    readonly remove: (
      scope: AccessScope,
      id: GraphId,
    ) => Effect.Effect<void, GraphNotFound | PersistenceError>;
  }
>()("repo/GraphService") {}

const graphId = (value: string): GraphId =>
  Schema.decodeUnknownSync(GraphIdSchema)(`graph_${value}`);
const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const GraphServiceTest = Layer.effect(
  GraphService,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<GraphId, Graph>());
    const owners = yield* Ref.make(new Map<GraphId, AccessScope>());
    let sequence = 0;

    const get = (scope: AccessScope, id: GraphId) =>
      Effect.flatMap(
        Effect.all([Ref.get(state), Ref.get(owners)]),
        ([graphs, ownership]) => {
          const graph = graphs.get(id);
          const owner = ownership.get(id);
          return graph &&
            owner?.tenantId === scope.tenantId &&
            owner.userId === scope.userId
            ? Effect.succeed(graph)
            : Effect.fail(new GraphNotFound({ graphId: id }));
        },
      );

    return GraphService.of({
      create: (scope, projectId, input) => {
        const violation = validateGraph(input);
        if (violation) return Effect.fail(violation);
        sequence += 1;
        const now = timestamp("2026-07-19T12:00:00.000Z");
        const graph: Graph = {
          id: graphId(sequence.toString().padStart(26, "0")),
          projectId,
          name: input.name,
          nodes: input.nodes,
          edges: input.edges,
          createdAt: now,
          updatedAt: now,
        };
        return Effect.as(
          Effect.all([
            Ref.update(state, (graphs) => new Map(graphs).set(graph.id, graph)),
            Ref.update(owners, (current) =>
              new Map(current).set(graph.id, scope),
            ),
          ]),
          graph,
        );
      },
      get,
      listByProject: (scope, projectId) =>
        Effect.map(
          Effect.all([Ref.get(state), Ref.get(owners)]),
          ([graphs, ownership]) =>
            [...graphs.values()].filter((graph) => {
              const owner = ownership.get(graph.id);
              return (
                graph.projectId === projectId &&
                owner?.tenantId === scope.tenantId &&
                owner.userId === scope.userId
              );
            }),
        ),
      update: (scope, id, input) => {
        const violation = validateGraph(input);
        if (violation) return Effect.fail(violation);
        return Effect.flatMap(get(scope, id), (current) => {
          const updated: Graph = {
            ...current,
            name: input.name,
            nodes: input.nodes,
            edges: input.edges,
            updatedAt: timestamp("2026-07-19T12:00:01.000Z"),
          };
          return Effect.as(
            Ref.update(state, (graphs) => new Map(graphs).set(id, updated)),
            updated,
          );
        });
      },
      remove: (scope, id) =>
        Effect.flatMap(get(scope, id), () =>
          Effect.asVoid(
            Ref.update(state, (graphs) => {
              const next = new Map(graphs);
              next.delete(id);
              return next;
            }),
          ),
        ),
    });
  }),
);
