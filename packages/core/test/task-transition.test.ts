import { describe, expect, it } from "vitest";
import { transitionTask } from "../src/task-transition.js";

describe("task lifecycle", () => {
  it("allows the explicit happy path", () => {
    expect(transitionTask("todo", "in-progress")).toEqual({
      status: "in-progress",
    });
    expect(transitionTask("in-progress", "done")).toEqual({ status: "done" });
  });

  it("rejects a transition out of a terminal state", () => {
    expect(transitionTask("done", "in-progress")).toEqual({
      _tag: "InvalidTaskTransition",
      from: "done",
      to: "in-progress",
    });
  });
});
