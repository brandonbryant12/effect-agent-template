import { Effect, Stream } from "effect";
import { ulid } from "ulid";
import type { AgentRuntimeEvent, RuntimeSessionRef } from "./model.js";
import { AgentRuntimeError } from "./model.js";
import type { AgentRuntime } from "./service.js";

interface State {
  readonly events: Array<AgentRuntimeEvent>;
  awaitingPermission: boolean;
}

const missing = (operation: string) =>
  new AgentRuntimeError({
    operation,
    reason: "not-found",
    retryable: false,
  });

export const makeAgentRuntimeTest = (): AgentRuntime => {
  const sessions = new Map<string, State>();
  const state = (session: RuntimeSessionRef, operation: string) =>
    Effect.fromNullishOr(sessions.get(session.id)).pipe(
      Effect.mapError(() => missing(operation)),
    );

  return {
    createSession: () =>
      Effect.sync(() => {
        const session = { id: `runtime_${ulid()}` };
        sessions.set(session.id, {
          events: [{ _tag: "RuntimeReady", session }],
          awaitingPermission: false,
        });
        return session;
      }),
    send: ({ session, message }) =>
      state(session, "send").pipe(
        Effect.tap((current) =>
          Effect.sync(() => {
            current.events.push({
              _tag: "RuntimeTextDelta",
              text: "Deterministic response",
            });
            if (message.includes("approval")) {
              current.awaitingPermission = true;
              current.events.push({
                _tag: "RuntimePermissionRequested",
                permissionId: "permission-1",
                toolName: "example.write",
                safeSummary: "Write the deterministic example",
              });
            } else if (message.includes("fail")) {
              current.events.push({
                _tag: "RuntimeFailed",
                code: "deterministic_failure",
                message: "The deterministic runtime failed",
              });
            } else {
              current.events.push({ _tag: "RuntimeCompleted" });
            }
          }),
        ),
        Effect.asVoid,
      ),
    events: (session) => {
      const current = sessions.get(session.id);
      return current
        ? Stream.fromIterable(current.events)
        : Stream.fail(missing("events"));
    },
    replyPermission: ({ session, permissionId, decision }) =>
      state(session, "reply-permission").pipe(
        Effect.flatMap((current) => {
          if (!current.awaitingPermission || permissionId !== "permission-1") {
            return Effect.fail(
              new AgentRuntimeError({
                operation: "reply-permission",
                reason: "permission-mismatch",
                retryable: false,
              }),
            );
          }
          return Effect.sync(() => {
            current.awaitingPermission = false;
            current.events.push(
              decision === "reject"
                ? {
                    _tag: "RuntimeFailed",
                    code: "permission_rejected",
                    message: "Permission was rejected",
                  }
                : { _tag: "RuntimeCompleted" },
            );
          });
        }),
      ),
    cancel: (session) =>
      state(session, "cancel").pipe(
        Effect.tap((current) =>
          Effect.sync(() => current.events.push({ _tag: "RuntimeCancelled" })),
        ),
        Effect.asVoid,
      ),
    close: (session) =>
      state(session, "close").pipe(
        Effect.tap(() => Effect.sync(() => sessions.delete(session.id))),
        Effect.asVoid,
      ),
  };
};
