import type { GraphEdge, GraphNode, GraphNodeId } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { validateGraph } from "../src/graph-validation.js";

const n = (id: string, promptTemplate = "Do {{input}}"): GraphNode => ({
  id: id as GraphNodeId,
  name: id,
  promptTemplate,
  position: { x: 0, y: 0 },
});
const e = (from: string, to: string): GraphEdge => ({
  from: from as GraphNodeId,
  to: to as GraphNodeId,
});

describe("validateGraph", () => {
  it("accepts a diamond with an ancestor output reference", () => {
    const diamond = {
      nodes: [
        n("plan"),
        n("research"),
        n("code"),
        n("review", "Review {{nodes.plan.output}} and {{nodes.code.output}}"),
      ],
      edges: [
        e("plan", "research"),
        e("plan", "code"),
        e("research", "review"),
        e("code", "review"),
      ],
    };
    expect(validateGraph(diamond)).toBeUndefined();
  });

  it("rejects an empty graph", () => {
    expect(validateGraph({ nodes: [], edges: [] })?.reason).toBe("empty");
  });

  it("rejects duplicate node ids", () => {
    expect(
      validateGraph({ nodes: [n("a"), n("a")], edges: [] })?.reason,
    ).toBe("duplicate-node");
  });

  it("rejects edges referencing unknown nodes", () => {
    expect(
      validateGraph({ nodes: [n("a")], edges: [e("a", "ghost")] })?.reason,
    ).toBe("unknown-edge-node");
  });

  it("rejects self edges and duplicate edges", () => {
    expect(
      validateGraph({ nodes: [n("a")], edges: [e("a", "a")] })?.reason,
    ).toBe("self-edge");
    expect(
      validateGraph({
        nodes: [n("a"), n("b")],
        edges: [e("a", "b"), e("a", "b")],
      })?.reason,
    ).toBe("duplicate-edge");
  });

  it("rejects cycles", () => {
    expect(
      validateGraph({
        nodes: [n("a"), n("b"), n("c")],
        edges: [e("a", "b"), e("b", "c"), e("c", "a")],
      })?.reason,
    ).toBe("cycle");
  });

  it("rejects references to unknown nodes", () => {
    expect(
      validateGraph({
        nodes: [n("a", "Use {{nodes.ghost.output}}")],
        edges: [],
      })?.reason,
    ).toBe("unknown-reference");
  });

  it("rejects references to non-ancestor nodes", () => {
    expect(
      validateGraph({
        nodes: [n("a", "Use {{nodes.b.output}}"), n("b")],
        edges: [e("a", "b")],
      })?.reason,
    ).toBe("non-ancestor-reference");
  });

  it("rejects graphs over the size cap", () => {
    const nodes = Array.from({ length: 26 }, (_value, index) =>
      n(`node-${index}`),
    );
    expect(validateGraph({ nodes, edges: [] })?.reason).toBe("too-large");
  });
});
