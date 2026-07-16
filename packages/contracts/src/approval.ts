import { Schema } from "effect";
import { Timestamp } from "./common.js";
import { AgentRunId, ApprovalId } from "./ids.js";

export const ApprovalDecision = Schema.Literals(["once", "always", "reject"]);
export type ApprovalDecision = typeof ApprovalDecision.Type;

export const ApprovalStatus = Schema.Literals([
  "pending",
  "approved-once",
  "approved-session",
  "rejected",
]);
export type ApprovalStatus = typeof ApprovalStatus.Type;

export const ApprovalRequest = Schema.Struct({
  id: ApprovalId,
  runId: AgentRunId,
  toolName: Schema.String,
  safeSummary: Schema.String,
  status: ApprovalStatus,
  createdAt: Timestamp,
  resolvedAt: Schema.NullOr(Timestamp),
});
export type ApprovalRequest = typeof ApprovalRequest.Type;
