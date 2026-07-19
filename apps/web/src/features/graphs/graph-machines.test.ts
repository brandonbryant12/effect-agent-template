import {
  allowedGraphRunTransitions,
  type GraphRunStatus,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { graphEditorMachine } from "./graph-editor-machine.js";
import { graphRunMachine, stateForStatus } from "./graph-run-machine.js";

const statuses = Object.keys(
  allowedGraphRunTransitions,
) as ReadonlyArray<GraphRunStatus>;

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

  it("drops STATUS events in states that do not react to them", () => {
    const actor = createActor(graphRunMachine).start();
    actor.send({ type: "STATUS", status: "completed" });
    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  it("accepts exactly the transitions in the contracts table", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = allowedGraphRunTransitions[from].has(to);
        const actor = createActor(graphRunMachine, {
          snapshot: graphRunMachine.resolveState({
            value: stateForStatus[from],
          }),
        }).start();
        actor.send({ type: "STATUS", status: to });
        const landed = actor.getSnapshot().value;
        actor.stop();
        if (allowed) {
          expect(landed, `${from} -> ${to} should transition`).toBe(
            stateForStatus[to],
          );
        } else {
          expect(landed, `${from} -> ${to} must be dropped`).toBe(
            stateForStatus[from],
          );
        }
      }
    }
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
