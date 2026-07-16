import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AuthenticationService,
  AuthenticationServiceTest,
} from "../src/index.js";

const TestAuth = AuthenticationServiceTest({
  cookieToken: "browser-session",
  bearerToken: "cli-session.signature",
  principal: {
    tenantId: "tenant_01J00000000000000000000000",
    userId: "user_01J00000000000000000000000",
    sessionId: "auth-session-1",
    clientKind: "browser",
  },
});

describe("AuthenticationService", () => {
  it("resolves browser cookies and CLI bearer tokens into the same principal", async () => {
    const program = Effect.gen(function* () {
      const auth = yield* AuthenticationService;
      const browser = yield* auth.authenticate(
        new Headers({ cookie: "better-auth.session_token=browser-session" }),
      );
      const cli = yield* auth.authenticate(
        new Headers({ authorization: "Bearer cli-session.signature" }),
      );
      return { browser, cli };
    });

    const result = await Effect.runPromise(Effect.provide(program, TestAuth));
    expect(result.browser.userId).toBe(result.cli.userId);
    expect(result.browser.clientKind).toBe("browser");
    expect(result.cli.clientKind).toBe("cli");
  });

  it("rejects unknown credentials without echoing them", async () => {
    const program = Effect.gen(function* () {
      const auth = yield* AuthenticationService;
      return yield* Effect.flip(
        auth.authenticate(
          new Headers({ authorization: "Bearer stolen-value" }),
        ),
      );
    });

    const error = await Effect.runPromise(Effect.provide(program, TestAuth));
    expect(error._tag).toBe("Unauthorized");
    expect(JSON.stringify(error)).not.toContain("stolen-value");
  });
});
