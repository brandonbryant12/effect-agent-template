import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CreateGraph, Graph, StartGraphRun } from "../src/graph.js";

describe("graph contracts", () => {
  it("decodes a well-formed graph definition", () => {
    const graph = Schema.decodeUnknownSync(Graph)({
      id: "graph_01JY0000000000000000000000",
      projectId: "project_01JY0000000000000000000000",
      name: "Ship feature",
      nodes: [
        {
          id: "plan",
          name: "Plan",
          promptTemplate: "Plan: {{input}}",
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
      createdAt: "2026-07-19T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(graph.nodes[0]?.id).toBe("plan");
  });

  it("rejects malformed node ids", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateGraph)({
        name: "Bad",
        nodes: [
          {
            id: "Not A Slug",
            name: "x",
            promptTemplate: "y",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      }),
    ).toThrow();
  });

  it("rejects empty run input", () => {
    expect(() =>
      Schema.decodeUnknownSync(StartGraphRun)({ input: "" }),
    ).toThrow();
  });
});
