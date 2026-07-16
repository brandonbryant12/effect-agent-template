import type { DeviceAuthorizationClient } from "@repo/auth";
import { DeviceAuthorizationError } from "@repo/auth";
import { memoryTokenStore } from "@repo/client";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loginWithDevice } from "../src/login.js";

describe("CLI device login", () => {
  it("presents verification, polls, and stores the bearer token", async () => {
    let polls = 0;
    const device: DeviceAuthorizationClient = {
      request: () =>
        Effect.succeed({
          deviceCode: "device-code",
          userCode: "ABCD-EFGH",
          verificationUri: "https://agent.example/device",
          verificationUriComplete:
            "https://agent.example/device?user_code=ABCD-EFGH",
          expiresInSeconds: 600,
          pollingIntervalSeconds: 5,
        }),
      poll: () => {
        polls += 1;
        return polls === 1
          ? Effect.fail(new DeviceAuthorizationError({ reason: "pending" }))
          : Effect.succeed({
              token: "signed-token",
              tokenType: "Bearer",
              expiresInSeconds: 604800,
              scope: "agent",
            });
      },
    };
    const store = memoryTokenStore();
    const presented: Array<string> = [];

    await Effect.runPromise(
      loginWithDevice({
        device,
        tokenStore: store,
        presentVerification: (uri, code) =>
          Effect.sync(() => presented.push(`${uri} ${code}`)),
        sleep: () => Effect.void,
      }),
    );

    expect(presented).toEqual([
      "https://agent.example/device?user_code=ABCD-EFGH ABCD-EFGH",
    ]);
    expect(await Effect.runPromise(store.get)).toBe("signed-token");
  });
});
