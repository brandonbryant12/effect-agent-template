import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { decodeGraphNodeId } from "./graph-identifiers.js";

describe("graph identifiers", () => {
  it("accepts a valid React Flow node identifier", () => {
    expect(Option.getOrUndefined(decodeGraphNodeId("plan-step"))).toBe(
      "plan-step",
    );
  });

  it("rejects an invalid React Flow node identifier", () => {
    expect(Option.isNone(decodeGraphNodeId("Not a graph node"))).toBe(true);
  });
});
