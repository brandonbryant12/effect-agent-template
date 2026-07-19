# Destroy Tech Debt Design

**Status:** Approved

**Date:** 2026-07-19

## Purpose

This repository is an executable architecture reference that will be forked to
start production projects. The remediation therefore treats unclear examples,
silent fallbacks, unenforced conventions, incomplete facades, and misleading
documentation as product defects in the template itself.

The change will remove every validated, compatibility-preserving defect found
by the repository-wide audit, add a test or automated guardrail for each defect
class, and document the few architectural choices that require an explicit
future decision. It will ship as one merge-ready pull request composed of small,
reviewable commits.

## Constraints

- Preserve the public HTTP schemas, persisted data model, queue protocol, and
  existing package export names unless a missing method is added additively.
- Treat `docs/patterns.md` as the canonical implementation style and
  `docs/decisions.md` as the record of architectural intent.
- Decode unknown values at transport, SQL, queue, provider, and UI-library
  boundaries. Do not fabricate branded identifiers to disable work.
- Expected failures remain narrow `Schema.TaggedErrorClass` values. Provider
  diagnostics may include only bounded, sanitized detail.
- TanStack Query owns remote state. Disabled queries use its native skip
  mechanism rather than fake keys or IDs.
- Vendored files under `apps/web/src/components/ui/` and
  `apps/web/src/components/ai-elements/` remain exempt from repository design
  linting and are not edited for local style preferences.
- Behavioral production changes follow a witnessed red-green test cycle.
- `pnpm guardrails` runs before every commit. SQL, server, queue, or worker
  changes also run the complete PostgreSQL integration matrix.

## Audit Findings and Remediation

### 1. Complete client contracts

The Effect client omits the project and graph deletion routes, while the
Promise facade additionally omits run lookup. Add the missing methods, derive
the Promise facade type from the Effect client, and add a route-completeness
contract test so a future HTTP route cannot silently disappear from either
public client.

### 2. Make boundary absence and identity explicit

Several SQL adapters decode `rows[0] ?? {}`, which disguises an impossible
missing `RETURNING` row as a schema problem. Other paths cast plain strings to
branded IDs after partial validation. Replace these with explicit typed
absence failures and schema decoding or lookups that return the already
validated branded value. Add architecture checks that reject production
branded-ID assertions and empty-object SQL fallbacks.

The web client currently fabricates empty branded IDs to disable queries and
casts React Flow string identifiers back into the domain. Query option
factories will accept optional identifiers and use TanStack Query `skipToken`.
React Flow identifiers will be decoded at the component boundary before they
enter domain commands.

### 3. Derive workflow policy from transition sources

Ad-hoc lists of terminal and skippable statuses duplicate the canonical
transition tables. Replace duplicated guards with exported predicates or
small pure projection functions derived from the owning status model. Tests
will enumerate every status so adding a new state forces an explicit policy
decision.

### 4. Make every service safely substitutable

`GraphRunServiceTest` does not enforce access scope even though the live layer
does. Store ownership with in-memory runs and test cross-user lookup/list
isolation. Add deterministic Test layers and direct unit coverage for
Approval, Conversation, and CredentialSecret services so examples do not need
ad hoc mocks or live infrastructure.

### 5. Preserve safe provider diagnostics

The OpenCode and AWS adapters collapse distinct failures into generic
"unavailable" errors and discard useful diagnostics. Add shared observability
helpers that extract bounded, redacted details and safe status codes. Classify
not-found, forbidden, rate-limited, and unavailable failures into the owning
schema-backed error types. Tests cover classification and prove likely secret
material is removed.

### 6. Make request observability real

The client already reads `x-request-id`, but the server never emits one. The
outer HTTP boundary will generate one request ID, return it on every response,
and include it in sanitized unexpected-error logs. The existing observability
package becomes the shared home for request IDs and safe diagnostic extraction
rather than a nominal package with unused context.

### 7. Remove dead and misleading package surface

Move repository guardrail tests out of the empty `@repo/testing` package and
remove that package. Remove proven-unused dependencies from application and UI
manifests. Add a dependency check to the standard guardrail chain so an
unused direct dependency cannot accumulate unnoticed while allowing compiler
type packages and tool-invoked dependencies.

### 8. Enforce the design system outside vendored code

Replace hard-coded CSS colors and raw Tailwind palette utilities in owned web
and UI components with the semantic tokens defined by `DESIGN.md`. Narrow the
existing exemption to the two vendored component directories, extend checking
to `packages/ui`, and add focused tests for the shared status component and
stylesheet token usage.

### 9. Keep heavy transcript code off the initial route

The main application statically imports syntax highlighting, Mermaid, and
math-rendering support through the transcript component, producing a multi-
megabyte initial JavaScript chunk. Move transcript rendering behind a lazy
feature boundary and add a post-build entry-chunk budget using Vite's manifest.
Optional rich-rendering chunks may remain large, but they must not be required
before the application shell becomes interactive.

### 10. Align CI and documentation with reality

CI currently omits the worker PostgreSQL integration tests even though they
exercise queue and graph orchestration contracts. Run the full required matrix
and make a meta-test assert that coverage. Remove redundant CI work already
performed by `guardrails`.

Update README, patterns, decisions, and design documentation to describe the
actual source-workspace build model, request IDs, client completeness rule,
dependency/design gates, and lazy bundle boundary. Do not claim every package
emits an independent build artifact when only the deployable web application
has a build task.

## Compatibility and Risk Management

The remediation is additive or internal. Existing routes, schemas, commands,
event order, exports, and database migrations are unchanged. Error reason
unions grow additively, and optional sanitized detail does not expose raw
provider objects. Query disabling changes only requests that were already
intended not to run. Lazy loading changes asset scheduling, not transcript
content.

Each track is committed only after focused tests, type checking, architecture
checks, and the full non-Docker guardrail suite. Database-related tracks also
run the repository's Postgres suites. The completed branch additionally runs
root and web builds, the bundle budget, infrastructure validation, and a final
diff review before publication.

## Commit Strategy

1. Record the approved design and executable plan.
2. Complete client and route parity.
3. Harden boundary decoding and derived status policy.
4. Complete scoped service Test layers.
5. Preserve sanitized provider diagnostics and request correlation.
6. Remove dead packages and dependency drift.
7. Enforce design tokens and split the initial web bundle.
8. Align CI and architecture documentation.
9. Apply any final review fixes and publish the merge-ready PR.

## Deliberately Deferred Decisions

### Event-driven worker wake-up

The one-second worker poll is operationally simple but creates idle database
traffic and up to one second of dispatch latency. Replacing it well requires a
new interruptible `JobQueue.awaitWork` capability backed by PostgreSQL
`LISTEN/NOTIFY` with a timeout fallback. That changes queue-port semantics and
failure recovery, so it belongs in a focused architectural decision and PR,
not a cosmetic loop rewrite.

### Independently built TypeScript packages

The workspace currently type-checks source packages as one program and builds
only deployable assets through Turbo. Giving every package an emitted,
cacheable build requires package-level TypeScript project references, output
contracts, and a decision about source versus compiled package exports. This
PR will make the current model truthful and keep Turbo scheduling observable;
it will not add no-op build scripts that imply isolation which does not exist.

## Acceptance Criteria

- All validated defects above are fixed with regression coverage or a
  generalized automated guardrail.
- No production source contains fabricated branded IDs or `rows[0] ?? {}`.
- Every HTTP route is represented by the Effect client and Promise facade.
- Service Test layers preserve live authorization semantics.
- Provider errors retain useful, redacted diagnostics and HTTP responses carry
  request IDs.
- Owned UI code uses semantic tokens and the initial entry chunk satisfies the
  documented budget.
- CI runs every required PostgreSQL suite.
- `pnpm guardrails`, PostgreSQL integration tests, `pnpm build`,
  `pnpm --filter @repo/web build`, and `pnpm infra:check` pass on the final
  branch.
- The branch is pushed and a non-draft, merge-ready pull request is open.
