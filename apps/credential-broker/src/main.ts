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
import { Clock, Effect, Layer, Redacted } from "effect";
import { createServer } from "node:http";
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

  yield* Effect.callback<void>((resume) => {
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Array<Buffer> = [];
        let size = 0;
        for await (const chunk of incoming) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.byteLength;
          if (size > maxBodyBytes) {
            outgoing.writeHead(413, { "cache-control": "no-store" });
            outgoing.end();
            return;
          }
          chunks.push(buffer);
        }
        const requestHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value))
            value.forEach((entry) => requestHeaders.append(name, entry));
          else if (value !== undefined) requestHeaders.set(name, value);
        }
        const request = new Request(
          `http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
          {
            method: incoming.method ?? "GET",
            headers: requestHeaders,
            ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
          },
        );
        const response = await handler(request);
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        outgoing.writeHead(500, { "cache-control": "no-store" });
        outgoing.end();
      }
    });
    server.listen(port, config.serverHost);
    const close = () =>
      server.close(() => {
        void auth.close().finally(() => resume(Effect.void));
      });
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return Effect.sync(() => server.close());
  });
});

Effect.runPromise(Effect.provide(program, Services)).catch((error: unknown) => {
  console.error("credential broker failed", error);
  process.exitCode = 1;
});
