---
description: Systematically find, fix, and prevent tech debt across the template
---

# Destroy Tech Debt

You are running a tech-debt elimination pass over this Effect TS + Turborepo
template. "Destroy" means three things, in order: **find** it exhaustively,
**fix** it in small verified commits, and **prevent** it by strengthening a
guardrail so that class of debt cannot return. A fix without a prevention is
half a job; prefer one prevented class over three one-off cleanups.

## Ground rules (non-negotiable)

1. Read `AGENTS.md`, `docs/patterns.md`, and `docs/decisions.md` before
   touching code. patterns.md is the tie-breaker for style questions;
   decisions.md explains why each pattern exists and what would justify
   changing it. If a "debt" you find is listed under patterns.md "Known
   deferred work" or matches a decisions.md entry, it is deliberate — do
   not fix it silently. Either leave it and note it in your report, or
   propose the change in the report with the decision entry it contradicts.
2. `pnpm guardrails` is the definition of done. Run it before every commit.
   If the local Node is older than 26, prepend Homebrew's Node 26:
   `export PATH="/opt/homebrew/opt/node@26/bin:$PATH"`.
3. Postgres-backed suites are part of done for any change touching SQL,
   services, routes, or the worker:
   `docker compose up -d postgres`, then
   `DATABASE_URL=postgres://agent:agent@localhost:5433/agent RUN_POSTGRES_TESTS=1 pnpm vitest run packages/db/test apps/server/test apps/worker/test packages/queue/test`.
4. Also run `pnpm build` and `pnpm --filter @repo/web build` when contracts
   or web code change.
5. Small conventional commits, one debt class per commit, push after each
   green batch. Never commit with a failing gate.
6. Vendored directories (`apps/web/src/components/ui`,
   `apps/web/src/components/ai-elements`) are upstream code — exempt from
   template rules; do not "clean" them.
7. Follow the repo's core principle everywhere: **derive, don't guard**.
   When a rule exists as data (route table, transition tables,
   `runStatusForEvent`, token palette), consumers must derive from it, not
   re-check it. New rules you introduce must also be data + derivation.

## The hunt — sweep every category, in this order

For each category: inventory first (grep/read/tests), rank findings by
blast-radius-if-wrong versus payoff, then fix top-down. Log anything you
deliberately skip.

1. **Duplication.** Search for logic declared more than once: repeated
   helper functions across files (timestamp/ISO normalizers, decode
   wrappers, id generators, status ternaries), parallel switch/if chains
   that shadow an existing projection function, copies of tables or
   constant lists. Fix = single authority in the owning package + all
   call sites derived from it.
2. **Stringly guards.** Grep for `!== "` / `=== "` chains on statuses,
   states, and tags outside the authority modules; inline
   `completed || failed || cancelled`-style triples; `String(x).includes`.
   Fix = use the `isTerminal*` helpers, transition tables, `_tag`
   matching, or generate the consumer from the table.
3. **Documented-but-unenforced rules.** For every rule in AGENTS.md and
   patterns.md marked (**review**), ask: could `scripts/check-architecture.ts`
   or a test enforce it cheaply? The checker is deliberately simple regex
   (decisions §11) — a five-line rule with an
   `// architecture-allow: <rule> -- <reason>` escape hatch is the house
   style. Every debt class you fix should end with one new rule or test.
4. **Error-information loss.** Find `catch: () =>` handlers that discard
   the cause, error unions collapsed to one coarse retryable reason,
   empty `catch {}` blocks, and errors stringified into codes. The
   sandbox adapter (`packages/sandbox-opensandbox/src/live.ts`) is the
   reference for reason-preserving classification with a sanitized
   `detail` field — bring the OpenCode runtime adapter and
   `packages/secrets/src/aws.ts` up to the same standard if still coarse.
5. **Dead surface.** Unused exports, unused dependencies (check every
   package.json against actual imports), near-empty packages that
   over-promise (audit `packages/testing`), schemas/events declared in
   contracts but never produced or consumed, parameters accepted and
   ignored. Delete or make real; never leave "maybe later" surface.
6. **Type-safety leaks.** Production `as` casts on branded types, values
   fabricated without schema decode (e.g. `x as Timestamp`), `Row` decoded
   with `?? {}` fallbacks that turn absence into a decode error, exported
   test doubles diverging from Live behavior. Tests may cast; production
   may not.
7. **Doc drift.** Diff reality against README, AGENTS.md, patterns.md,
   decisions.md, docs/*, and the two most recent
   `docs/superpowers/specs/*` files. Stale commands, renamed files, claims
   about checks that do not exist, spec sections implemented differently
   than described. Fix the doc or the code, whichever is wrong.
8. **Test gaps.** Every `Context.Service` should have a Test layer and a
   unit test; every port a deterministic double; every transition table an
   exhaustive or generated consumer test. Known weak spots to verify:
   `ApprovalService`/`ConversationService`/`CredentialSecretService` unit
   coverage, `packages/ui`, web components beyond machines.
9. **Operational debt.** The worker's 1-second `Effect.sleep` poll loop,
   turbo caching only `build` (typecheck/lint/test are root-global and
   uncached), the Promise facade (`packages/client/src/promise.ts`)
   re-enumerating client methods with no completeness check, CSS-side hex
   values in `styles.css` (`.session-tape`, `.event-spine`, `::selection`)
   that bypass the token palette. Fix what you can do safely and
   incrementally; report what needs a design conversation.

## Working style

- Verify each suspicion by reading the code before "fixing" it — several
  things that look like debt here are recorded decisions.
- One category at a time; run the relevant focused tests while iterating
  and the full gate before each commit.
- When a fix would change a public pattern (route table shape, port
  signatures, error taxonomies), update `docs/patterns.md` in the same
  commit; if it changes a rationale, update `docs/decisions.md` too.
- If you add a guardrail rule, fix all existing violations in the same
  commit so the gate stays green, and annotate legitimate exceptions with
  the escape-hatch comment plus a reason.

## Final report (required)

End with a summary containing:

1. **Fixed** — each debt, one line, with the commit hash.
2. **Prevented** — each new guardrail rule or drift test and which class it
   closes.
3. **Deliberately left** — each finding you skipped, with the decisions.md
   entry or reason, so the next pass does not re-litigate it.
4. **Needs a human decision** — anything whose fix contradicts a recorded
   decision or changes public behavior, with your recommendation.

All work committed and pushed by the end. Do not claim a check passed
unless you ran it in this session.
