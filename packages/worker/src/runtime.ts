import type { Job, JobQueue } from "@repo/queue";
import { Effect, Schema } from "effect";

export class JobHandlerError extends Schema.TaggedErrorClass<JobHandlerError>()(
  "JobHandlerError",
  { code: Schema.String, retryable: Schema.Boolean },
) {}

export type JobHandler = (job: Job) => Effect.Effect<void, JobHandlerError>;

export interface WorkerRuntime {
  readonly drain: () => Effect.Effect<number, unknown>;
}

export interface WorkerRuntimeOptions {
  readonly queue: JobQueue;
  readonly workerId: string;
  readonly concurrency: number;
  readonly handlers: Readonly<Record<string, JobHandler>>;
}

export const makeWorkerRuntime = (
  options: WorkerRuntimeOptions,
): WorkerRuntime => {
  const claimBatch = Effect.gen(function* () {
    const jobs: Array<Job> = [];
    while (jobs.length < options.concurrency) {
      const job = yield* options.queue.claim({
        workerId: options.workerId,
        leaseSeconds: 30,
      });
      if (!job) break;
      jobs.push(job);
    }
    return jobs;
  });

  const handle = (job: Job) => {
    const handler = options.handlers[job.kind];
    if (!handler) {
      return options.queue.fail(job.id, options.workerId, "unknown_job_kind");
    }
    return handler(job).pipe(
      Effect.andThen(options.queue.complete(job.id, options.workerId)),
      Effect.catchTag("JobHandlerError", (error) =>
        error.retryable
          ? options.queue.retry(job.id, options.workerId, error.code, 5)
          : options.queue.fail(job.id, options.workerId, error.code),
      ),
    );
  };

  const drain = (processed: number): Effect.Effect<number, unknown> =>
    claimBatch.pipe(
      Effect.flatMap((jobs) =>
        jobs.length === 0
          ? Effect.succeed(processed)
          : Effect.all(jobs.map(handle), { concurrency: "unbounded" }).pipe(
              Effect.andThen(
                Effect.suspend(() => drain(processed + jobs.length)),
              ),
            ),
      ),
    );

  return { drain: () => drain(0) };
};
