import { AppConfigLive } from "@repo/config";
import { AppConfig } from "@repo/config";
import { AgentRuntimeError, makeAgentRuntimeTest } from "@repo/agent-runtime";
import {
  makeOpenCodeRuntime,
  makeOpenCodeSdkDriver,
  makeOpenCodeServer,
  type OpenCodeConnection,
} from "@repo/agent-runtime-opencode";
import { runMigrations } from "@repo/db";
import { JobQueueService } from "@repo/queue";
import {
  makeSandboxWorkspaceTest,
  SandboxError,
  type SandboxWorkspace,
} from "@repo/sandbox";
import { makeOpenSandboxWorkspace } from "@repo/sandbox-opensandbox";
import { makeAwsSecretStore } from "@repo/secrets";
import {
  makeAgentRunHandler,
  makeCancelHandler,
  makePermissionHandler,
  makeWorkerRuntime,
} from "@repo/worker";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeAgentRunJournalPostgres } from "./journal.js";
import { WorkerInfrastructureLive } from "./layers.js";
import { makeSessionCredentialInstaller } from "./credentials.js";

const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());

const program = Effect.gen(function* () {
  yield* runMigrations;
  const queue = yield* JobQueueService;
  const config = yield* AppConfig;
  const journal = yield* makeAgentRunJournalPostgres;
  const sql = yield* SqlClient;
  const live = config.sandboxProvider === "opensandbox";
  const connections = new Map<string, OpenCodeConnection>();
  const openSandboxApiKey = config.openSandboxApiKey;
  if (live && !openSandboxApiKey) {
    return yield* Effect.die(
      new Error(
        "OPEN_SANDBOX_API_KEY must be set when SANDBOX_PROVIDER=opensandbox",
      ),
    );
  }
  const openSandbox =
    live && openSandboxApiKey
      ? makeOpenSandboxWorkspace({
          domain: config.openSandboxDomain,
          apiKey: openSandboxApiKey,
          image: config.openSandboxImage,
          allowedHosts: config.openSandboxAllowedHosts,
        })
      : undefined;
  const baseWorkspace = openSandbox?.workspace ?? makeSandboxWorkspaceTest();
  const openCodeServer = makeOpenCodeServer(baseWorkspace);
  const workspace: SandboxWorkspace = live
    ? {
        ...baseWorkspace,
        create: (input) =>
          baseWorkspace.create(input).pipe(
            Effect.tap((ref) =>
              openCodeServer.start(ref).pipe(
                Effect.mapError(
                  () =>
                    new SandboxError({
                      operation: "start-opencode-server",
                      reason: "unavailable",
                      retryable: true,
                    }),
                ),
                Effect.tap((connection) =>
                  Effect.sync(() => connections.set(ref.id, connection)),
                ),
              ),
            ),
          ),
      }
    : baseWorkspace;
  const agentRuntime = live
    ? makeOpenCodeRuntime({
        driver: makeOpenCodeSdkDriver(),
        connectionForWorkspace: (workspaceRef) => {
          const connection = connections.get(workspaceRef);
          return connection
            ? Effect.succeed(connection)
            : Effect.fail(
                new AgentRuntimeError({
                  operation: "resolve-opencode-connection",
                  reason: "not-found",
                  retryable: false,
                }),
              );
        },
      })
    : makeAgentRuntimeTest();
  const agentRunHandler = makeAgentRunHandler({
    runtime: agentRuntime,
    workspace,
    journal,
    ...(openSandbox
      ? {
          prepareWorkspace: makeSessionCredentialInstaller(
            sql,
            openSandbox.credentials,
            makeAwsSecretStore({
              region: config.awsRegion,
              namePrefix: config.secretNamePrefix,
            }),
          ),
        }
      : {}),
  });
  const runtime = makeWorkerRuntime({
    queue,
    workerId: `worker-${process.pid}`,
    concurrency: 4,
    handlers: {
      "agent-run": agentRunHandler,
      "agent-permission": makePermissionHandler(agentRuntime, journal),
      "agent-cancel": makeCancelHandler(agentRuntime),
    },
  });
  while (!abort.signal.aborted) {
    yield* runtime.drain();
    yield* Effect.sleep("1 second");
  }
});

const MainLive = Layer.provideMerge(WorkerInfrastructureLive, AppConfigLive);

Effect.runPromise(Effect.provide(program, MainLive)).catch((error: unknown) => {
  console.error("worker failed", error);
  process.exitCode = 1;
});
