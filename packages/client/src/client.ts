import type {
  AgentRunId,
  AgentSessionId,
  ApprovalDecision,
  ApprovalId,
  CommandId,
  CreateAgentSession,
  CreateConversation,
  CreateGraph,
  CreateProject,
  CreateTaskBody,
  Credential,
  BeginCredentialUpload,
  GraphId,
  GraphRunId,
  ProjectId,
  StartAgentRun,
  StartGraphRun,
  TaskId,
  TaskStatus,
  UpdateGraph,
} from "@repo/contracts";
import { ApiRoutes, buildPath } from "@repo/contracts/http";
import type { RouteName } from "@repo/contracts/http";
import type { ClientTransport } from "./transport.js";

/**
 * Every method resolves its route from the shared ApiRoutes table, so the
 * client can never drift from the server's paths, methods, or schemas.
 */
export const createAgentClient = (transport: ClientTransport) => ({
  projects: {
    list: () =>
      transport.execute({
        method: ApiRoutes.listProjects.method,
        path: ApiRoutes.listProjects.path,
        schema: ApiRoutes.listProjects.response,
      }),
    create: (input: CreateProject) =>
      transport.execute({
        method: ApiRoutes.createProject.method,
        path: ApiRoutes.createProject.path,
        schema: ApiRoutes.createProject.response,
        body: input,
      }),
    get: (projectId: ProjectId) =>
      transport.execute({
        method: ApiRoutes.getProject.method,
        path: buildPath(ApiRoutes.getProject, { projectId }),
        schema: ApiRoutes.getProject.response,
      }),
    update: (projectId: ProjectId, input: CreateProject) =>
      transport.execute({
        method: ApiRoutes.updateProject.method,
        path: buildPath(ApiRoutes.updateProject, { projectId }),
        schema: ApiRoutes.updateProject.response,
        body: input,
      }),
    remove: (projectId: ProjectId) =>
      transport.execute({
        method: ApiRoutes.deleteProject.method,
        path: buildPath(ApiRoutes.deleteProject, { projectId }),
        schema: ApiRoutes.deleteProject.response,
      }),
  },
  tasks: {
    list: (projectId: ProjectId) =>
      transport.execute({
        method: ApiRoutes.listTasks.method,
        path: buildPath(ApiRoutes.listTasks, { projectId }),
        schema: ApiRoutes.listTasks.response,
      }),
    create: (projectId: ProjectId, input: CreateTaskBody) =>
      transport.execute({
        method: ApiRoutes.createTask.method,
        path: buildPath(ApiRoutes.createTask, { projectId }),
        schema: ApiRoutes.createTask.response,
        body: input,
      }),
    transition: (taskId: TaskId, status: TaskStatus) =>
      transport.execute({
        method: ApiRoutes.transitionTask.method,
        path: buildPath(ApiRoutes.transitionTask, { taskId }),
        schema: ApiRoutes.transitionTask.response,
        body: { status },
      }),
  },
  conversations: {
    create: (input: CreateConversation) =>
      transport.execute({
        method: ApiRoutes.createConversation.method,
        path: ApiRoutes.createConversation.path,
        schema: ApiRoutes.createConversation.response,
        body: input,
      }),
  },
  sessions: {
    create: (input: CreateAgentSession) =>
      transport.execute({
        method: ApiRoutes.createSession.method,
        path: ApiRoutes.createSession.path,
        schema: ApiRoutes.createSession.response,
        body: input,
      }),
    get: (sessionId: AgentSessionId) =>
      transport.execute({
        method: ApiRoutes.getSession.method,
        path: buildPath(ApiRoutes.getSession, { sessionId }),
        schema: ApiRoutes.getSession.response,
      }),
  },
  runs: {
    start: (
      sessionId: AgentSessionId,
      commandId: CommandId,
      input: StartAgentRun,
    ) =>
      transport.execute({
        method: ApiRoutes.startRun.method,
        path: buildPath(ApiRoutes.startRun, { sessionId }),
        schema: ApiRoutes.startRun.response,
        body: input,
        idempotencyKey: commandId,
      }),
    get: (runId: AgentRunId) =>
      transport.execute({
        method: ApiRoutes.getRun.method,
        path: buildPath(ApiRoutes.getRun, { runId }),
        schema: ApiRoutes.getRun.response,
      }),
    events: (runId: AgentRunId, after?: number) =>
      transport.events({
        path: buildPath(ApiRoutes.streamRunEvents, { runId }),
        schema: ApiRoutes.streamRunEvents.response,
        ...(after === undefined ? {} : { after }),
      }),
    cancel: (runId: AgentRunId) =>
      transport.execute({
        method: ApiRoutes.cancelRun.method,
        path: buildPath(ApiRoutes.cancelRun, { runId }),
        schema: ApiRoutes.cancelRun.response,
      }),
  },
  approvals: {
    get: (approvalId: ApprovalId) =>
      transport.execute({
        method: ApiRoutes.getApproval.method,
        path: buildPath(ApiRoutes.getApproval, { approvalId }),
        schema: ApiRoutes.getApproval.response,
      }),
    reply: (approvalId: ApprovalId, decision: ApprovalDecision) =>
      transport.execute({
        method: ApiRoutes.replyApproval.method,
        path: buildPath(ApiRoutes.replyApproval, { approvalId }),
        schema: ApiRoutes.replyApproval.response,
        body: { decision },
      }),
  },
  graphs: {
    list: (projectId: ProjectId) =>
      transport.execute({
        method: ApiRoutes.listGraphs.method,
        path: buildPath(ApiRoutes.listGraphs, { projectId }),
        schema: ApiRoutes.listGraphs.response,
      }),
    create: (projectId: ProjectId, input: CreateGraph) =>
      transport.execute({
        method: ApiRoutes.createGraph.method,
        path: buildPath(ApiRoutes.createGraph, { projectId }),
        schema: ApiRoutes.createGraph.response,
        body: input,
      }),
    get: (graphId: GraphId) =>
      transport.execute({
        method: ApiRoutes.getGraph.method,
        path: buildPath(ApiRoutes.getGraph, { graphId }),
        schema: ApiRoutes.getGraph.response,
      }),
    update: (graphId: GraphId, input: UpdateGraph) =>
      transport.execute({
        method: ApiRoutes.updateGraph.method,
        path: buildPath(ApiRoutes.updateGraph, { graphId }),
        schema: ApiRoutes.updateGraph.response,
        body: input,
      }),
    remove: (graphId: GraphId) =>
      transport.execute({
        method: ApiRoutes.deleteGraph.method,
        path: buildPath(ApiRoutes.deleteGraph, { graphId }),
        schema: ApiRoutes.deleteGraph.response,
      }),
  },
  graphRuns: {
    start: (graphId: GraphId, commandId: CommandId, input: StartGraphRun) =>
      transport.execute({
        method: ApiRoutes.startGraphRun.method,
        path: buildPath(ApiRoutes.startGraphRun, { graphId }),
        schema: ApiRoutes.startGraphRun.response,
        body: input,
        idempotencyKey: commandId,
      }),
    list: (graphId: GraphId) =>
      transport.execute({
        method: ApiRoutes.listGraphRuns.method,
        path: buildPath(ApiRoutes.listGraphRuns, { graphId }),
        schema: ApiRoutes.listGraphRuns.response,
      }),
    get: (graphRunId: GraphRunId) =>
      transport.execute({
        method: ApiRoutes.getGraphRun.method,
        path: buildPath(ApiRoutes.getGraphRun, { graphRunId }),
        schema: ApiRoutes.getGraphRun.response,
      }),
    cancel: (graphRunId: GraphRunId) =>
      transport.execute({
        method: ApiRoutes.cancelGraphRun.method,
        path: buildPath(ApiRoutes.cancelGraphRun, { graphRunId }),
        schema: ApiRoutes.cancelGraphRun.response,
      }),
  },
  credentials: {
    beginUpload: (input: BeginCredentialUpload) =>
      transport.execute({
        method: ApiRoutes.beginCredentialUpload.method,
        path: ApiRoutes.beginCredentialUpload.path,
        schema: ApiRoutes.beginCredentialUpload.response,
        body: input,
      }),
    get: (credentialId: Credential["id"]) =>
      transport.execute({
        method: ApiRoutes.getCredential.method,
        path: buildPath(ApiRoutes.getCredential, { credentialId }),
        schema: ApiRoutes.getCredential.response,
      }),
  },
});

export type AgentClient = ReturnType<typeof createAgentClient>;

/**
 * A runtime contract test compares this list with ApiRoutes. Keeping the list
 * next to the implementation makes an added route an explicit client-design
 * decision instead of a silent omission.
 */
export const coveredClientRoutes = [
  "listProjects",
  "createProject",
  "getProject",
  "updateProject",
  "deleteProject",
  "listTasks",
  "createTask",
  "transitionTask",
  "createConversation",
  "createSession",
  "getSession",
  "startRun",
  "getRun",
  "cancelRun",
  "streamRunEvents",
  "getApproval",
  "replyApproval",
  "listGraphs",
  "createGraph",
  "getGraph",
  "updateGraph",
  "deleteGraph",
  "startGraphRun",
  "listGraphRuns",
  "getGraphRun",
  "cancelGraphRun",
  "beginCredentialUpload",
  "getCredential",
] as const satisfies ReadonlyArray<RouteName>;
