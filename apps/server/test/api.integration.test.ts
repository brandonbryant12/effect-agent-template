import { createBetterAuthRuntime } from "@repo/auth";
import {
  AgentRunService,
  AgentRunServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
  ConversationService,
  ConversationServiceLive,
  CredentialService,
  CredentialServiceLive,
  ProjectService,
  ProjectServiceLive,
  TaskService,
  TaskServiceLive,
} from "@repo/core";
import { PostgresLive, runMigrations } from "@repo/db";
import {
  makeCredentialUploadService,
  makeSecretStoreMemory,
} from "@repo/secrets";
import { Effect, Layer, Redacted } from "effect";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeApiHandler } from "../src/api.js";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("public server API", () => {
  it("authenticates and runs the deterministic durable flow", async () => {
    const auth = createBetterAuthRuntime({
      databaseUrl: databaseUrl ?? "",
      baseURL: "http://localhost:3000/api/auth",
      secret: "test-secret-that-is-at-least-thirty-two-characters",
      cliClientId: "effect-agent-cli",
      defaultTenantId: "tenant_00000000000000000000000000",
    });
    const Postgres = PostgresLive(databaseUrl ?? "");
    const Domain = Layer.provide(
      Layer.mergeAll(
        ProjectServiceLive,
        TaskServiceLive,
        ConversationServiceLive,
        AgentSessionServiceLive,
        AgentRunServiceLive,
        CredentialServiceLive,
      ),
      Postgres,
    );
    const program = Effect.gen(function* () {
      yield* runMigrations;
      const projects = yield* ProjectService;
      const tasks = yield* TaskService;
      const conversations = yield* ConversationService;
      const sessions = yield* AgentSessionService;
      const runs = yield* AgentRunService;
      const credentials = yield* CredentialService;
      const handler = makeApiHandler({
        authenticate: auth.authenticate,
        authHandler: auth.handler,
        projects,
        tasks,
        conversations,
        sessions,
        runs,
        credentials,
        uploads: makeCredentialUploadService({
          secretStore: makeSecretStoreMemory(),
          signingKey: Redacted.make("test-signing-key-with-enough-entropy"),
        }),
        credentialBrokerUrl: "http://localhost:3001",
        webOrigin: "http://localhost:5173",
      });
      const signup = yield* Effect.promise(() =>
        auth.handler(
          new Request("http://localhost:3000/api/auth/sign-up/email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "API User",
              email: `api-${crypto.randomUUID()}@example.com`,
              password: "correct-horse-battery-staple",
            }),
          }),
        ),
      );
      const cookie = signup.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      const call = (path: string, init: RequestInit = {}) =>
        handler(
          new Request(`http://localhost:3000${path}`, {
            ...init,
            headers: { cookie, ...(init.headers ?? {}) },
          }),
        );
      const projectResponse = yield* Effect.promise(() =>
        call("/api/v1/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Demo", description: null }),
        }),
      );
      const project = yield* Effect.promise(() => projectResponse.json());
      const conversationResponse = yield* Effect.promise(() =>
        call("/api/v1/conversations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            title: "First conversation",
          }),
        }),
      );
      const conversation = yield* Effect.promise(() =>
        conversationResponse.json(),
      );
      const sessionResponse = yield* Effect.promise(() =>
        call("/api/v1/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            conversationId: conversation.id,
          }),
        }),
      );
      const session = yield* Effect.promise(() => sessionResponse.json());
      const runResponse = yield* Effect.promise(() =>
        call(`/api/v1/sessions/${session.id}/runs`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `command_${randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`,
          },
          body: JSON.stringify({
            projectId: project.id,
            conversationId: conversation.id,
            taskId: null,
          }),
        }),
      );
      const run = yield* Effect.promise(() => runResponse.json());
      const events = yield* Effect.promise(() =>
        call(`/api/v1/runs/${run.id}/events`),
      );
      return {
        statuses: [
          projectResponse.status,
          conversationResponse.status,
          sessionResponse.status,
          runResponse.status,
        ],
        events: yield* Effect.promise(() => events.text()),
      };
    });

    try {
      const result = await Effect.runPromise(
        Effect.provide(program, Layer.merge(Domain, Postgres)),
      );
      expect(result.statuses).toEqual([201, 201, 201, 202]);
      expect(result.events).toContain("event: run-event");
    } finally {
      await auth.close();
    }
  });
});
