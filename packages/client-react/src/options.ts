import type { AgentClient } from "@repo/client";
import type { ProjectId } from "@repo/contracts";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { queryKeys } from "./query-keys.js";

export const projectQueryOptions = (client: AgentClient) =>
  queryOptions({
    queryKey: queryKeys.projects.all,
    queryFn: () => Effect.runPromise(client.projects.list()),
  });

export const taskQueryOptions = (client: AgentClient, projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.tasks.byProject(projectId),
    queryFn: () => Effect.runPromise(client.tasks.list(projectId)),
  });
