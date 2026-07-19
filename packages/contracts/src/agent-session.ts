import { Schema } from "effect";
import { Timestamp } from "./common.js";
import {
  AgentSessionId,
  ConversationId,
  CredentialId,
  ProjectId,
  TenantId,
  UserId,
} from "./ids.js";

export const AgentSessionStatus = Schema.Literals([
  "provisioning",
  "ready",
  "running",
  "awaiting-approval",
  "paused",
  "failed",
  "terminated",
]);
export type AgentSessionStatus = typeof AgentSessionStatus.Type;

export const AgentSession = Schema.Struct({
  id: AgentSessionId,
  tenantId: TenantId,
  userId: UserId,
  projectId: ProjectId,
  conversationId: ConversationId,
  status: AgentSessionStatus,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type AgentSession = typeof AgentSession.Type;

export const CreateAgentSession = Schema.Struct({
  projectId: ProjectId,
  conversationId: ConversationId,
  credentialIds: Schema.optionalKey(Schema.Array(CredentialId)),
});
export type CreateAgentSession = typeof CreateAgentSession.Type;
