import type { AgentSession, AgentSessionId } from "@repo/contracts";
import {
  AgentSession as AgentSessionSchema,
  AgentSessionId as AgentSessionIdSchema,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import {
  AgentSessionNotFound,
  AgentSessionService,
  InvalidAgentSessionTransition,
} from "../agent-session-service.js";
import { PersistenceError } from "../errors.js";
import { allowedSessionTransitions } from "../agent-session-transitions.js";
import { nowTimestamp } from "./sql-helpers.js";
import type { AccessScope } from "../access-scope.js";

type Row = Readonly<Record<string, unknown>>;
const decode = (row: Row) =>
  Schema.decodeUnknownEffect(AgentSessionSchema)({
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
      () => new PersistenceError({ operation: "decode-agent-session" }),
    ),
  );

export const AgentSessionServiceLive = Layer.effect(
  AgentSessionService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const projection = sql.literal(
      'agent_sessions.id, agent_sessions.tenant_id AS "tenantId", agent_sessions.user_id AS "userId", agent_sessions.project_id AS "projectId", agent_sessions.conversation_id AS "conversationId", agent_sessions.status, agent_sessions.created_at AS "createdAt", agent_sessions.updated_at AS "updatedAt"',
    );
    const get = (
      scope: AccessScope,
      id: AgentSessionId,
    ): Effect.Effect<AgentSession, AgentSessionNotFound | PersistenceError> =>
      Effect.gen(function* () {
        const rows = yield* sql<Row>`SELECT ${projection} FROM agent_sessions
          WHERE id = ${id} AND tenant_id = ${scope.tenantId} AND user_id = ${scope.userId}`.pipe(
          Effect.mapError(
            () => new PersistenceError({ operation: "get-agent-session" }),
          ),
        );
        const row = rows[0];
        if (!row) return yield* new AgentSessionNotFound({ sessionId: id });
        return yield* decode(row);
      });
    return AgentSessionService.of({
      create: (scope, input) => {
        const id = Schema.decodeUnknownSync(AgentSessionIdSchema)(
          `session_${ulid()}`,
        );
        return sql
          .withTransaction(
            Effect.gen(function* () {
              const now = yield* nowTimestamp;
              const rows = yield* sql<Row>`
          INSERT INTO agent_sessions (
            id, tenant_id, user_id, project_id, conversation_id, status, created_at, updated_at
          )
          SELECT ${id}, ${scope.tenantId}, ${scope.userId}, projects.id,
                 conversations.id, 'provisioning', ${now}, ${now}
          FROM projects
          INNER JOIN conversations ON conversations.project_id = projects.id
          WHERE projects.id = ${input.projectId}
            AND conversations.id = ${input.conversationId}
            AND projects.tenant_id = ${scope.tenantId}
            AND projects.owner_user_id = ${scope.userId}
          RETURNING ${projection}
          `;
              const row = rows[0];
              if (!row)
                return yield* Effect.fail(
                  new PersistenceError({
                    operation: "create-agent-session-scope",
                  }),
                );
              for (const credentialId of input.credentialIds ?? []) {
                const linked = yield* sql`
              INSERT INTO agent_session_credentials (session_id, credential_id, created_at)
              SELECT ${id}, credentials.id, ${now}
              FROM credentials
              WHERE credentials.id = ${credentialId}
                AND credentials.tenant_id = ${scope.tenantId}
                AND credentials.user_id = ${scope.userId}
                AND credentials.status = 'active'
              RETURNING credential_id
            `;
                if (linked.length !== 1) {
                  return yield* Effect.fail(
                    new PersistenceError({
                      operation: "attach-session-credential-scope",
                    }),
                  );
                }
              }
              return yield* decode(row);
            }),
          )
          .pipe(
            Effect.catchTag("SqlError", () =>
              Effect.fail(
                new PersistenceError({ operation: "create-agent-session" }),
              ),
            ),
          );
      },
      get,
      transition: (scope, id, status) =>
        Effect.gen(function* () {
          const current = yield* get(scope, id);
          if (!allowedSessionTransitions[current.status].has(status)) {
            return yield* new InvalidAgentSessionTransition({
              from: current.status,
              to: status,
            });
          }
          const now = yield* nowTimestamp;
          const rows = yield* sql<Row>`
                  UPDATE agent_sessions SET status = ${status}, updated_at = ${now}
                  WHERE id = ${id} AND tenant_id = ${scope.tenantId} AND user_id = ${scope.userId}
                  RETURNING ${projection}
                `.pipe(
            Effect.mapError(
              () =>
                new PersistenceError({
                  operation: "transition-agent-session",
                }),
            ),
          );
          return yield* decode(rows[0] ?? {});
        }),
    });
  }),
);
