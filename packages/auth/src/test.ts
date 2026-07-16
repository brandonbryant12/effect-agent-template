import { Effect, Layer, Schema } from "effect";
import { Principal, type ClientKind } from "./principal.js";
import { AuthenticationService, Unauthorized } from "./service.js";

export interface AuthenticationServiceTestOptions {
  readonly cookieToken: string;
  readonly bearerToken: string;
  readonly principal: Omit<typeof Principal.Encoded, "clientKind"> & {
    readonly clientKind: ClientKind;
  };
}

const cookieValue = (headers: Headers, name: string): string | undefined =>
  headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim().split("="))
    .find(([key]) => key === name)?.[1];

export const AuthenticationServiceTest = (
  options: AuthenticationServiceTestOptions,
) => {
  const base = Schema.decodeUnknownSync(Principal)(options.principal);
  return Layer.succeed(
    AuthenticationService,
    AuthenticationService.of({
      authenticate: (headers) => {
        const authorization = headers.get("authorization");
        if (
          cookieValue(headers, "better-auth.session_token") ===
          options.cookieToken
        ) {
          return Effect.succeed({ ...base, clientKind: "browser" });
        }
        if (authorization === `Bearer ${options.bearerToken}`) {
          return Effect.succeed({ ...base, clientKind: "cli" });
        }
        return Effect.fail(
          new Unauthorized({
            reason:
              authorization || headers.has("cookie") ? "invalid" : "missing",
          }),
        );
      },
    }),
  );
};
