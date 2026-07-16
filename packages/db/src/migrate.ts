import { AppConfig, AppConfigLive } from "@repo/config";
import { Effect } from "effect";
import { PostgresLive } from "./live.js";
import { runMigrations } from "./migrations.js";

const program = Effect.gen(function* () {
  const config = yield* AppConfig;
  yield* Effect.provide(runMigrations, PostgresLive(config.databaseUrl));
});

Effect.runPromise(Effect.provide(program, AppConfigLive)).catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
