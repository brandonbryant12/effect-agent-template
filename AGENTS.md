# Agent Guide

This repository is an executable architecture reference. Read public package
interfaces before opening `internal/` implementations.

## Start here

1. Read the nearest `AGENTS.md` and the relevant architecture or pattern doc.
2. For Effect code, read `.agents/skills/effect/SKILL.md` and inspect the exact
   installed `node_modules/effect/src` declarations and source.
3. For web design work, read `apps/web/DESIGN.md` before editing components.
4. Write a focused failing test before behavioral production code.
5. Run focused checks while iterating and `pnpm guardrails` before completion.

## Boundaries

- Cross packages only through declared package exports.
- Never import another package's `internal/` path.
- Provider SDKs stay inside their named adapter directories.
- Decode unknown data at transport, database, queue, AI, and sandbox boundaries.
- Read environment variables only in `packages/config` or app entrypoints.
- Never place secrets in logs, errors, events, models, command arguments, files,
  snapshots, fixtures, or cache keys.
- TanStack Query owns remote frontend state. XState owns only real workflows.
- Base UI imports are allowed only inside `packages/ui`.

## Confidence commands

- Focused tests: `pnpm vitest run <path>`
- Types: `pnpm typecheck`
- Architecture: `pnpm architecture:check`
- Full: `pnpm guardrails`
- Cached package build graph: `pnpm build`
- Inspect Turbo scheduling: `pnpm exec turbo run build --dry=json`
- Local stack: `pnpm compose:up`

Do not claim a check passed unless you ran it in the current change.
