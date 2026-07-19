import type { Principal } from "@repo/auth";
import { CommandId, isTerminalGraphNodeStatus } from "@repo/contracts";
import {
  ApiRoutes,
  decodeParams,
  matchPath,
  type RouteName,
  type RouteParams,
  type RouteRequest,
} from "@repo/contracts/http";
import {
  AgentRunService,
  ApprovalService,
  AgentSessionService,
  ConversationService,
  CredentialService,
  GraphRunService,
  GraphService,
  ProjectService,
  TaskService,
} from "@repo/core";
import type { CredentialUploadService } from "@repo/secrets";
import { Context, Effect, Schema } from "effect";

export interface ApiServices {
  readonly authenticate: (
    headers: Headers,
  ) => Effect.Effect<Principal, unknown>;
  readonly authHandler: (request: Request) => Promise<Response>;
  readonly projects: Context.Service.Shape<typeof ProjectService>;
  readonly tasks: Context.Service.Shape<typeof TaskService>;
  readonly conversations: Context.Service.Shape<typeof ConversationService>;
  readonly sessions: Context.Service.Shape<typeof AgentSessionService>;
  readonly runs: Context.Service.Shape<typeof AgentRunService>;
  readonly approvals: Context.Service.Shape<typeof ApprovalService>;
  readonly credentials: Context.Service.Shape<typeof CredentialService>;
  readonly graphs: Context.Service.Shape<typeof GraphService>;
  readonly graphRuns: Context.Service.Shape<typeof GraphRunService>;
  readonly uploads: CredentialUploadService;
  readonly credentialBrokerUrl: string;
  readonly webOrigin: string;
  readonly readiness: Effect.Effect<void, unknown>;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

// Every expected domain error maps to an explicit status. A tag missing from
// this table is a defect and intentionally falls through to 500 — extend the
// table when a capability gains a new tagged error.
const errorStatus: Readonly<Record<string, number>> = {
  ProjectNotFound: 404,
  TaskNotFound: 404,
  ConversationNotFound: 404,
  AgentSessionNotFound: 404,
  AgentRunNotFound: 404,
  ApprovalNotFound: 404,
  CredentialNotFound: 404,
  GraphNotFound: 404,
  GraphRunNotFound: 404,
  InvalidGraph: 409,
  InvalidTaskTransition: 409,
  InvalidAgentSessionTransition: 409,
  InvalidGraphRunTransition: 409,
  RunControlRejected: 409,
};

const statusFor = (error: unknown): number =>
  typeof error === "object" && error !== null && "_tag" in error
    ? (errorStatus[String(error._tag)] ?? 500)
    : 500;

const withCors = (response: Response, origin: string, allowed: string) => {
  const next = new Response(response.body, response);
  if (origin === allowed) {
    next.headers.set("access-control-allow-origin", origin);
    next.headers.set("access-control-allow-credentials", "true");
    next.headers.set(
      "access-control-allow-headers",
      "content-type,idempotency-key,last-event-id,x-upload-token,authorization",
    );
    next.headers.set(
      "access-control-allow-methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
    next.headers.set("vary", "Origin");
  }
  next.headers.set("x-content-type-options", "nosniff");
  return next;
};

interface AuthScope {
  readonly tenantId: Principal["tenantId"];
  readonly userId: Principal["userId"];
}

interface RouteContext<K extends RouteName> {
  readonly scope: AuthScope;
  readonly params: RouteParams<(typeof ApiRoutes)[K]>;
  readonly body: RouteRequest<(typeof ApiRoutes)[K]>;
  readonly request: Request;
  readonly url: URL;
}

/**
 * One handler per route in the shared table. `RouteName` keys make this map
 * exhaustive: adding a route to ApiRoutes without a handler here is a
 * compile error.
 */
type RouteHandlers = {
  readonly [K in RouteName]: (context: RouteContext<K>) => Promise<Response>;
};

interface DispatchContext {
  readonly scope: AuthScope;
  readonly params: unknown;
  readonly body: unknown;
  readonly request: Request;
  readonly url: URL;
}

export const makeApiHandler = (services: ApiServices) => {
  const run = <A>(effect: Effect.Effect<A, unknown>) =>
    Effect.runPromise(effect);

  const handlers: RouteHandlers = {
    listProjects: async ({ scope }) =>
      json(await run(services.projects.list(scope))),
    createProject: async ({ scope, body }) =>
      json(await run(services.projects.create(scope, body)), 201),
    getProject: async ({ scope, params }) =>
      json(await run(services.projects.get(scope, params.projectId))),
    updateProject: async ({ scope, params, body }) =>
      json(await run(services.projects.update(scope, params.projectId, body))),
    deleteProject: async ({ scope, params }) => {
      await run(services.projects.remove(scope, params.projectId));
      return new Response(null, { status: 204 });
    },
    listTasks: async ({ scope, params }) =>
      json(await run(services.tasks.listByProject(scope, params.projectId))),
    createTask: async ({ scope, params, body }) =>
      json(
        await run(
          services.tasks.create(scope, {
            ...body,
            projectId: params.projectId,
          }),
        ),
        201,
      ),
    transitionTask: async ({ scope, params, body }) =>
      json(
        await run(services.tasks.transition(scope, params.taskId, body.status)),
      ),
    createConversation: async ({ scope, body }) =>
      json(await run(services.conversations.create(scope, body)), 201),
    createSession: async ({ scope, body }) =>
      json(
        await run(
          services.sessions.create(scope, {
            ...body,
            credentialIds: body.credentialIds ?? [],
          }),
        ),
        201,
      ),
    getSession: async ({ scope, params }) =>
      json(await run(services.sessions.get(scope, params.sessionId))),
    startRun: async ({ scope, params, body, request }) => {
      const commandId = Schema.decodeUnknownSync(CommandId)(
        request.headers.get("idempotency-key"),
      );
      return json(
        await run(
          services.runs.admit(scope, {
            ...body,
            commandId,
            sessionId: params.sessionId,
          }),
        ),
        202,
      );
    },
    getRun: async ({ scope, params }) =>
      json(await run(services.runs.get(scope, params.runId))),
    cancelRun: async ({ scope, params }) =>
      json(await run(services.approvals.cancelRun(scope, params.runId))),
    streamRunEvents: async ({ scope, params, request, url }) => {
      const after = Number(
        request.headers.get("last-event-id") ??
          url.searchParams.get("after") ??
          "0",
      );
      const values = await run(
        services.runs.events(
          scope,
          params.runId,
          Number.isSafeInteger(after) ? after : 0,
        ),
      );
      const stream = values
        .map(
          (event) =>
            `id: ${event.sequence}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`,
        )
        .join("");
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-store",
          connection: "keep-alive",
        },
      });
    },
    getApproval: async ({ scope, params }) =>
      json(await run(services.approvals.get(scope, params.approvalId))),
    replyApproval: async ({ scope, params, body }) =>
      json(
        await run(
          services.approvals.resolve(scope, params.approvalId, body.decision),
        ),
      ),
    listGraphs: async ({ scope, params }) =>
      json(await run(services.graphs.listByProject(scope, params.projectId))),
    createGraph: async ({ scope, params, body }) =>
      json(
        await run(services.graphs.create(scope, params.projectId, body)),
        201,
      ),
    getGraph: async ({ scope, params }) =>
      json(await run(services.graphs.get(scope, params.graphId))),
    updateGraph: async ({ scope, params, body }) =>
      json(await run(services.graphs.update(scope, params.graphId, body))),
    deleteGraph: async ({ scope, params }) => {
      await run(services.graphs.remove(scope, params.graphId));
      return new Response(null, { status: 204 });
    },
    startGraphRun: async ({ scope, params, body, request }) => {
      const commandId = Schema.decodeUnknownSync(CommandId)(
        request.headers.get("idempotency-key"),
      );
      return json(
        await run(
          services.graphRuns.start(
            scope,
            params.graphId,
            commandId,
            body.input,
          ),
        ),
        202,
      );
    },
    listGraphRuns: async ({ scope, params }) =>
      json(await run(services.graphRuns.listByGraph(scope, params.graphId))),
    getGraphRun: async ({ scope, params }) =>
      json(await run(services.graphRuns.get(scope, params.graphRunId))),
    cancelGraphRun: async ({ scope, params }) => {
      const detail = await run(
        services.graphRuns.cancel(scope, params.graphRunId),
      );
      // Cancel in-flight node runs through the existing run-cancel path;
      // a node already terminal rejects with RunControlRejected — ignored.
      for (const node of detail.nodes) {
        if (
          node.agentRunId !== null &&
          !isTerminalGraphNodeStatus(node.status)
        ) {
          try {
            await run(services.approvals.cancelRun(scope, node.agentRunId));
          } catch (error) {
            if (
              typeof error !== "object" ||
              error === null ||
              !("_tag" in error) ||
              error._tag !== "RunControlRejected"
            ) {
              throw error;
            }
          }
        }
      }
      return json(detail);
    },
    beginCredentialUpload: async ({ scope, body }) => {
      const credential = await run(
        services.credentials.createPending(scope, body),
      );
      const intent = await run(services.uploads.issue(scope, credential.id));
      return json(
        {
          credential,
          upload: {
            url: `${services.credentialBrokerUrl}/v1/credential-uploads`,
            token: intent.token,
            expiresAt: intent.expiresAt.toISOString(),
          },
        },
        201,
      );
    },
    getCredential: async ({ scope, params }) =>
      json(await run(services.credentials.get(scope, params.credentialId))),
  };

  const routeNames = Object.keys(ApiRoutes) as ReadonlyArray<RouteName>;

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") ?? "";
    const respond = (response: Response) =>
      withCors(response, origin, services.webOrigin);
    if (request.method === "OPTIONS")
      return respond(new Response(null, { status: 204 }));
    if (url.pathname === "/healthz") {
      return respond(json({ status: "ok" }));
    }
    if (url.pathname === "/readyz") {
      try {
        await run(services.readiness);
        return respond(json({ status: "ready" }));
      } catch {
        return respond(json({ status: "unavailable" }, 503));
      }
    }
    if (url.pathname.startsWith("/api/auth/")) {
      return respond(await services.authHandler(request));
    }
    if (!url.pathname.startsWith("/api/v1/")) {
      return respond(json({ error: "not_found" }, 404));
    }

    let principal: Principal;
    try {
      principal = await run(services.authenticate(request.headers));
    } catch {
      return respond(json({ error: "unauthorized" }, 401));
    }
    const scope = { tenantId: principal.tenantId, userId: principal.userId };
    const subPath = url.pathname.slice("/api/v1".length);

    try {
      for (const name of routeNames) {
        const definition = ApiRoutes[name];
        if (definition.method !== request.method) continue;
        const raw = matchPath(definition, subPath);
        if (raw === null) continue;
        const params = decodeParams(definition, raw);
        const body =
          definition.request === undefined
            ? undefined
            : Schema.decodeUnknownSync(definition.request)(
                await request.json(),
              );
        // The handler map is precisely typed per route; the dispatcher calls
        // through one widened signature after decoding params and body with
        // that route's own schemas.
        const handler = handlers[name] as unknown as (
          context: DispatchContext,
        ) => Promise<Response>;
        return respond(await handler({ scope, params, body, request, url }));
      }
      return respond(json({ error: "not_found" }, 404));
    } catch (error) {
      if (error instanceof SyntaxError || Schema.isSchemaError(error)) {
        return respond(json({ error: "invalid_request" }, 400));
      }
      const status = statusFor(error);
      if (status === 500) {
        // Expected domain errors are mapped above; anything reaching 500 is
        // a defect and must be visible, not silently swallowed.
        console.error(
          "unhandled request error",
          request.method,
          subPath,
          error,
        );
      }
      return respond(json({ error: "request_failed" }, status));
    }
  };
};
