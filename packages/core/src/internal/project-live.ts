import type { Project, ProjectId } from "@repo/contracts";
import { ProjectId as ProjectIdSchema } from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import { PersistenceError } from "../errors.js";
import { ProjectNotFound, ProjectService } from "../project-service.js";
import { decodeProjectRow, nowTimestamp, persistence } from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;

const makeId = (): ProjectId =>
  Schema.decodeUnknownSync(ProjectIdSchema)(`project_${ulid()}`);

const decodeFirst = (
  id: ProjectId,
  rows: ReadonlyArray<Row>,
): Effect.Effect<Project, ProjectNotFound | PersistenceError> => {
  const row = rows[0];
  return row
    ? decodeProjectRow(row)
    : Effect.fail(new ProjectNotFound({ projectId: id }));
};

const decodeCreated = (rows: ReadonlyArray<Row>) => {
  const row = rows[0];
  return row
    ? decodeProjectRow(row)
    : Effect.fail(
        new PersistenceError({ operation: "create-project-returning" }),
      );
};

export const ProjectServiceLive = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"',
    );

    return ProjectService.of({
      create: (scope, input) =>
        Effect.flatMap(nowTimestamp, (now) => {
          const id = makeId();
          return persistence(
            "create-project",
            sql<Row>`
            INSERT INTO projects (
              id, tenant_id, owner_user_id, name, description, created_at, updated_at
            )
            VALUES (
              ${id}, ${scope.tenantId}, ${scope.userId}, ${input.name}, ${input.description}, ${now}, ${now}
            )
            RETURNING ${projection}
          `,
          ).pipe(Effect.flatMap(decodeCreated));
        }),
      get: (scope, id) =>
        persistence(
          "get-project",
          sql<Row>`
            SELECT ${projection} FROM projects
            WHERE id = ${id}
              AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
          `,
        ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows))),
      list: (scope) =>
        persistence(
          "list-projects",
          sql<Row>`
            SELECT ${projection} FROM projects
            WHERE tenant_id = ${scope.tenantId} AND owner_user_id = ${scope.userId}
            ORDER BY created_at DESC, id DESC
          `,
        ).pipe(Effect.flatMap(Effect.forEach(decodeProjectRow))),
      update: (scope, id, input) =>
        Effect.flatMap(nowTimestamp, (now) =>
          persistence(
            "update-project",
            sql<Row>`
            UPDATE projects
            SET name = ${input.name}, description = ${input.description}, updated_at = ${now}
            WHERE id = ${id}
              AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
            RETURNING ${projection}
          `,
          ).pipe(Effect.flatMap((rows) => decodeFirst(id, rows))),
        ),
      remove: (scope, id) =>
        persistence(
          "remove-project",
          sql<{ readonly id: string }>`
            DELETE FROM projects
            WHERE id = ${id}
              AND tenant_id = ${scope.tenantId}
              AND owner_user_id = ${scope.userId}
            RETURNING id
          `,
        ).pipe(
          Effect.flatMap((rows) =>
            rows.length === 0
              ? Effect.fail(new ProjectNotFound({ projectId: id }))
              : Effect.void,
          ),
        ),
    });
  }),
);
