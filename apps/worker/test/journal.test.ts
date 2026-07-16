import { AgentRunId } from "@repo/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { toDurableRunEvent } from "../src/journal.js";

const runId = Schema.decodeUnknownSync(AgentRunId)(
  "run_01JY0000000000000000000000",
);
const occurredAt = "2026-07-16T12:00:00.000Z" as never;

describe("worker journal mapping", () => {
  it("maps provider-neutral runtime terminal events to repository events", () => {
    expect(
      toDurableRunEvent(
        runId,
        4,
        occurredAt,
        { _tag: "RuntimeCompleted" },
        () => "approval_01JY0000000000000000000000" as never,
      ),
    ).toEqual({
      _tag: "RunCompleted",
      protocolVersion: 1,
      runId,
      sequence: 4,
      occurredAt,
    });
    expect(
      toDurableRunEvent(
        runId,
        5,
        occurredAt,
        { _tag: "RuntimeTextDelta", text: "Done" },
        () => "approval_01JY0000000000000000000000" as never,
      ),
    ).toMatchObject({ _tag: "AssistantTextCompleted", text: "Done" });
  });

  it("does not duplicate the begin event for runtime readiness", () => {
    expect(
      toDurableRunEvent(
        runId,
        2,
        occurredAt,
        { _tag: "RuntimeReady", session: { id: "runtime-1" } },
        () => "approval_01JY0000000000000000000000" as never,
      ),
    ).toBeUndefined();
  });
});
