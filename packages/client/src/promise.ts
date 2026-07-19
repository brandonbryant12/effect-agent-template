import { Effect, Stream } from "effect";
import type { AgentClient } from "./client.js";

export const toPromiseClient = (client: AgentClient) => ({
  projects: {
    list: () => Effect.runPromise(client.projects.list()),
    create: (input: Parameters<AgentClient["projects"]["create"]>[0]) =>
      Effect.runPromise(client.projects.create(input)),
    get: (id: Parameters<AgentClient["projects"]["get"]>[0]) =>
      Effect.runPromise(client.projects.get(id)),
    update: (...input: Parameters<AgentClient["projects"]["update"]>) =>
      Effect.runPromise(client.projects.update(...input)),
  },
  tasks: {
    list: (id: Parameters<AgentClient["tasks"]["list"]>[0]) =>
      Effect.runPromise(client.tasks.list(id)),
    create: (...input: Parameters<AgentClient["tasks"]["create"]>) =>
      Effect.runPromise(client.tasks.create(...input)),
    transition: (...input: Parameters<AgentClient["tasks"]["transition"]>) =>
      Effect.runPromise(client.tasks.transition(...input)),
  },
  conversations: {
    create: (input: Parameters<AgentClient["conversations"]["create"]>[0]) =>
      Effect.runPromise(client.conversations.create(input)),
  },
  sessions: {
    create: (input: Parameters<AgentClient["sessions"]["create"]>[0]) =>
      Effect.runPromise(client.sessions.create(input)),
    get: (id: Parameters<AgentClient["sessions"]["get"]>[0]) =>
      Effect.runPromise(client.sessions.get(id)),
  },
  runs: {
    start: (...input: Parameters<AgentClient["runs"]["start"]>) =>
      Effect.runPromise(client.runs.start(...input)),
    events: (...input: Parameters<AgentClient["runs"]["events"]>) =>
      Stream.toAsyncIterable(client.runs.events(...input)),
    cancel: (id: Parameters<AgentClient["runs"]["cancel"]>[0]) =>
      Effect.runPromise(client.runs.cancel(id)),
  },
  approvals: {
    get: (id: Parameters<AgentClient["approvals"]["get"]>[0]) =>
      Effect.runPromise(client.approvals.get(id)),
    reply: (...input: Parameters<AgentClient["approvals"]["reply"]>) =>
      Effect.runPromise(client.approvals.reply(...input)),
  },
  graphs: {
    list: (id: Parameters<AgentClient["graphs"]["list"]>[0]) =>
      Effect.runPromise(client.graphs.list(id)),
    create: (...input: Parameters<AgentClient["graphs"]["create"]>) =>
      Effect.runPromise(client.graphs.create(...input)),
    get: (id: Parameters<AgentClient["graphs"]["get"]>[0]) =>
      Effect.runPromise(client.graphs.get(id)),
    update: (...input: Parameters<AgentClient["graphs"]["update"]>) =>
      Effect.runPromise(client.graphs.update(...input)),
  },
  graphRuns: {
    start: (...input: Parameters<AgentClient["graphRuns"]["start"]>) =>
      Effect.runPromise(client.graphRuns.start(...input)),
    list: (id: Parameters<AgentClient["graphRuns"]["list"]>[0]) =>
      Effect.runPromise(client.graphRuns.list(id)),
    get: (id: Parameters<AgentClient["graphRuns"]["get"]>[0]) =>
      Effect.runPromise(client.graphRuns.get(id)),
    cancel: (id: Parameters<AgentClient["graphRuns"]["cancel"]>[0]) =>
      Effect.runPromise(client.graphRuns.cancel(id)),
  },
  credentials: {
    beginUpload: (
      input: Parameters<AgentClient["credentials"]["beginUpload"]>[0],
    ) => Effect.runPromise(client.credentials.beginUpload(input)),
    get: (id: Parameters<AgentClient["credentials"]["get"]>[0]) =>
      Effect.runPromise(client.credentials.get(id)),
  },
});
