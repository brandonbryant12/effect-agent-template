import { Schema } from "effect";
import { Timestamp } from "./common.js";
import {
  AgentRunId,
  AgentSessionId,
  ApprovalId,
  ArtifactId,
  ConversationId,
  ProjectId,
  TaskId,
} from "./ids.js";

export const AgentRunStatus = Schema.Literals([
  "queued",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = typeof AgentRunStatus.Type;

export const AgentRun = Schema.Struct({
  id: AgentRunId,
  sessionId: AgentSessionId,
  projectId: ProjectId,
  conversationId: ConversationId,
  taskId: Schema.NullOr(TaskId),
  status: AgentRunStatus,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type AgentRun = typeof AgentRun.Type;

const durable = {
  protocolVersion: Schema.Literal(1),
  runId: AgentRunId,
  sequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  occurredAt: Timestamp,
};

export const RunStarted = Schema.TaggedStruct("RunStarted", durable);
export const RunStatusChanged = Schema.TaggedStruct("RunStatusChanged", {
  ...durable,
  status: AgentRunStatus,
});
export const AssistantTextCompleted = Schema.TaggedStruct(
  "AssistantTextCompleted",
  {
    ...durable,
    messageId: Schema.String,
    text: Schema.String,
  },
);
export const ApprovalRequested = Schema.TaggedStruct("ApprovalRequested", {
  ...durable,
  approvalId: ApprovalId,
  toolName: Schema.String,
  safeSummary: Schema.String,
});
export const ApprovalResolved = Schema.TaggedStruct("ApprovalResolved", {
  ...durable,
  approvalId: ApprovalId,
  decision: Schema.Literals(["once", "always", "reject"]),
});
export const ArtifactCreated = Schema.TaggedStruct("ArtifactCreated", {
  ...durable,
  artifactId: ArtifactId,
  name: Schema.String,
});
export const RunCompleted = Schema.TaggedStruct("RunCompleted", durable);
export const RunFailed = Schema.TaggedStruct("RunFailed", {
  ...durable,
  code: Schema.String,
  message: Schema.String,
});
export const RunCancelled = Schema.TaggedStruct("RunCancelled", durable);

export const AgentRunEvent = Schema.Union([
  RunStarted,
  RunStatusChanged,
  AssistantTextCompleted,
  ApprovalRequested,
  ApprovalResolved,
  ArtifactCreated,
  RunCompleted,
  RunFailed,
  RunCancelled,
]);
export type AgentRunEvent = typeof AgentRunEvent.Type;
