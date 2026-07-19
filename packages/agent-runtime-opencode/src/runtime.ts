import {
  AgentRuntimeError,
  isTerminalRuntimeEvent,
  type AgentRuntime,
  type RuntimeSessionRef,
} from "@repo/agent-runtime";
import { errorStatus, safeErrorDetail } from "@repo/observability";
import { Effect, Stream } from "effect";
import { mapOpenCodeEvent } from "./event-mapper.js";
import type { OpenCodeConnection, OpenCodeRuntimeOptions } from "./model.js";

interface SessionState {
  readonly connection: OpenCodeConnection;
  readonly openCodeSessionId: string;
}

const runtimeError = (
  operation: string,
  reason: AgentRuntimeError["reason"],
  detail?: string,
) =>
  new AgentRuntimeError({
    operation,
    reason,
    retryable: reason === "unavailable",
    ...(detail === undefined ? {} : { detail }),
  });

export const classifyRuntimeError = (
  operation: string,
  cause: unknown,
): AgentRuntimeError => {
  const status = errorStatus(cause);
  const reason =
    status === 404
      ? "not-found"
      : status === 401 || status === 403
        ? "forbidden"
        : status === 429
          ? "rate-limited"
          : "unavailable";
  const detail = safeErrorDetail(cause);
  return new AgentRuntimeError({
    operation,
    reason,
    retryable: reason === "rate-limited" || reason === "unavailable",
    ...(detail === undefined ? {} : { detail }),
  });
};

export const makeOpenCodeRuntime = (
  options: OpenCodeRuntimeOptions,
): AgentRuntime => {
  const sessions = new Map<string, SessionState>();
  const state = (
    session: RuntimeSessionRef,
    operation: string,
  ): Effect.Effect<SessionState, AgentRuntimeError> => {
    const current = sessions.get(session.id);
    return current
      ? Effect.succeed(current)
      : Effect.fail(runtimeError(operation, "not-found"));
  };

  return {
    createSession: ({ workspaceRef }) =>
      Effect.gen(function* () {
        const connection = yield* options.connectionForWorkspace(workspaceRef);
        const openCodeSessionId = yield* Effect.tryPromise({
          try: () => options.driver.createSession(connection),
          catch: (cause) => classifyRuntimeError("create-session", cause),
        });
        const ref = { id: `opencode:${openCodeSessionId}` };
        sessions.set(ref.id, { connection, openCodeSessionId });
        return ref;
      }),
    send: ({ session, message }) =>
      state(session, "send").pipe(
        Effect.flatMap((current) =>
          Effect.tryPromise({
            try: () =>
              options.driver.send(
                current.connection,
                current.openCodeSessionId,
                message,
              ),
            catch: (cause) => classifyRuntimeError("send", cause),
          }),
        ),
      ),
    events: (session) => {
      const current = sessions.get(session.id);
      if (!current) return Stream.fail(runtimeError("events", "not-found"));
      const iterable = (async function* () {
        yield { _tag: "RuntimeReady" as const, session };
        for await (const raw of options.driver.events(
          current.connection,
          current.openCodeSessionId,
        )) {
          const event = mapOpenCodeEvent(raw, current.openCodeSessionId);
          if (event) {
            yield event;
            if (isTerminalRuntimeEvent(event)) break;
          }
        }
      })();
      return Stream.fromAsyncIterable(iterable, (cause) =>
        classifyRuntimeError("events", cause),
      );
    },
    replyPermission: ({ session, permissionId, decision }) =>
      state(session, "reply-permission").pipe(
        Effect.flatMap((current) =>
          Effect.tryPromise({
            try: () =>
              options.driver.replyPermission(
                current.connection,
                current.openCodeSessionId,
                permissionId,
                decision,
              ),
            catch: (cause) => classifyRuntimeError("reply-permission", cause),
          }),
        ),
      ),
    cancel: (session) =>
      state(session, "cancel").pipe(
        Effect.flatMap((current) =>
          Effect.tryPromise({
            try: () =>
              options.driver.cancel(
                current.connection,
                current.openCodeSessionId,
              ),
            catch: (cause) => classifyRuntimeError("cancel", cause),
          }),
        ),
      ),
    close: (session) =>
      state(session, "close").pipe(
        Effect.flatMap((current) =>
          Effect.tryPromise({
            try: () =>
              options.driver.close(
                current.connection,
                current.openCodeSessionId,
              ),
            catch: (cause) => classifyRuntimeError("close", cause),
          }),
        ),
        Effect.tap(() => Effect.sync(() => sessions.delete(session.id))),
      ),
  };
};
