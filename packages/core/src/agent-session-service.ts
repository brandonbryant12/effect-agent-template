import type {
  AgentSession,
  AgentSessionId,
  AgentSessionStatus,
  ConversationId,
  ProjectId,
} from "@repo/contracts";
import {
  AgentSessionId as AgentSessionIdSchema,
  Timestamp,
} from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { PersistenceError } from "./project-service.js";
import type { AccessScope } from "./access-scope.js";

export interface CreateAgentSession {
  readonly projectId: ProjectId;
  readonly conversationId: ConversationId;
}

export class AgentSessionNotFound extends Schema.TaggedErrorClass<AgentSessionNotFound>()(
  "AgentSessionNotFound",
  { sessionId: AgentSessionIdSchema },
) {}

export class InvalidAgentSessionTransition extends Schema.TaggedErrorClass<InvalidAgentSessionTransition>()(
  "InvalidAgentSessionTransition",
  { from: Schema.String, to: Schema.String },
) {}

export class AgentSessionService extends Context.Service<
  AgentSessionService,
  {
    readonly create: (
      scope: AccessScope,
      input: CreateAgentSession,
    ) => Effect.Effect<AgentSession, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: AgentSessionId,
    ) => Effect.Effect<AgentSession, AgentSessionNotFound | PersistenceError>;
    readonly transition: (
      scope: AccessScope,
      id: AgentSessionId,
      status: AgentSessionStatus,
    ) => Effect.Effect<
      AgentSession,
      AgentSessionNotFound | InvalidAgentSessionTransition | PersistenceError
    >;
  }
>()("repo/AgentSessionService") {}

const allowed: Readonly<
  Record<AgentSessionStatus, ReadonlySet<AgentSessionStatus>>
> = {
  provisioning: new Set(["ready", "failed", "terminated"]),
  ready: new Set(["running", "paused", "terminated"]),
  running: new Set([
    "ready",
    "awaiting-approval",
    "paused",
    "failed",
    "terminated",
  ]),
  "awaiting-approval": new Set(["running", "failed", "terminated"]),
  paused: new Set(["ready", "terminated"]),
  failed: new Set(["terminated"]),
  terminated: new Set(),
};

const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const AgentSessionServiceTest = Layer.effect(
  AgentSessionService,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<AgentSessionId, AgentSession>());
    let sequence = 0;

    const get = (scope: AccessScope, id: AgentSessionId) =>
      Effect.flatMap(Ref.get(state), (sessions) => {
        const session = sessions.get(id);
        return session &&
          session.tenantId === scope.tenantId &&
          session.userId === scope.userId
          ? Effect.succeed(session)
          : Effect.fail(new AgentSessionNotFound({ sessionId: id }));
      });

    return AgentSessionService.of({
      create: (scope, input) =>
        Effect.gen(function* () {
          sequence += 1;
          const now = timestamp("2026-07-16T12:00:00.000Z");
          const session: AgentSession = {
            id: Schema.decodeUnknownSync(AgentSessionIdSchema)(
              `session_${sequence.toString().padStart(26, "0")}`,
            ),
            ...scope,
            ...input,
            status: "provisioning",
            createdAt: now,
            updatedAt: now,
          };
          yield* Ref.update(state, (sessions) =>
            new Map(sessions).set(session.id, session),
          );
          return session;
        }),
      get,
      transition: (scope, id, status) =>
        Effect.flatMap(get(scope, id), (current) => {
          if (!allowed[current.status].has(status)) {
            return Effect.fail(
              new InvalidAgentSessionTransition({
                from: current.status,
                to: status,
              }),
            );
          }
          const updated: AgentSession = {
            ...current,
            status,
            updatedAt: timestamp("2026-07-16T12:00:01.000Z"),
          };
          return Effect.as(
            Ref.update(state, (sessions) => new Map(sessions).set(id, updated)),
            updated,
          );
        }),
    });
  }),
);
