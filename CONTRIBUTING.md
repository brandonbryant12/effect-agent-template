# Contributing

Use Node 26 and the pinned pnpm version, then run `pnpm install`. pnpm owns the workspace and lockfile; Turborepo owns package task scheduling and build caching. Oxlint and TypeScript 7 remain repository-wide correctness gates.

Keep changes inside the smallest owning capability, add a failing test for
behavior, and preserve the public-interface-first package shape. Run focused
tests while working and `pnpm guardrails` before opening a pull request.

Database integration tests and the complete product flow use Docker Compose;
static checks and package unit tests do not require Docker.
