import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import type { AgentRuntimeEvent } from "../src/index.js";
import { isTerminalRuntimeEvent, makeAgentRuntimeTest } from "../src/index.js";

describe("AgentRuntime contract", () => {
  it.each([
    ["RuntimeReady", false],
    ["RuntimeTextDelta", false],
    ["RuntimePermissionRequested", false],
    ["RuntimeCompleted", true],
    ["RuntimeCancelled", true],
    ["RuntimeFailed", true],
  ] as const)("derives terminality for %s", (_tag, expected) => {
    expect(isTerminalRuntimeEvent({ _tag } as AgentRuntimeEvent)).toBe(
      expected,
    );
  });

  it("pauses for permission, resumes deterministically, and cleans up", async () => {
    const runtime = makeAgentRuntimeTest();
    const session = await Effect.runPromise(
      runtime.createSession({ workspaceRef: "workspace-1" }),
    );
    await Effect.runPromise(
      runtime.send({ session, message: "please require approval" }),
    );
    const paused = Array.from(
      await Effect.runPromise(runtime.events(session).pipe(Stream.runCollect)),
    );
    expect(paused.map((event) => event._tag)).toEqual([
      "RuntimeReady",
      "RuntimeTextDelta",
      "RuntimePermissionRequested",
    ]);

    await Effect.runPromise(
      runtime.replyPermission({
        session,
        permissionId: "permission-1",
        decision: "once",
      }),
    );
    const resumed = Array.from(
      await Effect.runPromise(runtime.events(session).pipe(Stream.runCollect)),
    );
    expect(resumed.at(-1)?._tag).toBe("RuntimeCompleted");

    await Effect.runPromise(runtime.close(session));
    await expect(
      Effect.runPromise(runtime.cancel(session)),
    ).rejects.toMatchObject({ _tag: "AgentRuntimeError", reason: "not-found" });
  });

  it("reports cooperative cancellation", async () => {
    const runtime = makeAgentRuntimeTest();
    const session = await Effect.runPromise(
      runtime.createSession({ workspaceRef: "workspace-2" }),
    );
    await Effect.runPromise(runtime.cancel(session));
    const events = Array.from(
      await Effect.runPromise(runtime.events(session).pipe(Stream.runCollect)),
    );
    expect(events.at(-1)?._tag).toBe("RuntimeCancelled");
  });

  it("exposes safe deterministic failures", async () => {
    const runtime = makeAgentRuntimeTest();
    const session = await Effect.runPromise(
      runtime.createSession({ workspaceRef: "workspace-3" }),
    );
    await Effect.runPromise(runtime.send({ session, message: "please fail" }));
    const events = Array.from(
      await Effect.runPromise(runtime.events(session).pipe(Stream.runCollect)),
    );
    expect(events.at(-1)).toMatchObject({
      _tag: "RuntimeFailed",
      code: "deterministic_failure",
    });
  });
});
