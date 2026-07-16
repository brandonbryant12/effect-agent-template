import { setup } from "xstate";

type RunEvent =
  | { readonly type: "START" }
  | { readonly type: "CONNECTED" }
  | { readonly type: "DISCONNECTED" }
  | { readonly type: "APPROVAL_REQUIRED" }
  | { readonly type: "APPROVED" }
  | { readonly type: "REJECTED" }
  | { readonly type: "COMPLETED" }
  | { readonly type: "FAILED" }
  | { readonly type: "CANCEL" };

export const runMachine = setup({
  types: { events: {} as RunEvent },
}).createMachine({
  id: "agent-run",
  initial: "idle",
  states: {
    idle: { on: { START: "connecting" } },
    connecting: {
      on: { CONNECTED: "running", FAILED: "failed", CANCEL: "cancelled" },
    },
    running: {
      on: {
        DISCONNECTED: "reconnecting",
        APPROVAL_REQUIRED: "awaitingApproval",
        COMPLETED: "completed",
        FAILED: "failed",
        CANCEL: "cancelled",
      },
    },
    reconnecting: {
      on: { CONNECTED: "running", FAILED: "failed", CANCEL: "cancelled" },
    },
    awaitingApproval: {
      on: {
        APPROVED: "running",
        REJECTED: "failed",
        DISCONNECTED: "reconnecting",
        CANCEL: "cancelled",
      },
    },
    completed: { on: { START: "connecting" } },
    failed: { on: { START: "connecting" } },
    cancelled: { on: { START: "connecting" } },
  },
});
