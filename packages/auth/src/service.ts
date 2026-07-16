import { Context, Effect, Schema } from "effect";
import type { Principal } from "./principal.js";

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { reason: Schema.Literals(["missing", "invalid", "expired"]) },
) {}

export class AuthenticationUnavailable extends Schema.TaggedErrorClass<AuthenticationUnavailable>()(
  "AuthenticationUnavailable",
  { operation: Schema.String },
) {}

export class AuthenticationService extends Context.Service<
  AuthenticationService,
  {
    readonly authenticate: (
      headers: Headers,
    ) => Effect.Effect<Principal, Unauthorized | AuthenticationUnavailable>;
  }
>()("repo/AuthenticationService") {}
