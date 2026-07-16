import {
  AgentRunService,
  AgentRunServiceLive,
  ProjectService,
  ProjectServiceLive,
  TaskService,
  TaskServiceLive,
} from "@repo/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { Schema } from "effect";
import {
  AgentSessionId,
  CommandId,
  ConversationId,
  ProjectId,
  TaskId,
  TenantId,
  UserId,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { PostgresLive, runMigrations } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const scope = {
  tenantId: Schema.decodeUnknownSync(TenantId)(
    "tenant_00000000000000000000000000",
  ),
  userId: Schema.decodeUnknownSync(UserId)("user_00000000000000000000000000"),
};

integration("Postgres capabilities", () => {
  const Postgres = PostgresLive(databaseUrl ?? "");
  const Services = Layer.merge(
    Layer.provide(
      Layer.mergeAll(ProjectServiceLive, TaskServiceLive, AgentRunServiceLive),
      Postgres,
    ),
    Postgres,
  );

  it("migrates and persists project/task behavior", async () => {
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const projects = yield* ProjectService;
      const tasks = yield* TaskService;
      const project = yield* projects.create(scope, {
        name: "Database example",
        description: null,
      });
      const task = yield* tasks.create(scope, {
        projectId: project.id,
        title: "Exercise transaction",
        description: null,
      });
      const completed = yield* tasks
        .transition(scope, task.id, "in-progress")
        .pipe(Effect.flatMap(() => tasks.transition(scope, task.id, "done")));
      return { project: yield* projects.get(scope, project.id), completed };
    });

    const result = await Effect.runPromise(Effect.provide(program, Services));
    expect(result.project.name).toBe("Database example");
    expect(result.completed.status).toBe("done");
  });

  it("migrates user-scoped sessions and write-only credential metadata", async () => {
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const sql = yield* SqlClient;
      const tables = yield* sql<{ readonly table_name: string }>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'agent_sessions', 'credentials', 'credential_uploads')
        ORDER BY table_name
      `;
      return tables.map((row) => row.table_name);
    });

    const tables = await Effect.runPromise(Effect.provide(program, Services));
    expect(tables).toEqual([
      "agent_sessions",
      "credential_uploads",
      "credentials",
      "users",
    ]);
  });

  it("admits a run, command, first event, and job exactly once", async () => {
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const sql = yield* SqlClient;
      const projects = yield* ProjectService;
      const runs = yield* AgentRunService;
      const project = yield* projects.create(scope, {
        name: "Atomic run",
        description: null,
      });
      const conversationId = "conversation_01J00000000000000000000001";
      const sessionId = "session_01J00000000000000000000001";
      const commandId = "command_01J00000000000000000000001";
      yield* sql`DELETE FROM conversations WHERE id = ${conversationId}`;
      yield* sql`
        INSERT INTO conversations (id, project_id, title, created_at, updated_at)
        VALUES (${conversationId}, ${project.id}, 'Atomic run', now(), now())
      `;
      yield* sql`
        INSERT INTO agent_sessions (
          id, tenant_id, user_id, project_id, conversation_id, status, created_at, updated_at
        ) VALUES (
          ${sessionId}, ${scope.tenantId}, ${scope.userId}, ${project.id}, ${conversationId}, 'ready', now(), now()
        )
      `;
      const input = Schema.decodeUnknownSync(
        Schema.Struct({
          commandId: CommandId,
          sessionId: AgentSessionId,
          projectId: ProjectId,
          conversationId: ConversationId,
          taskId: Schema.NullOr(TaskId),
          prompt: Schema.String,
        }),
      )({
        commandId,
        sessionId,
        projectId: project.id,
        conversationId,
        taskId: null,
        prompt: "Build the project",
      });
      const first = yield* runs.admit(scope, input);
      const repeated = yield* runs.admit(scope, input);
      const counts = yield* sql<{
        readonly commands: number;
        readonly events: number;
        readonly jobs: number;
        readonly prompt: string;
      }>`
        SELECT
          (SELECT count(*)::int FROM agent_run_commands WHERE id = ${commandId}) AS commands,
          (SELECT count(*)::int FROM agent_run_events WHERE run_id = ${first.id}) AS events,
          (SELECT count(*)::int FROM jobs WHERE payload->>'runId' = ${first.id}) AS jobs,
          (SELECT payload->>'prompt' FROM jobs WHERE payload->>'runId' = ${first.id}) AS prompt
      `;
      return { first, repeated, counts: counts[0] };
    });

    const result = await Effect.runPromise(Effect.provide(program, Services));
    expect(result.repeated.id).toBe(result.first.id);
    expect(result.counts).toEqual({
      commands: 1,
      events: 1,
      jobs: 1,
      prompt: "Build the project",
    });
  });
});
