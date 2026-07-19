import type { AgentRun, AgentRunEvent } from "@repo/contracts";
import { runStatusForEvent } from "@repo/contracts";

export const projectRunEvent = (
  run: AgentRun,
  event: AgentRunEvent,
): AgentRun => ({
  ...run,
  status: runStatusForEvent(event) ?? run.status,
  updatedAt: event.occurredAt,
});
