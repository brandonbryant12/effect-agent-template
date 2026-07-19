import {
  allowedGraphRunTransitions,
  type GraphRunStatus,
} from "@repo/contracts";
import { setup } from "xstate";

type GraphRunMachineEvent =
  | { readonly type: "START" }
  | { readonly type: "STARTED" }
  | { readonly type: "START_FAILED" }
  | { readonly type: "STATUS"; readonly status: GraphRunStatus };

/** Machine state that mirrors each GraphRunStatus. Exhaustive by type. */
export const stateForStatus: Readonly<Record<GraphRunStatus, string>> = {
  queued: "starting",
  running: "running",
  "awaiting-approval": "awaitingApproval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * STATUS transitions are generated from the contracts transition table, so
 * the machine cannot express a move the domain forbids. States without a
 * generated entry simply drop STATUS events — that is the statechart's
 * decision, not the caller's.
 */
const statusTransitions = (from: GraphRunStatus) =>
  [...allowedGraphRunTransitions[from]].map((to) => ({
    guard: ({ event }: { event: GraphRunMachineEvent }) =>
      event.type === "STATUS" && event.status === to,
    target: stateForStatus[to],
  }));

export const graphRunMachine = setup({
  types: { events: {} as GraphRunMachineEvent },
}).createMachine({
  id: "graph-run",
  initial: "idle",
  states: {
    idle: { on: { START: "starting" } },
    starting: {
      on: {
        STARTED: "running",
        START_FAILED: "idle",
        STATUS: statusTransitions("queued"),
      },
    },
    running: { on: { STATUS: statusTransitions("running") } },
    awaitingApproval: {
      on: { STATUS: statusTransitions("awaiting-approval") },
    },
    completed: { on: { START: "starting" } },
    failed: { on: { START: "starting" } },
    cancelled: { on: { START: "starting" } },
  },
});
