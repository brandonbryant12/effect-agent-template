import { Schema } from "effect";
import { Name, Timestamp } from "./common.js";
import {
  AgentRunId,
  AgentSessionId,
  GraphId,
  GraphNodeId,
  GraphRunId,
  ProjectId,
} from "./ids.js";

const PromptTemplate = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(20_000),
);

const RunInput = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100_000),
);

export const GraphNode = Schema.Struct({
  id: GraphNodeId,
  name: Name,
  promptTemplate: PromptTemplate,
  // Editor canvas coordinates; execution ignores this field.
  position: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
});
export type GraphNode = typeof GraphNode.Type;

export const GraphEdge = Schema.Struct({
  from: GraphNodeId,
  to: GraphNodeId,
});
export type GraphEdge = typeof GraphEdge.Type;

export const Graph = Schema.Struct({
  id: GraphId,
  projectId: ProjectId,
  name: Name,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Graph = typeof Graph.Type;

export const GraphRunStatus = Schema.Literals([
  "queued",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "cancelled",
]);
export type GraphRunStatus = typeof GraphRunStatus.Type;

export const GraphNodeRunStatus = Schema.Literals([
  "pending",
  "ready",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "skipped",
]);
export type GraphNodeRunStatus = typeof GraphNodeRunStatus.Type;

export const GraphRun = Schema.Struct({
  id: GraphRunId,
  graphId: GraphId,
  projectId: ProjectId,
  status: GraphRunStatus,
  input: RunInput,
  // Definition snapshot taken at start; graph edits never affect this run.
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type GraphRun = typeof GraphRun.Type;

export const GraphRunNode = Schema.Struct({
  graphRunId: GraphRunId,
  nodeId: GraphNodeId,
  status: GraphNodeRunStatus,
  agentRunId: Schema.NullOr(AgentRunId),
  sessionId: Schema.NullOr(AgentSessionId),
  updatedAt: Timestamp,
});
export type GraphRunNode = typeof GraphRunNode.Type;

export const GraphRunDetail = Schema.Struct({
  run: GraphRun,
  nodes: Schema.Array(GraphRunNode),
});
export type GraphRunDetail = typeof GraphRunDetail.Type;

export const CreateGraph = Schema.Struct({
  name: Name,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
});
export type CreateGraph = typeof CreateGraph.Type;

export const UpdateGraph = CreateGraph;
export type UpdateGraph = typeof UpdateGraph.Type;

export const StartGraphRun = Schema.Struct({ input: RunInput });
export type StartGraphRun = typeof StartGraphRun.Type;
