// architecture-allow: wall-clock -- deterministic double with an injectable clock; the default binds the host wall clock
import { JobId } from "@repo/contracts";
import { Effect, Schema } from "effect";
import { ulid } from "ulid";
import type { EnqueueJob, Job } from "./job.js";
import { JobQueueError } from "./job.js";
import type { JobQueue } from "./service.js";

export interface JobQueueTestOptions {
  readonly now?: () => Date;
}

export const makeJobQueueTest = (
  options: JobQueueTestOptions = {},
): JobQueue => {
  const jobs = new Map<string, Job>();
  const now = options.now ?? (() => new Date());
  const timestamp = (date: Date): Job["availableAt"] =>
    date.toISOString() as Job["availableAt"];
  const update = (job: Job, values: Partial<Job>): Job => {
    const next = { ...job, ...values };
    jobs.set(job.id, next);
    return next;
  };
  const leased = (
    id: string,
    workerId: string,
    operation: string,
  ): Effect.Effect<Job, JobQueueError> => {
    const job = jobs.get(id);
    return job?.status === "running" && job.leaseOwner === workerId
      ? Effect.succeed(job)
      : Effect.fail(
          new JobQueueError({
            operation,
            reason: job ? "lease-lost" : "not-found",
          }),
        );
  };

  return {
    enqueue: (input: EnqueueJob) =>
      Effect.sync(() => {
        const job: Job = {
          id: Schema.decodeUnknownSync(JobId)(`job_${ulid()}`),
          kind: input.kind,
          payload: input.payload,
          status: "queued",
          attempts: 0,
          maxAttempts: input.maxAttempts,
          availableAt: timestamp(input.availableAt ?? now()),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        };
        jobs.set(job.id, job);
        return job;
      }),
    claim: ({ workerId, leaseSeconds }) =>
      Effect.sync(() => {
        const current = now();
        const job = Array.from(jobs.values())
          .filter(
            (candidate) =>
              (candidate.status === "queued" ||
                candidate.status === "retrying") &&
              new Date(candidate.availableAt) <= current,
          )
          .sort((left, right) =>
            left.availableAt.localeCompare(right.availableAt),
          )[0];
        if (!job) return undefined;
        return update(job, {
          status: "running",
          attempts: job.attempts + 1,
          leaseOwner: workerId,
          leaseExpiresAt: timestamp(
            new Date(current.getTime() + leaseSeconds * 1_000),
          ),
        });
      }),
    heartbeat: (id, workerId, leaseSeconds) =>
      leased(id, workerId, "heartbeat").pipe(
        Effect.tap((job) =>
          Effect.sync(() =>
            update(job, {
              leaseExpiresAt: timestamp(
                new Date(now().getTime() + leaseSeconds * 1_000),
              ),
            }),
          ),
        ),
        Effect.asVoid,
      ),
    complete: (id, workerId) =>
      leased(id, workerId, "complete").pipe(
        Effect.tap((job) =>
          Effect.sync(() =>
            update(job, {
              status: "completed",
              leaseOwner: null,
              leaseExpiresAt: null,
            }),
          ),
        ),
        Effect.asVoid,
      ),
    retry: (id, workerId, errorCode, delaySeconds) =>
      leased(id, workerId, "retry").pipe(
        Effect.tap((job) =>
          Effect.sync(() =>
            update(job, {
              status: job.attempts >= job.maxAttempts ? "failed" : "retrying",
              availableAt: timestamp(
                new Date(now().getTime() + delaySeconds * 1_000),
              ),
              leaseOwner: null,
              leaseExpiresAt: null,
              lastErrorCode: errorCode,
            }),
          ),
        ),
        Effect.asVoid,
      ),
    fail: (id, workerId, errorCode) =>
      leased(id, workerId, "fail").pipe(
        Effect.tap((job) =>
          Effect.sync(() =>
            update(job, {
              status: "failed",
              leaseOwner: null,
              leaseExpiresAt: null,
              lastErrorCode: errorCode,
            }),
          ),
        ),
        Effect.asVoid,
      ),
  };
};
