import { randomBytes } from "node:crypto";
import type { WorkspaceRef, SandboxWorkspace } from "@repo/sandbox";
import { AgentRuntimeError } from "@repo/agent-runtime";
import { Effect, Redacted } from "effect";
import { OPENCODE_CLI_VERSION, OPENCODE_PORT } from "./config.js";
import type { OpenCodeConnection } from "./model.js";

export interface OpenCodeServer {
  readonly start: (
    workspace: WorkspaceRef,
  ) => Effect.Effect<OpenCodeConnection, AgentRuntimeError>;
}

export const makeOpenCodeServer = (
  sandbox: SandboxWorkspace,
  directory = "/workspace",
): OpenCodeServer => ({
  start: (workspace) =>
    Effect.gen(function* () {
      const password = randomBytes(32).toString("base64url");
      yield* sandbox
        .writeFile(workspace, "/tmp/opencode-server-password", password)
        .pipe(
          Effect.mapError(
            () =>
              new AgentRuntimeError({
                operation: "write-opencode-password",
                reason: "unavailable",
                retryable: true,
              }),
          ),
        );
      yield* sandbox
        .exec(workspace, [
          "sh",
          "-lc",
          `OPENCODE_SERVER_PASSWORD=$(cat /tmp/opencode-server-password) nohup opencode serve --hostname 0.0.0.0 --port ${OPENCODE_PORT} >/tmp/opencode.log 2>&1 &`,
        ])
        .pipe(
          Effect.mapError(
            () =>
              new AgentRuntimeError({
                operation: "start-opencode",
                reason: "unavailable",
                retryable: true,
              }),
          ),
        );
      const endpoint = yield* sandbox.expose(workspace, OPENCODE_PORT).pipe(
        Effect.mapError(
          () =>
            new AgentRuntimeError({
              operation: "expose-opencode",
              reason: "unavailable",
              retryable: true,
            }),
        ),
      );
      return {
        baseUrl: endpoint.url,
        password: Redacted.make(password),
        directory,
      };
    }),
});

export const openCodeCliInstallCommand = `npm install --global opencode-ai@${OPENCODE_CLI_VERSION}`;
