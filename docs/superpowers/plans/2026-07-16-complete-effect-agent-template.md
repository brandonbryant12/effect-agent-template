# Complete Effect Agent Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, production-shaped GitHub template that teaches an opinionated Effect 4 architecture through a complete AI agent project/task application.

**Architecture:** A pnpm monorepo separates public Effect capabilities from provider implementations. A Vite React client talks to an Effect HTTP server, a Postgres-backed worker executes durable agent jobs, and a provider-neutral sandbox boundary can use a deterministic local implementation or OpenSandbox. Docker Compose proves the local system and a Helm chart deploys the same images to Kubernetes/EKS.

**Tech Stack:** Node 22, pnpm 10, TypeScript, Effect `4.0.0-beta.98`, Effect Schema, Effect SQL/Postgres, Vite, React 19, TanStack Query, XState, Tailwind 4, shadcn/Base UI, Vitest, Playwright, Docker Compose, Helm 3, Kubernetes/EKS.

## Global Constraints

- Use Effect `4.0.0-beta.98` and derive all Effect package versions from one pnpm catalog.
- Public package APIs contain no provider SDK, Postgres driver, OpenSandbox SDK, or Base UI types.
- Decode all transport, database, queue, AI, and sandbox data with Effect Schema.
- Keep raw secrets out of models, events, logs, errors, command arguments, sandbox files, and snapshots.
- Default local operation uses fake AI and fake sandbox implementations without API keys.
- Every behavioral slice follows red-green-refactor; configuration and generated component source are verified by their consuming slice.
- Commit each completed task to `main` after its focused checks pass.

---

### Task 1: Repository foundation and executable guardrails

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.json`, `tsconfig.base.json`, `vitest.config.ts`, `turbo.json`
- Create: `.gitignore`, `.env.example`, `.node-version`, `.npmrc`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`
- Create: `scripts/guardrails.ts`, `scripts/effect-reference-sync.ts`, `scripts/check-architecture.ts`
- Create: `.agents/skills/effect/SKILL.md`, `.agents/skills/effect/references/*.md`
- Create: `examples/effect-recipes/src/*.ts`, `examples/effect-recipes/test/recipes.test.ts`
- Test: `packages/testing/test/guardrails.test.ts`

**Interfaces:**
- Produces root commands `dev`, `build`, `test`, `typecheck`, `lint`, `guardrails`, `effect:reference:sync`, `db:migrate`, `compose:up`, and `compose:down`.
- Produces the package rule: only declared package exports may cross package boundaries.

- [ ] Write a guardrail test that fails because required scripts, agent guidance, and the Effect version catalog do not exist.
- [ ] Run `pnpm vitest run packages/testing/test/guardrails.test.ts` and confirm the missing-contract failure.
- [ ] Add workspace manifests, exact dependency catalog, agent routing, Effect source sync, compile-tested recipes, and architecture script.
- [ ] Run the focused test, `pnpm typecheck`, and `pnpm guardrails`; confirm foundation checks pass.
- [ ] Commit with `chore: establish Effect 4 template foundation`.

### Task 2: Contracts, configuration, observability, database, and CRUD

**Files:**
- Create: `packages/contracts/src/{ids,project,task,conversation,agent-run,http}.ts`
- Create: `packages/config/src/{service,live,test}.ts`
- Create: `packages/observability/src/{service,live,test}.ts`
- Create: `packages/db/src/{service,live,test,migrate}.ts`, `packages/db/migrations/0001_initial.sql`
- Create: `packages/core/src/{project-service,task-service,conversation-service,agent-run-service}.ts`
- Test: `packages/contracts/test/*.test.ts`, `packages/core/test/*.test.ts`, `packages/db/test/*.integration.test.ts`

**Interfaces:**
- Produces branded `ProjectId`, `TaskId`, `ConversationId`, `AgentRunId`, `CommandId`, and `JobId` schemas.
- Produces `ProjectService`, `TaskService`, `ConversationService`, and `AgentRunService` as `Context.Service` capabilities.
- Produces transaction/query/migration entrypoints; SQL remains internal to live use-case layers.

- [ ] Write schema and state-transition tests for CRUD, invalid task transitions, idempotent commands, and monotonic run events; run and observe missing exports.
- [ ] Implement public schemas and pure transitions, then make unit tests pass.
- [ ] Write Postgres integration tests for migration, CRUD, rollback, command idempotency, event/job atomicity, and concurrent claims; confirm the live layer is missing.
- [ ] Implement Effect SQL/Postgres layers and use-case queries with explicit projections and decoded rows.
- [ ] Run unit tests always and integration tests against Compose Postgres; commit with `feat: add typed domain and Postgres persistence`.

### Task 3: Provider-neutral AI with fake and OpenAI Responses adapters

**Files:**
- Create: `packages/ai/src/{model,tool,service,fake}.ts`
- Create: `packages/ai/src/internal/openai/{client,request,event-decoder,error}.ts`
- Create: `packages/ai/test/{contract,openai-fixtures}.test.ts`, `packages/ai/test/fixtures/*.json`

**Interfaces:**
- Produces `AiModel.stream(request): Stream<AiModelEvent, AiError>` and schema-decoded `AiModel.generateObject`.
- Produces `AiTool<Input, Output>` with Effect Schema inputs/outputs and Effect handlers.
- Provider events normalize to response start, text delta, tool call, usage, completion, and failure events.

- [ ] Write adapter contract tests for semantic streaming, strict tools, `call_id`, structured output decoding, interruption, retry classification, and safe errors; confirm missing implementations.
- [ ] Implement the deterministic fake adapter and make the shared contract green.
- [ ] Add recorded Responses API fixtures and verify typed event decoding fails before the OpenAI mapper exists.
- [ ] Implement the OpenAI SDK adapter with `store: false`, `text.format`, typed SSE events, bounded retries, request IDs, and no SDK types in exports.
- [ ] Run AI tests and typecheck; commit with `feat: add Effect AI model adapters`.

### Task 4: Durable queue, worker runtime, orchestration, and sandboxes

**Files:**
- Create: `packages/queue/src/{job,service,postgres}.ts`
- Create: `packages/worker/src/{registry,runtime,agent-run-handler}.ts`
- Create: `packages/sandbox/src/{workspace,fake}.ts`
- Create: `packages/secrets/src/{reference,service,environment,test}.ts`
- Create: `packages/sandbox-opensandbox/src/{workspace,credential-broker,live}.ts`
- Create: `apps/worker/src/main.ts`
- Test: `packages/{queue,worker,sandbox,secrets,sandbox-opensandbox}/test/*.test.ts`

**Interfaces:**
- Produces `JobQueue.enqueue`, `claim`, `heartbeat`, `complete`, `retry`, and `fail` with leases and caller IDs.
- Produces `WorkerRuntime.run` with bounded concurrency and graceful shutdown.
- Produces `SandboxWorkspace.create/exec/readFile/writeFile/expose/terminate` and `SandboxCredentialBroker.install/remove`.

- [ ] Write queue and worker tests for at-least-once execution, lease loss, retries, cancellation, concurrency, and shutdown; confirm missing services.
- [ ] Implement the Postgres queue and worker runtime, then pass focused tests.
- [ ] Write sandbox/secret contract tests with canary values and fail-closed bindings; confirm missing adapters.
- [ ] Implement fake sandbox, scoped/redacted secrets, the OpenSandbox SDK adapter, and Credential Vault broker with default-deny matching.
- [ ] Assemble the worker app, run focused suites, and commit with `feat: add durable workers and sandbox execution`.

### Task 5: Effect HTTP server, resumable SSE, and approval flow

**Files:**
- Create: `apps/server/src/{api,handlers,sse,layers,main}.ts`
- Test: `apps/server/test/{api,sse,agent-flow}.test.ts`

**Interfaces:**
- Produces health, project/task CRUD, conversations, run commands, durable run-event SSE, cancellation, and approval endpoints under `/api/v1`.
- SSE accepts `Last-Event-ID`, replays durable events after that sequence, then follows live events with keepalives.

- [ ] Write HTTP tests for schema rejection, CRUD, not-found/conflict encoding, identity context, and health; confirm no server exists.
- [ ] Implement the Effect HTTP API and handlers as decode-authorize-call-encode orchestration.
- [ ] Write SSE resume and approval tests, including reconnect without replaying transient deltas; confirm failure.
- [ ] Implement durable event replay/follow, approval decisions, cancellation, and safe outer-boundary errors.
- [ ] Run server tests and commit with `feat: expose agent API and resumable events`.

### Task 6: Deliberate agent client with Query, XState, and shadcn/Base UI

**Files:**
- Create: `apps/web/{index.html,components.json,DESIGN.md}`
- Create: `apps/web/src/{main,app,styles}.tsx`
- Create: `apps/web/src/lib/{api,effect-runtime,query-client}.ts`
- Create: `apps/web/src/features/{projects,tasks,conversation,agent-run}/**/*.{ts,tsx}`
- Create: `packages/ui/src/components/ui/*.tsx`, `packages/ui/src/components/chat/*.tsx`
- Test: `apps/web/src/**/*.test.{ts,tsx}`, `apps/web/e2e/agent-flow.spec.ts`

**Interfaces:**
- TanStack Query owns server entities; one event projector updates the cache.
- XState owns only run/reconnect/approval/cancel phases and never duplicates entity data.
- shadcn first-party chat components use Base UI-compatible generated source.

- [ ] Write tests for API decoding, query keys, event projection, run transitions, and approval recovery; confirm missing modules.
- [ ] Implement the Effect client runtime, TanStack Query features, and XState machine.
- [ ] Define the dark operations-notebook design contract: graphite surfaces, signal-blue focus, warm execution states, Geist Sans/Mono, compact two-pane layout, and an event-sequence rail as the signature element.
- [ ] Generate only required shadcn/Base UI and first-party chat components, then compose responsive project/task/conversation/run screens with accessible empty/error/loading states.
- [ ] Run component tests, design lint, build, and mocked browser smoke; commit with `feat: build agent operations client`.

### Task 7: Full local runtime and end-to-end example

**Files:**
- Create: `Dockerfile`, `compose.yaml`, `.dockerignore`
- Create: `scripts/{wait-for-health,seed-demo}.ts`
- Create: `docs/{getting-started,architecture,patterns,testing}/**/*.md`
- Test: `tests/e2e/template-flow.spec.ts`

**Interfaces:**
- `docker compose up --build` starts healthy Postgres, migration, server, worker, and web services.
- The fake agent creates a proposed artifact, pauses for approval, uses the fake sandbox, then completes the linked task.

- [ ] Write the end-to-end test for project creation through completed approved run and observe connection failure before Compose exists.
- [ ] Add multi-stage non-root images, health checks, dependency conditions, persistent Postgres, migration job, and documented environment overrides.
- [ ] Implement deterministic seed/demo behavior and make the end-to-end test pass against Compose.
- [ ] Run `docker compose config`, image builds, health checks, and the browser flow; commit with `feat: add complete local container runtime`.

### Task 8: Helm, EKS, CI, and template release

**Files:**
- Create: `deploy/charts/effect-agent/{Chart.yaml,values.yaml,values.schema.json,templates/*}`
- Create: `deploy/eks/{README.md,values.example.yaml,pod-identity-policy.example.json}`
- Create: `.github/workflows/{ci,images,helm}.yml`, `.github/dependabot.yml`
- Create: `README.md`, `SECURITY.md`, `docs/template-adoption.md`
- Test: `scripts/check-template.ts`

**Interfaces:**
- The chart deploys server, worker, and web separately with migrations, probes, resources, autoscaling, disruption budgets, ingress, network policies, and external Secret references.
- EKS guidance uses EKS Pod Identity, one service account/role per workload, managed Postgres, ECR images, and the upstream OpenSandbox controller chart.

- [ ] Write chart assertions for workloads, probes, non-root security, secret-free values, and separate service accounts; confirm the chart is absent.
- [ ] Implement the chart and validate with `helm lint`, `helm template`, and schema checks.
- [ ] Add EKS prerequisites and install/upgrade/rollback instructions, including OpenSandbox controller deployment and explicit production gaps.
- [ ] Add CI for guardrails, Compose smoke, image build, and Helm validation; add template adoption and security documentation.
- [ ] Run `pnpm guardrails`, Compose end-to-end, `helm lint`, `helm template`, and a domain-leak scan; commit with `docs: finalize deployable GitHub template`.
