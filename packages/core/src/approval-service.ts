import type {
  AgentRun,
  AgentRunId,
  ApprovalDecision,
  ApprovalId,
  ApprovalRequest,
} from "@repo/contracts";
import {
  isTerminalAgentRunStatus,
  AgentRunId as AgentRunIdSchema,
  ApprovalId as ApprovalIdSchema,
  Timestamp,
} from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import { PersistenceError } from "./errors.js";

export class ApprovalNotFound extends Schema.TaggedErrorClass<ApprovalNotFound>()(
  "ApprovalNotFound",
  { approvalId: ApprovalIdSchema },
) {}

export class RunControlRejected extends Schema.TaggedErrorClass<RunControlRejected>()(
  "RunControlRejected",
  {
    runId: AgentRunIdSchema,
    reason: Schema.Literals([
      "terminal",
      "not-awaiting-approval",
      "runtime-not-ready",
    ]),
  },
) {}

export class ApprovalService extends Context.Service<
  ApprovalService,
  {
    readonly get: (
      scope: AccessScope,
      id: ApprovalId,
    ) => Effect.Effect<ApprovalRequest, ApprovalNotFound | PersistenceError>;
    readonly resolve: (
      scope: AccessScope,
      id: ApprovalId,
      decision: ApprovalDecision,
    ) => Effect.Effect<
      ApprovalRequest,
      ApprovalNotFound | RunControlRejected | PersistenceError
    >;
    readonly cancelRun: (
      scope: AccessScope,
      runId: AgentRunId,
    ) => Effect.Effect<AgentRun, RunControlRejected | PersistenceError>;
  }
>()("repo/ApprovalService") {}

interface ScopedValue<A> {
  readonly scope: AccessScope;
  readonly value: A;
}

export interface ApprovalServiceTestSeed {
  readonly approvals?: ReadonlyArray<ScopedValue<ApprovalRequest>>;
  readonly runs?: ReadonlyArray<ScopedValue<AgentRun>>;
}

const sameScope = (left: AccessScope, right: AccessScope): boolean =>
  left.tenantId === right.tenantId && left.userId === right.userId;

const resolvedTimestamp = Schema.decodeUnknownSync(Timestamp)(
  "2026-07-19T12:00:01.000Z",
);

export const makeApprovalServiceTest = (seed: ApprovalServiceTestSeed = {}) =>
  Layer.effect(
    ApprovalService,
    Effect.gen(function* () {
      const approvals = yield* Ref.make(
        new Map(
          (seed.approvals ?? []).map((record) => [record.value.id, record]),
        ),
      );
      const runs = yield* Ref.make(
        new Map((seed.runs ?? []).map((record) => [record.value.id, record])),
      );

      const get = (scope: AccessScope, id: ApprovalId) =>
        Effect.flatMap(Ref.get(approvals), (current) => {
          const record = current.get(id);
          return record && sameScope(record.scope, scope)
            ? Effect.succeed(record.value)
            : Effect.fail(new ApprovalNotFound({ approvalId: id }));
        });

      return ApprovalService.of({
        get,
        resolve: (scope, id, decision) =>
          Effect.gen(function* () {
            const current = yield* get(scope, id);
            if (current.status !== "pending") return current;
            const status =
              decision === "once"
                ? "approved-once"
                : decision === "always"
                  ? "approved-session"
                  : "rejected";
            const resolved: ApprovalRequest = {
              ...current,
              status,
              resolvedAt: resolvedTimestamp,
            };
            yield* Ref.update(approvals, (records) =>
              new Map(records).set(id, { scope, value: resolved }),
            );
            return resolved;
          }),
        cancelRun: (scope, runId) =>
          Effect.gen(function* () {
            const record = (yield* Ref.get(runs)).get(runId);
            if (!record || !sameScope(record.scope, scope)) {
              return yield* new PersistenceError({
                operation: "cancel-run-not-found",
              });
            }
            if (isTerminalAgentRunStatus(record.value.status)) {
              return yield* new RunControlRejected({
                runId,
                reason: "terminal",
              });
            }
            const cancelled: AgentRun = {
              ...record.value,
              status: "cancelled",
              updatedAt: resolvedTimestamp,
            };
            yield* Ref.update(runs, (records) =>
              new Map(records).set(runId, { scope, value: cancelled }),
            );
            return cancelled;
          }),
      });
    }),
  );

export const ApprovalServiceTest = makeApprovalServiceTest();
