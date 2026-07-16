import type { AgentRunId, ProjectId } from "@repo/contracts";

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
};
