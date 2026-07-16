# Complete Effect Agent Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete off-the-shelf GitHub template whose project/task agent example proves an opinionated Effect 4 architecture from browser and CLI through Better Auth, Postgres, workers, one OpenCode sandbox per session, secure credentials, Docker Compose, Helm, and EKS.

**Architecture:** A public Effect HTTP gateway and narrow credential broker serve a transport-neutral SDK used by a React browser app and an Effect CLI. Durable application state lives in Postgres; workers lease one exclusive OpenSandbox workspace per agent session and drive a pinned private `opencode serve` process through `@opencode-ai/sdk`. OpenCode owns the model/tool loop while repository-owned schemas, authorization, approvals, audit events, and secret references remain authoritative.

**Tech Stack:** Node 26, pnpm 10, TypeScript 7, Effect `4.0.0-beta.98`, Effect Schema/HTTP/SQL, Postgres, Better Auth, OpenCode CLI and SDK, OpenSandbox Credential Vault, AWS Secrets Manager/KMS, React 19, TanStack Query, XState, Tailwind 4, shadcn/Base UI, Vitest, Playwright, Docker Compose, Helm 3, Kubernetes/EKS.

## Global Constraints

- Use Effect `4.0.0-beta.98`; installed declarations and source are the Effect API authority.
- Pin the OpenCode CLI and `@opencode-ai/sdk` to the same exact release.
- Decode all transport, database, queue, OpenCode, sandbox, and secret metadata with Effect Schema.
- Public package exports contain no OpenCode, OpenAI, Postgres driver, Better Auth, OpenSandbox, AWS SDK, or Base UI types.
- The public server never proxies arbitrary OpenCode routes and no public client addresses OpenCode directly.
- One `AgentSession` owns one exclusive sandbox, OpenCode process, data directory, server password, network policy, and Credential Vault state.
- Better Auth cookies authenticate the browser; Better Auth Device Authorization plus signed bearer tokens authenticate the CLI.
- The public SDK does not expose organization selection. The server derives one configured default `TenantId` and the authenticated user.
- Credentials are personal, write-only, referenced by `CredentialId`, and absent from logs, traces, errors, commands, files, snapshots, and application rows.
- The default local path uses deterministic runtime, sandbox, and secret adapters without paid keys.
- Each milestone follows focused red-green-refactor checks and is committed directly to `main`.

---

### Task 1: Foundation and guardrails — complete

**Files:** root manifests, `scripts/*`, `.agents/skills/effect/**`, `examples/effect-recipes/**`, `packages/testing/**`.

**Produces:** Node 26/pnpm workspace, exact Effect catalog, architecture checks, recipes, and root `guardrails`.

- [x] Establish the repository, Effect truth chain, instructions, guardrails, recipes, and CI-ready root commands.
- [x] Verify `pnpm guardrails` and commit `c2b1b07`.

### Task 2: Contracts, Postgres, and generic application services

**Files:**

- Modify: `packages/contracts/src/{ids,project,task,conversation,agent-run,index}.ts`
- Create: `packages/contracts/src/{agent-session,approval,artifact,credential,job,http,event}.ts`
- Modify: `packages/core/src/{project-service,task-service,live,index}.ts`
- Create: `packages/core/src/{conversation-service,agent-session-service,agent-run-service,credential-service}.ts`
- Modify: `packages/db/migrations/0001_initial.sql`, `packages/db/src/{live,index}.ts`
- Test: `packages/contracts/test/models.test.ts`, `packages/core/test/*.test.ts`, `packages/db/test/postgres.integration.test.ts`

**Interfaces:**

- Produces branded IDs including `UserId`, `TenantId`, `AgentSessionId`, `ApprovalRequestId`, `CredentialId`, and `JobId`.
- Produces `AgentSessionService.create`, `AgentRunService.admit`, and `CredentialService.beginUpload` with repository-owned schemas.
- Produces transactionally atomic run-command, first-event, and job admission.

- [ ] Add failing schema tests proving branded ID rejection, personal credential ownership, valid session transitions, monotonic event sequences, and invalid task transitions.
- [ ] Run `pnpm vitest run packages/contracts/test packages/core/test` and confirm missing session/credential exports.
- [ ] Implement the schema and pure transition modules with `Schema.TaggedError` failures.
- [ ] Add failing Postgres tests for CRUD, cross-user rejection, upload-token single use, command idempotency, event/job atomicity, and concurrent queue claims.
- [ ] Implement explicit SQL projections and transactions in `packages/db/src/live.ts`; decode every returned row.
- [ ] Run unit tests, `docker compose up -d postgres`, `RUN_POSTGRES_TESTS=1 pnpm vitest run packages/db/test`, and `pnpm typecheck`.
- [ ] Commit only this slice with `feat: add typed application persistence`.

### Task 3: Better Auth and the transport-neutral client SDK

**Files:**

- Create: `packages/auth/src/{principal,service,server,browser,device,live,test,index}.ts`
- Create: `packages/client/src/{client,transport,auth,sse,promise,index}.ts`
- Create: `packages/client-react/src/{query-keys,options,index}.ts`
- Create: `apps/cli/src/{main,auth-store,commands/login}.ts`
- Create: `apps/server/src/auth-route.ts`
- Test: `packages/auth/test/*.test.ts`, `packages/client/test/*.test.ts`, `apps/cli/test/*.test.ts`

**Interfaces:**

```ts
export interface AuthenticationService {
  readonly authenticate: (
    headers: Headers,
  ) => Effect.Effect<Principal, AuthenticationError>;
}

export interface ClientTransport {
  readonly execute: <A, I, E>(
    request: ApiRequest<A, I, E>,
  ) => Effect.Effect<A, E>;
  readonly events: (
    request: EventRequest,
  ) => Stream.Stream<AgentRunEvent, ClientError>;
}
```

- [ ] Add failing tests for browser-cookie and signed-bearer principal resolution, device-code expiry/denial/slow-down, registered CLI client validation, and cross-user access.
- [ ] Install Better Auth and configure email/password local auth, Device Authorization, and bearer signature verification through `packages/auth`.
- [ ] Add failing shared-client contract tests that run the same project/session calls with cookie and bearer transports.
- [ ] Implement fetch-based Effect transport, resumable SSE parsing, auth injection, and Promise/`AsyncIterable` delegates without React or Node imports.
- [ ] Implement CLI device login and keychain-backed token storage behind an injectable `AuthTokenStore`; tests use memory storage.
- [ ] Run `pnpm vitest run packages/auth packages/client apps/cli` and `pnpm typecheck`.
- [ ] Commit with `feat: add Better Auth and shared client SDK`.

### Task 4: Direct AI examples and provider-neutral agent runtime

**Files:**

- Create: `packages/ai/src/{model,tool,fake,index}.ts`
- Create: `packages/ai/src/internal/openai/{client,request,event-decoder,error}.ts`
- Create: `packages/agent-runtime/src/{model,service,test,index}.ts`
- Test: `packages/ai/test/*.test.ts`, `packages/agent-runtime/test/*.test.ts`

**Interfaces:**

```ts
export interface AgentRuntime {
  readonly createSession: (
    input: CreateRuntimeSession,
  ) => Effect.Effect<RuntimeSessionRef, AgentRuntimeError>;
  readonly send: (
    input: SendRuntimeMessage,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly events: (
    session: RuntimeSessionRef,
  ) => Stream.Stream<AgentRuntimeEvent, AgentRuntimeError>;
  readonly replyPermission: (
    input: RuntimePermissionReply,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly cancel: (
    session: RuntimeSessionRef,
  ) => Effect.Effect<void, AgentRuntimeError>;
  readonly close: (
    session: RuntimeSessionRef,
  ) => Effect.Effect<void, AgentRuntimeError>;
}
```

- [ ] Write failing `AgentRuntime` contract tests for deterministic events, approval pause/resume, cancellation, failure, and cleanup.
- [ ] Implement `AgentRuntimeTest` and make the shared contract pass without network access.
- [ ] Write failing direct-AI tests for schema-decoded streaming, structured output, strict tools, safe errors, interruption, and retry classification.
- [ ] Implement the fake and OpenAI Responses adapters with recorded fixtures and no provider types in exports.
- [ ] Run focused tests, architecture checks, and typecheck.
- [ ] Commit with `feat: add Effect AI and agent runtime contracts`.

### Task 5: Queue, worker, and exclusive session leases

**Files:**

- Create: `packages/queue/src/{job,service,postgres,index}.ts`
- Create: `packages/worker/src/{registry,runtime,agent-run-handler,index}.ts`
- Create: `packages/sandbox/src/{model,workspace,test,index}.ts`
- Create: `apps/worker/src/{layers,main}.ts`
- Test: `packages/{queue,worker,sandbox}/test/*.test.ts`

**Interfaces:** `JobQueue` exposes enqueue/claim/heartbeat/complete/retry/fail; `SandboxWorkspace` exposes create/resume/exec/files/expose/pause/terminate; `WorkerRuntime` owns bounded concurrency and drain.

- [ ] Add failing queue tests for at-least-once claims, lease loss, retry classification, idempotency, and dead-letter outcomes.
- [ ] Implement Postgres queue operations with `FOR UPDATE SKIP LOCKED` and transactional terminal events.
- [ ] Add failing worker tests for bounded concurrency, graceful shutdown, cooperative cancellation, and exclusive `AgentSession` leases.
- [ ] Implement the worker runtime and deterministic sandbox capability.
- [ ] Assemble `apps/worker` from layers; do not construct clients inside handlers.
- [ ] Run focused tests, Postgres integration tests, and typecheck.
- [ ] Commit with `feat: add durable session workers`.

### Task 6: OpenCode, OpenSandbox, and credential ingestion

**Files:**

- Create: `packages/agent-runtime-opencode/src/{config,server,client,event-mapper,permission-mapper,live,index}.ts`
- Create: `packages/secrets/src/{model,store,upload-token,memory,aws,index}.ts`
- Create: `packages/sandbox-opensandbox/src/{workspace,credential-broker,network-policy,live,index}.ts`
- Create: `apps/credential-broker/src/{api,layers,main}.ts`
- Test: `packages/agent-runtime-opencode/test/*.test.ts`, `packages/secrets/test/*.test.ts`, `packages/sandbox-opensandbox/test/*.test.ts`, `apps/credential-broker/test/*.test.ts`

**Interfaces:** OpenCode adapter implements `AgentRuntime`; broker exposes only single-use secret upload; `SecretStore` returns opaque `SecretRef`; sandbox broker installs exact HTTPS host/method/path bindings.

- [ ] Pin identical OpenCode CLI/SDK versions and add a failing mismatch test.
- [ ] Add fixture tests for session creation, async prompt, SSE mapping, permissions, cancellation, password authentication, runtime loss, and unsupported event versions.
- [ ] Implement the OpenCode SDK adapter with all external data decoded before mapping.
- [ ] Add failing upload tests for expiry, replay, wrong principal, body limits, no-store responses, absent payload telemetry, partial-failure cleanup, and no read-secret route.
- [ ] Implement signed upload intents, memory/AWS secret stores, and the narrow broker process with write-only production IAM documentation.
- [ ] Add OpenSandbox contract tests proving one sandbox per session, default-deny egress, exact binding matching, canary redaction, and vault teardown.
- [ ] Implement OpenSandbox workspace and Credential Vault adapters; never place real credentials in sandbox env/files/commands.
- [ ] Run focused tests, typecheck, architecture checks, and an OpenCode fixture smoke.
- [ ] Commit with `feat: add isolated OpenCode session runtime`.

### Task 7: Public server, CLI workflows, and deterministic end-to-end flow

**Files:**

- Create: `apps/server/src/{api,handlers,sse,layers,main}.ts`
- Expand: `apps/cli/src/commands/{projects,tasks,sessions,credentials}.ts`
- Test: `apps/server/test/*.test.ts`, `apps/cli/test/*.test.ts`, `tests/e2e/template-flow.test.ts`

**Interfaces:** `/api/v1` exposes project/task CRUD, sessions, runs, approvals, credential-upload intents, cancellation, and cursor-resumable SSE; it never exposes OpenCode URLs or secret values.

- [ ] Write failing Effect HTTP tests for schema errors, auth, resource ownership, CRUD, idempotency, safe errors, and health/readiness.
- [ ] Implement thin decode-authenticate-authorize-use-case-encode handlers.
- [ ] Write failing SSE tests for cursor resume, live-only deltas, durable completion, keepalive, disconnect, and authorization.
- [ ] Implement event replay/follow and cache-safe stream headers.
- [ ] Implement CLI project/task/session/approval/cancel and hidden-input credential commands entirely through `packages/client`.
- [ ] Add an end-to-end deterministic test from login through project/task creation, session start, approval, artifact, completion, and reconnect.
- [ ] Run server/CLI/E2E tests and commit with `feat: expose multi-client agent platform`.

### Task 8: Browser client, design system, Query, and XState

**Files:**

- Create: `apps/web/{index.html,components.json,DESIGN.md}`
- Create: `apps/web/src/{main,app,styles}.tsx`
- Create: `apps/web/src/features/{auth,projects,tasks,credentials,conversation,agent-run}/**/*.{ts,tsx}`
- Create: `packages/ui/src/components/{ui,chat}/*.tsx`
- Test: `apps/web/src/**/*.test.{ts,tsx}`, `apps/web/e2e/agent-flow.spec.ts`

**Interfaces:** TanStack Query owns server state; XState owns run/reconnect/approval/cancel workflows; one event projector updates query caches; Base UI imports remain inside `packages/ui`.

- [ ] Write failing query-key, event-projector, machine-transition, and auth-rehydration tests.
- [ ] Implement `packages/client-react` integration and the browser cookie transport.
- [ ] Add the complete `DESIGN.md`, Tailwind theme, `@google/design.md` lint, and drift guardrail.
- [ ] Install only required shadcn/Base UI and first-party chat source components.
- [ ] Compose responsive login, project/task, credential, conversation, approval, error, loading, and empty states.
- [ ] Run component tests, design lint, accessibility checks, production build, and mocked browser flow.
- [ ] Commit with `feat: build agent browser client`.

### Task 9: Docker Compose, Helm/EKS, CI, and template release

**Files:**

- Create: `Dockerfile`, `.dockerignore`, complete `compose.yaml`, `scripts/{wait-for-health,seed-demo,check-template}.ts`
- Create: `deploy/charts/effect-agent/{Chart.yaml,values.yaml,values.schema.json,templates/**}`
- Create: `deploy/eks/{README.md,values.example.yaml,pod-identity-policy.example.json}`
- Create: `.github/workflows/{ci,images,helm}.yml`, `.github/dependabot.yml`
- Create: `README.md`, `SECURITY.md`, `docs/{getting-started,architecture,patterns,testing,template-adoption}/**/*.md`
- Test: `tests/e2e/compose-flow.spec.ts`, chart assertions in `scripts/check-template.ts`

**Interfaces:** `docker compose up --build` starts Postgres, migration, Better Auth server, credential broker, worker, and web; Helm deploys separate workloads/service accounts with ingress, probes, resources, autoscaling, disruption budgets, network policies, external secrets, and EKS Pod Identity.

- [ ] Add a failing Compose smoke test and chart assertions before images/manifests exist.
- [ ] Implement non-root multi-stage images, health checks, migration gating, persistent Postgres, deterministic demo seeding, and safe local auth.
- [ ] Implement the Helm chart with separate server/broker/worker IAM boundaries and OpenSandbox controller integration guidance.
- [ ] Add CI for guardrails, Postgres tests, Compose smoke, image build, Helm lint/template, and domain-leak checks.
- [ ] Write off-the-shelf setup, architecture, security, credential, OpenCode, local/live sandbox, EKS, adoption, and extension documentation.
- [ ] Run `pnpm guardrails`, Compose E2E, image builds, `helm lint`, `helm template`, and `pnpm tsx scripts/check-template.ts`.
- [ ] Confirm the dirty tree contains only intended template files and commit with `docs: finalize deployable Effect agent template`.

## Completion Proof

- [ ] A clean clone passes install, migration, guardrails, build, and deterministic E2E from documented root commands.
- [ ] Browser and CLI authenticate with Better Auth and execute the same SDK contract.
- [ ] Live mode proves a password-protected OpenCode server inside one exclusive sandbox per session.
- [ ] Canary credentials reach only their exact mock upstream binding and never appear in application or sandbox-visible surfaces.
- [ ] Docker Compose and rendered Helm resources are healthy and contain no plaintext secrets.
- [ ] README starts from zero context and reaches a completed agent run without undocumented steps.
