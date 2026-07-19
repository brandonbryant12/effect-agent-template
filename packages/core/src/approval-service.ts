import type {
  AgentRun,
  AgentRunId,
  ApprovalDecision,
  ApprovalId,
  ApprovalRequest,
} from "@repo/contracts";
import {
  AgentRunId as AgentRunIdSchema,
  ApprovalId as ApprovalIdSchema,
} from "@repo/contracts";
import { Context, Effect, Schema } from "effect";
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
