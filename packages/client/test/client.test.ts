import {
  AgentRunEvent,
  type AgentRunId,
  type AgentSessionId,
  type CommandId,
  type ConversationId,
  type Project,
  type ProjectId,
} from "@repo/contracts";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  bearerAuth,
  browserCookieAuth,
  createAgentClient,
  createFetchTransport,
  memoryTokenStore,
} from "../src/index.js";

const project: Project = {
  id: "project_01JY0000000000000000000000" as Project["id"],
  name: "Example",
  description: "Transport-neutral project",
  createdAt: "2026-07-16T12:00:00.000Z" as Project["createdAt"],
  updatedAt: "2026-07-16T12:00:00.000Z" as Project["updatedAt"],
};

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("shared client", () => {
  it.each([
    ["browser", browserCookieAuth(), undefined],
    [
      "cli",
      bearerAuth(memoryTokenStore("signed-token")),
      "Bearer signed-token",
    ],
  ] as const)(
    "runs project calls through %s auth",
    async (_, auth, expected) => {
      const requests: Array<Request> = [];
      const transport = createFetchTransport({
        baseUrl: "https://agent.example/api/v1",
        auth,
        fetch: async (input, init) => {
          const request = new Request(input, init);
          requests.push(request);
          return json([project]);
        },
      });

      const projects = await Effect.runPromise(
        createAgentClient(transport).projects.list(),
      );
      expect(projects).toEqual([project]);
      expect(requests[0]?.headers.get("authorization") ?? undefined).toBe(
        expected,
      );
      expect(requests[0]?.credentials).toBe("include");
    },
  );

  it("resumes and decodes server-sent run events", async () => {
    const runId = "run_01JY0000000000000000000000" as AgentRunId;
    const event = {
      _tag: "RunStarted",
      protocolVersion: 1,
      runId,
      sequence: 7,
      occurredAt: "2026-07-16T12:00:00.000Z",
    } satisfies typeof AgentRunEvent.Encoded;
    const requests: Array<Request> = [];
    const transport = createFetchTransport({
      baseUrl: "https://agent.example/api/v1",
      auth: browserCookieAuth(),
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(
          `id: 7\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`,
          {
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
    });

    const events = await Effect.runPromise(
      transport
        .events({
          path: `/runs/${runId}/events`,
          schema: AgentRunEvent,
          after: 6,
        })
        .pipe(Stream.runCollect),
    );
    expect(Array.from(events)).toEqual([event]);
    expect(requests[0]?.headers.get("last-event-id")).toBe("6");
  });

  it("rejects malformed API payloads", async () => {
    const transport = createFetchTransport({
      baseUrl: "https://agent.example/api/v1",
      auth: browserCookieAuth(),
      fetch: async () => json([{ id: "not-a-project" }]),
    });

    await expect(
      Effect.runPromise(createAgentClient(transport).projects.list()),
    ).rejects.toMatchObject({ _tag: "ClientDecodeError" });
  });

  it("exposes the complete transport-neutral application workflow", async () => {
    const requests: Array<Request> = [];
    const transport = createFetchTransport({
      baseUrl: "https://agent.example/api/v1",
      auth: browserCookieAuth(),
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return json({});
      },
    });
    const client = createAgentClient(transport);
    const projectId = "project_01JY0000000000000000000000" as ProjectId;
    const conversationId =
      "conversation_01JY0000000000000000000000" as ConversationId;
    const sessionId = "session_01JY0000000000000000000000" as AgentSessionId;
    const commandId = "command_01JY0000000000000000000000" as CommandId;

    const execute = (effect: Effect.Effect<unknown, unknown>) =>
      Effect.runPromise(effect).catch(() => undefined);
    await execute(client.projects.get(projectId));
    await execute(client.tasks.list(projectId));
    await execute(
      client.tasks.create(projectId, { title: "Ship", description: null }),
    );
    await execute(
      client.conversations.create({ projectId, title: "Build it" }),
    );
    await execute(client.sessions.create({ projectId, conversationId }));
    await execute(
      client.runs.start(sessionId, commandId, {
        projectId,
        conversationId,
        taskId: null,
      }),
    );
    await execute(
      client.credentials.beginUpload({
        provider: "openai",
        label: "Personal",
      }),
    );

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      `/api/v1/projects/${projectId}`,
      `/api/v1/projects/${projectId}/tasks`,
      `/api/v1/projects/${projectId}/tasks`,
      "/api/v1/conversations",
      "/api/v1/sessions",
      `/api/v1/sessions/${sessionId}/runs`,
      "/api/v1/credentials",
    ]);
    expect(await requests[5]?.json()).toEqual({
      projectId,
      conversationId,
      taskId: null,
    });
    expect(requests[5]?.headers.get("idempotency-key")).toBe(commandId);
  });
});
