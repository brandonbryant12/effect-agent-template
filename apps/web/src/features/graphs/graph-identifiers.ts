import { GraphNodeId } from "@repo/contracts";
import { Schema } from "effect";

/** Decodes the untrusted string identifiers emitted by React Flow. */
export const decodeGraphNodeId = Schema.decodeUnknownOption(GraphNodeId);
