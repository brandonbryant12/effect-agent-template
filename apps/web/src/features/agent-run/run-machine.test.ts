import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { runMachine } from "./run-machine.js";

describe("agent run machine", () => {
  it("models reconnect, approval, completion, and cancellation", () => {
    const actor = createActor(runMachine).start();
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("connecting");
    actor.send({ type: "CONNECTED" });
    expect(actor.getSnapshot().value).toBe("running");
    actor.send({ type: "APPROVAL_REQUIRED" });
    expect(actor.getSnapshot().value).toBe("awaitingApproval");
    actor.send({ type: "APPROVED" });
    expect(actor.getSnapshot().value).toBe("running");
    actor.send({ type: "DISCONNECTED" });
    expect(actor.getSnapshot().value).toBe("reconnecting");
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "COMPLETED" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("connecting");
  });
});
