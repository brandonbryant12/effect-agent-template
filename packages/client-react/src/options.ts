import type { AgentClient } from "@repo/client";
import type { GraphId, GraphRunId, ProjectId } from "@repo/contracts";
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

export const graphQueryOptions = (client: AgentClient, projectId: ProjectId) =>
  queryOptions({
    queryKey: queryKeys.graphs.byProject(projectId),
    queryFn: () => Effect.runPromise(client.graphs.list(projectId)),
  });

export const graphDetailQueryOptions = (
  client: AgentClient,
  graphId: GraphId,
) =>
  queryOptions({
    queryKey: queryKeys.graphs.detail(graphId),
    queryFn: () => Effect.runPromise(client.graphs.get(graphId)),
  });

export const graphRunQueryOptions = (
  client: AgentClient,
  graphRunId: GraphRunId,
) =>
  queryOptions({
    queryKey: queryKeys.graphRuns.detail(graphRunId),
    queryFn: () => Effect.runPromise(client.graphRuns.get(graphRunId)),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status === "completed" ||
        status === "failed" ||
        status === "cancelled"
        ? false
        : 2_000;
    },
  });
