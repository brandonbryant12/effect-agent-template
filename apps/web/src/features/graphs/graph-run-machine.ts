import type { GraphRunStatus } from "@repo/contracts";
import { setup } from "xstate";

type GraphRunMachineEvent =
  | { readonly type: "START" }
  | { readonly type: "STARTED" }
  | { readonly type: "START_FAILED" }
  | { readonly type: "STATUS"; readonly status: GraphRunStatus };

/**
 * Client workflow for observing one graph run. Machine states mirror
 * GraphRunStatus values; a test asserts they stay a subset of the core
 * transition tables. STATUS events come from the polled GraphRun query.
 */
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
      },
    },
    running: {
      on: {
        STATUS: [
          {
            guard: ({ event }) => event.status === "awaiting-approval",
            target: "awaitingApproval",
          },
          {
            guard: ({ event }) => event.status === "completed",
            target: "completed",
          },
          { guard: ({ event }) => event.status === "failed", target: "failed" },
          {
            guard: ({ event }) => event.status === "cancelled",
            target: "cancelled",
          },
        ],
      },
    },
    awaitingApproval: {
      on: {
        STATUS: [
          {
            guard: ({ event }) => event.status === "running",
            target: "running",
          },
          {
            guard: ({ event }) => event.status === "completed",
            target: "completed",
          },
          { guard: ({ event }) => event.status === "failed", target: "failed" },
          {
            guard: ({ event }) => event.status === "cancelled",
            target: "cancelled",
          },
        ],
      },
    },
    completed: { on: { START: "starting" } },
    failed: { on: { START: "starting" } },
    cancelled: { on: { START: "starting" } },
  },
});

/**
 * The GraphRunStatus each machine state mirrors, exported for the
 * machine/table consistency test. `idle` and `starting` are client-only
 * phases before a run exists and map to no status.
 */
export const machineStateStatus: Readonly<
  Record<string, GraphRunStatus | undefined>
> = {
  idle: undefined,
  starting: undefined,
  running: "running",
  awaitingApproval: "awaiting-approval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};
