import type { AgentRunId, GraphId, GraphRunId, ProjectId } from "@repo/contracts";

export const queryKeys = {
  projects: {
    all: ["projects"] as const,
    detail: (projectId: ProjectId) => ["projects", projectId] as const,
  },
  tasks: {
    byProject: (projectId: ProjectId) =>
      ["projects", projectId, "tasks"] as const,
  },
  runs: {
    detail: (runId: AgentRunId) => ["runs", runId] as const,
    events: (runId: AgentRunId) => ["runs", runId, "events"] as const,
  },
  graphs: {
    byProject: (projectId: ProjectId) =>
      ["projects", projectId, "graphs"] as const,
    detail: (graphId: GraphId) => ["graphs", graphId] as const,
    runs: (graphId: GraphId) => ["graphs", graphId, "runs"] as const,
  },
  graphRuns: {
    detail: (graphRunId: GraphRunId) => ["graph-runs", graphRunId] as const,
  },
};
