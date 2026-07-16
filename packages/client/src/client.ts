import {
  AgentRun,
  AgentRunEvent,
  AgentSession,
  Project,
  type AgentRunId,
  type AgentSessionId,
  type CommandId,
  type CreateProject,
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
  },
  sessions: {
    get: (sessionId: AgentSessionId) =>
      transport.execute({
        method: "GET",
        path: `/sessions/${encodeURIComponent(sessionId)}`,
        schema: AgentSession,
      }),
  },
  runs: {
    start: (sessionId: AgentSessionId, commandId: CommandId) =>
      transport.execute({
        method: "POST",
        path: `/sessions/${encodeURIComponent(sessionId)}/runs`,
        schema: AgentRun,
        body: {},
        idempotencyKey: commandId,
      }),
    events: (runId: AgentRunId, after?: number) =>
      transport.events({
        path: `/runs/${encodeURIComponent(runId)}/events`,
        schema: AgentRunEvent,
        ...(after === undefined ? {} : { after }),
      }),
  },
});

export type AgentClient = ReturnType<typeof createAgentClient>;
