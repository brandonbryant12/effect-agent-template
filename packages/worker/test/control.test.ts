import { makeAgentRuntimeTest } from "@repo/agent-runtime";
import { AgentRunId, JobId } from "@repo/contracts";
import { Effect, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { makePermissionHandler, type AgentRunJournal } from "../src/index.js";

describe("agent runtime control jobs", () => {
  it("resumes an approval and journals only the new terminal event", async () => {
    const runtime = makeAgentRuntimeTest();
    const session = await Effect.runPromise(
      runtime.createSession({ workspaceRef: "workspace-1" }),
    );
    await Effect.runPromise(
      runtime.send({ session, message: "needs approval" }),
    );
    await Effect.runPromise(Stream.runDrain(runtime.events(session)));
    const recorded: Array<string> = [];
    const journal: AgentRunJournal = {
      begin: () => Effect.void,
      record: (_runId, event) => Effect.sync(() => recorded.push(event._tag)),
    };
    const runId = Schema.decodeUnknownSync(AgentRunId)(
      "run_01JY0000000000000000000000",
    );
    const handler = makePermissionHandler(runtime, journal);
    await Effect.runPromise(
      handler({
        id: Schema.decodeUnknownSync(JobId)("job_01JY0000000000000000000000"),
        kind: "agent-permission",
        payload: {
          runId,
          runtimeSessionId: session.id,
          permissionId: "permission-1",
          decision: "once",
        },
        status: "running",
        attempts: 1,
        maxAttempts: 5,
        availableAt: "2026-07-16T12:00:00.000Z" as never,
        leaseOwner: "worker-1",
        leaseExpiresAt: "2026-07-16T12:00:30.000Z" as never,
        lastErrorCode: null,
      }),
    );
    expect(recorded).toEqual(["RuntimeCompleted"]);
  });
});
