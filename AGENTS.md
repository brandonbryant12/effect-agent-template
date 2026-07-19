# Agent Guide

This repository is an executable architecture reference. Read public package
interfaces before opening `internal/` implementations.

## Start here

1. Read [docs/patterns.md](docs/patterns.md) — the canonical idioms. When two
   styles seem plausible, that file is the tie-breaker. The reasoning behind
   each pattern is in [docs/decisions.md](docs/decisions.md); consult it
   before deviating from or extending a pattern.
2. For Effect code, read `.agents/skills/effect/SKILL.md` and inspect the exact
   installed `node_modules/effect/src` declarations and source.
3. For web design work, read `apps/web/DESIGN.md` before editing components.
4. Write a focused failing test before behavioral production code.
5. Run focused checks while iterating and `pnpm guardrails` before completion.

## Boundaries

Enforced by `pnpm architecture:check` unless marked otherwise:

- Cross packages only through declared package exports.
- Never import another package's `internal/` path.
- Provider SDKs stay inside their named adapter directories.
- Raw SQL lives in data-access modules only (`packages/db`,
  `packages/queue/src`, a package's `internal/` directory). An app file that
  must touch SQL carries an `// architecture-allow: raw-sql -- <reason>`
  annotation.
- Errors are `Schema.TaggedErrorClass` values. Never
  `Effect.fail(new Error(...))`; never match errors by stringified content.
- No `any`, `as never`, or non-null `!` assertions in production source.
- No `console` in library packages; apps log at their entrypoints.
- Read environment variables only in `packages/config` or app entrypoints.
- Base UI imports only inside `packages/ui`; `radix-ui`/`cmdk` only inside
  the vendored `apps/web/src/components/ui/` directory or `packages/ui`.
- Decode unknown data at transport, database, queue, AI, and sandbox
  boundaries (review).
- Never place secrets in logs, errors, events, models, command arguments,
  files, snapshots, fixtures, or cache keys (review + tests).
- TanStack Query owns remote frontend state. XState owns only real workflows
  (review).

## Confidence commands

- Focused tests: `pnpm vitest run <path>`
- Types: `pnpm typecheck`
- Architecture: `pnpm architecture:check`
- Full: `pnpm guardrails` (lint, typecheck, architecture, design lint,
  template check, tests — everything CI runs without Docker)
- Cached package build graph: `pnpm build`
- Inspect Turbo scheduling: `pnpm exec turbo run build --dry=json`
- Local stack: `pnpm compose:up`
- Postgres integration tests: start Postgres, set `DATABASE_URL`, rerun
  `pnpm test`

Do not claim a check passed unless you ran it in the current change.
