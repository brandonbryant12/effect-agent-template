import { PostgresLive, runMigrations } from "@repo/db";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
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
      const sql = yield* SqlClient;
      yield* sql`DELETE FROM jobs`;
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

  it("reclaims a running job after its worker lease expires", async () => {
    const Postgres = PostgresLive(databaseUrl ?? "");
    const Live = Layer.provide(JobQueueLive, Postgres);
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const queue = yield* JobQueueService;
      const sql = yield* SqlClient;
      yield* sql`DELETE FROM jobs`;
      const enqueued = yield* queue.enqueue({
        kind: `lease-recovery-${crypto.randomUUID()}`,
        payload: { safe: true },
        maxAttempts: 3,
      });
      yield* queue.claim({ workerId: "worker-that-died", leaseSeconds: 30 });
      yield* sql`
        UPDATE jobs SET lease_expires_at = now() - interval '1 second'
        WHERE id = ${enqueued.id}
      `;
      return yield* queue.claim({
        workerId: "replacement-worker",
        leaseSeconds: 30,
      });
    });

    const reclaimed = await Effect.runPromise(
      Effect.provide(program, Layer.merge(Live, Postgres)),
    );
    expect(reclaimed).toMatchObject({
      leaseOwner: "replacement-worker",
      attempts: 2,
    });
  });
});
