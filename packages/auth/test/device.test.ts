import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createDeviceAuthorizationClient } from "../src/index.js";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("device authorization client", () => {
  it("requests a code and returns a signed bearer after approval", async () => {
    const replies = [
      response({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://agent.example/device",
        verification_uri_complete:
          "https://agent.example/device?user_code=ABCD-EFGH",
        expires_in: 600,
        interval: 5,
      }),
      response({
        access_token: "signed-token",
        token_type: "Bearer",
        expires_in: 604800,
        scope: "agent",
      }),
    ];
    const client = createDeviceAuthorizationClient({
      authBaseUrl: "https://agent.example/api/auth",
      clientId: "effect-agent-cli",
      fetch: async () => replies.shift() ?? response({}, 500),
    });

    const authorization = await Effect.runPromise(client.request("agent"));
    expect(authorization.userCode).toBe("ABCD-EFGH");
    const token = await Effect.runPromise(
      client.poll(authorization.deviceCode),
    );
    expect(token).toMatchObject({ token: "signed-token", tokenType: "Bearer" });
  });

  it.each([
    ["authorization_pending", "pending"],
    ["slow_down", "slow-down"],
    ["expired_token", "expired"],
    ["access_denied", "denied"],
    ["invalid_client", "invalid-client"],
  ] as const)(
    "maps %s without leaking provider details",
    async (error, reason) => {
      const client = createDeviceAuthorizationClient({
        authBaseUrl: "https://agent.example/api/auth",
        clientId: "effect-agent-cli",
        fetch: async () =>
          response({ error, error_description: "sensitive" }, 400),
      });

      await expect(
        Effect.runPromise(client.poll("device-code")),
      ).rejects.toMatchObject({
        _tag: "DeviceAuthorizationError",
        reason,
      });
    },
  );
});
