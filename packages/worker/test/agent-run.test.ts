import { makeAgentRuntimeTest } from "@repo/agent-runtime";
import { JobId } from "@repo/contracts";
import { makeSandboxWorkspaceTest } from "@repo/sandbox";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { makeAgentRunHandler, type AgentRunJournal } from "../src/agent-run.js";

const job = (payload: unknown) => ({
  id: Schema.decodeUnknownSync(JobId)("job_01JY0000000000000000000000"),
  kind: "agent-run",
  payload,
  status: "running" as const,
  attempts: 1,
  maxAttempts: 5,
  availableAt: "2026-07-16T12:00:00.000Z" as never,
  leaseOwner: "worker-1",
  leaseExpiresAt: "2026-07-16T12:00:30.000Z" as never,
  lastErrorCode: null,
});

describe("agent run handler", () => {
  it("drives the injected runtime and journals durable events", async () => {
    const recorded: Array<string> = [];
    const journal: AgentRunJournal = {
      begin: () => Effect.sync(() => recorded.push("begin")),
      record: (_runId, event) => Effect.sync(() => recorded.push(event._tag)),
    };
    const handler = makeAgentRunHandler({
      runtime: makeAgentRuntimeTest(),
      workspace: makeSandboxWorkspaceTest(),
      journal,
    });

    await Effect.runPromise(
      handler(
        job({
          runId: "run_01JY0000000000000000000000",
          sessionId: "session_01JY0000000000000000000000",
          prompt: "Build the project",
        }),
      ),
    );

    expect(recorded).toEqual([
      "begin",
      "RuntimeReady",
      "RuntimeTextDelta",
      "RuntimeCompleted",
    ]);
  });

  it("rejects malformed job payloads without retrying", async () => {
    const handler = makeAgentRunHandler({
      runtime: makeAgentRuntimeTest(),
      workspace: makeSandboxWorkspaceTest(),
      journal: {
        begin: () => Effect.void,
        record: () => Effect.void,
      },
    });
    await expect(Effect.runPromise(handler(job({})))).rejects.toMatchObject({
      _tag: "JobHandlerError",
      retryable: false,
    });
  });
});
