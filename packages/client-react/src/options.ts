import type { AgentClient } from "@repo/client";
import { isTerminalGraphRunStatus } from "@repo/contracts";
import type { GraphId, GraphRunId, ProjectId } from "@repo/contracts";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { Effect } from "effect";
import { queryKeys } from "./query-keys.js";

export const projectQueryOptions = (client: AgentClient) =>
  queryOptions({
    queryKey: queryKeys.projects.all,
    queryFn: () => Effect.runPromise(client.projects.list()),
  });

export const taskQueryOptions = (
  client: AgentClient,
  projectId: ProjectId | undefined,
) =>
  queryOptions({
    queryKey: queryKeys.tasks.byProject(projectId),
    queryFn: projectId
      ? () => Effect.runPromise(client.tasks.list(projectId))
      : skipToken,
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
  graphRunId: GraphRunId | undefined,
) =>
  queryOptions({
    queryKey: queryKeys.graphRuns.detail(graphRunId),
    queryFn: graphRunId
      ? () => Effect.runPromise(client.graphRuns.get(graphRunId))
      : skipToken,
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status && isTerminalGraphRunStatus(status) ? false : 2_000;
    },
  });
