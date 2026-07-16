import { Effect, Schema, Stream } from "effect";
import OpenAI from "openai";
import type { AiInput } from "../../model.js";
import { AiError, AiTextResult } from "../../model.js";
import type { AiService } from "../../service.js";
import { decodeOpenAiEvent } from "./event-decoder.js";
import { mapOpenAiError } from "./error.js";
import { responseRequest } from "./request.js";

export interface OpenAiResponsesOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export const makeOpenAiResponses = (
  options: OpenAiResponsesOptions,
): AiService => {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const model = options.model ?? "gpt-5.6";

  const complete = (input: AiInput) =>
    Effect.tryPromise({
      try: () =>
        client.responses.create(responseRequest(input, model), {
          signal: input.signal,
        }),
      catch: mapOpenAiError,
    }).pipe(
      Effect.flatMap((response) =>
        Schema.decodeUnknownEffect(AiTextResult)({
          responseId: response.id,
          text: response.output_text,
        }).pipe(
          Effect.mapError(
            () => new AiError({ code: "invalid_response", retryable: false }),
          ),
        ),
      ),
    );

  return {
    complete,
    stream: (input) => {
      const iterable = (async function* () {
        const source = await client.responses.create(
          { ...responseRequest(input, model), stream: true },
          { signal: input.signal },
        );
        for await (const raw of source) {
          const event = decodeOpenAiEvent(raw);
          if (event) yield event;
        }
      })();
      return Stream.fromAsyncIterable(iterable, mapOpenAiError);
    },
    structured: (input, name, schema) =>
      Effect.gen(function* () {
        const document = Schema.toJsonSchemaDocument(schema);
        const response = yield* Effect.tryPromise({
          try: () =>
            client.responses.create(
              {
                ...responseRequest(input, model),
                text: {
                  format: {
                    type: "json_schema",
                    name,
                    strict: true,
                    schema: {
                      ...document.schema,
                      ...(Object.keys(document.definitions).length === 0
                        ? {}
                        : { $defs: document.definitions }),
                    },
                  },
                },
              },
              { signal: input.signal },
            ),
          catch: mapOpenAiError,
        });
        const parsed = yield* Effect.try({
          try: () => JSON.parse(response.output_text),
          catch: () =>
            new AiError({ code: "invalid_response", retryable: false }),
        });
        return yield* Schema.decodeUnknownEffect(schema)(parsed).pipe(
          Effect.mapError(
            () => new AiError({ code: "invalid_response", retryable: false }),
          ),
        );
      }),
  };
};
