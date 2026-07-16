import type { AgentSessionId } from "@repo/contracts";
import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { makeSecretStoreMemory } from "@repo/secrets";
import {
  makeOpenSandboxWorkspaceWithDriver,
  type OpenSandboxDriver,
} from "../src/index.js";

describe("OpenSandbox workspace adapter", () => {
  it("uses default-deny networking and installs exact vault bindings", async () => {
    const calls: Array<unknown> = [];
    const driver: OpenSandboxDriver = {
      create: async (options) => {
        calls.push({ create: options });
        return {
          id: "sandbox-1",
          exec: async (command) => {
            calls.push({ exec: command });
            return { exitCode: 0, stdout: "ok", stderr: "" };
          },
          writeFile: async (path, content) => {
            calls.push({ writeFile: { path, content } });
          },
          readFile: async () => "ok",
          expose: async (port) => `https://sandbox.example:${port}`,
          pause: async () => undefined,
          resume: async function () {
            return this;
          },
          installCredential: async (credential) => {
            calls.push({ credential });
          },
          deleteCredentialVault: async () => {
            calls.push({ deleteVault: true });
          },
          terminate: async () => {
            calls.push({ terminate: true });
          },
          close: async () => undefined,
        };
      },
    };
    const adapter = makeOpenSandboxWorkspaceWithDriver({
      driver,
      image: "ghcr.io/example/agent:latest",
      allowedHosts: ["api.openai.com"],
    });
    const workspace = await Effect.runPromise(
      adapter.workspace.create({
        sessionId: "session_01JY0000000000000000000000" as AgentSessionId,
      }),
    );
    const store = makeSecretStoreMemory();
    const ref = await Effect.runPromise(
      store.put(Redacted.make("canary-secret")),
    );
    await Effect.runPromise(
      adapter.credentials.install(
        workspace,
        {
          name: "openai",
          hosts: ["api.openai.com"],
          methods: ["POST"],
          paths: ["/v1/responses"],
          auth: { type: "bearer" },
        },
        ref,
        store,
      ),
    );
    await Effect.runPromise(adapter.workspace.terminate(workspace));

    expect(calls[0]).toMatchObject({
      create: {
        networkPolicy: { defaultAction: "deny" },
        credentialProxy: { enabled: true },
      },
    });
    expect(calls).toContainEqual({
      credential: {
        name: "openai",
        value: "canary-secret",
        binding: {
          hosts: ["api.openai.com"],
          methods: ["POST"],
          paths: ["/v1/responses"],
          schemes: ["https"],
          auth: { type: "bearer" },
        },
      },
    });
    expect(
      JSON.stringify(
        calls.filter(
          (call) =>
            "exec" in (call as object) || "writeFile" in (call as object),
        ),
      ),
    ).not.toContain("canary-secret");
    expect(calls).toContainEqual({ deleteVault: true });
  });
});
