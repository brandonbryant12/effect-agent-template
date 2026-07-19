import type { GraphNodeRunStatus, GraphRunStatus } from "@repo/contracts";

/**
 * Single source of truth for graph-run and node status transitions. The
 * worker coordinator, SQL layers, and the web XState machines all derive
 * from these tables; a web test asserts the machines stay a subset.
 */
export const allowedGraphRunTransitions: Readonly<
  Record<GraphRunStatus, ReadonlySet<GraphRunStatus>>
> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set([
    "awaiting-approval",
    "completed",
    "failed",
    "cancelled",
  ]),
  "awaiting-approval": new Set(["running", "completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export const allowedGraphNodeTransitions: Readonly<
  Record<GraphNodeRunStatus, ReadonlySet<GraphNodeRunStatus>>
> = {
  pending: new Set(["ready", "skipped"]),
  ready: new Set(["running", "skipped"]),
  running: new Set(["awaiting-approval", "completed", "failed"]),
  "awaiting-approval": new Set(["running", "completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
  skipped: new Set(),
};
