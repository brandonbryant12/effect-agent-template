# Template Hardening Design

**Status:** Implemented

**Date:** 2026-07-19

## Summary

A four-track audit of the template (core packages, apps, provider adapters,
and meta/guardrail layer) found that the architecture was sound but several
interfaces leaked, several documented rules were unenforced, and several
pieces of meta-code had drifted from reality. This change hardens the
template on all three axes so a coding agent gets one canonical idiom per
concern and a guardrail that actually rejects the alternatives.

## Findings addressed

1. **Dead meta-code.** `scripts/guardrails.ts` was unreferenced and listed a
   weaker gate than the real `pnpm guardrails` chain. Deleted.
2. **Doc drift.** `AGENTS.md` pointed at nested per-package guides that do
   not exist; the README claimed guardrails/CI parity that was false. Both
   rewritten to describe reality; `pnpm guardrails` now includes
   `template:check` so the Docker-free CI surface and the local gate match.
3. **Unenforced boundaries.** The documented rules (`no any`, primitive-
   library containment, console discipline) had no checker. `.oxlintrc.json`
   now enforces `no-explicit-any` and `no-non-null-assertion`, and
   `scripts/check-architecture.ts` gained rules for: raw SQL outside
   data-access modules (with an `// architecture-allow: raw-sql -- <reason>`
   escape hatch), `Effect.fail(new Error(...))`, stringified error matching,
   non-canonical idioms (`Data.TaggedError`, `Context.GenericTag`),
   production `any`, `radix-ui`/`cmdk` outside vendored component
   directories, and `console` inside library packages.
4. **Leaky interfaces.** `@repo/ai` re-exported its internal OpenAI adapter
   from the barrel; it now lives behind a deliberate `@repo/ai/openai`
   subpath. `@repo/contracts` had two modules reachable only through the
   barrel; `./approval` and `./common` subpaths added.
5. **Inconsistent core conventions.** `PersistenceError` moved from
   `project-service.ts` to a neutral `errors.ts`; the two Live layers that
   lived in public service files (`ConversationServiceLive`,
   `CredentialSecretServiceLive`) moved into `internal/` and are exported
   from `live.ts` like every other production layer.
6. **Fragile error handling.** The server's error→status mapping matched
   substrings of tags ("NotFound", "Invalid"); it is now an explicit
   tag-to-status table plus `Schema.isSchemaError` for 400s. The worker
   journal failed with untyped `new Error("run not found")` that handlers
   classified as retryable; the journal contract is now typed
   (`JournalError | RunNotFound`) and `RunNotFound` is terminal.
7. **Brittle meta-tests.** The guardrail test hard-coded the Effect beta
   version string; it now asserts that every catalog entry pins one
   identical exact version, and asserts the guardrails chain contains each
   gate.

## New canonical documentation

`docs/patterns.md` is the tie-breaker document: package anatomy, the
`Context.Service` + `Schema.TaggedErrorClass` idiom, the provider-port
recipe, the three-place HTTP route contract checklist, and the accepted
deferred gaps. `AGENTS.md` routes to it first.

## Deferred (deliberately not done here)

- Collapse the triple-declared route contract (server router, Effect client,
  Promise facade) into one shared table or `@effect/platform` HttpApi.
- Move provider ports onto `Context.Service` layers for symmetric wiring
  with `packages/core`.
- Take time from `Clock` in Live layers instead of `new Date()`; adopt
  `@effect/vitest` with TestClock.
- Replace hardcoded hex values in `apps/web/src/app.tsx` with the DESIGN.md
  token palette, and add a token-drift check.
- Give `sandbox-opensandbox` schema validation of SDK responses and
  reason-preserving error mapping like `packages/ai` has.
