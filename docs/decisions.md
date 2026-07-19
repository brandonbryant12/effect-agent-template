# Architecture Decisions

Why the template is shaped the way it is. Each entry records the decision,
the reasoning, and what would have to change for the decision to be
revisited. `docs/patterns.md` tells you _what_ to do; this file tells you
_why_, so you can judge when a pattern genuinely does not apply instead of
guessing.

## 1. One narrow vertical slice, not a library or a large example

A minimal interface skeleton cannot prove that the pieces compose under
real CRUD, streaming, transactions, and worker pressure; a large example
application buries the architecture under incidental product complexity.
The template ships one thin product slice (projects → tasks → agent runs →
approvals) plus the reusable packages behind it, so every pattern has a
working, tested instance an agent can copy. Revisit only if the slice
itself grows product ambitions — that is scope creep, not architecture.

## 2. `Context.Service` for domain capabilities, plain interfaces for provider ports

Domain services (`ProjectService`, `AgentRunService`, …) are `Context.Service`
classes wired through Layers because they form a dependency graph the app
composes in one place, and tests substitute them wholesale. Provider ports
(`AiService`, `SandboxWorkspace`, `AgentRuntime`, `SecretStore`) are plain
interfaces built by `make*` factories because their construction is a
runtime _decision_ (`SANDBOX_PROVIDER=fake|opensandbox`), made once in an
app entrypoint with config in hand — a Layer graph would move that decision
into layer wiring without removing the branch. The asymmetry is deliberate;
if provider selection ever becomes deep (nested graphs of providers), lift
the ports into Layers and delete this paragraph.

## 3. `Schema.TaggedErrorClass` everywhere; no `Data.TaggedError`, no raw `Error`

One error idiom means every failure is serializable, pattern-matchable on
`_tag`, and schema-documented. Handlers, HTTP mapping, and retry policy all
branch on tags — which only works if nothing throws untyped `Error`s into
the typed channel. The architecture check enforces this because the failure
mode (an agent copying `Effect.fail(new Error(...))` from another codebase)
is common and silent.

## 4. Explicit error→status table, not tag-string matching

The server once mapped errors by substring ("includes NotFound → 404").
That silently mis-mapped any tag that didn't match the naming convention,
and the failure mode was invisible: a wrong status code, no error. The
`errorStatus` table makes the mapping reviewable, and the deliberate
fallthrough to 500 — now logged — makes an unmapped tag loud instead of
wrong.

## 5. One typed route table (`ApiRoutes`) instead of `@effect/platform` HttpApi

The API contract was originally declared three times (server regex router,
Effect client, Promise facade) with nothing keeping them aligned — the
single most likely place for an agent to introduce drift. `ApiRoutes` fixes
that with a repository-owned table: the server handler map is keyed by
`RouteName` (a missing handler is a compile error) and the client builds
requests from the same definitions. We chose a ~200-line owned table over
`@effect/platform` HttpApi because the platform API is still churning in
the v4 beta and the owned table keeps the teaching surface small. When
platform HttpApi stabilizes, migrating from the table is mechanical because
the contract is already centralized.

## 6. Hand-rolled `node:http` bridge, extracted to `@repo/node-http`

The template predates a stable v4 platform HTTP server. Rather than adopt
beta churn, both public processes share one small fetch-style bridge
(`serveHttp`) so buffering, header conversion, body limits, and shutdown
behave identically. The bridge is the _only_ place that knows about
node:http; handlers speak `Request`/`Response`, which is what makes them
testable and portable to platform HttpServer later.

## 7. Config decodes once and throws at boot

`decodeAppConfig` runs before any listener starts and throws on invalid
input, on purpose. A process with bad configuration must die immediately
and loudly — modeling boot config failure as a typed effect would only add
machinery around an unrecoverable state. After boot, everything receives
the already-validated `AppConfig` value; `process.env` reads anywhere else
are rejected so configuration cannot fragment (enforced).

## 8. Deterministic doubles ship in the production barrel

`makeAgentRuntimeTest`, `makeSandboxWorkspaceTest`, and `makeAiServiceFake`
are not test-only code: local development and CI select them through
config so the full product flow runs without credentials, sandboxes, or
paid models. That requirement — a complete runnable system with zero
external dependencies — is why they live beside their ports rather than in
test directories.

## 9. Raw SQL is contained, with a visible escape hatch

SQL is an implementation detail of the package that owns the use case;
callers depend on capability interfaces, never tables. The architecture
check restricts `sql\`` to data-access modules. The
`// architecture-allow: raw-sql -- <reason>`annotation exists because a
blanket ban was wrong (the readiness probe and the worker's journal binding
legitimately issue SQL from apps) and silent exemption lists hidden in the
checker are worse than justifications visible in the file itself. The same
philosophy produced`architecture-allow: wall-clock`.

## 10. Time comes from the Effect Clock

`new Date()` scattered through Live layers made every persistence path
untestable deterministically and unverifiable under TestClock. Deriving
time from `Clock.currentTimeMillis` costs one `flatMap` per write and buys
reproducible tests (see `packages/core/test/clock.test.ts`). The wall-clock
guardrail keeps regressions out; injectable-clock defaults (upload tokens,
queue double) carry the annotation instead.

## 11. Structural guardrails are regex checks, not a lint plugin

`scripts/check-architecture.ts` is ~150 lines of string matching. That is a
deliberate trade: it runs in milliseconds with zero dependencies, an agent
can read the entire rule set in one screen, and adding a rule is a
five-line diff. The known cost is soundness — regexes can be fooled by
aliased imports or string tricks. The rules are tripwires for honest
mistakes, not a sandbox against adversarial code; the review step remains
the backstop. If a rule ever needs real semantics, that one rule can move
to an AST check without changing the harness.

## 12. Plain vitest with explicit layers, not `@effect/vitest`

Tests build their world explicitly: `Effect.runPromise(Effect.provide(
program, TestLayer))`. The explicit form teaches the layer mechanics that
`it.effect` sugar hides, works identically for Effect and non-Effect tests,
and avoids coupling the suite to a beta integration package. TestClock
comes from `effect/testing` directly. If the suite grows enough that the
boilerplate hurts, adopt `@effect/vitest` wholesale — not per-file.

## 13. Two-tier docs: `patterns.md` decides, `decisions.md` explains

Agent-facing guidance is split by function. `AGENTS.md` is the entry
router (short, imperative). `patterns.md` is the tie-breaker an agent
consults mid-edit — what to do, with enforcement labels. This file holds
rationale, which changes rarely and is read when someone wants to
challenge or extend a pattern. Mixing rationale into the tie-breaker doc
would double its length and halve the chance an agent reads it.

## 14. Guardrails are one command, and CI is a superset

`pnpm guardrails` runs everything that needs no Docker: lint, typecheck,
architecture, design lint, template check, tests. One command is the
definition of done precisely because agents reliably run one command and
unreliably run five. CI adds what needs infrastructure (Postgres suites,
images, Compose smoke, Helm lint). The meta-test in
`packages/testing/test/guardrails.test.ts` pins the chain's contents so
the gate cannot silently weaken.

## 15. DESIGN.md is a machine-checked contract, not a style guide

Visual drift is the default outcome when colors are string literals in
JSX. The palette lives in `DESIGN.md` (linted by `design.md`), is declared
once as Tailwind `@theme` tokens, and hex literals in non-vendored web code
are rejected. A drift test binds DESIGN.md to the CSS so the contract and
the runtime cannot diverge. Vendored component directories are exempt from
source-level rules — they are upstream code we chose not to fork further.

## 16. Vendored UI code is exempt, not rewritten

shadcn and AI Elements components are vendored source, deliberately kept
close to upstream so they can be diffed and updated. Template rules
(no radix outside the vendored dirs, no hex literals, wall-clock ban)
carve those directories out rather than rewriting upstream code to comply.
The boundary: vendored code may not _export_ provider types into
application contracts.

## 17. Graph execution reuses the run machinery instead of a second engine

A user-defined orchestration graph could have grown its own executor —
mailboxes, schedulers, a parallel event log. Instead each node is an
ordinary `AgentSession` + `AgentRun` admitted with a deterministic command
id (`<graphRunId>/<nodeId>`), and the coordinator is a small requeueing
job that advances the frontier and reconciles statuses. Everything
expensive (isolation, approvals, retries, events, cancellation) is
inherited, and coordinator crashes are harmless because every dispatch
replays idempotently. The coordinator re-enqueues itself with a short
delay rather than holding a long lease so a worker restart never strands
a run mid-graph. Conditional edges and loops were deliberately excluded
from v1; they change the validation story (termination) and belong to a
separate decision when a real need appears.
