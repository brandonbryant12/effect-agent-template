#!/usr/bin/env node
import { createDeviceAuthorizationClient } from "@repo/auth";
import {
  bearerAuth,
  createAgentClient,
  createFetchTransport,
} from "@repo/client";
import { Effect } from "effect";
import { createMacOsKeychainTokenStore } from "./auth-store.js";
import { parseCommand, runCommand } from "./commands.js";
import { loginWithDevice } from "./login.js";

const apiBaseUrl = process.env.AGENT_API_URL ?? "http://localhost:3000/api/v1";
const authBaseUrl =
  process.env.AGENT_AUTH_URL ?? "http://localhost:3000/api/auth";
const tokenStore = createMacOsKeychainTokenStore({
  service: "effect-agent-template",
  account: authBaseUrl,
});

const readHidden = (prompt: string): Effect.Effect<string> =>
  Effect.promise(
    () =>
      new Promise<string>((resolve) => {
        process.stdout.write(prompt);
        const input = process.stdin;
        if (!input.isTTY) {
          input.setEncoding("utf8");
          input.once("data", (chunk) => resolve(String(chunk).trimEnd()));
          input.resume();
          return;
        }
        let value = "";
        input.setRawMode(true);
        input.setEncoding("utf8");
        input.resume();
        const restore = () => {
          input.setRawMode(false);
          input.pause();
          input.removeListener("data", onData);
          process.stdout.write("\n");
        };
        const onData = (chunk: string) => {
          if (chunk === "\r" || chunk === "\n") {
            restore();
            resolve(value);
          } else if (chunk === "\u0003") {
            restore();
            process.exitCode = 130;
            resolve("");
          } else if (chunk === "\u007f") {
            value = value.slice(0, -1);
          } else {
            value += chunk;
          }
        };
        input.on("data", onData);
      }),
  );

const args = process.argv.slice(2);
const program =
  args[0] === "login"
    ? loginWithDevice({
        device: createDeviceAuthorizationClient({
          authBaseUrl,
          clientId: "effect-agent-cli",
        }),
        tokenStore,
        presentVerification: (uri, code) =>
          Effect.sync(() => console.log(`Open ${uri}\nCode: ${code}`)),
        sleep: (seconds) => Effect.sleep(`${seconds} seconds`),
      }).pipe(Effect.tap(() => Effect.sync(() => console.log("Logged in"))))
    : runCommand(parseCommand(args), {
        client: createAgentClient(
          createFetchTransport({
            baseUrl: apiBaseUrl,
            auth: bearerAuth(tokenStore),
          }),
        ),
        output: (value) =>
          Effect.sync(() =>
            console.log(
              typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2),
            ),
          ),
        readSecret: readHidden,
        uploadSecret: (upload, secret) =>
          Effect.gen(function* () {
            const token = yield* tokenStore.get;
            if (!token) return yield* Effect.fail(new Error("not logged in"));
            const response = yield* Effect.promise(() =>
              fetch(upload.url, {
                method: "POST",
                headers: {
                  authorization: `Bearer ${token}`,
                  "content-type": "application/octet-stream",
                  "x-upload-token": upload.token,
                },
                body: secret,
              }),
            );
            if (!response.ok) {
              return yield* Effect.fail(
                new Error(`credential upload failed (${response.status})`),
              );
            }
          }),
      });

Effect.runPromise(program).catch((error: unknown) => {
  console.error("Command failed", error);
  process.exitCode = 1;
});
