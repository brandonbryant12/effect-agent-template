import { Effect, Schema, Stream } from "effect";
import type { ClientAuthError } from "./auth.js";

export class ClientNetworkError extends Schema.TaggedErrorClass<ClientNetworkError>()(
  "ClientNetworkError",
  { operation: Schema.String },
) {}

export class ClientHttpError extends Schema.TaggedErrorClass<ClientHttpError>()(
  "ClientHttpError",
  {
    status: Schema.Number.check(Schema.isInt()),
    requestId: Schema.NullOr(Schema.String),
  },
) {}

export class ClientDecodeError extends Schema.TaggedErrorClass<ClientDecodeError>()(
  "ClientDecodeError",
  { source: Schema.Literals(["response", "event"]) },
) {}

export type ClientError =
  ClientAuthError | ClientNetworkError | ClientHttpError | ClientDecodeError;

export interface ApiRequest<
  S extends Schema.ConstraintDecoder<unknown, never>,
> {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly schema: S;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export interface EventRequest<
  S extends Schema.ConstraintDecoder<unknown, never>,
> {
  readonly path: string;
  readonly schema: S;
  readonly after?: number;
}

export interface ClientTransport {
  readonly execute: <S extends Schema.ConstraintDecoder<unknown, never>>(
    request: ApiRequest<S>,
  ) => Effect.Effect<S["Type"], ClientError>;
  readonly events: <S extends Schema.ConstraintDecoder<unknown, never>>(
    request: EventRequest<S>,
  ) => Stream.Stream<S["Type"], ClientError>;
}
