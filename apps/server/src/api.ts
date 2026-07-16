import type { Principal } from "@repo/auth";
import {
  AgentRunId,
  AgentSessionId,
  CommandId,
  ConversationId,
  CreateConversation,
  CreateProject,
  CreateTask,
  CredentialId,
  CredentialProvider,
  ProjectId,
  TaskId,
  TaskStatus,
} from "@repo/contracts";
import {
  AgentRunService,
  AgentSessionService,
  ConversationService,
  CredentialService,
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
  readonly credentials: Context.Service.Shape<typeof CredentialService>;
  readonly uploads: CredentialUploadService;
  readonly credentialBrokerUrl: string;
  readonly webOrigin: string;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const statusFor = (error: unknown): number => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return 500;
  }
  if (String(error._tag).includes("NotFound")) return 404;
  if (String(error._tag).includes("Invalid")) return 409;
  return 500;
};

const body = async <S extends Schema.ConstraintDecoder<unknown, never>>(
  request: Request,
  schema: S,
): Promise<S["Type"]> => Schema.decodeUnknownSync(schema)(await request.json());

const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  value: unknown,
): S["Type"] => Schema.decodeUnknownSync(schema)(value);

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

export const makeApiHandler =
  (services: ApiServices) =>
  async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") ?? "";
    const respond = (response: Response) =>
      withCors(response, origin, services.webOrigin);
    if (request.method === "OPTIONS")
      return respond(new Response(null, { status: 204 }));
    if (url.pathname === "/healthz" || url.pathname === "/readyz") {
      return respond(json({ status: "ok" }));
    }
    if (url.pathname.startsWith("/api/auth/")) {
      return respond(await services.authHandler(request));
    }
    if (!url.pathname.startsWith("/api/v1/")) {
      return respond(json({ error: "not_found" }, 404));
    }

    let principal: Principal;
    try {
      principal = await Effect.runPromise(
        services.authenticate(request.headers),
      );
    } catch {
      return respond(json({ error: "unauthorized" }, 401));
    }
    const scope = { tenantId: principal.tenantId, userId: principal.userId };

    try {
      if (url.pathname === "/api/v1/projects" && request.method === "GET") {
        return respond(
          json(await Effect.runPromise(services.projects.list(scope))),
        );
      }
      if (url.pathname === "/api/v1/projects" && request.method === "POST") {
        const input = await body(request, CreateProject);
        return respond(
          json(
            await Effect.runPromise(services.projects.create(scope, input)),
            201,
          ),
        );
      }
      const project = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (project) {
        const id = decode(ProjectId, project[1]);
        if (request.method === "GET") {
          return respond(
            json(await Effect.runPromise(services.projects.get(scope, id))),
          );
        }
        if (request.method === "PATCH") {
          const input = await body(request, CreateProject);
          return respond(
            json(
              await Effect.runPromise(
                services.projects.update(scope, id, input),
              ),
            ),
          );
        }
        if (request.method === "DELETE") {
          await Effect.runPromise(services.projects.remove(scope, id));
          return respond(new Response(null, { status: 204 }));
        }
      }
      const projectTasks = url.pathname.match(
        /^\/api\/v1\/projects\/([^/]+)\/tasks$/,
      );
      if (projectTasks) {
        const projectId = decode(ProjectId, projectTasks[1]);
        if (request.method === "GET") {
          return respond(
            json(
              await Effect.runPromise(
                services.tasks.listByProject(scope, projectId),
              ),
            ),
          );
        }
        if (request.method === "POST") {
          const payload = await request.json();
          const input = decode(CreateTask, {
            ...(payload as object),
            projectId,
          });
          return respond(
            json(
              await Effect.runPromise(services.tasks.create(scope, input)),
              201,
            ),
          );
        }
      }
      const taskTransition = url.pathname.match(
        /^\/api\/v1\/tasks\/([^/]+)\/transition$/,
      );
      if (taskTransition && request.method === "POST") {
        const taskId = decode(TaskId, taskTransition[1]);
        const transition = await body(
          request,
          Schema.Struct({ status: TaskStatus }),
        );
        return respond(
          json(
            await Effect.runPromise(
              services.tasks.transition(scope, taskId, transition.status),
            ),
          ),
        );
      }
      if (
        url.pathname === "/api/v1/conversations" &&
        request.method === "POST"
      ) {
        const input = await body(request, CreateConversation);
        return respond(
          json(
            await Effect.runPromise(
              services.conversations.create(scope, input),
            ),
            201,
          ),
        );
      }
      if (url.pathname === "/api/v1/sessions" && request.method === "POST") {
        const input = await body(
          request,
          Schema.Struct({
            projectId: ProjectId,
            conversationId: ConversationId,
          }),
        );
        return respond(
          json(
            await Effect.runPromise(services.sessions.create(scope, input)),
            201,
          ),
        );
      }
      const session = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
      if (session && request.method === "GET") {
        return respond(
          json(
            await Effect.runPromise(
              services.sessions.get(scope, decode(AgentSessionId, session[1])),
            ),
          ),
        );
      }
      const startRun = url.pathname.match(
        /^\/api\/v1\/sessions\/([^/]+)\/runs$/,
      );
      if (startRun && request.method === "POST") {
        const commandId = decode(
          CommandId,
          request.headers.get("idempotency-key"),
        );
        const input = await body(
          request,
          Schema.Struct({
            projectId: ProjectId,
            conversationId: ConversationId,
            taskId: Schema.NullOr(TaskId),
          }),
        );
        return respond(
          json(
            await Effect.runPromise(
              services.runs.admit(scope, {
                ...input,
                commandId,
                sessionId: decode(AgentSessionId, startRun[1]),
              }),
            ),
            202,
          ),
        );
      }
      const run = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)$/);
      if (run && request.method === "GET") {
        return respond(
          json(
            await Effect.runPromise(
              services.runs.get(scope, decode(AgentRunId, run[1])),
            ),
          ),
        );
      }
      const events = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/events$/);
      if (events && request.method === "GET") {
        const after = Number(
          request.headers.get("last-event-id") ??
            url.searchParams.get("after") ??
            "0",
        );
        const values = await Effect.runPromise(
          services.runs.events(
            scope,
            decode(AgentRunId, events[1]),
            Number.isSafeInteger(after) ? after : 0,
          ),
        );
        const stream = values
          .map(
            (event) =>
              `id: ${event.sequence}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join("");
        return respond(
          new Response(stream, {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-store",
              connection: "keep-alive",
            },
          }),
        );
      }
      if (url.pathname === "/api/v1/credentials" && request.method === "POST") {
        const input = await body(
          request,
          Schema.Struct({ provider: CredentialProvider, label: Schema.String }),
        );
        const credential = await Effect.runPromise(
          services.credentials.createPending(scope, input),
        );
        const intent = await Effect.runPromise(
          services.uploads.issue(scope, credential.id),
        );
        return respond(
          json(
            {
              credential,
              upload: {
                url: `${services.credentialBrokerUrl}/v1/credential-uploads`,
                token: intent.token,
                expiresAt: intent.expiresAt.toISOString(),
              },
            },
            201,
          ),
        );
      }
      const credential = url.pathname.match(
        /^\/api\/v1\/credentials\/([^/]+)$/,
      );
      if (credential && request.method === "GET") {
        return respond(
          json(
            await Effect.runPromise(
              services.credentials.get(
                scope,
                decode(CredentialId, credential[1]),
              ),
            ),
          ),
        );
      }
      return respond(json({ error: "not_found" }, 404));
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        String(error).includes("SchemaError")
      ) {
        return respond(json({ error: "invalid_request" }, 400));
      }
      return respond(json({ error: "request_failed" }, statusFor(error)));
    }
  };
