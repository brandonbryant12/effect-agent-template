import {
  allowedAgentRunTransitions,
  type AgentRunStatus,
} from "@repo/contracts";
import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { runMachine, stateForStatus } from "./run-machine.js";

describe("agent run machine", () => {
  it("models reconnect, approval, completion, and cancellation", () => {
    const actor = createActor(runMachine).start();
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("connecting");
    actor.send({ type: "CONNECTED" });
    expect(actor.getSnapshot().value).toBe("running");
    actor.send({ type: "STATUS", status: "awaiting-approval" });
    expect(actor.getSnapshot().value).toBe("awaitingApproval");
    actor.send({ type: "APPROVED" });
    expect(actor.getSnapshot().value).toBe("running");
    actor.send({ type: "DISCONNECTED" });
    expect(actor.getSnapshot().value).toBe("reconnecting");
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "STATUS", status: "completed" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("connecting");
  });

  it("accepts exactly the status transitions in the contracts table", () => {
    const statuses = Object.keys(
      allowedAgentRunTransitions,
    ) as ReadonlyArray<AgentRunStatus>;
    for (const from of statuses) {
      for (const to of statuses) {
        const actor = createActor(runMachine, {
          snapshot: runMachine.resolveState({ value: stateForStatus[from] }),
        }).start();
        actor.send({ type: "STATUS", status: to });
        const landed = actor.getSnapshot().value;
        actor.stop();
        if (allowedAgentRunTransitions[from].has(to)) {
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
