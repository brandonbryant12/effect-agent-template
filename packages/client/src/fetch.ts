import { Effect, Schema, Stream } from "effect";
import type { ClientAuth } from "./auth.js";
import { decodeSse } from "./sse.js";
import {
  ClientDecodeError,
  ClientHttpError,
  ClientNetworkError,
  type ClientError,
  type ClientTransport,
} from "./transport.js";

export interface FetchTransportOptions {
  readonly baseUrl: string;
  readonly auth: ClientAuth;
  readonly fetch?: typeof globalThis.fetch;
}

const url = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const normalizeStreamError = (error: unknown): ClientError =>
  typeof error === "object" && error !== null && "_tag" in error
    ? (error as ClientError)
    : new ClientNetworkError({ operation: "stream-events" });

export const createFetchTransport = (
  options: FetchTransportOptions,
): ClientTransport => {
  const fetch = options.fetch ?? globalThis.fetch;

  return {
    execute: (request) =>
      Effect.gen(function* () {
        const authHeaders = yield* options.auth.headers;
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(url(options.baseUrl, request.path), {
              method: request.method,
              credentials: "include",
              headers: {
                accept: "application/json",
                ...(request.body === undefined
                  ? {}
                  : { "content-type": "application/json" }),
                ...authHeaders,
                ...(request.idempotencyKey
                  ? { "idempotency-key": request.idempotencyKey }
                  : {}),
              },
              ...(request.body === undefined
                ? {}
                : { body: JSON.stringify(request.body) }),
            }),
          catch: () => new ClientNetworkError({ operation: "execute-request" }),
        });
        if (!response.ok) {
          return yield* new ClientHttpError({
            status: response.status,
            requestId: response.headers.get("x-request-id"),
          });
        }
        if (response.status === 204) {
          return yield* Effect.try({
            try: () => Schema.decodeUnknownSync(request.schema)(undefined),
            catch: () => new ClientDecodeError({ source: "response" }),
          });
        }
        const payload = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () => new ClientDecodeError({ source: "response" }),
        });
        return yield* Effect.try({
          try: () => Schema.decodeUnknownSync(request.schema)(payload),
          catch: () => new ClientDecodeError({ source: "response" }),
        });
      }),
    events: (request) => {
      const iterable = (async function* () {
        const authHeaders = await Effect.runPromise(options.auth.headers);
        const response = await fetch(url(options.baseUrl, request.path), {
          method: "GET",
          credentials: "include",
          headers: {
            accept: "text/event-stream",
            ...authHeaders,
            ...(request.after === undefined
              ? {}
              : { "last-event-id": String(request.after) }),
          },
        });
        if (!response.ok) {
          throw new ClientHttpError({
            status: response.status,
            requestId: response.headers.get("x-request-id"),
          });
        }
        yield* decodeSse(response, request.schema);
      })();
      return Stream.fromAsyncIterable(iterable, normalizeStreamError);
    },
  };
};
