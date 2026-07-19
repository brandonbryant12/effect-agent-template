import type {
  GraphEdge,
  GraphNode,
  GraphNodeId,
  ProjectId,
  TenantId,
  UserId,
} from "@repo/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { AccessScope } from "../src/access-scope.js";
import { GraphService, GraphServiceTest } from "../src/graph-service.js";

const scope: AccessScope = {
  tenantId: "tenant_01JY0000000000000000000000" as TenantId,
  userId: "user_01JY0000000000000000000000" as UserId,
};
const otherScope: AccessScope = {
  tenantId: scope.tenantId,
  userId: "user_01JY0000000000000000000099" as UserId,
};
const projectId = "project_01JY0000000000000000000000" as ProjectId;

const node = (id: string, promptTemplate = "Do {{input}}"): GraphNode => ({
  id: id as GraphNodeId,
  name: id,
  promptTemplate,
  position: { x: 0, y: 0 },
});
const edge = (from: string, to: string): GraphEdge => ({
  from: from as GraphNodeId,
  to: to as GraphNodeId,
});

const runTest = <A>(program: Effect.Effect<A, unknown, GraphService>) =>
  Effect.runPromise(Effect.provide(program, GraphServiceTest));

describe("GraphService (test layer)", () => {
  it("creates, lists, updates, and removes graphs within scope", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const graphs = yield* GraphService;
        const created = yield* graphs.create(scope, projectId, {
          name: "Pipeline",
          nodes: [node("plan"), node("build")],
          edges: [edge("plan", "build")],
        });
        const listed = yield* graphs.listByProject(scope, projectId);
        const updated = yield* graphs.update(scope, created.id, {
          name: "Pipeline v2",
          nodes: [node("plan")],
          edges: [],
        });
        yield* graphs.remove(scope, created.id);
        const after = yield* graphs.listByProject(scope, projectId);
        return { created, listed, updated, after };
      }),
    );
    expect(result.listed).toHaveLength(1);
    expect(result.updated.name).toBe("Pipeline v2");
    expect(result.after).toHaveLength(0);
  });

  it("rejects invalid definitions with InvalidGraph", async () => {
    const failure = await runTest(
      Effect.gen(function* () {
        const graphs = yield* GraphService;
        return yield* Effect.flip(
          graphs.create(scope, projectId, {
            name: "Cyclic",
            nodes: [node("a"), node("b")],
            edges: [edge("a", "b"), edge("b", "a")],
          }),
        );
      }),
    );
    expect(failure).toMatchObject({ _tag: "InvalidGraph", reason: "cycle" });
  });

  it("scopes access to the owning user", async () => {
    const failure = await runTest(
      Effect.gen(function* () {
        const graphs = yield* GraphService;
        const created = yield* graphs.create(scope, projectId, {
          name: "Private",
          nodes: [node("only")],
          edges: [],
        });
        return yield* Effect.flip(graphs.get(otherScope, created.id));
      }),
    );
    expect(failure).toMatchObject({ _tag: "GraphNotFound" });
  });
});
