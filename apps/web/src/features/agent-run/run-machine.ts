import {
  allowedAgentRunTransitions,
  type AgentRunStatus,
} from "@repo/contracts";
import { setup } from "xstate";

type RunEvent =
  | { readonly type: "START" }
  | { readonly type: "START_FAILED" } // client-observed failure (request or stream threw)
  | { readonly type: "CONNECTED" }
  | { readonly type: "DISCONNECTED" }
  | { readonly type: "APPROVED" }
  | { readonly type: "REJECTED" }
  | { readonly type: "CANCEL" }
  | { readonly type: "STATUS"; readonly status: AgentRunStatus };

/** Machine state that mirrors each AgentRunStatus. Exhaustive by type. */
export const stateForStatus: Readonly<Record<AgentRunStatus, string>> = {
  queued: "connecting",
  running: "running",
  "awaiting-approval": "awaitingApproval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * Domain transitions are generated from the contracts table; the machine
 * cannot express a status move the domain forbids. Connection-level events
 * (START, CONNECTED, DISCONNECTED, CANCEL) and user decisions
 * (APPROVED, REJECTED) remain client workflow concerns layered on top.
 */
const statusTransitions = (from: AgentRunStatus) =>
  [...allowedAgentRunTransitions[from]].map((to) => ({
    guard: ({ event }: { event: RunEvent }) =>
      event.type === "STATUS" && event.status === to,
    target: stateForStatus[to],
  }));

export const runMachine = setup({
  types: { events: {} as RunEvent },
}).createMachine({
  id: "agent-run",
  initial: "idle",
  states: {
    idle: { on: { START: "connecting" } },
    connecting: {
      on: {
        CONNECTED: "running",
        START_FAILED: "failed",
        CANCEL: "cancelled",
        STATUS: statusTransitions("queued"),
      },
    },
    running: {
      on: {
        DISCONNECTED: "reconnecting",
        START_FAILED: "failed",
        CANCEL: "cancelled",
        STATUS: statusTransitions("running"),
      },
    },
    reconnecting: {
      on: {
        CONNECTED: "running",
        START_FAILED: "failed",
        CANCEL: "cancelled",
        STATUS: statusTransitions("running"),
      },
    },
    awaitingApproval: {
      on: {
        APPROVED: "running",
        REJECTED: "failed",
        DISCONNECTED: "reconnecting",
        START_FAILED: "failed",
        CANCEL: "cancelled",
        STATUS: statusTransitions("awaiting-approval"),
      },
    },
    completed: { on: { START: "connecting" } },
    failed: { on: { START: "connecting" } },
    cancelled: { on: { START: "connecting" } },
  },
});
