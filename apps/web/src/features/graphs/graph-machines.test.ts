import type { GraphRunStatus } from "@repo/contracts";
import { allowedGraphRunTransitions } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { graphEditorMachine } from "./graph-editor-machine.js";
import { graphRunMachine, machineStateStatus } from "./graph-run-machine.js";

describe("graphRunMachine", () => {
  it("follows the run lifecycle through approval to completion", () => {
    const actor = createActor(graphRunMachine).start();
    actor.send({ type: "START" });
    actor.send({ type: "STARTED" });
    expect(actor.getSnapshot().value).toBe("running");
    actor.send({ type: "STATUS", status: "awaiting-approval" });
    expect(actor.getSnapshot().value).toBe("awaitingApproval");
    actor.send({ type: "STATUS", status: "running" });
    actor.send({ type: "STATUS", status: "completed" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.stop();
  });

  it("every status-mirroring machine transition exists in the core table", () => {
    const states = graphRunMachine.config.states ?? {};
    for (const [stateName, stateConfig] of Object.entries(states)) {
      const fromStatus = machineStateStatus[stateName];
      if (fromStatus === undefined) continue;
      const on = (stateConfig as { on?: Record<string, unknown> }).on ?? {};
      const statusTransitions = on["STATUS"];
      if (!Array.isArray(statusTransitions)) continue;
      for (const transition of statusTransitions) {
        const target = String(
          (transition as { target?: string }).target ?? "",
        );
        const toStatus = machineStateStatus[target];
        if (toStatus === undefined) continue;
        expect(
          allowedGraphRunTransitions[fromStatus].has(toStatus),
          `machine allows ${fromStatus} -> ${toStatus} but core table does not`,
        ).toBe(true);
      }
    }
    // Every core status is represented by exactly one machine state.
    const mirrored = Object.values(machineStateStatus).filter(
      (status): status is GraphRunStatus => status !== undefined,
    );
    expect(new Set(mirrored).size).toBe(mirrored.length);
    expect(mirrored.sort()).toEqual(
      (Object.keys(allowedGraphRunTransitions) as Array<GraphRunStatus>)
        .filter((status) => status !== "queued")
        .sort(),
    );
  });
});

describe("graphEditorMachine", () => {
  it("tracks edit, save, and failure recovery", () => {
    const actor = createActor(graphEditorMachine).start();
    actor.send({ type: "EDIT" });
    actor.send({ type: "SAVE" });
    expect(actor.getSnapshot().value).toBe("saving");
    actor.send({ type: "SAVE_FAILED" });
    expect(actor.getSnapshot().value).toBe("saveFailed");
    actor.send({ type: "SAVE" });
    actor.send({ type: "SAVED" });
    expect(actor.getSnapshot().value).toBe("viewing");
    actor.stop();
  });
});
