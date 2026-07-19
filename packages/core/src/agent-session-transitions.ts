import type { AgentSessionStatus } from "@repo/contracts";

/**
 * The single source of truth for legal session-status transitions. Both the
 * Live SQL implementation and the in-memory Test layer consult this table,
 * so they cannot drift apart.
 */
export const allowedSessionTransitions: Readonly<
  Record<AgentSessionStatus, ReadonlySet<AgentSessionStatus>>
> = {
  provisioning: new Set(["ready", "failed", "terminated"]),
  ready: new Set(["running", "paused", "terminated"]),
  running: new Set([
    "ready",
    "awaiting-approval",
    "paused",
    "failed",
    "terminated",
  ]),
  "awaiting-approval": new Set(["running", "failed", "terminated"]),
  paused: new Set(["ready", "terminated"]),
  failed: new Set(["terminated"]),
  terminated: new Set(),
};
