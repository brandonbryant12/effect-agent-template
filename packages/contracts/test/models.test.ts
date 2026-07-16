import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AgentRunEvent } from "../src/agent-run.js";
import { AgentSession } from "../src/agent-session.js";
import { Credential } from "../src/credential.js";
import { decodeProject, Project } from "../src/project.js";
import { decodeTask, Task } from "../src/task.js";

describe("public contracts", () => {
  it("decodes and trims project input", () => {
    const project = decodeProject({
      id: "project_01J00000000000000000000000",
      name: "  Reference project  ",
      description: null,
      createdAt: "2026-07-16T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    });

    expect(project.name).toBe("Reference project");
    expect(Schema.encodeSync(Project)(project).id).toBe(
      "project_01J00000000000000000000000",
    );
  });

  it("rejects malformed IDs at the boundary", () => {
    expect(() =>
      decodeTask({
        id: "1",
        projectId: "project_01J00000000000000000000000",
        title: "Ship template",
        description: null,
        status: "todo",
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("represents durable run events as a versioned tagged union", () => {
    const decoded = Schema.decodeUnknownSync(AgentRunEvent)({
      _tag: "RunStarted",
      protocolVersion: 1,
      runId: "run_01J00000000000000000000000",
      sequence: 1,
      occurredAt: "2026-07-16T12:00:00.000Z",
    });

    expect(decoded._tag).toBe("RunStarted");
    expect(decoded.sequence).toBe(1);
  });

  it("does not accept impossible task statuses", () => {
    expect(() =>
      Schema.decodeUnknownSync(Task)({
        id: "task_01J00000000000000000000000",
        projectId: "project_01J00000000000000000000000",
        title: "Ship template",
        description: null,
        status: "almost-done",
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("requires an agent session to carry its trusted user and tenant scope", () => {
    const session = Schema.decodeUnknownSync(AgentSession)({
      id: "session_01J00000000000000000000000",
      tenantId: "tenant_01J00000000000000000000000",
      userId: "user_01J00000000000000000000000",
      projectId: "project_01J00000000000000000000000",
      conversationId: "conversation_01J00000000000000000000000",
      status: "ready",
      createdAt: "2026-07-16T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    });

    expect(session.status).toBe("ready");
    expect(session.userId).toBe("user_01J00000000000000000000000");
  });

  it("accepts personal credential metadata without accepting a secret value", () => {
    const credential = Schema.decodeUnknownSync(Credential)({
      id: "credential_01J00000000000000000000000",
      tenantId: "tenant_01J00000000000000000000000",
      userId: "user_01J00000000000000000000000",
      provider: "openai",
      ownership: "personal",
      label: "Primary model key",
      displayHint: "sk-…7f31",
      status: "active",
      createdAt: "2026-07-16T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    });

    expect(credential.ownership).toBe("personal");
    expect("secret" in credential).toBe(false);
    expect(() =>
      Schema.decodeUnknownSync(Credential)({
        ...credential,
        ownership: "organization",
      }),
    ).toThrow();
  });
});
