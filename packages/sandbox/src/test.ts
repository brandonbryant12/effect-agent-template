import { Effect } from "effect";
import { ulid } from "ulid";
import { SandboxError, type WorkspaceRef } from "./model.js";
import type { SandboxWorkspace } from "./workspace.js";

interface State {
  readonly ref: WorkspaceRef;
  readonly files: Map<string, string>;
  status: "running" | "paused" | "terminated";
}

export const makeSandboxWorkspaceTest = (): SandboxWorkspace => {
  const sessions = new Map<string, State>();
  const get = (
    ref: WorkspaceRef,
    operation: string,
  ): Effect.Effect<State, SandboxError> => {
    const state = sessions.get(ref.sessionId);
    if (!state || state.ref.id !== ref.id) {
      return Effect.fail(
        new SandboxError({ operation, reason: "not-found", retryable: false }),
      );
    }
    if (state.status === "terminated") {
      return Effect.fail(
        new SandboxError({ operation, reason: "terminated", retryable: false }),
      );
    }
    return Effect.succeed(state);
  };

  return {
    create: ({ sessionId }) =>
      Effect.sync(() => {
        const existing = sessions.get(sessionId);
        if (existing && existing.status !== "terminated") return existing.ref;
        const ref = { id: `workspace_${ulid()}`, sessionId };
        sessions.set(sessionId, { ref, files: new Map(), status: "running" });
        return ref;
      }),
    resume: (ref) =>
      get(ref, "resume").pipe(
        Effect.tap((state) =>
          Effect.sync(() => {
            state.status = "running";
          }),
        ),
        Effect.asVoid,
      ),
    exec: (ref, command) =>
      get(ref, "exec").pipe(
        Effect.map(() => ({
          exitCode: 0,
          stdout: command[0] === "printf" ? command.slice(1).join(" ") : "",
          stderr: "",
        })),
      ),
    writeFile: (ref, path, content) =>
      get(ref, "write-file").pipe(
        Effect.tap((state) =>
          Effect.sync(() => state.files.set(path, content)),
        ),
        Effect.asVoid,
      ),
    readFile: (ref, path) =>
      get(ref, "read-file").pipe(
        Effect.flatMap((state) => {
          const content = state.files.get(path);
          return content === undefined
            ? Effect.fail(
                new SandboxError({
                  operation: "read-file",
                  reason: "invalid-path",
                  retryable: false,
                }),
              )
            : Effect.succeed(content);
        }),
      ),
    expose: (ref, port) =>
      get(ref, "expose").pipe(
        Effect.map(() => ({
          port,
          url: `https://${ref.id}.example.test:${port}`,
        })),
      ),
    pause: (ref) =>
      get(ref, "pause").pipe(
        Effect.tap((state) =>
          Effect.sync(() => {
            state.status = "paused";
          }),
        ),
        Effect.asVoid,
      ),
    terminate: (ref) =>
      get(ref, "terminate").pipe(
        Effect.tap((state) =>
          Effect.sync(() => {
            state.status = "terminated";
          }),
        ),
        Effect.asVoid,
      ),
  };
};
