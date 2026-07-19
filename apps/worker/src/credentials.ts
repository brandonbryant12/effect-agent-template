// architecture-allow: raw-sql -- reads frozen session credential references when installing vault bindings
import type { AgentSessionId } from "@repo/contracts";
import { CredentialId, CredentialProvider } from "@repo/contracts";
import type { WorkspaceRef } from "@repo/sandbox";
import { SandboxError } from "@repo/sandbox";
import type { SandboxCredentialBroker } from "@repo/sandbox-opensandbox";
import { SecretRef, type SecretStore } from "@repo/secrets";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";

const Row = Schema.Struct({
  id: CredentialId,
  provider: CredentialProvider,
  secretRef: Schema.String,
});

const binding = (provider: typeof CredentialProvider.Type, name: string) => {
  switch (provider) {
    case "openai":
      return {
        name,
        hosts: ["api.openai.com"],
        methods: ["POST"],
        paths: ["/**"],
        auth: { type: "bearer" as const },
      };
    case "anthropic":
      return {
        name,
        hosts: ["api.anthropic.com"],
        methods: ["POST"],
        paths: ["/**"],
        auth: { type: "apiKey" as const, headerName: "x-api-key" },
      };
    case "github":
      return {
        name,
        hosts: ["github.com", "api.github.com"],
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        paths: ["/**"],
        auth: { type: "bearer" as const },
      };
    case "custom":
      return undefined;
  }
};

export const makeSessionCredentialInstaller =
  (sql: SqlClient, broker: SandboxCredentialBroker, secretStore: SecretStore) =>
  (sessionId: AgentSessionId, workspace: WorkspaceRef) =>
    Effect.gen(function* () {
      const raw = yield* sql<Readonly<Record<string, unknown>>>`
      SELECT credentials.id, credentials.provider, credentials.secret_ref AS "secretRef"
      FROM agent_session_credentials
      INNER JOIN credentials ON credentials.id = agent_session_credentials.credential_id
      WHERE agent_session_credentials.session_id = ${sessionId}
        AND credentials.status = 'active'
      ORDER BY credentials.id
    `.pipe(
        Effect.mapError(
          () =>
            new SandboxError({
              operation: "list-session-credentials",
              reason: "unavailable",
              retryable: true,
            }),
        ),
      );
      const rows = yield* Schema.decodeUnknownEffect(Schema.Array(Row))(
        raw,
      ).pipe(
        Effect.mapError(
          () =>
            new SandboxError({
              operation: "decode-session-credentials",
              reason: "unavailable",
              retryable: false,
            }),
        ),
      );
      for (const row of rows) {
        const spec = binding(row.provider, row.id);
        if (!spec) {
          return yield* Effect.fail(
            new SandboxError({
              operation: "bind-custom-credential",
              reason: "unavailable",
              retryable: false,
            }),
          );
        }
        const ref = yield* Schema.decodeUnknownEffect(SecretRef)(
          JSON.parse(row.secretRef),
        ).pipe(
          Effect.mapError(
            () =>
              new SandboxError({
                operation: "decode-secret-reference",
                reason: "unavailable",
                retryable: false,
              }),
          ),
        );
        yield* broker.install(workspace, spec, ref, secretStore);
      }
    });
