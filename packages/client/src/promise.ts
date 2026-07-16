import { Effect, Stream } from "effect";
import type { AgentClient } from "./client.js";

export const toPromiseClient = (client: AgentClient) => ({
  projects: {
    list: () => Effect.runPromise(client.projects.list()),
    create: (input: Parameters<AgentClient["projects"]["create"]>[0]) =>
      Effect.runPromise(client.projects.create(input)),
  },
  sessions: {
    get: (id: Parameters<AgentClient["sessions"]["get"]>[0]) =>
      Effect.runPromise(client.sessions.get(id)),
  },
  runs: {
    start: (...input: Parameters<AgentClient["runs"]["start"]>) =>
      Effect.runPromise(client.runs.start(...input)),
    events: (...input: Parameters<AgentClient["runs"]["events"]>) =>
      Stream.toAsyncIterable(client.runs.events(...input)),
  },
});
