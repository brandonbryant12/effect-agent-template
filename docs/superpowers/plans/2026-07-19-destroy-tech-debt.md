# Destroy Tech Debt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into a fork-ready reference by fixing every validated compatibility-preserving debt item and preventing each defect class from returning.

**Architecture:** Keep the existing public protocols and source-workspace model while tightening boundaries around them. Contract tables and schemas remain the source of truth; clients, workflow guards, test layers, observability, design lint, CI, and documentation are derived from or checked against those sources.

**Tech Stack:** TypeScript 7, Effect 4, Effect Schema, Vitest, TanStack Query, React 19, Vite, Tailwind CSS 4, Turbo, pnpm, PostgreSQL, OpenCode SDK, AWS Secrets Manager.

## Global Constraints

- Preserve the public HTTP schemas, persisted data model, queue protocol, and existing package export names unless a missing method is added additively.
- Decode unknown values at transport, SQL, queue, provider, and UI-library boundaries; never fabricate branded identifiers.
- Use `Schema.TaggedErrorClass` for expected failures and retain only bounded, sanitized provider diagnostics.
- Keep remote state in TanStack Query and use `skipToken` for disabled queries.
- Do not edit vendored files under `apps/web/src/components/ui/` or `apps/web/src/components/ai-elements/` for local design cleanup.
- Write and witness a focused failing test before every behavioral production change.
- Run `PATH=/opt/homebrew/opt/node@26/bin:$PATH pnpm guardrails` before every commit.
- For SQL, server, queue, or worker commits also run `DATABASE_URL=postgres://agent:agent@localhost:5433/agent RUN_POSTGRES_TESTS=1 pnpm vitest run packages/db/test apps/server/test apps/worker/test packages/queue/test`.
- Push every green commit to `origin/codex/destroy-tech-debt`.

---

### Task 1: Record the Approved Architecture

**Files:**

- Create: `docs/superpowers/specs/2026-07-19-destroy-tech-debt-design.md`
- Create: `docs/superpowers/plans/2026-07-19-destroy-tech-debt.md`

**Interfaces:**

- Consumes: the approved audit findings and repository rules.
- Produces: the compatibility constraints, remediation tracks, verification matrix, and deferred decisions used by every later task.

- [ ] **Step 1: Self-review the design against the audit**

Confirm that client parity, boundary decoding, derived transitions, scoped Test layers, safe diagnostics, request IDs, dependency cleanup, design enforcement, bundle splitting, CI, docs, and both deferred decisions have explicit sections.

- [ ] **Step 2: Scan the plan for incomplete instructions**

Run: `rg -n 'T[B]D|T[O]DO|implement lat[e]r|similar to Tas[k]|appropriate error handlin[g]' docs/superpowers/specs/2026-07-19-destroy-tech-debt-design.md docs/superpowers/plans/2026-07-19-destroy-tech-debt.md`

Expected: no matches.

- [ ] **Step 3: Verify and commit**

Run: `PATH=/opt/homebrew/opt/node@26/bin:$PATH pnpm guardrails`

Expected: all lint, type, architecture, design, template, and unit-test gates pass.

Commit: `docs: specify repository debt remediation`

---

### Task 2: Enforce HTTP Client and Promise-Facade Completeness

**Files:**

- Modify: `packages/client/test/client.test.ts`
- Modify: `packages/client/src/client.ts`
- Modify: `packages/client/src/promise.ts`

**Interfaces:**

- Consumes: `ApiRoutes.deleteProject`, `ApiRoutes.deleteGraph`, `ApiRoutes.getRun`, `AgentClient`.
- Produces: `projects.remove(id)`, `graphs.remove(id)`, `runs.get(id)`, and exported `PromiseAgentClient` whose nested methods are mapped from `AgentClient` Effect/Stream results.

- [ ] **Step 1: Write failing route- and facade-completeness tests**

Add tests that invoke the three missing methods against the recording transport and assert their method/path, then compare every `Object.keys(ApiRoutes)` entry with the routes referenced by `createAgentClient`. Add a compile-time assignment from `toPromiseClient(client)` to `PromiseAgentClient`.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/client/test/client.test.ts`

Expected: failure because `projects.remove`, `graphs.remove`, and Promise `runs.get` do not exist.

- [ ] **Step 3: Add the missing methods and mapped facade type**

Implement deletion through the shared routes. Define a recursive nested mapped type that converts `Effect.Effect<A, E, never>` methods to `Promise<A>` and `Stream.Stream<A, E, never>` methods to `AsyncIterable<A>`, and make the returned facade `satisfies PromiseAgentClient`.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm vitest run packages/client/test/client.test.ts && pnpm typecheck && pnpm guardrails`

Expected: client tests and all guardrails pass.

Commit: `fix(client): enforce complete route facades`

---

### Task 3: Remove Fabricated Identity and Silent SQL Fallbacks

**Files:**

- Modify: `packages/client-react/test/options.test.ts`
- Modify: `packages/client-react/src/options.ts`
- Modify: `packages/client-react/src/query-keys.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/features/graphs/graphs-panel.tsx`
- Modify: `apps/web/src/features/graphs/graph-canvas.tsx`
- Create: `apps/web/src/features/graphs/graph-identifiers.ts`
- Create: `apps/web/src/features/graphs/graph-identifiers.test.ts`
- Modify: `packages/queue/src/postgres.ts`
- Modify: `packages/core/src/internal/credential-live.ts`
- Modify: `packages/core/src/internal/agent-session-live.ts`
- Modify: `packages/core/src/internal/approval-live.ts`
- Modify: `packages/core/src/graph-validation.ts`
- Modify: `packages/worker/src/graph-run.ts`
- Modify: `apps/worker/src/graph-journal.ts`
- Modify: `scripts/check-architecture.ts`
- Modify: `packages/testing/test/guardrails.test.ts`

**Interfaces:**

- Consumes: branded ID schemas, TanStack Query `skipToken`, existing typed persistence errors.
- Produces: optional-ID query factories, `decodeGraphNodeId(value: unknown): Option.Option<GraphNodeId>`, explicit missing-row errors, and architecture violations for production branded assertions or `rows[0] ?? {}`.

- [ ] **Step 1: Write failing disabled-query, boundary-decoding, persistence, and architecture tests**

Assert optional IDs produce `queryFn === skipToken`; invalid React Flow IDs decode to `Option.none`; missing `RETURNING` rows fail with the owning persistence error; and fixture snippets containing `as ProjectId` or `rows[0] ?? {}` are rejected by the architecture checker.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/client-react/test apps/web/src/features/graphs/graph-identifiers.test.ts packages/queue/test packages/core/test packages/testing/test/guardrails.test.ts`

Expected: missing optional query support/helper/architecture rules cause focused failures.

- [ ] **Step 3: Implement schema-first identity handling**

Use `Schema.decodeUnknownOption` at React Flow boundaries, use actual graph-node lookups after membership validation, and use schema decoding for SQL-returned IDs/statuses. Replace fake IDs with `undefined` and `skipToken`. Turn absent required SQL rows into `JobQueueError` or `PersistenceError` with the operation name; never decode an invented object.

- [ ] **Step 4: Add generalized architecture checks**

Scan non-test production TypeScript for assertions to repository branded ID names and for `rows[0] ?? {}`. Report file and line while preserving allowed `as const` and vendored exclusions.

- [ ] **Step 5: Verify green and commit**

Run: `pnpm vitest run packages/client-react/test apps/web/src/features/graphs/graph-identifiers.test.ts packages/queue/test packages/core/test packages/testing/test/guardrails.test.ts && pnpm typecheck && pnpm architecture:check`

Run the full PostgreSQL matrix, then `pnpm guardrails`.

Expected: focused tests, database tests, and guardrails pass.

Commit: `fix(boundaries): decode identity without fabricated values`

---

### Task 4: Derive Workflow Policy and Preserve Test-Layer Authorization

**Files:**

- Modify: `packages/contracts/src/graph-transitions.ts`
- Modify: `packages/contracts/test/graph-transitions.test.ts`
- Modify: `packages/agent-runtime/src/model.ts`
- Modify: `packages/agent-runtime/test/runtime.test.ts`
- Modify: `packages/core/src/graph-run-service.ts`
- Modify: `packages/core/test/graph-run-service.test.ts`
- Modify: `packages/core/src/internal/approval-live.ts`
- Modify: `packages/worker/src/graph-run.ts`
- Modify: `apps/server/src/api.ts`
- Modify: `apps/worker/src/graph-journal.ts`

**Interfaces:**

- Consumes: `allowedGraphNodeTransitions`, terminal status predicates, runtime-event schemas.
- Produces: pure exhaustive helpers for skippable nodes, graph-run projection, and terminal runtime events; scoped in-memory graph-run records.

- [ ] **Step 1: Write failing exhaustive policy and scope tests**

Enumerate all graph node/run statuses and runtime event tags, asserting their derived terminal/skippable/projected behavior. Add a GraphRunService Test-layer test where one user cannot get or list another user's run.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/contracts/test/graph-transitions.test.ts packages/agent-runtime/test/runtime.test.ts packages/core/test/graph-run-service.test.ts`

Expected: missing helper exports and cross-scope leakage fail.

- [ ] **Step 3: Implement derived policy and scoped storage**

Derive skippability from `allowedGraphNodeTransitions[status].has("skipped")`; centralize graph-run projection and terminal runtime-event classification in pure helpers; replace duplicated status lists at callers. Store `{ scope, run }` in the Test-layer Ref and filter both `get` and `list` by `scope.userId`.

- [ ] **Step 4: Verify green and commit**

Run focused tests, `pnpm typecheck`, the full PostgreSQL matrix, and `pnpm guardrails`.

Expected: all status cases and authorization paths pass.

Commit: `refactor(workflows): derive policy from state models`

---

### Task 5: Complete Deterministic Service Test Layers

**Files:**

- Modify: `packages/core/src/approval-service.ts`
- Modify: `packages/core/src/conversation-service.ts`
- Modify: `packages/core/src/credential-secret-service.ts`
- Create: `packages/core/test/service-test-layers.test.ts`

**Interfaces:**

- Consumes: public service method contracts, `AccessScope`, domain schemas, `Ref`.
- Produces: `ApprovalServiceTest`, `ConversationServiceTest`, `CredentialSecretServiceTest`, plus deterministic layer constructors that accept seeded validated records when lookup behavior needs setup.

- [ ] **Step 1: Write failing substitution tests**

Test each service through `Effect.provide`: conversation creation/get honors scope, approval resolution/cancellation changes only the seeded approval, and credential activation records only the requested secret reference.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/core/test/service-test-layers.test.ts`

Expected: imports fail because the Test layers do not exist.

- [ ] **Step 3: Implement minimal Ref-backed layers**

Keep mutable state private to each layer construction, enforce the same ownership checks as live layers, generate deterministic IDs/timestamps using the existing test identifier/clock patterns, and expose no test-only mutators on production services.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm vitest run packages/core/test/service-test-layers.test.ts packages/core/test/services.test.ts && pnpm typecheck && pnpm guardrails`

Expected: direct service tests and guardrails pass.

Commit: `test(core): complete scoped service layers`

---

### Task 6: Preserve Sanitized Diagnostics and Correlate Requests

**Files:**

- Modify: `packages/observability/src/redaction.ts`
- Modify: `packages/observability/src/context.ts`
- Modify: `packages/observability/src/index.ts`
- Create: `packages/observability/test/redaction.test.ts`
- Modify: `packages/agent-runtime/src/model.ts`
- Modify: `packages/agent-runtime-opencode/src/client.ts`
- Modify: `packages/agent-runtime-opencode/src/runtime.ts`
- Modify: `packages/agent-runtime-opencode/test/runtime.test.ts`
- Modify: `packages/secrets/src/model.ts`
- Modify: `packages/secrets/src/aws.ts`
- Modify: `packages/secrets/test/secrets.test.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/api.ts`
- Modify: `apps/server/test/api.integration.test.ts`

**Interfaces:**

- Produces: `safeErrorDetail(error: unknown): string | undefined`, `errorStatus(error: unknown): number | undefined`, `makeRequestId(): string`; optional `detail` on provider errors; additive `forbidden` and `rate-limited` reasons; `x-request-id` on all server responses.

- [ ] **Step 1: Write failing redaction, classification, and response tests**

Assert secret-like tokens and credentials are redacted, detail is bounded, HTTP/status metadata is retained, OpenCode/AWS 404/403/429 cases map to their exact reason and retryability, and success/error server responses contain the same request ID format expected by the client.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/observability/test packages/agent-runtime-opencode/test/runtime.test.ts packages/secrets/test/secrets.test.ts apps/server/test/api.integration.test.ts`

Expected: helper exports, reason variants, and server header assertions fail.

- [ ] **Step 3: Implement safe shared diagnostics**

Extract only message/name/status-like scalar data, redact credential patterns, and cap detail at 240 characters. Classify known provider status/name signals without storing raw causes. Generate one UUID per HTTP request, attach it to every response, and log only `{ requestId, method, path, detail }` for unexpected defects at the app boundary.

- [ ] **Step 4: Verify green and commit**

Run focused tests, `pnpm typecheck`, the full PostgreSQL matrix, and `pnpm guardrails`.

Expected: diagnostics remain useful without secret leakage and all responses are correlated.

Commit: `feat(observability): add safe correlated diagnostics`

---

### Task 7: Remove Dead Package Surface and Enforce Dependency Hygiene

**Files:**

- Create: `test/guardrails.test.ts`
- Delete: `packages/testing/src/index.ts`
- Delete: `packages/testing/test/guardrails.test.ts`
- Delete: `packages/testing/package.json`
- Create: `scripts/check-dependencies.ts`
- Create: `scripts/check-dependencies.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `apps/web/package.json`
- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `dependencies:check` and a pure dependency-audit function that scans package-owned source/config/script imports while exempting `@types/*`, peer dependencies, and command-invoked tools.

- [ ] **Step 1: Move the guardrail test and write a failing dependency-audit test**

Preserve every existing meta-test under `test/guardrails.test.ts`. Add fixtures proving an unused direct runtime dependency is reported and imported/CSS/tool dependencies are retained.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run test/guardrails.test.ts scripts/check-dependencies.test.ts`

Expected: dependency-check imports fail before the script exists.

- [ ] **Step 3: Implement the checker and remove proven dead surface**

Scan workspace package files with deterministic ordering, report `package: dependency`, wire `dependencies:check` into `guardrails`, delete `@repo/testing`, remove unused `@base-ui/react`/`@repo/core` web dependencies and unused UI utility dependencies, then refresh the lockfile with pnpm.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm dependencies:check && pnpm vitest run test/guardrails.test.ts scripts/check-dependencies.test.ts && pnpm typecheck && pnpm guardrails`

Expected: dependency audit and all repository gates pass.

Commit: `chore(repo): remove dead package and dependency surface`

---

### Task 8: Enforce Semantic UI Tokens and an Initial-Bundle Budget

**Files:**

- Modify: `apps/web/src/design-tokens.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/features/auth/login-panel.tsx`
- Modify: `apps/web/src/features/graphs/graphs-panel.tsx`
- Create: `apps/web/src/features/agent-run/run-transcript.tsx`
- Modify: `packages/ui/src/status-beacon.tsx`
- Create: `packages/ui/test/status-beacon.test.tsx`
- Modify: `scripts/check-architecture.ts`
- Modify: `apps/web/vite.config.ts`
- Create: `scripts/check-web-bundle.ts`
- Create: `scripts/check-web-bundle.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**

- Produces: semantic token enforcement across owned web/UI files; lazy `RunTranscript`; Vite manifest output; `check-web-bundle` enforcing a 750 KiB entry-JavaScript limit.

- [ ] **Step 1: Write failing token, component, and bundle-budget tests**

Assert owned CSS rules contain no raw color literals outside token definitions, owned TSX contains no raw palette/arbitrary color utilities, each StatusBeacon status renders semantic classes, and a synthetic manifest above 750 KiB fails with the exact entry file and size.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run apps/web/src/design-tokens.test.ts packages/ui/test/status-beacon.test.tsx scripts/check-web-bundle.test.ts`

Expected: current raw colors/classes and missing bundle checker fail.

- [ ] **Step 3: Replace raw styling and lazy-load transcript rendering**

Map status colors to `success`, `warning`, `destructive`, `code`, and panel tokens; replace owned raw Tailwind/CSS colors with semantic variables; narrow exemptions to vendored directories. Move Message/MessageContent/MessageResponse imports into `RunTranscript` and load it via `React.lazy` plus a lightweight Suspense fallback.

- [ ] **Step 4: Add the post-build budget**

Enable `build.manifest`, make `@repo/web` build run Vite followed by the checker, locate the manifest entry with `isEntry: true`, and fail when its JavaScript file exceeds 768000 bytes.

- [ ] **Step 5: Verify green and commit**

Run focused tests, `pnpm design:lint`, `pnpm --filter @repo/web build`, `pnpm typecheck`, and `pnpm guardrails`.

Expected: semantic styling passes and the built initial entry is at or below 750 KiB.

Commit: `perf(web): enforce tokens and lazy initial bundle`

---

### Task 9: Align CI, Documentation, and Final Verification

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `test/guardrails.test.ts`
- Modify: `README.md`
- Modify: `docs/patterns.md`
- Modify: `docs/decisions.md`
- Modify: `apps/web/DESIGN.md`
- Modify: `docs/superpowers/plans/2026-07-19-destroy-tech-debt.md`

**Interfaces:**

- Produces: CI coverage for `packages/db/test`, `apps/server/test`, `apps/worker/test`, and `packages/queue/test`; truthful documentation of client, observability, dependency, design, bundle, and source-workspace behavior.

- [ ] **Step 1: Write a failing CI meta-test**

Assert the CI workflow contains `RUN_POSTGRES_TESTS=1` and all four required Postgres test directories, and invokes `pnpm guardrails` without a redundant standalone `pnpm template:check` step.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run test/guardrails.test.ts`

Expected: missing `apps/worker/test` and redundant template check fail.

- [ ] **Step 3: Correct CI and documentation**

Use the exact complete PostgreSQL command from Global Constraints. Document facade parity, boundary decoding, request IDs and safe error detail, dependency/design/bundle gates, and that Turbo builds deployable artifacts while root typecheck validates source packages. Record the two deliberately deferred decisions without implying they are fixed.

- [ ] **Step 4: Verify the complete repository**

Run:

```bash
PATH=/opt/homebrew/opt/node@26/bin:$PATH pnpm guardrails
DATABASE_URL=postgres://agent:agent@localhost:5433/agent RUN_POSTGRES_TESTS=1 pnpm vitest run packages/db/test apps/server/test apps/worker/test packages/queue/test
pnpm build
pnpm --filter @repo/web build
pnpm infra:check
git diff --check
```

Expected: every command exits 0, with no skipped required Postgres suites and no whitespace errors.

- [ ] **Step 5: Review, commit, push, and open the PR**

Review `git diff origin/main...HEAD`, fix every critical or important issue, rerun Step 4 after any edit, then commit `docs: align CI and architecture guidance`. Push the branch and create a non-draft PR whose body lists fixed debt, prevention gates, deliberately deferred decisions, and exact verification evidence.
