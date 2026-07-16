import {
  AgentSessionId,
  CommandId,
  ConversationId,
  ProjectId,
  TenantId,
  UserId,
} from "@repo/contracts";
import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ProjectService, ProjectServiceTest } from "../src/project-service.js";
import { TaskService, TaskServiceTest } from "../src/task-service.js";
import {
  AgentSessionService,
  AgentSessionServiceTest,
} from "../src/agent-session-service.js";
import {
  CredentialService,
  CredentialServiceTest,
} from "../src/credential-service.js";
import {
  AgentRunService,
  AgentRunServiceTest,
} from "../src/agent-run-service.js";

const ServicesTest = Layer.mergeAll(
  ProjectServiceTest,
  TaskServiceTest,
  AgentSessionServiceTest,
  CredentialServiceTest,
  AgentRunServiceTest,
);

const tenantId = Schema.decodeUnknownSync(TenantId)(
  "tenant_01J00000000000000000000000",
);
const userId = Schema.decodeUnknownSync(UserId)(
  "user_01J00000000000000000000000",
);
const otherUserId = Schema.decodeUnknownSync(UserId)(
  "user_01J00000000000000000000001",
);
const projectId = Schema.decodeUnknownSync(ProjectId)(
  "project_01J00000000000000000000000",
);
const conversationId = Schema.decodeUnknownSync(ConversationId)(
  "conversation_01J00000000000000000000000",
);
const agentSessionId = Schema.decodeUnknownSync(AgentSessionId)(
  "session_01J00000000000000000000000",
);
const commandId = Schema.decodeUnknownSync(CommandId)(
  "command_01J00000000000000000000000",
);
const scope = { tenantId, userId };

describe("core capabilities", () => {
  it("creates, reads, updates, and deletes a project", async () => {
    const program = Effect.gen(function* () {
      const projects = yield* ProjectService;
      const created = yield* projects.create(scope, {
        name: "Template",
        description: null,
      });
      const updated = yield* projects.update(scope, created.id, {
        name: "Reference template",
        description: "Public example",
      });
      const listed = yield* projects.list(scope);
      const denied = yield* Effect.flip(
        projects.get({ tenantId, userId: otherUserId }, created.id),
      );
      yield* projects.remove(scope, created.id);
      const afterDelete = yield* projects.list(scope);
      return { created, updated, listed, denied, afterDelete };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, ServicesTest),
    );
    expect(result.created.name).toBe("Template");
    expect(result.updated.name).toBe("Reference template");
    expect(result.listed).toHaveLength(1);
    expect(result.denied._tag).toBe("ProjectNotFound");
    expect(result.afterDelete).toHaveLength(0);
  });

  it("creates tasks and enforces lifecycle transitions", async () => {
    const program = Effect.gen(function* () {
      const projects = yield* ProjectService;
      const tasks = yield* TaskService;
      const project = yield* projects.create(scope, {
        name: "Template",
        description: null,
      });
      const task = yield* tasks.create(scope, {
        projectId: project.id,
        title: "Prove worker flow",
        description: null,
      });
      const active = yield* tasks.transition(scope, task.id, "in-progress");
      const done = yield* tasks.transition(scope, task.id, "done");
      const invalid = yield* Effect.flip(
        tasks.transition(scope, task.id, "in-progress"),
      );
      return { task, active, done, invalid };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, ServicesTest),
    );
    expect(result.task.status).toBe("todo");
    expect(result.active.status).toBe("in-progress");
    expect(result.done.status).toBe("done");
    expect(result.invalid._tag).toBe("InvalidTaskTransition");
  });

  it("creates one user-scoped agent session and enforces lifecycle transitions", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* AgentSessionService;
      const created = yield* sessions.create(scope, {
        projectId,
        conversationId,
      });
      const ready = yield* sessions.transition(scope, created.id, "ready");
      const running = yield* sessions.transition(scope, created.id, "running");
      const denied = yield* Effect.flip(
        sessions.get({ tenantId, userId: otherUserId }, created.id),
      );
      return { created, ready, running, denied };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, ServicesTest),
    );
    expect(result.created.status).toBe("provisioning");
    expect(result.ready.status).toBe("ready");
    expect(result.running.status).toBe("running");
    expect(result.denied._tag).toBe("AgentSessionNotFound");
  });

  it("creates write-only personal credential metadata scoped to its user", async () => {
    const program = Effect.gen(function* () {
      const credentials = yield* CredentialService;
      const created = yield* credentials.createPending(scope, {
        provider: "openai",
        label: "Primary model key",
      });
      const denied = yield* Effect.flip(
        credentials.get({ tenantId, userId: otherUserId }, created.id),
      );
      return { created, denied };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, ServicesTest),
    );
    expect(result.created.status).toBe("pending");
    expect(result.created.displayHint).toBe("");
    expect("secret" in result.created).toBe(false);
    expect(result.denied._tag).toBe("CredentialNotFound");
  });

  it("admits an idempotent run command with the first durable event", async () => {
    const program = Effect.gen(function* () {
      const runs = yield* AgentRunService;
      const input = {
        commandId,
        sessionId: agentSessionId,
        projectId,
        conversationId,
        taskId: null,
      } as const;
      const first = yield* runs.admit(scope, input);
      const repeated = yield* runs.admit(scope, input);
      const events = yield* runs.events(scope, first.id, 0);
      return { first, repeated, events };
    });

    const result = await Effect.runPromise(
      Effect.provide(program, ServicesTest),
    );
    expect(result.repeated.id).toBe(result.first.id);
    expect(result.events.map((event) => event.sequence)).toEqual([1]);
    expect(result.events[0]?._tag).toBe("RunStarted");
  });
});
