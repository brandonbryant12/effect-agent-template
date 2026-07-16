import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationsDirectory = resolve(import.meta.dirname, "../migrations");

export const runMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const files = yield* Effect.tryPromise({
    try: () => readdir(migrationsDirectory),
    catch: () => new Error("Could not read database migrations"),
  });

  for (const file of files.filter((name) => name.endsWith(".sql")).sort()) {
    const applied = yield* sql<{ readonly version: string }>`
      SELECT version FROM schema_migrations WHERE version = ${file}
    `.pipe(Effect.catch(() => Effect.succeed([])));
    if (applied.length > 0) continue;

    const source = yield* Effect.tryPromise({
      try: () => readFile(resolve(migrationsDirectory, file), "utf8"),
      catch: () => new Error(`Could not read migration ${file}`),
    });
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql.unsafe(source).raw;
        yield* sql`INSERT INTO schema_migrations (version) VALUES (${file})`;
      }),
    );
  }
});
