import type {
  GraphEdge,
  GraphNode,
  GraphNodeId,
  GraphNodeRunStatus,
  GraphRun,
  GraphRunId,
  GraphRunNode,
  GraphRunStatus,
  JobId,
  Timestamp,
} from "@repo/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  makeGraphRunHandler,
  substituteTemplate,
  type GraphCoordinatorJournal,
} from "../src/graph-run.js";
import type { Job } from "@repo/queue";

const now = "2026-07-19T12:00:00.000Z" as Timestamp;
const runId = "graphrun_01JY0000000000000000000000" as GraphRunId;

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

interface FakeWorld {
  status: GraphRunStatus;
  readonly nodes: Map<string, GraphNodeRunStatus>;
  readonly dispatched: Array<{ nodeId: string; prompt: string }>;
  readonly outputs: Map<string, string>;
  requeued: number;
}

const makeWorld = (
  definition: { nodes: ReadonlyArray<GraphNode>; edges: ReadonlyArray<GraphEdge> },
  input = "Ship it",
) => {
  const world: FakeWorld = {
    status: "queued",
    nodes: new Map(definition.nodes.map((n) => [n.id, "pending"])),
    dispatched: [],
    outputs: new Map(),
    requeued: 0,
  };
  const run: GraphRun = {
    id: runId,
    graphId: "graph_01JY0000000000000000000000" as never,
    projectId: "project_01JY0000000000000000000000" as never,
    status: world.status,
    input: input as never,
    nodes: definition.nodes,
    edges: definition.edges,
    createdAt: now,
    updatedAt: now,
  };
  const journal: GraphCoordinatorJournal = {
    load: () =>
      Effect.sync(() => ({
        run: { ...run, status: world.status },
        nodes: [...world.nodes.entries()].map(
          ([nodeId, status]): GraphRunNode => ({
            graphRunId: runId,
            nodeId: nodeId as GraphNodeId,
            status,
            agentRunId: null,
            sessionId: null,
            updatedAt: now,
          }),
        ),
      })),
    reconcile: () => Effect.void,
    markReady: (_id, nodeIds) =>
      Effect.sync(() => {
        for (const nodeId of nodeIds) world.nodes.set(nodeId, "ready");
      }),
    dispatch: (_id, nodeId, prompt) =>
      Effect.sync(() => {
        world.dispatched.push({ nodeId, prompt });
        world.nodes.set(nodeId, "running");
        return { nodeId };
      }),
    failNode: (_id, nodeId) =>
      Effect.sync(() => {
        world.nodes.set(nodeId, "failed");
      }),
    skip: (_id, nodeIds) =>
      Effect.sync(() => {
        for (const nodeId of nodeIds) world.nodes.set(nodeId, "skipped");
      }),
    nodeOutput: (_id, nodeId) =>
      Effect.sync(() => world.outputs.get(nodeId) ?? ""),
    finalize: () =>
      Effect.sync(() => {
        const statuses = [...world.nodes.values()];
        if (statuses.every((status) => status === "completed")) {
          world.status = "completed";
        } else if (
          statuses.some((status) => status === "failed") &&
          statuses.every(
            (status) =>
              status === "completed" ||
              status === "failed" ||
              status === "skipped",
          )
        ) {
          world.status = "failed";
        } else {
          world.status = "running";
        }
        return world.status;
      }),
    requeue: () =>
      Effect.sync(() => {
        world.requeued += 1;
      }),
  };
  return { world, journal };
};

const job: Job = {
  id: "job_01JY0000000000000000000000" as JobId,
  kind: "graph-run",
  payload: { graphRunId: runId },
  status: "running",
  attempts: 1,
  maxAttempts: 5,
  availableAt: now as never,
  leaseOwner: "test",
  leaseExpiresAt: null,
  lastErrorCode: null,
};

const pass = (journal: GraphCoordinatorJournal) =>
  Effect.runPromise(makeGraphRunHandler(journal)(job));

describe("graph run coordinator", () => {
  it("dispatches roots, then joins after both parents complete", async () => {
    const { world, journal } = makeWorld({
      nodes: [
        node("plan"),
        node("research"),
        node("code"),
        node("review", "Review {{nodes.code.output}}"),
      ],
      edges: [
        edge("plan", "research"),
        edge("plan", "code"),
        edge("research", "review"),
        edge("code", "review"),
      ],
    });
    await pass(journal);
    expect(world.dispatched.map((d) => d.nodeId)).toEqual(["plan"]);
    expect(world.requeued).toBe(1);

    world.nodes.set("plan", "completed");
    await pass(journal);
    expect(world.dispatched.map((d) => d.nodeId)).toEqual([
      "plan",
      "research",
      "code",
    ]);

    // Join must wait for BOTH parents.
    world.nodes.set("research", "completed");
    await pass(journal);
    expect(world.dispatched.map((d) => d.nodeId)).not.toContain("review");

    world.nodes.set("code", "completed");
    world.outputs.set("code", "the code output");
    await pass(journal);
    expect(world.dispatched.at(-1)).toEqual({
      nodeId: "review",
      prompt: "Review the code output",
    });

    world.nodes.set("review", "completed");
    await pass(journal);
    expect(world.status).toBe("completed");
  });

  it("skips descendants of a failed node and finalizes failed", async () => {
    const { world, journal } = makeWorld({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c")],
    });
    await pass(journal);
    world.nodes.set("a", "failed");
    await pass(journal);
    expect(world.nodes.get("b")).toBe("skipped");
    expect(world.nodes.get("c")).toBe("skipped");
    expect(world.status).toBe("failed");
  });

  it("replaying a pass never re-dispatches in-flight nodes", async () => {
    const { world, journal } = makeWorld({
      nodes: [node("only")],
      edges: [],
    });
    await pass(journal);
    await pass(journal);
    expect(world.dispatched).toHaveLength(1);
  });

  it("fails a node whose template reference has no output", async () => {
    const { world, journal } = makeWorld({
      nodes: [node("a"), node("b", "Use {{nodes.a.output}}")],
      edges: [edge("a", "b")],
    });
    await pass(journal);
    world.nodes.set("a", "completed");
    // no output recorded for a → unresolved
    const original = journal.nodeOutput;
    const failing: GraphCoordinatorJournal = {
      ...journal,
      nodeOutput: (id, nodeId) =>
        nodeId === "a"
          ? Effect.sync(() => undefined as never)
          : original(id, nodeId),
    };
    await Effect.runPromise(makeGraphRunHandler(failing)(job));
    expect(world.nodes.get("b")).toBe("failed");
  });

  it("substitutes input and outputs; reports unresolved references", () => {
    const outputs = new Map([["plan", "PLAN"]]);
    expect(
      substituteTemplate("Do {{input}} with {{nodes.plan.output}}", "X", outputs),
    ).toBe("Do X with PLAN");
    expect(
      substituteTemplate("{{nodes.ghost.output}}", "X", outputs),
    ).toMatchObject({ _tag: "UnresolvedReference", reference: "ghost" });
  });
});
