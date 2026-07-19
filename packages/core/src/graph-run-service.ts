import type {
  CommandId,
  GraphId,
  GraphRun,
  GraphRunDetail,
  GraphRunId,
  GraphRunNode,
} from "@repo/contracts";
import { GraphRunId as GraphRunIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import type { PersistenceError } from "./errors.js";
import {
  GraphNotFound,
  GraphRunNotFound,
  InvalidGraphRunTransition,
} from "./graph-errors.js";
import { allowedGraphRunTransitions } from "./graph-run-transitions.js";
import { isSkippableGraphNodeStatus } from "./graph-run-transitions.js";
import { GraphService } from "./graph-service.js";

export class GraphRunService extends Context.Service<
  GraphRunService,
  {
    readonly start: (
      scope: AccessScope,
      graphId: GraphId,
      commandId: CommandId,
      input: string,
    ) => Effect.Effect<GraphRun, GraphNotFound | PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: GraphRunId,
    ) => Effect.Effect<GraphRunDetail, GraphRunNotFound | PersistenceError>;
    readonly listByGraph: (
      scope: AccessScope,
      graphId: GraphId,
    ) => Effect.Effect<ReadonlyArray<GraphRun>, PersistenceError>;
    readonly cancel: (
      scope: AccessScope,
      id: GraphRunId,
    ) => Effect.Effect<
      GraphRunDetail,
      GraphRunNotFound | InvalidGraphRunTransition | PersistenceError
    >;
  }
>()("repo/GraphRunService") {}

const runId = (value: string): GraphRunId =>
  Schema.decodeUnknownSync(GraphRunIdSchema)(`graphrun_${value}`);
const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const GraphRunServiceTest = Layer.effect(
  GraphRunService,
  Effect.gen(function* () {
    const graphs = yield* GraphService;
    const runs = yield* Ref.make(
      new Map<
        GraphRunId,
        { readonly scope: AccessScope; readonly run: GraphRun }
      >(),
    );
    const nodes = yield* Ref.make(
      new Map<GraphRunId, ReadonlyArray<GraphRunNode>>(),
    );
    const byCommand = yield* Ref.make(new Map<CommandId, GraphRunId>());
    let sequence = 0;

    const get = (scope: AccessScope, id: GraphRunId) =>
      Effect.flatMap(
        Effect.all([Ref.get(runs), Ref.get(nodes)]),
        ([allRuns, allNodes]) => {
          const record = allRuns.get(id);
          return record &&
            record.scope.tenantId === scope.tenantId &&
            record.scope.userId === scope.userId
            ? Effect.succeed({ run: record.run, nodes: allNodes.get(id) ?? [] })
            : Effect.fail(new GraphRunNotFound({ graphRunId: id }));
        },
      );

    return GraphRunService.of({
      start: (scope, graphId, commandId, input) =>
        Effect.gen(function* () {
          const existingId = (yield* Ref.get(byCommand)).get(commandId);
          if (existingId) {
            const existing = (yield* Ref.get(runs)).get(existingId);
            if (
              existing &&
              existing.scope.tenantId === scope.tenantId &&
              existing.scope.userId === scope.userId
            ) {
              return existing.run;
            }
          }
          const graph = yield* graphs.get(scope, graphId);
          sequence += 1;
          const now = timestamp("2026-07-19T12:00:00.000Z");
          const run: GraphRun = {
            id: runId(sequence.toString().padStart(26, "0")),
            graphId,
            projectId: graph.projectId,
            status: "queued",
            input,
            nodes: graph.nodes,
            edges: graph.edges,
            createdAt: now,
            updatedAt: now,
          };
          const nodeRows: ReadonlyArray<GraphRunNode> = graph.nodes.map(
            (node) => ({
              graphRunId: run.id,
              nodeId: node.id,
              status: "pending",
              agentRunId: null,
              sessionId: null,
              updatedAt: now,
            }),
          );
          yield* Ref.update(runs, (current) =>
            new Map(current).set(run.id, { scope, run }),
          );
          yield* Ref.update(nodes, (current) =>
            new Map(current).set(run.id, nodeRows),
          );
          yield* Ref.update(byCommand, (current) =>
            new Map(current).set(commandId, run.id),
          );
          return run;
        }),
      get,
      listByGraph: (scope, graphId) =>
        Effect.map(Ref.get(runs), (allRuns) =>
          [...allRuns.values()]
            .filter(
              (record) =>
                record.scope.tenantId === scope.tenantId &&
                record.scope.userId === scope.userId,
            )
            .map((record) => record.run)
            .filter((run) => run.graphId === graphId),
        ),
      cancel: (scope, id) =>
        Effect.gen(function* () {
          const detail = yield* get(scope, id);
          if (!allowedGraphRunTransitions[detail.run.status].has("cancelled")) {
            return yield* Effect.fail(
              new InvalidGraphRunTransition({
                from: detail.run.status,
                to: "cancelled",
              }),
            );
          }
          const now = timestamp("2026-07-19T12:00:01.000Z");
          const cancelled: GraphRun = {
            ...detail.run,
            status: "cancelled",
            updatedAt: now,
          };
          const nextNodes = detail.nodes.map((node) =>
            isSkippableGraphNodeStatus(node.status)
              ? { ...node, status: "skipped" as const, updatedAt: now }
              : node,
          );
          yield* Ref.update(runs, (current) =>
            new Map(current).set(id, { scope, run: cancelled }),
          );
          yield* Ref.update(nodes, (current) =>
            new Map(current).set(id, nextNodes),
          );
          return { run: cancelled, nodes: nextNodes };
        }),
    });
  }),
);
