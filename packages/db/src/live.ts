import { PgClient } from "@effect/sql-pg";
import { Redacted } from "effect";

export const PostgresLive = (url: string) =>
  PgClient.layer({
    url: Redacted.make(url),
    applicationName: "effect-agent-template",
    maxConnections: 10,
  });
