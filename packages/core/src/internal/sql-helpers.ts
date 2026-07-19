import type { Project, Task } from "@repo/contracts";
import {
  Project as ProjectSchema,
  Task as TaskSchema,
  Timestamp,
} from "@repo/contracts";
import { Clock, Effect, Schema } from "effect";
import { PersistenceError } from "../errors.js";

type Row = Readonly<Record<string, unknown>>;

/**
 * Current time as a branded Timestamp, taken from the Effect Clock so tests
 * can control it. Live layers must use this instead of the wall clock.
 */
export const nowTimestamp: Effect.Effect<Timestamp> = Effect.map(
  Clock.currentTimeMillis,
  (millis) =>
    Schema.decodeUnknownSync(Timestamp)(new Date(millis).toISOString()),
);

const iso = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export const normalizeTimestamps = (row: Row): Row => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export const decodeProjectRow = (
  row: Row,
): Effect.Effect<Project, PersistenceError> =>
  Schema.decodeUnknownEffect(ProjectSchema)(normalizeTimestamps(row)).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-project-row" }),
    ),
  );

export const decodeTaskRow = (
  row: Row,
): Effect.Effect<Task, PersistenceError> =>
  Schema.decodeUnknownEffect(TaskSchema)(normalizeTimestamps(row)).pipe(
    Effect.mapError(
      () => new PersistenceError({ operation: "decode-task-row" }),
    ),
  );

export const persistence = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) => Effect.mapError(effect, () => new PersistenceError({ operation }));
