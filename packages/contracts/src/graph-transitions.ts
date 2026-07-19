import type { GraphNodeRunStatus, GraphRunStatus } from "./graph.js";

/**
 * Single source of truth for graph-run and node status transitions, owned
 * by contracts because both tiers consume it: SQL layers and the worker
 * coordinator enforce it, and the web XState machine is generated from it,
 * so an illegal transition cannot even be expressed client-side.
 */
export const allowedGraphRunTransitions: Readonly<
  Record<GraphRunStatus, ReadonlySet<GraphRunStatus>>
> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["awaiting-approval", "completed", "failed", "cancelled"]),
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
