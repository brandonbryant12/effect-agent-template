import { AgentRun, type AgentRunId, type ProjectId } from "@repo/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { projectRunEvent, queryKeys } from "../src/index.js";

describe("React client integration", () => {
  it("uses stable hierarchical query keys", () => {
    const projectId = "project_01JY0000000000000000000000" as ProjectId;
    expect(queryKeys.projects.all).toEqual(["projects"]);
    expect(queryKeys.projects.detail(projectId)).toEqual([
      "projects",
      projectId,
    ]);
    expect(queryKeys.tasks.byProject(projectId)).toEqual([
      "projects",
      projectId,
      "tasks",
    ]);
  });

  it("projects durable terminal events into cached run state", () => {
    const runId = "run_01JY0000000000000000000000" as AgentRunId;
    const run = Schema.decodeUnknownSync(AgentRun)({
      id: runId,
      sessionId: "session_01JY0000000000000000000000",
      projectId: "project_01JY0000000000000000000000",
      conversationId: "conversation_01JY0000000000000000000000",
      taskId: null,
      status: "running",
      createdAt: "2026-07-16T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    });
    expect(
      projectRunEvent(run, {
        _tag: "RunCompleted",
        protocolVersion: 1,
        runId,
        sequence: 4,
        occurredAt: "2026-07-16T12:00:04.000Z" as never,
      }),
    ).toMatchObject({ status: "completed" });
  });
});
