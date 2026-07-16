import { Effect, Schema } from "effect";

export class ClientAuthError extends Schema.TaggedErrorClass<ClientAuthError>()(
  "ClientAuthError",
  { reason: Schema.Literals(["missing-token", "token-store-unavailable"]) },
) {}

export interface AuthTokenStore {
  readonly get: Effect.Effect<string | undefined, ClientAuthError>;
  readonly set: (token: string) => Effect.Effect<void, ClientAuthError>;
  readonly clear: Effect.Effect<void, ClientAuthError>;
}

export interface ClientAuth {
  readonly headers: Effect.Effect<
    Readonly<Record<string, string>>,
    ClientAuthError
  >;
}

export const browserCookieAuth = (): ClientAuth => ({
  headers: Effect.succeed({}),
});

export const bearerAuth = (store: AuthTokenStore): ClientAuth => ({
  headers: store.get.pipe(
    Effect.flatMap((token) =>
      token
        ? Effect.succeed({ authorization: `Bearer ${token}` })
        : Effect.fail(new ClientAuthError({ reason: "missing-token" })),
    ),
  ),
});

export const memoryTokenStore = (initial?: string): AuthTokenStore => {
  let token = initial;
  return {
    get: Effect.sync(() => token),
    set: (next) =>
      Effect.sync(() => {
        token = next;
      }),
    clear: Effect.sync(() => {
      token = undefined;
    }),
  };
};
