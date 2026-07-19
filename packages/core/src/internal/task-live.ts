import type { Task, TaskId } from "@repo/contracts";
import { TaskId as TaskIdSchema } from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  InvalidTaskTransition,
  TaskNotFound,
  TaskService,
} from "../task-service.js";
import { transitionTask } from "../task-transition.js";
import { decodeTaskRow, persistence } from "./sql-helpers.js";
import { PersistenceError } from "../errors.js";
import type { AccessScope } from "../access-scope.js";

type Row = Readonly<Record<string, unknown>>;

const makeId = (): TaskId =>
  Schema.decodeUnknownSync(TaskIdSchema)(`task_${ulid()}`);

const decodeFirst = (
  id: TaskId,
  rows: ReadonlyArray<Row>,
): Effect.Effect<Task, TaskNotFound | PersistenceError> => {
  const row = rows[0];
  return row
    ? decodeTaskRow(row)
    : Effect.fail(new TaskNotFound({ taskId: id }));
};

const decodeCreated = (rows: ReadonlyArray<Row>) => {
  const row = rows[0];
  return row
    ? decodeTaskRow(row)
    : Effect.fail(new PersistenceError({ operation: "create-task-returning" }));
};

export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'tasks.id, tasks.project_id AS "projectId", tasks.title, tasks.description, tasks.status, tasks.created_at AS "createdAt", tasks.updated_at AS "updatedAt"',
    );

    const get = (scope: AccessScope, id: TaskId) =>
      persistence(
        "get-task",
        sql<Row>`
          SELECT ${projection}
          FROM tasks
          INNER JOIN projects ON projects.id = tasks.project_id
          WHERE tasks.id = ${id}
            AND projects.tenant_id = ${scope.tenantId}
            AND projects.owner_user_id = ${scope.userId}
        `,
      ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows)));

    return TaskService.of({
      create: (scope, input) => {
        const id = makeId();
        const now = new Date();
        return persistence(
          "create-task",
          sql<Row>`
            INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at)
            SELECT ${id}, projects.id, ${input.title}, ${input.description}, 'todo', ${now}, ${now}
            FROM projects
            WHERE projects.id = ${input.projectId}
              AND projects.tenant_id = ${scope.tenantId}
              AND projects.owner_user_id = ${scope.userId}
            RETURNING ${projection}
          `,
        ).pipe(Effect.flatMap(decodeCreated));
      },
      get,
      listByProject: (scope, projectId) =>
        persistence(
          "list-tasks",
          sql<Row>`
            SELECT ${projection}
            FROM tasks
            INNER JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.project_id = ${projectId}
              AND projects.tenant_id = ${scope.tenantId}
              AND projects.owner_user_id = ${scope.userId}
            ORDER BY tasks.created_at ASC, tasks.id ASC
          `,
        ).pipe(Effect.flatMap(Effect.forEach(decodeTaskRow))),
      transition: (scope, id, status) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const rows = yield* persistence(
                "lock-task",
                sql<Row>`
                SELECT ${projection}
                FROM tasks
                INNER JOIN projects ON projects.id = tasks.project_id
                WHERE tasks.id = ${id}
                  AND projects.tenant_id = ${scope.tenantId}
                  AND projects.owner_user_id = ${scope.userId}
                FOR UPDATE OF tasks
              `,
              );
              const current = yield* decodeFirst(id, rows);
              const result = transitionTask(current.status, status);
              if ("_tag" in result) {
                return yield* new InvalidTaskTransition({
                  from: result.from,
                  to: result.to,
                });
              }
              const updated = yield* persistence(
                "transition-task",
                sql<Row>`
                UPDATE tasks SET status = ${result.status}, updated_at = ${new Date()}
                WHERE id = ${id}
                RETURNING ${projection}
              `,
              );
              return yield* decodeFirst(id, updated);
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({ operation: "task-transaction" }),
              ),
            ),
          ),
    });
  }),
);
