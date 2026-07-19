import { Schema } from "effect";
import { AgentRun, AgentRunEvent, StartAgentRun } from "./agent-run.js";
import { AgentSession, CreateAgentSession } from "./agent-session.js";
import { ApprovalRequest, ReplyApproval } from "./approval.js";
import { Conversation, CreateConversation } from "./conversation.js";
import {
  BeginCredentialUpload,
  Credential,
  PendingCredentialUpload,
} from "./credential.js";
import {
  Graph,
  GraphRun,
  GraphRunDetail,
  CreateGraph as CreateGraphSchema,
  StartGraphRun,
  UpdateGraph as UpdateGraphSchema,
} from "./graph.js";
import {
  AgentRunId,
  AgentSessionId,
  ApprovalId,
  CredentialId,
  GraphId,
  GraphRunId,
  ProjectId,
  TaskId,
} from "./ids.js";
import { CreateProject, Project } from "./project.js";
import { CreateTaskBody, Task, TransitionTask } from "./task.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type AnySchema = Schema.ConstraintDecoder<unknown, never>;

type PathParamNames<Path extends string> =
  Path extends `${string}:${infer Rest}`
    ? Rest extends `${infer Name}/${infer Tail}`
      ? Name | PathParamNames<`/${Tail}`>
      : Rest
    : never;

export interface RouteDef<
  Path extends string = string,
  Params extends Readonly<Record<string, AnySchema>> = Readonly<
    Record<string, AnySchema>
  >,
  Request extends AnySchema | undefined = AnySchema | undefined,
  Response extends AnySchema | undefined = AnySchema | undefined,
> {
  readonly method: HttpMethod;
  readonly path: Path;
  readonly params: Params;
  readonly request: Request;
  readonly response: Response;
  readonly status: number;
}

const route = <
  const Path extends string,
  const Params extends Readonly<Record<PathParamNames<Path>, AnySchema>>,
  Request extends AnySchema | undefined = undefined,
  Response extends AnySchema | undefined = undefined,
>(definition: {
  readonly method: HttpMethod;
  readonly path: Path;
  readonly params?: Params;
  readonly request?: Request;
  readonly response?: Response;
  readonly status?: number;
}): RouteDef<Path, Params, Request, Response> => ({
  method: definition.method,
  path: definition.path,
  params: definition.params ?? ({} as Params),
  request: definition.request as Request,
  response: definition.response as Response,
  status: definition.status ?? 200,
});

/**
 * The single authority for the public HTTP API. The server router, the
 * Effect client, and every test derive method, path, parameter decoding,
 * and body/response schemas from this table. Adding an endpoint here forces
 * a compile error in the server handler map until a handler exists.
 */
export const ApiRoutes = {
  listProjects: route({
    method: "GET",
    path: "/projects",
    response: Schema.Array(Project),
  }),
  createProject: route({
    method: "POST",
    path: "/projects",
    request: CreateProject,
    response: Project,
    status: 201,
  }),
  getProject: route({
    method: "GET",
    path: "/projects/:projectId",
    params: { projectId: ProjectId },
    response: Project,
  }),
  updateProject: route({
    method: "PATCH",
    path: "/projects/:projectId",
    params: { projectId: ProjectId },
    request: CreateProject,
    response: Project,
  }),
  deleteProject: route({
    method: "DELETE",
    path: "/projects/:projectId",
    params: { projectId: ProjectId },
    status: 204,
  }),
  listTasks: route({
    method: "GET",
    path: "/projects/:projectId/tasks",
    params: { projectId: ProjectId },
    response: Schema.Array(Task),
  }),
  createTask: route({
    method: "POST",
    path: "/projects/:projectId/tasks",
    params: { projectId: ProjectId },
    request: CreateTaskBody,
    response: Task,
    status: 201,
  }),
  transitionTask: route({
    method: "POST",
    path: "/tasks/:taskId/transition",
    params: { taskId: TaskId },
    request: TransitionTask,
    response: Task,
  }),
  createConversation: route({
    method: "POST",
    path: "/conversations",
    request: CreateConversation,
    response: Conversation,
    status: 201,
  }),
  createSession: route({
    method: "POST",
    path: "/sessions",
    request: CreateAgentSession,
    response: AgentSession,
    status: 201,
  }),
  getSession: route({
    method: "GET",
    path: "/sessions/:sessionId",
    params: { sessionId: AgentSessionId },
    response: AgentSession,
  }),
  startRun: route({
    method: "POST",
    path: "/sessions/:sessionId/runs",
    params: { sessionId: AgentSessionId },
    request: StartAgentRun,
    response: AgentRun,
    status: 202,
  }),
  getRun: route({
    method: "GET",
    path: "/runs/:runId",
    params: { runId: AgentRunId },
    response: AgentRun,
  }),
  cancelRun: route({
    method: "POST",
    path: "/runs/:runId/cancel",
    params: { runId: AgentRunId },
    response: AgentRun,
  }),
  streamRunEvents: route({
    method: "GET",
    path: "/runs/:runId/events",
    params: { runId: AgentRunId },
    response: AgentRunEvent,
  }),
  getApproval: route({
    method: "GET",
    path: "/approvals/:approvalId",
    params: { approvalId: ApprovalId },
    response: ApprovalRequest,
  }),
  replyApproval: route({
    method: "POST",
    path: "/approvals/:approvalId/reply",
    params: { approvalId: ApprovalId },
    request: ReplyApproval,
    response: ApprovalRequest,
  }),
  listGraphs: route({
    method: "GET",
    path: "/projects/:projectId/graphs",
    params: { projectId: ProjectId },
    response: Schema.Array(Graph),
  }),
  createGraph: route({
    method: "POST",
    path: "/projects/:projectId/graphs",
    params: { projectId: ProjectId },
    request: CreateGraphSchema,
    response: Graph,
    status: 201,
  }),
  getGraph: route({
    method: "GET",
    path: "/graphs/:graphId",
    params: { graphId: GraphId },
    response: Graph,
  }),
  updateGraph: route({
    method: "PATCH",
    path: "/graphs/:graphId",
    params: { graphId: GraphId },
    request: UpdateGraphSchema,
    response: Graph,
  }),
  deleteGraph: route({
    method: "DELETE",
    path: "/graphs/:graphId",
    params: { graphId: GraphId },
    status: 204,
  }),
  startGraphRun: route({
    method: "POST",
    path: "/graphs/:graphId/runs",
    params: { graphId: GraphId },
    request: StartGraphRun,
    response: GraphRun,
    status: 202,
  }),
  listGraphRuns: route({
    method: "GET",
    path: "/graphs/:graphId/runs",
    params: { graphId: GraphId },
    response: Schema.Array(GraphRun),
  }),
  getGraphRun: route({
    method: "GET",
    path: "/graph-runs/:graphRunId",
    params: { graphRunId: GraphRunId },
    response: GraphRunDetail,
  }),
  cancelGraphRun: route({
    method: "POST",
    path: "/graph-runs/:graphRunId/cancel",
    params: { graphRunId: GraphRunId },
    response: GraphRunDetail,
  }),
  beginCredentialUpload: route({
    method: "POST",
    path: "/credentials",
    request: BeginCredentialUpload,
    response: PendingCredentialUpload,
    status: 201,
  }),
  getCredential: route({
    method: "GET",
    path: "/credentials/:credentialId",
    params: { credentialId: CredentialId },
    response: Credential,
  }),
} as const;

export type RouteName = keyof typeof ApiRoutes;

export type RouteParams<D extends RouteDef> = {
  readonly [K in keyof D["params"]]: D["params"][K] extends AnySchema
    ? D["params"][K]["Type"]
    : never;
};

export type RouteRequest<D extends RouteDef> = D["request"] extends AnySchema
  ? D["request"]["Type"]
  : undefined;

/** Builds a concrete request path from a route definition and typed params. */
export const buildPath = <D extends RouteDef>(
  definition: D,
  params: RouteParams<D>,
): string =>
  definition.path.replace(/:(\w+)/g, (_segment, name: string) =>
    encodeURIComponent(String((params as Record<string, unknown>)[name])),
  );

const patternCache = new Map<string, RegExp>();

const patternFor = (path: string): RegExp => {
  const cached = patternCache.get(path);
  if (cached) return cached;
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, "([^/]+)")}$`);
  patternCache.set(path, pattern);
  return pattern;
};

const paramNames = (path: string): ReadonlyArray<string> =>
  [...path.matchAll(/:(\w+)/g)].map((match) => match[1] ?? "");

/**
 * Matches a pathname against a route definition and returns the raw
 * (undecoded) path parameters, or null when the route does not match.
 */
export const matchPath = (
  definition: RouteDef,
  pathname: string,
): Readonly<Record<string, string>> | null => {
  const match = pathname.match(patternFor(definition.path));
  if (!match) return null;
  const names = paramNames(definition.path);
  const raw: Record<string, string> = {};
  names.forEach((name, index) => {
    raw[name] = decodeURIComponent(match[index + 1] ?? "");
  });
  return raw;
};

/** Decodes raw path parameters with each parameter's schema. Throws SchemaError on invalid input. */
export const decodeParams = <D extends RouteDef>(
  definition: D,
  raw: Readonly<Record<string, string>>,
): RouteParams<D> => {
  const decoded: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(definition.params)) {
    decoded[name] = Schema.decodeUnknownSync(schema)(raw[name]);
  }
  return decoded as RouteParams<D>;
};
