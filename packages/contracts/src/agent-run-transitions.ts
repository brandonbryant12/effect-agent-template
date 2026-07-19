import type { AgentRunStatus } from "./agent-run.js";

/**
 * Legal agent-run status moves, owned by contracts beside the status
 * schema. Consumers derive behavior from this table (the web run machine
 * generates its transitions from it; terminality is derived below) rather
 * than re-checking statuses at call sites.
 */
export const allowedAgentRunTransitions: Readonly<
  Record<AgentRunStatus, ReadonlySet<AgentRunStatus>>
> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["awaiting-approval", "completed", "failed", "cancelled"]),
  "awaiting-approval": new Set(["running", "completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

/** Terminal means the table allows no further moves — derived, not enumerated. */
export const isTerminalAgentRunStatus = (status: AgentRunStatus): boolean =>
  allowedAgentRunTransitions[status].size === 0;
