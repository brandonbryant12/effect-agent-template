import {
  AgentRun,
  AgentRunId,
  AgentSessionId,
  ApprovalId,
  ApprovalRequest,
  ConversationId,
  CredentialId,
  ProjectId,
  TenantId,
  Timestamp,
  UserId,
} from "@repo/contracts";
import { Effect, Ref, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { AccessScope } from "../src/access-scope.js";
import {
  ApprovalService,
  makeApprovalServiceTest,
} from "../src/approval-service.js";
import {
  ConversationService,
  ConversationServiceTest,
} from "../src/conversation-service.js";
import {
  CredentialSecretService,
  makeCredentialSecretServiceTest,
} from "../src/credential-secret-service.js";

const tenantId = Schema.decodeUnknownSync(TenantId)(
  "tenant_01JY0000000000000000000000",
);
const userId = Schema.decodeUnknownSync(UserId)(
  "user_01JY0000000000000000000000",
);
const otherUserId = Schema.decodeUnknownSync(UserId)(
  "user_01JY0000000000000000000001",
);
const projectId = Schema.decodeUnknownSync(ProjectId)(
  "project_01JY0000000000000000000000",
);
const conversationId = Schema.decodeUnknownSync(ConversationId)(
  "conversation_01JY0000000000000000000000",
);
const runId = Schema.decodeUnknownSync(AgentRunId)(
  "run_01JY0000000000000000000000",
);
const approvalId = Schema.decodeUnknownSync(ApprovalId)(
  "approval_01JY0000000000000000000000",
);
const credentialId = Schema.decodeUnknownSync(CredentialId)(
  "credential_01JY0000000000000000000000",
);
const timestamp = Schema.decodeUnknownSync(Timestamp)(
  "2026-07-19T12:00:00.000Z",
);
const scope: AccessScope = { tenantId, userId };
const otherScope: AccessScope = { tenantId, userId: otherUserId };

describe("core service Test layers", () => {
  it("creates scoped conversations without live infrastructure", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const conversations = yield* ConversationService;
        const created = yield* conversations.create(scope, {
          projectId,
          title: "Scoped conversation",
        });
        const denied = yield* Effect.flip(
          conversations.get(otherScope, created.id),
        );
        return { created, denied };
      }).pipe(Effect.provide(ConversationServiceTest)),
    );

    expect(result.created.title).toBe("Scoped conversation");
    expect(result.denied._tag).toBe("ConversationNotFound");
  });

  it("resolves seeded approvals and cancels their run", async () => {
    const approval = Schema.decodeUnknownSync(ApprovalRequest)({
      id: approvalId,
      runId,
      toolName: "write",
      safeSummary: "Write a file",
      status: "pending",
      createdAt: timestamp,
      resolvedAt: null,
    });
    const run = Schema.decodeUnknownSync(AgentRun)({
      id: runId,
      sessionId: Schema.decodeUnknownSync(AgentSessionId)(
        "session_01JY0000000000000000000000",
      ),
      projectId,
      conversationId,
      taskId: null,
      status: "awaiting-approval",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const layer = makeApprovalServiceTest({
      approvals: [{ scope, value: approval }],
      runs: [{ scope, value: run }],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const approvals = yield* ApprovalService;
        const resolved = yield* approvals.resolve(scope, approvalId, "once");
        const cancelled = yield* approvals.cancelRun(scope, runId);
        const denied = yield* Effect.flip(
          approvals.get(otherScope, approvalId),
        );
        return { resolved, cancelled, denied };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.resolved.status).toBe("approved-once");
    expect(result.cancelled.status).toBe("cancelled");
    expect(result.denied._tag).toBe("ApprovalNotFound");
  });

  it("observes credential activation through a deterministic layer", async () => {
    const seen = await Effect.runPromise(Ref.make<ReadonlyArray<string>>([]));
    const layer = makeCredentialSecretServiceTest((input) =>
      Ref.update(seen, (values) => [...values, input.secretRef]),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const secrets = yield* CredentialSecretService;
        yield* secrets.activate({
          ...scope,
          credentialId,
          secretRef: "secret/reference",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(await Effect.runPromise(Ref.get(seen))).toEqual([
      "secret/reference",
    ]);
  });
});
