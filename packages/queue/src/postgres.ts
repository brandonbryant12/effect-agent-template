import { JobId } from "@repo/contracts";
import { Clock, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ulid } from "ulid";
import { Job, JobQueueError, type EnqueueJob } from "./job.js";
import { JobQueueService, type JobQueue } from "./service.js";

type Row = Readonly<Record<string, unknown>>;

const projection = (sql: SqlClient) =>
  sql.literal(
    'id, kind, payload, status, attempts, max_attempts AS "maxAttempts", available_at AS "availableAt", lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_error_code AS "lastErrorCode"',
  );

const iso = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

const decode = (row: Row) =>
  Schema.decodeUnknownEffect(Job)({
    ...row,
    availableAt: iso(row.availableAt),
    leaseExpiresAt: iso(row.leaseExpiresAt),
  }).pipe(
    Effect.mapError(
      () =>
        new JobQueueError({ operation: "decode-job", reason: "persistence" }),
    ),
  );

const persistence = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.mapError(
    effect,
    () => new JobQueueError({ operation, reason: "persistence" }),
  );

const nowDate: Effect.Effect<Date> = Effect.map(
  Clock.currentTimeMillis,
  (millis) => new Date(millis),
);

const requireLease = (operation: string, rows: ReadonlyArray<Row>) => {
  const row = rows[0];
  return row
    ? decode(row).pipe(Effect.asVoid)
    : Effect.fail(new JobQueueError({ operation, reason: "lease-lost" }));
};

export const makeJobQueuePostgres = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const columns = projection(sql);

  const queue: JobQueue = {
    enqueue: (input: EnqueueJob) =>
      Effect.flatMap(nowDate, (now) => {
        const id = Schema.decodeUnknownSync(JobId)(`job_${ulid()}`);
        return persistence(
          "enqueue-job",
          sql<Row>`
          INSERT INTO jobs (
            id, kind, payload, status, attempts, max_attempts,
            available_at, created_at, updated_at
          ) VALUES (
            ${id}, ${input.kind}, ${JSON.stringify(input.payload)}::jsonb,
            'queued', 0, ${input.maxAttempts},
            ${input.availableAt ?? now}, ${now}, ${now}
          )
          RETURNING ${columns}
        `,
        ).pipe(Effect.flatMap((rows) => decode(rows[0] ?? {})));
      }),
    claim: ({ workerId, leaseSeconds }) =>
      Effect.flatMap(nowDate, (now) => {
        const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);
        return persistence(
          "claim-job",
          sql<Row>`
          WITH candidate AS (
            SELECT id
            FROM jobs
            WHERE (
              (status IN ('queued', 'retrying') AND available_at <= ${now})
              OR (status = 'running' AND lease_expires_at <= ${now})
            )
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE jobs
          SET status = 'running',
              attempts = attempts + 1,
              lease_owner = ${workerId},
              lease_expires_at = ${leaseExpiresAt},
              updated_at = ${now}
          WHERE id = (SELECT id FROM candidate)
          RETURNING ${columns}
        `,
        ).pipe(
          Effect.flatMap((rows) => {
            const row = rows[0];
            return row
              ? decode(row).pipe(Effect.map((job) => job as Job | undefined))
              : Effect.succeed(undefined);
          }),
        );
      }),
    heartbeat: (id, workerId, leaseSeconds) =>
      Effect.flatMap(nowDate, (now) => {
        return persistence(
          "heartbeat-job",
          sql<Row>`
          UPDATE jobs
          SET lease_expires_at = ${new Date(now.getTime() + leaseSeconds * 1_000)},
              updated_at = ${now}
          WHERE id = ${id} AND status = 'running'
            AND lease_owner = ${workerId} AND lease_expires_at > ${now}
          RETURNING ${columns}
        `,
        ).pipe(Effect.flatMap((rows) => requireLease("heartbeat-job", rows)));
      }),
    complete: (id, workerId) =>
      Effect.flatMap(nowDate, (now) =>
        persistence(
          "complete-job",
          sql<Row>`
          UPDATE jobs
          SET status = 'completed', lease_owner = NULL,
              lease_expires_at = NULL, updated_at = ${now}
          WHERE id = ${id} AND status = 'running' AND lease_owner = ${workerId}
          RETURNING ${columns}
        `,
        ).pipe(Effect.flatMap((rows) => requireLease("complete-job", rows))),
      ),
    retry: (id, workerId, errorCode, delaySeconds) =>
      Effect.flatMap(nowDate, (now) => {
        return persistence(
          "retry-job",
          sql<Row>`
          UPDATE jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
              available_at = ${new Date(now.getTime() + delaySeconds * 1_000)},
              lease_owner = NULL, lease_expires_at = NULL,
              last_error_code = ${errorCode}, updated_at = ${now}
          WHERE id = ${id} AND status = 'running' AND lease_owner = ${workerId}
          RETURNING ${columns}
        `,
        ).pipe(Effect.flatMap((rows) => requireLease("retry-job", rows)));
      }),
    fail: (id, workerId, errorCode) =>
      Effect.flatMap(nowDate, (now) =>
        persistence(
          "fail-job",
          sql<Row>`
          UPDATE jobs
          SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
              last_error_code = ${errorCode}, updated_at = ${now}
          WHERE id = ${id} AND status = 'running' AND lease_owner = ${workerId}
          RETURNING ${columns}
        `,
        ).pipe(Effect.flatMap((rows) => requireLease("fail-job", rows))),
      ),
  };
  return queue;
});

export const JobQueueLive = Layer.effect(JobQueueService, makeJobQueuePostgres);
