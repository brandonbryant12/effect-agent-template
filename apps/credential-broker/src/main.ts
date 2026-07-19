// architecture-allow: raw-sql -- atomically consumes one-time upload tokens inside the broker's narrow scope
import { createBetterAuthRuntime } from "@repo/auth";
import { decodeAppConfig } from "@repo/config";
import {
  CredentialSecretService,
  CredentialSecretServiceLive,
} from "@repo/core";
import { PostgresLive, runMigrations } from "@repo/db";
import {
  makeAwsSecretStore,
  makeCredentialUploadService,
  makeSecretStoreMemory,
} from "@repo/secrets";
import { serveHttp } from "@repo/node-http";
import { Clock, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { createCredentialUploadHandler } from "./api.js";

const config = decodeAppConfig(process.env);
if (
  config.nodeEnv === "production" &&
  (!process.env.BETTER_AUTH_SECRET ||
    !process.env.CREDENTIAL_UPLOAD_SIGNING_KEY)
) {
  throw new Error(
    "BETTER_AUTH_SECRET and CREDENTIAL_UPLOAD_SIGNING_KEY are required by the production credential broker",
  );
}
const port = Number(process.env.CREDENTIAL_BROKER_PORT ?? "3001");
const serverPublicUrl =
  process.env.SERVER_PUBLIC_URL ?? `http://localhost:${config.serverPort}`;
const maxBodyBytes = 16 * 1024;
const auth = createBetterAuthRuntime({
  databaseUrl: config.databaseUrl,
  baseURL: `${serverPublicUrl}/api/auth`,
  secret: Redacted.value(config.betterAuthSecret),
  cliClientId: "effect-agent-cli",
  defaultTenantId: "tenant_00000000000000000000000000",
  trustedOrigins: [config.webOrigin],
});
const secretStore =
  config.secretStoreProvider === "aws"
    ? makeAwsSecretStore({
        region: config.awsRegion,
        namePrefix: config.secretNamePrefix,
      })
    : makeSecretStoreMemory();
const Postgres = PostgresLive(config.databaseUrl);
const Services = Layer.merge(
  Layer.provide(CredentialSecretServiceLive, Postgres),
  Postgres,
);

const program = Effect.gen(function* () {
  yield* runMigrations;
  const sql = yield* SqlClient;
  const credentialSecrets = yield* CredentialSecretService;
  const uploads = makeCredentialUploadService({
    secretStore,
    signingKey: config.credentialUploadSigningKey,
    claim: (input) =>
      Effect.flatMap(Clock.currentTimeMillis, (millis) => {
        const now = new Date(millis);
        return Effect.map(
          sql<{ readonly id: string }>`
          INSERT INTO credential_uploads (
            id, credential_id, token_hash, expires_at, consumed_at, created_at
          ) VALUES (
            ${input.uploadId}, ${input.credentialId}, ${input.tokenHash},
            ${input.expiresAt}, ${now}, ${now}
          )
          ON CONFLICT (token_hash) DO NOTHING
          RETURNING id
        `,
          (rows) => rows.length === 1,
        );
      }),
  });
  const handler = createCredentialUploadHandler({
    authenticate: auth.authenticate,
    uploads,
    maxBodyBytes,
    webOrigin: config.webOrigin,
    onStored: (principal, stored) =>
      credentialSecrets.activate({
        tenantId: principal.tenantId,
        userId: principal.userId,
        credentialId: stored.credentialId,
        secretRef: JSON.stringify(stored.secretRef),
      }),
  });

  yield* serveHttp({
    handler,
    port,
    host: config.serverHost,
    maxBodyBytes,
    onClose: () => auth.close(),
    // The broker never logs request detail; its routes carry secret material.
  });
});

Effect.runPromise(Effect.provide(program, Services)).catch((error: unknown) => {
  console.error("credential broker failed", error);
  process.exitCode = 1;
});
