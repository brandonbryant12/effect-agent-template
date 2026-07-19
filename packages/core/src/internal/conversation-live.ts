import {
  Conversation as ConversationSchema,
  ConversationId as ConversationIdSchema,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  ConversationNotFound,
  ConversationService,
} from "../conversation-service.js";
import { PersistenceError } from "../errors.js";
import { normalizeTimestamps, nowTimestamp } from "./sql-helpers.js";

type Row = Readonly<Record<string, unknown>>;

const decode = (row: Row) =>
  Schema.decodeUnknownEffect(ConversationSchema)(normalizeTimestamps(row)).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-conversation" }),
    ),
  );

export const ConversationServiceLive = Layer.effect(
  ConversationService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'conversations.id, conversations.project_id AS "projectId", conversations.title, conversations.created_at AS "createdAt", conversations.updated_at AS "updatedAt"',
    );
    return ConversationService.of({
      create: (scope, input) =>
        Effect.flatMap(nowTimestamp, (now) => {
          const id = Schema.decodeUnknownSync(ConversationIdSchema)(
            `conversation_${ulid()}`,
          );
          return sql<Row>`
          INSERT INTO conversations (id, project_id, title, created_at, updated_at)
          SELECT ${id}, projects.id, ${input.title}, ${now}, ${now}
          FROM projects
          WHERE projects.id = ${input.projectId}
            AND projects.tenant_id = ${scope.tenantId}
            AND projects.owner_user_id = ${scope.userId}
          RETURNING ${projection}
        `.pipe(
            Effect.mapError(
              () => new PersistenceError({ operation: "create-conversation" }),
            ),
            Effect.flatMap((rows) =>
              rows[0]
                ? decode(rows[0])
                : Effect.fail(
                    new PersistenceError({
                      operation: "create-conversation-scope",
                    }),
                  ),
            ),
          );
        }),
      get: (scope, id) =>
        Effect.gen(function* () {
          const rows = yield* sql<Row>`
          SELECT ${projection}
          FROM conversations
          INNER JOIN projects ON projects.id = conversations.project_id
          WHERE conversations.id = ${id}
            AND projects.tenant_id = ${scope.tenantId}
            AND projects.owner_user_id = ${scope.userId}
        `.pipe(
            Effect.mapError(
              () => new PersistenceError({ operation: "get-conversation" }),
            ),
          );
          const row = rows[0];
          if (!row) {
            return yield* new ConversationNotFound({ conversationId: id });
          }
          return yield* decode(row);
        }),
    });
  }),
);
