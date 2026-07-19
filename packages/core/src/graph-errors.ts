import {
  GraphId,
  GraphNodeRunStatus,
  GraphRunId,
  GraphRunStatus,
} from "@repo/contracts";
import { Schema } from "effect";

export class GraphNotFound extends Schema.TaggedErrorClass<GraphNotFound>()(
  "GraphNotFound",
  { graphId: GraphId },
) {}

export class GraphRunNotFound extends Schema.TaggedErrorClass<GraphRunNotFound>()(
  "GraphRunNotFound",
  { graphRunId: GraphRunId },
) {}

export const InvalidGraphReason = Schema.Literals([
  "empty",
  "duplicate-node",
  "unknown-edge-node",
  "self-edge",
  "duplicate-edge",
  "cycle",
  "unknown-reference",
  "non-ancestor-reference",
  "too-large",
]);
export type InvalidGraphReason = typeof InvalidGraphReason.Type;

export class InvalidGraph extends Schema.TaggedErrorClass<InvalidGraph>()(
  "InvalidGraph",
  { reason: InvalidGraphReason, detail: Schema.String },
) {}

export class InvalidGraphRunTransition extends Schema.TaggedErrorClass<InvalidGraphRunTransition>()(
  "InvalidGraphRunTransition",
  {
    from: Schema.Union([GraphRunStatus, GraphNodeRunStatus]),
    to: Schema.Union([GraphRunStatus, GraphNodeRunStatus]),
  },
) {}
