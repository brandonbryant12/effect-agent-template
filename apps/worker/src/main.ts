import { AppConfigLive } from "@repo/config";
import { runMigrations } from "@repo/db";
import { JobQueueService } from "@repo/queue";
import { makeWorkerRuntime } from "@repo/worker";
import { Effect, Layer } from "effect";
import { agentRunHandler } from "./agent-run-handler.js";
import { WorkerInfrastructureLive } from "./layers.js";

const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());

const program = Effect.gen(function* () {
  yield* runMigrations;
  const queue = yield* JobQueueService;
  const runtime = makeWorkerRuntime({
    queue,
    workerId: `worker-${process.pid}`,
    concurrency: 4,
    handlers: { "agent-run": agentRunHandler },
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
