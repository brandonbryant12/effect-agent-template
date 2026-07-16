import {
  AgentRun,
  AgentRunEvent,
  AgentSession,
  Conversation,
  Credential,
  PendingCredentialUpload,
  ApprovalRequest,
  Project,
  Task,
  type AgentRunId,
  type AgentSessionId,
  type ApprovalDecision,
  type ApprovalId,
  type CommandId,
  type ConversationId,
  type CreateConversation,
  type CreateProject,
  type CredentialProvider,
  type ProjectId,
  type TaskId,
  type TaskStatus,
} from "@repo/contracts";
import { Schema } from "effect";
import type { ClientTransport } from "./transport.js";

export const createAgentClient = (transport: ClientTransport) => ({
  projects: {
    list: () =>
      transport.execute({
        method: "GET",
        path: "/projects",
        schema: Schema.Array(Project),
      }),
    create: (input: CreateProject) =>
      transport.execute({
        method: "POST",
        path: "/projects",
        schema: Project,
        body: input,
      }),
    get: (projectId: ProjectId) =>
      transport.execute({
        method: "GET",
        path: `/projects/${encodeURIComponent(projectId)}`,
        schema: Project,
      }),
    update: (projectId: ProjectId, input: CreateProject) =>
      transport.execute({
        method: "PATCH",
        path: `/projects/${encodeURIComponent(projectId)}`,
        schema: Project,
        body: input,
      }),
  },
  tasks: {
    list: (projectId: ProjectId) =>
      transport.execute({
        method: "GET",
        path: `/projects/${encodeURIComponent(projectId)}/tasks`,
        schema: Schema.Array(Task),
      }),
    create: (
      projectId: ProjectId,
      input: { readonly title: string; readonly description: string | null },
    ) =>
      transport.execute({
        method: "POST",
        path: `/projects/${encodeURIComponent(projectId)}/tasks`,
        schema: Task,
        body: input,
      }),
    transition: (taskId: TaskId, status: TaskStatus) =>
      transport.execute({
        method: "POST",
        path: `/tasks/${encodeURIComponent(taskId)}/transition`,
        schema: Task,
        body: { status },
      }),
  },
  conversations: {
    create: (input: CreateConversation) =>
      transport.execute({
        method: "POST",
        path: "/conversations",
        schema: Conversation,
        body: input,
      }),
  },
  sessions: {
    create: (input: {
      readonly projectId: ProjectId;
      readonly conversationId: ConversationId;
      readonly credentialIds?: ReadonlyArray<Credential["id"]>;
    }) =>
      transport.execute({
        method: "POST",
        path: "/sessions",
        schema: AgentSession,
        body: input,
      }),
    get: (sessionId: AgentSessionId) =>
      transport.execute({
        method: "GET",
        path: `/sessions/${encodeURIComponent(sessionId)}`,
        schema: AgentSession,
      }),
  },
  runs: {
    start: (
      sessionId: AgentSessionId,
      commandId: CommandId,
      input: {
        readonly projectId: ProjectId;
        readonly conversationId: ConversationId;
        readonly taskId: TaskId | null;
        readonly prompt: string;
      },
    ) =>
      transport.execute({
        method: "POST",
        path: `/sessions/${encodeURIComponent(sessionId)}/runs`,
        schema: AgentRun,
        body: input,
        idempotencyKey: commandId,
      }),
    events: (runId: AgentRunId, after?: number) =>
      transport.events({
        path: `/runs/${encodeURIComponent(runId)}/events`,
        schema: AgentRunEvent,
        ...(after === undefined ? {} : { after }),
      }),
    cancel: (runId: AgentRunId) =>
      transport.execute({
        method: "POST",
        path: `/runs/${encodeURIComponent(runId)}/cancel`,
        schema: AgentRun,
      }),
  },
  approvals: {
    get: (approvalId: ApprovalId) =>
      transport.execute({
        method: "GET",
        path: `/approvals/${encodeURIComponent(approvalId)}`,
        schema: ApprovalRequest,
      }),
    reply: (approvalId: ApprovalId, decision: ApprovalDecision) =>
      transport.execute({
        method: "POST",
        path: `/approvals/${encodeURIComponent(approvalId)}/reply`,
        schema: ApprovalRequest,
        body: { decision },
      }),
  },
  credentials: {
    beginUpload: (input: {
      readonly provider: CredentialProvider;
      readonly label: string;
    }) =>
      transport.execute({
        method: "POST",
        path: "/credentials",
        schema: PendingCredentialUpload,
        body: input,
      }),
    get: (credentialId: Credential["id"]) =>
      transport.execute({
        method: "GET",
        path: `/credentials/${encodeURIComponent(credentialId)}`,
        schema: Credential,
      }),
  },
});

export type AgentClient = ReturnType<typeof createAgentClient>;
