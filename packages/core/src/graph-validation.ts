import type { GraphEdge, GraphNode, GraphNodeId } from "@repo/contracts";
import { InvalidGraph } from "./graph-errors.js";

export interface GraphDefinition {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
}

export const MAX_GRAPH_NODES = 25;
export const MAX_GRAPH_EDGES = 100;

/** Extracts the node ids referenced as {{nodes.<id>.output}} in a template. */
export const graphTemplateReferences = (
  template: string,
): ReadonlyArray<string> =>
  [...template.matchAll(/\{\{nodes\.([a-z][a-z0-9-]*)\.output\}\}/g)].map(
    (match) => match[1] ?? "",
  );

const invalid = (reason: InvalidGraph["reason"], detail: string) =>
  new InvalidGraph({ reason, detail });

/**
 * Structural validation shared by create and update. Returns undefined when
 * the definition is valid, mirroring transitionTask's result style. The
 * editor validates through the API; this is the only implementation.
 */
export const validateGraph = (
  definition: GraphDefinition,
): InvalidGraph | undefined => {
  const { nodes, edges } = definition;
  if (nodes.length === 0) return invalid("empty", "a graph needs nodes");
  if (nodes.length > MAX_GRAPH_NODES || edges.length > MAX_GRAPH_EDGES) {
    return invalid(
      "too-large",
      `at most ${MAX_GRAPH_NODES} nodes and ${MAX_GRAPH_EDGES} edges`,
    );
  }

  const ids = new Set<GraphNodeId>();
  for (const node of nodes) {
    if (ids.has(node.id)) return invalid("duplicate-node", node.id);
    ids.add(node.id);
  }

  const seenEdges = new Set<string>();
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      return invalid("unknown-edge-node", `${edge.from} -> ${edge.to}`);
    }
    if (edge.from === edge.to) return invalid("self-edge", edge.from);
    const key = `${edge.from}->${edge.to}`;
    if (seenEdges.has(key)) return invalid("duplicate-edge", key);
    seenEdges.add(key);
  }

  // Kahn's algorithm: topological order proves acyclicity and yields
  // ancestor sets for reference validation in one pass.
  const incoming = new Map<GraphNodeId, number>();
  const outgoing = new Map<GraphNodeId, Array<GraphNodeId>>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const ancestors = new Map<GraphNodeId, Set<GraphNodeId>>(
    nodes.map((node) => [node.id, new Set<GraphNodeId>()]),
  );
  const queue = nodes
    .map((node) => node.id)
    .filter((id) => incoming.get(id) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    visited += 1;
    for (const next of outgoing.get(current) ?? []) {
      const nextAncestors = ancestors.get(next);
      nextAncestors?.add(current);
      for (const inherited of ancestors.get(current) ?? []) {
        nextAncestors?.add(inherited);
      }
      const remaining = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) {
    return invalid("cycle", "graph contains a cycle");
  }

  for (const node of nodes) {
    for (const reference of graphTemplateReferences(node.promptTemplate)) {
      if (!ids.has(reference as GraphNodeId)) {
        return invalid("unknown-reference", `${node.id} -> ${reference}`);
      }
      if (!ancestors.get(node.id)?.has(reference as GraphNodeId)) {
        return invalid("non-ancestor-reference", `${node.id} -> ${reference}`);
      }
    }
  }
  return undefined;
};
