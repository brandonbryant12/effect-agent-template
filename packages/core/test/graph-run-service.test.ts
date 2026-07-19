import type {
  CommandId,
  GraphEdge,
  GraphNode,
  GraphNodeId,
  ProjectId,
  TenantId,
  UserId,
} from "@repo/contracts";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { AccessScope } from "../src/access-scope.js";
import {
  GraphRunService,
  GraphRunServiceTest,
} from "../src/graph-run-service.js";
import { GraphService, GraphServiceTest } from "../src/graph-service.js";

const scope: AccessScope = {
  tenantId: "tenant_01JY0000000000000000000000" as TenantId,
  userId: "user_01JY0000000000000000000000" as UserId,
};
const projectId = "project_01JY0000000000000000000000" as ProjectId;
const commandId = "command_01JY0000000000000000000000" as CommandId;

const node = (id: string): GraphNode => ({
  id: id as GraphNodeId,
  name: id,
  promptTemplate: "Do {{input}}",
  position: { x: 0, y: 0 },
});
const edge = (from: string, to: string): GraphEdge => ({
  from: from as GraphNodeId,
  to: to as GraphNodeId,
});

const TestLayer = Layer.merge(
  GraphServiceTest,
  Layer.provide(GraphRunServiceTest, GraphServiceTest),
);

const runTest = <A>(
  program: Effect.Effect<A, unknown, GraphService | GraphRunService>,
) => Effect.runPromise(Effect.provide(program, TestLayer));

describe("GraphRunService (test layer)", () => {
  it("starts a run with a definition snapshot and pending nodes", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const graphs = yield* GraphService;
        const graphRuns = yield* GraphRunService;
        const graph = yield* graphs.create(scope, projectId, {
          name: "Pipeline",
          nodes: [node("plan"), node("build")],
          edges: [edge("plan", "build")],
        });
        const run = yield* graphRuns.start(
          scope,
          graph.id,
          commandId,
          "Ship it",
        );
        const replay = yield* graphRuns.start(
          scope,
          graph.id,
          commandId,
          "Ship it",
        );
        const detail = yield* graphRuns.get(scope, run.id);
        return { run, replay, detail };
      }),
    );
    expect(result.run.status).toBe("queued");
    expect(result.run.nodes).toHaveLength(2);
    expect(result.replay.id).toBe(result.run.id);
    expect(result.detail.nodes.map((n) => n.status)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("cancel skips pending nodes and rejects double cancel", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const graphs = yield* GraphService;
        const graphRuns = yield* GraphRunService;
        const graph = yield* graphs.create(scope, projectId, {
          name: "Pipeline",
          nodes: [node("only")],
          edges: [],
        });
        const run = yield* graphRuns.start(scope, graph.id, commandId, "Go");
        const cancelled = yield* graphRuns.cancel(scope, run.id);
        const again = yield* Effect.flip(graphRuns.cancel(scope, run.id));
        return { cancelled, again };
      }),
    );
    expect(result.cancelled.run.status).toBe("cancelled");
    expect(result.cancelled.nodes[0]?.status).toBe("skipped");
    expect(result.again).toMatchObject({ _tag: "InvalidGraphRunTransition" });
  });
});
