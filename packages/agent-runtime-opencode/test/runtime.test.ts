import { Effect, Redacted, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { makeOpenCodeRuntime, type OpenCodeDriver } from "../src/index.js";

describe("OpenCode AgentRuntime adapter", () => {
  it("classifies rate limits with retryable redacted detail", async () => {
    const runtime = makeOpenCodeRuntime({
      driver: {
        createSession: async () => {
          throw {
            name: "RateLimitError",
            status: 429,
            message: "token=private-provider-token quota exceeded",
          };
        },
        send: async () => undefined,
        events: async function* () {},
        replyPermission: async () => undefined,
        cancel: async () => undefined,
        close: async () => undefined,
      },
      connectionForWorkspace: () =>
        Effect.succeed({
          baseUrl: "https://private-sandbox.example",
          password: Redacted.make("private-control-password"),
          directory: "/workspace",
        }),
    });

    await expect(
      Effect.runPromise(runtime.createSession({ workspaceRef: "workspace-1" })),
    ).rejects.toMatchObject({
      _tag: "AgentRuntimeError",
      reason: "rate-limited",
      retryable: true,
      detail: expect.not.stringContaining("private-provider-token"),
    });
  });

  it("maps sessions, async prompts, events, permissions, cancellation, and cleanup", async () => {
    const calls: Array<unknown> = [];
    const driver: OpenCodeDriver = {
      createSession: async () => "opencode-session-1",
      send: async (_connection, sessionId, message) => {
        calls.push({ send: { sessionId, message } });
      },
      events: async function* () {
        yield {
          type: "message.part.updated",
          properties: {
            part: {
              sessionID: "opencode-session-1",
              type: "text",
              text: "Hello",
              time: { end: 1 },
            },
          },
        };
        yield {
          type: "permission.asked",
          properties: {
            id: "permission-1",
            sessionID: "opencode-session-1",
            permission: "write",
            patterns: ["/workspace/*"],
          },
        };
        yield {
          type: "session.status",
          properties: {
            sessionID: "opencode-session-1",
            status: { type: "idle" },
          },
        };
        yield {
          type: "message.part.updated",
          properties: {
            part: {
              sessionID: "opencode-session-1",
              type: "text",
              text: "must not leak into the completed run",
              time: { end: 2 },
            },
          },
        };
      },
      replyPermission: async (_connection, _session, requestId, decision) => {
        calls.push({ permission: { requestId, decision } });
      },
      cancel: async () => {
        calls.push({ cancel: true });
      },
      close: async () => {
        calls.push({ close: true });
      },
    };
    const runtime = makeOpenCodeRuntime({
      driver,
      connectionForWorkspace: () =>
        Effect.succeed({
          baseUrl: "https://private-sandbox.example",
          password: Redacted.make("private-control-password"),
          directory: "/workspace",
        }),
    });

    const session = await Effect.runPromise(
      runtime.createSession({ workspaceRef: "workspace-1" }),
    );
    await Effect.runPromise(runtime.send({ session, message: "Hello" }));
    const events = Array.from(
      await Effect.runPromise(runtime.events(session).pipe(Stream.runCollect)),
    );
    expect(events.map((event) => event._tag)).toEqual([
      "RuntimeReady",
      "RuntimeTextDelta",
      "RuntimePermissionRequested",
      "RuntimeCompleted",
    ]);
    await Effect.runPromise(
      runtime.replyPermission({
        session,
        permissionId: "permission-1",
        decision: "once",
      }),
    );
    await Effect.runPromise(runtime.cancel(session));
    await Effect.runPromise(runtime.close(session));
    expect(calls).toContainEqual({
      permission: { requestId: "permission-1", decision: "once" },
    });
    expect(calls).toContainEqual({ close: true });
  });
});
