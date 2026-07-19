// architecture-allow: raw-sql -- readiness probe issues SELECT 1 against the pooled client
import { createBetterAuthRuntime } from "@repo/auth";
import { decodeAppConfig } from "@repo/config";
import {
  AgentRunService,
  AgentRunServiceLive,
  ApprovalService,
  ApprovalServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
  ConversationService,
  ConversationServiceLive,
  CredentialService,
  CredentialServiceLive,
  ProjectService,
  ProjectServiceLive,
  TaskService,
  TaskServiceLive,
} from "@repo/core";
import { PostgresLive, runMigrations } from "@repo/db";
import {
  makeCredentialUploadService,
  makeSecretStoreMemory,
} from "@repo/secrets";
import { serveHttp } from "@repo/node-http";
import { Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeApiHandler } from "./api.js";

const config = decodeAppConfig(process.env);
if (
  config.nodeEnv === "production" &&
  (!process.env.BETTER_AUTH_SECRET ||
    !process.env.CREDENTIAL_UPLOAD_SIGNING_KEY)
) {
  throw new Error(
    "BETTER_AUTH_SECRET and CREDENTIAL_UPLOAD_SIGNING_KEY are required by the production server",
  );
}
const publicUrl =
  process.env.SERVER_PUBLIC_URL ?? `http://localhost:${config.serverPort}`;
const credentialBrokerUrl =
  process.env.CREDENTIAL_BROKER_URL ?? "http://localhost:3001";
const auth = createBetterAuthRuntime({
  databaseUrl: config.databaseUrl,
  baseURL: `${publicUrl}/api/auth`,
  secret: Redacted.value(config.betterAuthSecret),
  cliClientId: "effect-agent-cli",
  defaultTenantId: "tenant_00000000000000000000000000",
  trustedOrigins: [config.webOrigin],
});
const uploads = makeCredentialUploadService({
  secretStore: makeSecretStoreMemory(),
  signingKey: config.credentialUploadSigningKey,
});
const Postgres = PostgresLive(config.databaseUrl);
const Domain = Layer.provide(
  Layer.mergeAll(
    ProjectServiceLive,
    TaskServiceLive,
    ConversationServiceLive,
    AgentSessionServiceLive,
    AgentRunServiceLive,
    ApprovalServiceLive,
    CredentialServiceLive,
  ),
  Postgres,
);
const Services = Layer.merge(Domain, Postgres);

const program = Effect.gen(function* () {
  yield* runMigrations;
  const projects = yield* ProjectService;
  const tasks = yield* TaskService;
  const conversations = yield* ConversationService;
  const sessions = yield* AgentSessionService;
  const runs = yield* AgentRunService;
  const approvals = yield* ApprovalService;
  const credentials = yield* CredentialService;
  const sql = yield* SqlClient;
  const handler = makeApiHandler({
    authenticate: auth.authenticate,
    authHandler: auth.handler,
    projects,
    tasks,
    conversations,
    sessions,
    runs,
    approvals,
    credentials,
    uploads,
    credentialBrokerUrl,
    webOrigin: config.webOrigin,
    readiness: Effect.asVoid(sql`SELECT 1`),
  });

  yield* serveHttp({
    handler,
    port: config.serverPort,
    host: config.serverHost,
    publicUrl,
    onClose: () => auth.close(),
    onError: (error) => console.error("request bridge failed", error),
  });
});

Effect.runPromise(Effect.provide(program, Services)).catch((error: unknown) => {
  console.error("server failed", error);
  process.exitCode = 1;
});
