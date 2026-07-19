import type { CredentialId } from "@repo/contracts";
import {
  Credential as CredentialSchema,
  CredentialId as CredentialIdSchema,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  CredentialNotFound,
  CredentialService,
} from "../credential-service.js";
import { PersistenceError } from "../errors.js";
import { nowTimestamp } from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;
const decode = (row: Row) =>
  Schema.decodeUnknownEffect(CredentialSchema)({
    ...row,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  }).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-credential" }),
    ),
  );

export const CredentialServiceLive = Layer.effect(
  CredentialService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'id, tenant_id AS "tenantId", user_id AS "userId", provider, ownership, label, display_hint AS "displayHint", status, created_at AS "createdAt", updated_at AS "updatedAt"',
    );
    return CredentialService.of({
      createPending: (scope, input) =>
        Effect.flatMap(nowTimestamp, (now) => {
          const id = Schema.decodeUnknownSync(CredentialIdSchema)(
            `credential_${ulid()}`,
          );
          return sql<Row>`
          INSERT INTO credentials (
            id, tenant_id, user_id, provider, ownership, label,
            display_hint, status, created_at, updated_at
          ) VALUES (
            ${id}, ${scope.tenantId}, ${scope.userId}, ${input.provider},
            'personal', ${input.label}, '', 'pending', ${now}, ${now}
          ) RETURNING ${projection}
        `.pipe(
            Effect.mapError(
              () => new PersistenceError({ operation: "create-credential" }),
            ),
            Effect.flatMap((rows) => {
              const row = rows[0];
              return row
                ? decode(row)
                : Effect.fail(
                    new PersistenceError({
                      operation: "create-credential-missing-row",
                    }),
                  );
            }),
          );
        }),
      get: (scope, id: CredentialId) =>
        Effect.gen(function* () {
          const rows = yield* sql<Row>`
          SELECT ${projection} FROM credentials
          WHERE id = ${id} AND tenant_id = ${scope.tenantId} AND user_id = ${scope.userId}
        `.pipe(
            Effect.mapError(
              () => new PersistenceError({ operation: "get-credential" }),
            ),
          );
          const row = rows[0];
          if (!row) return yield* new CredentialNotFound({ credentialId: id });
          return yield* decode(row);
        }),
    });
  }),
);
