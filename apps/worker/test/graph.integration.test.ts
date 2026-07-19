import { makeAgentRuntimeTest } from "@repo/agent-runtime";
import { CommandId, GraphNodeId, TenantId, UserId } from "@repo/contracts";
import {
  AgentRunService,
  AgentRunServiceLive,
  GraphRunService,
  GraphRunServiceLive,
  GraphService,
  GraphServiceLive,
  ProjectService,
  ProjectServiceLive,
} from "@repo/core";
import { PostgresLive, runMigrations } from "@repo/db";
import { JobQueueLive, JobQueueService } from "@repo/queue";
import { makeSandboxWorkspaceTest } from "@repo/sandbox";
import {
  makeAgentRunHandler,
  makeGraphRunHandler,
  makeWorkerRuntime,
} from "@repo/worker";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { describe, expect, it } from "vitest";
import { makeGraphCoordinatorJournal } from "../src/graph-journal.js";
import { makeAgentRunJournalPostgres } from "../src/journal.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

const scope = {
  tenantId: Schema.decodeUnknownSync(TenantId)(
    "tenant_00000000000000000000000000",
  ),
  userId: Schema.decodeUnknownSync(UserId)("user_00000000000000000000000000"),
};
const nodeId = Schema.decodeUnknownSync(GraphNodeId);

integration("durable graph execution", () => {
  it("runs a two-node graph to completion with output handoff", async () => {
    const Postgres = PostgresLive(databaseUrl ?? "");
    const Services = Layer.merge(
      Layer.provide(
        Layer.mergeAll(
          ProjectServiceLive,
          AgentRunServiceLive,
          GraphServiceLive,
          GraphRunServiceLive,
          JobQueueLive,
        ),
        Postgres,
      ),
      Postgres,
    );

    const program = Effect.gen(function* () {
      yield* runMigrations;
      const sql = yield* SqlClient;
      const projects = yield* ProjectService;
      const graphs = yield* GraphService;
      const graphRuns = yield* GraphRunService;
      const agentRuns = yield* AgentRunService;
      const queue = yield* JobQueueService;

      const project = yield* projects.create(scope, {
        name: "Graph execution",
        description: null,
      });
      const graph = yield* graphs.create(scope, project.id, {
        name: "Two step",
        nodes: [
          {
            id: nodeId("plan"),
            name: "Plan",
            promptTemplate: "Plan {{input}}",
            position: { x: 0, y: 0 },
          },
          {
            id: nodeId("build"),
            name: "Build",
            promptTemplate: "Build from: {{nodes.plan.output}}",
            position: { x: 240, y: 0 },
          },
        ],
        edges: [{ from: nodeId("plan"), to: nodeId("build") }],
      });
      const commandId = Schema.decodeUnknownSync(CommandId)(
        `command_${crypto.randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`,
      );
      const started = yield* graphRuns.start(
        scope,
        graph.id,
        commandId,
        "the durable demo",
      );

      const agentJournal = yield* makeAgentRunJournalPostgres;
      const graphJournal = yield* makeGraphCoordinatorJournal(agentRuns);
      const runtime = makeWorkerRuntime({
        queue,
        workerId: "graph-int-test",
        concurrency: 4,
        handlers: {
          "agent-run": makeAgentRunHandler({
            runtime: makeAgentRuntimeTest(),
            workspace: makeSandboxWorkspaceTest(),
            journal: agentJournal,
          }),
          "graph-run": makeGraphRunHandler(graphJournal),
        },
      });

      let detail = yield* graphRuns.get(scope, started.id);
      for (let pass = 0; pass < 20; pass += 1) {
        yield* runtime.drain();
        // Collapse the coordinator's 5-second requeue delay for the test.
        yield* sql`
          UPDATE jobs SET available_at = now()
          WHERE kind = 'graph-run' AND status IN ('queued', 'retrying')
        `;
        detail = yield* graphRuns.get(scope, started.id);
        if (
          detail.run.status === "completed" ||
          detail.run.status === "failed" ||
          detail.run.status === "cancelled"
        ) {
          break;
        }
      }

      const buildNode = detail.nodes.find((node) => node.nodeId === "build");
      const prompt = buildNode?.agentRunId
        ? yield* sql<{ readonly prompt: string | null }>`
            SELECT payload->>'prompt' AS prompt
            FROM agent_run_commands
            WHERE run_id = ${buildNode.agentRunId}
          `
        : [];
      return { detail, prompt: prompt[0]?.prompt ?? null };
    });

    const result = await Effect.runPromise(Effect.provide(program, Services));
    expect(result.detail.run.status).toBe("completed");
    expect(result.detail.nodes.map((node) => node.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(result.prompt).toBe("Build from: Deterministic response");
  }, 30_000);
});
