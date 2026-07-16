import { PostgresLive, runMigrations } from "@repo/db";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { JobQueueLive, JobQueueService } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Postgres JobQueue", () => {
  it("claims a job once across concurrent workers", async () => {
    const Postgres = PostgresLive(databaseUrl ?? "");
    const Live = Layer.provide(JobQueueLive, Postgres);
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const queue = yield* JobQueueService;
      const enqueued = yield* queue.enqueue({
        kind: `integration-${crypto.randomUUID()}`,
        payload: { safe: true },
        maxAttempts: 2,
        availableAt: new Date("2000-01-01T00:00:00.000Z"),
      });
      const claims = yield* Effect.all(
        [
          queue.claim({ workerId: "worker-a", leaseSeconds: 30 }),
          queue.claim({ workerId: "worker-b", leaseSeconds: 30 }),
        ],
        { concurrency: "unbounded" },
      );
      return {
        enqueued,
        claims: claims.filter((job) => job?.id === enqueued.id),
      };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, Layer.merge(Live, Postgres)),
    );
    expect(result.claims).toHaveLength(1);
  });
});
