import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { createBetterAuthRuntime } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Better Auth runtime", () => {
  it("maps browser sessions and exposes CLI device authorization", async () => {
    const runtime = createBetterAuthRuntime({
      databaseUrl: databaseUrl ?? "",
      baseURL: "http://localhost:3000/api/auth",
      secret: "test-secret-that-is-at-least-thirty-two-characters",
      cliClientId: "effect-agent-cli",
      defaultTenantId: "tenant_00000000000000000000000000",
    });

    try {
      const health = await runtime.handler(
        new Request("http://localhost:3000/api/auth/ok"),
      );
      expect(health.status).toBe(200);
      expect(runtime.deviceVerificationPath).toBe("/device");

      const signup = await runtime.handler(
        new Request("http://localhost:3000/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Template User",
            email: `template-${crypto.randomUUID()}@example.com`,
            password: "correct-horse-battery-staple",
          }),
        }),
      );
      expect(signup.status).toBe(200);
      const cookie = signup.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      const principal = await Effect.runPromise(
        runtime.authenticate(new Headers({ cookie })),
      );
      expect(principal.clientKind).toBe("browser");
      expect(principal.tenantId).toBe("tenant_00000000000000000000000000");

      const token = signup.headers.get("set-auth-token");
      expect(token).toBeTruthy();
      const cliPrincipal = await Effect.runPromise(
        runtime.authenticate(
          new Headers({ authorization: `Bearer ${String(token)}` }),
        ),
      );
      expect(cliPrincipal).toMatchObject({
        userId: principal.userId,
        tenantId: principal.tenantId,
        clientKind: "cli",
      });

      const device = await runtime.handler(
        new Request("http://localhost:3000/api/auth/device/code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: "effect-agent-cli" }),
        }),
      );
      expect(device.status).toBe(200);
      await expect(device.json()).resolves.toMatchObject({
        verification_uri: "http://localhost:3000/device",
      });
    } finally {
      await runtime.close();
    }
  });
});
