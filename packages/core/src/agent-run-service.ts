import type {
  AgentRun,
  AgentRunEvent,
  AgentRunId,
  AgentSessionId,
  CommandId,
  ConversationId,
  ProjectId,
  TaskId,
} from "@repo/contracts";
import { AgentRunId as AgentRunIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import { PersistenceError } from "./errors.js";

export interface AdmitAgentRun {
  readonly commandId: CommandId;
  readonly sessionId: AgentSessionId;
  readonly projectId: ProjectId;
  readonly conversationId: ConversationId;
  readonly taskId: TaskId | null;
  readonly prompt: string;
}

export class AgentRunNotFound extends Schema.TaggedErrorClass<AgentRunNotFound>()(
  "AgentRunNotFound",
  { runId: AgentRunIdSchema },
) {}

export class AgentRunService extends Context.Service<
  AgentRunService,
  {
    readonly admit: (
      scope: AccessScope,
      input: AdmitAgentRun,
    ) => Effect.Effect<AgentRun, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: AgentRunId,
    ) => Effect.Effect<AgentRun, AgentRunNotFound | PersistenceError>;
    readonly events: (
      scope: AccessScope,
      id: AgentRunId,
      afterSequence: number,
    ) => Effect.Effect<
      ReadonlyArray<AgentRunEvent>,
      AgentRunNotFound | PersistenceError
    >;
  }
>()("repo/AgentRunService") {}

const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const AgentRunServiceTest = Layer.effect(
  AgentRunService,
  Effect.gen(function* () {
    const runs = yield* Ref.make(new Map<AgentRunId, AgentRun>());
    const owners = yield* Ref.make(new Map<AgentRunId, AccessScope>());
    const commands = yield* Ref.make(new Map<string, AgentRunId>());
    const runEvents = yield* Ref.make(
      new Map<AgentRunId, ReadonlyArray<AgentRunEvent>>(),
    );
    let sequence = 0;

    const commandKey = (scope: AccessScope, commandId: CommandId) =>
      `${scope.tenantId}:${scope.userId}:${commandId}`;

    const get = (scope: AccessScope, id: AgentRunId) =>
      Effect.flatMap(
        Effect.all([Ref.get(runs), Ref.get(owners)]),
        ([current, ownership]) => {
          const run = current.get(id);
          const owner = ownership.get(id);
          return run &&
            owner?.tenantId === scope.tenantId &&
            owner.userId === scope.userId
            ? Effect.succeed(run)
            : Effect.fail(new AgentRunNotFound({ runId: id }));
        },
      );

    return AgentRunService.of({
      admit: (scope, input) =>
        Effect.gen(function* () {
          const key = commandKey(scope, input.commandId);
          const existingId = (yield* Ref.get(commands)).get(key);
          if (existingId) {
            return yield* get(scope, existingId).pipe(
              Effect.mapError(
                () =>
                  new PersistenceError({ operation: "resolve-idempotent-run" }),
              ),
            );
          }

          sequence += 1;
          const now = timestamp("2026-07-16T12:00:00.000Z");
          const run: AgentRun = {
            id: Schema.decodeUnknownSync(AgentRunIdSchema)(
              `run_${sequence.toString().padStart(26, "0")}`,
            ),
            sessionId: input.sessionId,
            projectId: input.projectId,
            conversationId: input.conversationId,
            taskId: input.taskId,
            status: "queued",
            createdAt: now,
            updatedAt: now,
          };
          const started: AgentRunEvent = {
            _tag: "RunStarted",
            protocolVersion: 1,
            runId: run.id,
            sequence: 1,
            occurredAt: now,
          };
          yield* Effect.all([
            Ref.update(runs, (current) => new Map(current).set(run.id, run)),
            Ref.update(owners, (current) =>
              new Map(current).set(run.id, scope),
            ),
            Ref.update(commands, (current) =>
              new Map(current).set(key, run.id),
            ),
            Ref.update(runEvents, (current) =>
              new Map(current).set(run.id, [started]),
            ),
          ]);
          return run;
        }),
      get,
      events: (scope, id, afterSequence) =>
        Effect.flatMap(get(scope, id), () =>
          Effect.map(Ref.get(runEvents), (current) =>
            (current.get(id) ?? []).filter(
              (event) => event.sequence > afterSequence,
            ),
          ),
        ),
    });
  }),
);
