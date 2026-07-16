import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeJobQueueTest } from "../src/index.js";

describe("JobQueue contract", () => {
  it("enforces exclusive leases and supports retry", async () => {
    let now = new Date("2026-07-16T12:00:00.000Z");
    const queue = makeJobQueueTest({ now: () => now });
    const job = await Effect.runPromise(
      queue.enqueue({ kind: "example", payload: { value: 1 }, maxAttempts: 3 }),
    );
    const claimed = await Effect.runPromise(
      queue.claim({ workerId: "worker-1", leaseSeconds: 30 }),
    );
    expect(claimed?.id).toBe(job.id);
    expect(
      await Effect.runPromise(
        queue.claim({ workerId: "worker-2", leaseSeconds: 30 }),
      ),
    ).toBeUndefined();
    await expect(
      Effect.runPromise(queue.complete(job.id, "worker-2")),
    ).rejects.toMatchObject({ _tag: "JobQueueError", reason: "lease-lost" });

    await Effect.runPromise(queue.retry(job.id, "worker-1", "transient", 10));
    expect(
      await Effect.runPromise(
        queue.claim({ workerId: "worker-2", leaseSeconds: 30 }),
      ),
    ).toBeUndefined();
    now = new Date("2026-07-16T12:00:11.000Z");
    expect(
      (
        await Effect.runPromise(
          queue.claim({ workerId: "worker-2", leaseSeconds: 30 }),
        )
      )?.attempts,
    ).toBe(2);
  });
});
