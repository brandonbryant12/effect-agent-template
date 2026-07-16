import type { AgentRun, AgentRunEvent } from "@repo/contracts";

export const projectRunEvent = (
  run: AgentRun,
  event: AgentRunEvent,
): AgentRun => {
  const status =
    event._tag === "RunCompleted"
      ? "completed"
      : event._tag === "RunCancelled"
        ? "cancelled"
        : event._tag === "RunFailed"
          ? "failed"
          : event._tag === "ApprovalRequested"
            ? "awaiting-approval"
            : event._tag === "RunStatusChanged"
              ? event.status
              : run.status;
  return { ...run, status, updatedAt: event.occurredAt };
};
