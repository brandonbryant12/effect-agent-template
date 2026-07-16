import { createBetterAuthRuntime } from "@repo/auth";
import { decodeAppConfig } from "@repo/config";
import {
  AgentRunService,
  AgentRunServiceLive,
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
import { Effect, Layer, Redacted } from "effect";
import { createServer } from "node:http";
import { makeApiHandler } from "./api.js";

const config = decodeAppConfig(process.env);
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
  const credentials = yield* CredentialService;
  const handler = makeApiHandler({
    authenticate: auth.authenticate,
    authHandler: auth.handler,
    projects,
    tasks,
    conversations,
    sessions,
    runs,
    credentials,
    uploads,
    credentialBrokerUrl,
    webOrigin: config.webOrigin,
  });

  yield* Effect.callback<void>((resume) => {
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Array<Buffer> = [];
        for await (const chunk of incoming) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const requestHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            value.forEach((entry) => requestHeaders.append(name, entry));
          } else if (value !== undefined) requestHeaders.set(name, value);
        }
        const request = new Request(`${publicUrl}${incoming.url ?? "/"}`, {
          method: incoming.method ?? "GET",
          headers: requestHeaders,
          ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
        });
        const response = await handler(request);
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        outgoing.writeHead(500, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: "internal_error" }));
      }
    });
    server.listen(config.serverPort, config.serverHost);
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
  console.error("server failed", error);
  process.exitCode = 1;
});
