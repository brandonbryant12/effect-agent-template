import {
  ProjectService,
  ProjectServiceLive,
  TaskService,
  TaskServiceLive,
} from "@repo/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { Schema } from "effect";
import { TenantId, UserId } from "@repo/contracts";
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
      Layer.mergeAll(ProjectServiceLive, TaskServiceLive),
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
});
