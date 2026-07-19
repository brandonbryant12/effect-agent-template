import type { Project, Task } from "@repo/contracts";
import { Project as ProjectSchema, Task as TaskSchema } from "@repo/contracts";
import { Effect, Schema } from "effect";
import { PersistenceError } from "../errors.js";

type Row = Readonly<Record<string, unknown>>;

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
