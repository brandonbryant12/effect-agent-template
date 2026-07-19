import { Schema } from "effect";

const id = <Brand extends string>(prefix: string, brand: Brand) =>
  Schema.String.check(
    Schema.isPattern(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`)),
  ).pipe(Schema.brand(brand));

export const ProjectId = id("project", "ProjectId");
export type ProjectId = typeof ProjectId.Type;

export const TenantId = id("tenant", "TenantId");
export type TenantId = typeof TenantId.Type;

export const UserId = id("user", "UserId");
export type UserId = typeof UserId.Type;

export const TaskId = id("task", "TaskId");
export type TaskId = typeof TaskId.Type;

export const ConversationId = id("conversation", "ConversationId");
export type ConversationId = typeof ConversationId.Type;

export const MessageId = id("message", "MessageId");
export type MessageId = typeof MessageId.Type;

export const AgentRunId = id("run", "AgentRunId");
export type AgentRunId = typeof AgentRunId.Type;

export const AgentSessionId = id("session", "AgentSessionId");
export type AgentSessionId = typeof AgentSessionId.Type;

export const CommandId = id("command", "CommandId");
export type CommandId = typeof CommandId.Type;

export const JobId = id("job", "JobId");
export type JobId = typeof JobId.Type;

export const ApprovalId = id("approval", "ApprovalId");
export type ApprovalId = typeof ApprovalId.Type;

export const ArtifactId = id("artifact", "ArtifactId");
export type ArtifactId = typeof ArtifactId.Type;

export const CredentialId = id("credential", "CredentialId");
export type CredentialId = typeof CredentialId.Type;

export const CredentialUploadId = id("upload", "CredentialUploadId");
export type CredentialUploadId = typeof CredentialUploadId.Type;

export const GraphId = id("graph", "GraphId");
export type GraphId = typeof GraphId.Type;

export const GraphRunId = id("graphrun", "GraphRunId");
export type GraphRunId = typeof GraphRunId.Type;

// Author-chosen slug, unique within one graph — not a generated ulid id.
export const GraphNodeId = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,39}$/),
).pipe(Schema.brand("GraphNodeId"));
export type GraphNodeId = typeof GraphNodeId.Type;
