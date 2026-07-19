import type { GraphNodeRunStatus } from "../src/graph.js";
import {
  graphRunStatusForNodes,
  isSkippableGraphNodeStatus,
} from "../src/graph-transitions.js";
import { describe, expect, it } from "vitest";

describe("graph transition policy", () => {
  it.each([
    ["pending", true],
    ["ready", true],
    ["running", false],
    ["awaiting-approval", false],
    ["completed", false],
    ["failed", false],
    ["skipped", false],
  ] satisfies ReadonlyArray<readonly [GraphNodeRunStatus, boolean]>)(
    "derives whether %s may be skipped",
    (status, expected) => {
      expect(isSkippableGraphNodeStatus(status)).toBe(expected);
    },
  );

  it.each([
    [["completed"], "completed"],
    [["completed", "failed"], "failed"],
    [["pending", "completed"], "running"],
    [["awaiting-approval", "running"], "awaiting-approval"],
    [[], "failed"],
  ] satisfies ReadonlyArray<
    readonly [ReadonlyArray<GraphNodeRunStatus>, string]
  >)("projects node statuses %j to %s", (statuses, expected) => {
    expect(graphRunStatusForNodes(statuses)).toBe(expected);
  });
});
