import { AgentRunEvent, type AgentRunId, type Project } from "@repo/contracts";
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
});
