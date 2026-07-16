import type { JobId } from "@repo/contracts";
import { Context, type Effect } from "effect";
import type { EnqueueJob, Job, JobQueueError } from "./job.js";

export interface ClaimJob {
  readonly workerId: string;
  readonly leaseSeconds: number;
}

export interface JobQueue {
  readonly enqueue: (input: EnqueueJob) => Effect.Effect<Job, JobQueueError>;
  readonly claim: (
    input: ClaimJob,
  ) => Effect.Effect<Job | undefined, JobQueueError>;
  readonly heartbeat: (
    id: JobId,
    workerId: string,
    leaseSeconds: number,
  ) => Effect.Effect<void, JobQueueError>;
  readonly complete: (
    id: JobId,
    workerId: string,
  ) => Effect.Effect<void, JobQueueError>;
  readonly retry: (
    id: JobId,
    workerId: string,
    errorCode: string,
    delaySeconds: number,
  ) => Effect.Effect<void, JobQueueError>;
  readonly fail: (
    id: JobId,
    workerId: string,
    errorCode: string,
  ) => Effect.Effect<void, JobQueueError>;
}

export class JobQueueService extends Context.Service<
  JobQueueService,
  JobQueue
>()("repo/JobQueueService") {}
