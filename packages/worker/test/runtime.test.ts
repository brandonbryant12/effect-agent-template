import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeJobQueueTest } from "@repo/queue";
import { makeWorkerRuntime } from "../src/index.js";

describe("WorkerRuntime", () => {
  it("drains registered jobs with bounded concurrency", async () => {
    const queue = makeJobQueueTest();
    for (let index = 0; index < 4; index += 1) {
      await Effect.runPromise(
        queue.enqueue({ kind: "example", payload: { index }, maxAttempts: 2 }),
      );
    }
    let active = 0;
    let maximum = 0;
    const runtime = makeWorkerRuntime({
      queue,
      workerId: "worker-1",
      concurrency: 2,
      handlers: {
        example: () =>
          Effect.acquireUseRelease(
            Effect.sync(() => {
              active += 1;
              maximum = Math.max(maximum, active);
            }),
            () => Effect.sleep("5 millis"),
            () =>
              Effect.sync(() => {
                active -= 1;
              }),
          ),
      },
    });

    expect(await Effect.runPromise(runtime.drain())).toBe(4);
    expect(maximum).toBe(2);
  });
});
