import { JobId, Timestamp } from "@repo/contracts";
import { Schema } from "effect";

export const JobStatus = Schema.Literals([
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
]);
export type JobStatus = typeof JobStatus.Type;

export const Job = Schema.Struct({
  id: JobId,
  kind: Schema.String,
  payload: Schema.Unknown,
  status: JobStatus,
  attempts: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  maxAttempts: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  availableAt: Timestamp,
  leaseOwner: Schema.NullOr(Schema.String),
  leaseExpiresAt: Schema.NullOr(Timestamp),
  lastErrorCode: Schema.NullOr(Schema.String),
});
export type Job = typeof Job.Type;

export interface EnqueueJob {
  readonly kind: string;
  readonly payload: unknown;
  readonly maxAttempts: number;
  readonly availableAt?: Date;
}

export class JobQueueError extends Schema.TaggedErrorClass<JobQueueError>()(
  "JobQueueError",
  {
    operation: Schema.String,
    reason: Schema.Literals(["lease-lost", "not-found", "persistence"]),
  },
) {}
