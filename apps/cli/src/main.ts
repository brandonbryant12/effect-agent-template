#!/usr/bin/env node
import { createDeviceAuthorizationClient } from "@repo/auth";
import { Effect } from "effect";
import { createMacOsKeychainTokenStore } from "./auth-store.js";
import { loginWithDevice } from "./login.js";

const authBaseUrl =
  process.env.AGENT_AUTH_URL ?? "http://localhost:3000/api/auth";

const program = loginWithDevice({
  device: createDeviceAuthorizationClient({
    authBaseUrl,
    clientId: "effect-agent-cli",
  }),
  tokenStore: createMacOsKeychainTokenStore({
    service: "effect-agent-template",
    account: authBaseUrl,
  }),
  presentVerification: (uri, code) =>
    Effect.sync(() => console.log(`Open ${uri}\nCode: ${code}`)),
  sleep: (seconds) => Effect.sleep(`${seconds} seconds`),
});

Effect.runPromise(program).catch((error: unknown) => {
  console.error("Login failed", error);
  process.exitCode = 1;
});
