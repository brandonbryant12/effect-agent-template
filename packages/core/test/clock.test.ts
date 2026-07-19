import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import { nowTimestamp } from "../src/internal/sql-helpers.js";

describe("nowTimestamp", () => {
  it("derives its value from the ambient Clock, so TestClock controls it", async () => {
    const program = Effect.gen(function* () {
      yield* TestClock.setTime(new Date("2026-07-19T09:30:00.000Z").getTime());
      const first = yield* nowTimestamp;
      yield* TestClock.adjust("5 minutes");
      const second = yield* nowTimestamp;
      return { first, second };
    });
    const { first, second } = await Effect.runPromise(
      Effect.provide(program, TestClock.layer()),
    );
    expect(first).toBe("2026-07-19T09:30:00.000Z");
    expect(second).toBe("2026-07-19T09:35:00.000Z");
  });
});
