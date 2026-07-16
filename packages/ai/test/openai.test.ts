import { Effect, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { makeOpenAiResponses } from "../src/index.js";

const streamResponse = (events: ReadonlyArray<unknown>) =>
  new Response(
    `${events.map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );

describe("OpenAI Responses adapter", () => {
  it("schema-decodes streaming events and builds strict tools", async () => {
    let body: unknown;
    const ai = makeOpenAiResponses({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return streamResponse([
          {
            type: "response.output_text.delta",
            item_id: "message-1",
            output_index: 0,
            content_index: 0,
            delta: "Hello",
          },
          {
            type: "response.completed",
            response: { id: "response-1" },
          },
        ]);
      },
    });

    const events = Array.from(
      await Effect.runPromise(
        ai
          .stream({
            prompt: "Say hello",
            tools: [
              {
                name: "lookup_project",
                description: "Look up a project",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                },
              },
            ],
          })
          .pipe(Stream.runCollect),
      ),
    );
    expect(events).toEqual([
      { _tag: "AiTextDelta", text: "Hello" },
      { _tag: "AiCompleted", responseId: "response-1" },
    ]);
    expect(body).toMatchObject({
      model: "gpt-5.6",
      stream: true,
      tools: [
        {
          type: "function",
          strict: true,
          parameters: { additionalProperties: false },
        },
      ],
    });
  });

  it("decodes structured output with the caller's Effect Schema", async () => {
    const ai = makeOpenAiResponses({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "response-1",
            object: "response",
            created_at: 1,
            status: "completed",
            model: "gpt-5.6",
            output: [
              {
                id: "message-1",
                type: "message",
                status: "completed",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ title: "Typed result" }),
                    annotations: [],
                  },
                ],
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });

    const result = await Effect.runPromise(
      ai.structured(
        { prompt: "Return a title" },
        "project_summary",
        Schema.Struct({ title: Schema.String }),
      ),
    );
    expect(result).toEqual({ title: "Typed result" });
  });

  it("classifies retryable errors without exposing provider messages", async () => {
    const ai = makeOpenAiResponses({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { message: "secret upstream detail" } }),
          {
            status: 429,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    await expect(
      Effect.runPromise(ai.complete({ prompt: "Hello" })),
    ).rejects.toMatchObject({
      _tag: "AiError",
      code: "rate_limited",
      retryable: true,
    });
  });

  it("maps caller interruption to a non-retryable cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const ai = makeOpenAiResponses({ apiKey: "test-key" });

    await expect(
      Effect.runPromise(
        ai
          .stream({ prompt: "Hello", signal: controller.signal })
          .pipe(Stream.runCollect),
      ),
    ).rejects.toMatchObject({
      _tag: "AiError",
      code: "cancelled",
      retryable: false,
    });
  });
});
