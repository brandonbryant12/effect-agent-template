import { AppConfig } from "@repo/config";
import { PostgresLive } from "@repo/db";
import { JobQueueLive } from "@repo/queue";
import { Effect, Layer } from "effect";

export const WorkerInfrastructureLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const Postgres = PostgresLive(config.databaseUrl);
    return Layer.merge(Layer.provide(JobQueueLive, Postgres), Postgres);
  }),
);
