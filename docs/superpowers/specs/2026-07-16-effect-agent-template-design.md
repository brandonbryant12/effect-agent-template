# Effect Agent Template Design

**Status:** Approved for implementation

**Date:** 2026-07-16

## Summary

Build a public GitHub template for an AI-agent product using Effect 4 as the
application foundation. The repository is an opinionated production starter
and a readable framework kit: a useful application runs immediately, while
each subsystem also demonstrates the preferred way to model contracts, access
Postgres, call AI APIs, execute background work, stream agent events, manage
frontend state, and protect architectural boundaries.

The template must contain no concepts inherited from either source product. Its
only example domain is the product the template itself demonstrates: projects,
tasks, conversations, agent runs, tools, approvals, and artifacts.

## Goals

- Make the preferred implementation path obvious to both humans and coding
  agents.
- Use Effect 4, Effect Schema, services, layers, scopes, streams, typed errors,
  and observability idiomatically.
- Provide deep public interfaces whose implementation details remain optional
  reading.
- Demonstrate complete CRUD, transactional writes, cached reads, streaming,
  jobs, retries, cancellation, and failure recovery.
- Include an AI package that demonstrates current AI API best practices through
  Effect, with OpenAI Responses as the first production adapter.
- Include both a reusable worker package and a runnable worker application.
- Ship production-shaped container images, a complete local Docker Compose
  environment, a reusable Helm chart, and an Amazon EKS deployment reference.
- Demonstrate brokered sandbox credentials so agents can use external services
  without possessing or observing the real secrets.
- Keep provider SDK types and infrastructure details behind repository-owned
  contracts.
- Give agents compact instructions, checked recipes, structural guardrails, and
  an exact-version Effect source reference.
- Ship a deliberate Base UI and shadcn interface with first-party chat
  primitives.

## Non-goals

- A no-code framework or plugin marketplace.
- Multiple production AI, database, queue, or sandbox adapters in the first
  release.
- A generic abstraction for every implementation detail.
- A production auth vendor integration. The template defines the identity
  boundary and supplies a local-development implementation.
- Product-specific billing or analytics dashboards.

## Approaches Considered

### 1. Minimal library skeleton

This would publish interfaces and recipes without a working product. It is easy
to understand but does not prove that the pieces compose under real CRUD,
streaming, caching, and worker pressure.

### 2. Large example application

This would copy a mature application's breadth and remove its names. It offers
many examples, but inherited domain assumptions and incidental complexity would
make the architecture harder to see.

### 3. Integrated starter with an embedded framework kit — selected

The repository ships one narrow vertical product slice and the reusable
packages behind it. Every package has a small public surface, internal
implementation directory, contract tests, and a focused recipe. This provides
real evidence without turning the template into a disguised existing product.

## Repository Shape

```text
apps/
  web/                 AI-agent client
  server/              HTTP API, event stream, and agent orchestration
  worker/              Durable job execution process
packages/
  ai/                   Provider-neutral AI capabilities and OpenAI adapter
  contracts/            Cross-process Effect Schemas and HTTP/event contracts
  core/                 Projects, tasks, conversations, and agent-run use cases
  db/                   Postgres client, migrations, and internal repositories
  queue/                Durable job contracts and queue capability
  worker/               Worker runtime, handlers, retry policy, and lifecycle
  sandbox/              Provider-neutral sandbox workspace capability
  sandbox-opensandbox/  Optional OpenSandbox adapter and Credential Vault bridge
  secrets/              Host-side secret references, resolution, and redaction
  observability/        Logging, metrics, tracing, and correlation context
  config/               Schema-decoded environment configuration
  ui/                   shadcn source components and shared product components
  testing/              Test layers, fixtures, architecture checks, guardrails
examples/
  effect-recipes/       Compile-tested, focused Effect 4 examples
.agents/skills/effect/  Template-owned Effect guidance and routing
docs/
  architecture/         System boundaries and dependency rules
  patterns/             Preferred implementation patterns
  testing/              Test pyramid and guardrail inventory
scripts/                Setup, source sync, validation, and generation
```

Packages expose explicit entry points. Consumers cannot import another
package's `internal/` directory. Public modules state their inputs, outputs,
errors, invariants, and lifecycle semantics before exposing constructors or
layers.

## Interface Philosophy

An interface is more than a TypeScript type. It includes ordering, atomicity,
error behavior, ownership, lifecycle, performance expectations, and
observability. Public APIs should let a reader understand what a capability
does without opening its implementation.

Use `Context.Service` for real capabilities: external authority, lifecycle,
resource ownership, test substitution, or provider variability. Keep pure
domain logic as ordinary functions. Layers may remain internal when callers do
not need to assemble or replace them.

The default package pattern is:

```text
src/
  index.ts             Deliberate public exports
  service.ts           Public capability and typed errors
  model.ts             Public schemas and branded identifiers
  internal/            SQL, SDK mapping, orchestration, and helpers
  live.ts              Production layer when callers must assemble it
  test.ts               Test layer when useful to consumers
```

The deletion test applies: if an implementation can be removed and replaced
without changing consumers, the seam is meaningful. The template does not
publish interfaces for helpers that have no authority or realistic reason to
vary.

## Effect 4 Truth Chain

All Effect packages use one exact catalog version. The lockfile is the version
authority. Agent guidance follows this lookup order:

1. installed package declarations and types;
2. installed `node_modules/effect/src` source;
3. a gitignored exact-version source checkout created by
   `pnpm effect:reference:sync`;
4. current upstream documentation for concepts not established locally.

The sync script must derive the version rather than carrying a second manually
maintained version string. Guardrails fail if the cached checkout metadata does
not match the installed version when that cache exists.

The repository does not vendor upstream skill trees. It folds the useful Effect
guidance into a template-owned skill with focused references for schemas,
errors, services and layers, data access, transactions, HTTP contracts,
workers, concurrency, runtime/configuration, testing, and review. Recipes under
`examples/effect-recipes` compile and run in CI so guidance cannot silently
drift.

## Application Model

The example product contains these generic records:

- `Project`: owns context, conversations, tasks, and artifacts.
- `Task`: a user- or agent-created unit of work with an explicit lifecycle.
- `Conversation`: an ordered set of user, assistant, tool, and system entries.
- `Message`: a stable envelope for one conversation turn.
- `MessagePart`: typed text, reasoning summary, attachment, tool call, tool
  result, or status content belonging to a message.
- `AgentRun`: one resumable execution associated with a project, conversation,
  and optionally a task.
- `AgentRunEvent`: the ordered, replayable event log for a run.
- `AgentRunCommand`: an idempotent admitted input waiting to be executed.
- `ApprovalRequest`: a durable decision gate for a proposed side effect.
- `Artifact`: an addressable output produced by an agent or tool.
- `Job`: durable worker work with attempts, scheduling, and terminal state.
- `AgentProfile`: model choice, instructions, step budget, and permission rules.

Identifiers are branded strings. Persistence and transport records are decoded
with Effect Schema. State transitions are pure functions and reject invalid
transitions with narrow tagged errors.

The starter demonstrates project and task CRUD, starting/cancelling an agent
run, streaming its events, approving a tool, and observing a worker-owned task
reach a terminal state.

Messages and parts are separate because a turn is not merely text. Tool calls,
attachments, bounded reasoning summaries, and completion metadata need stable
identities and independent lifecycle states. Tool parts use a tagged state
union (`proposed`, `awaiting-approval`, `running`, `completed`, `failed`) rather
than optional-field combinations.

## Data Access and Transactions

Postgres is the production database. `packages/db` owns migrations and the
Effect SQL implementation. SQL details remain internal to the package that
owns the use case; application callers depend on deep use-case interfaces, not
table repositories.

Rules:

- Decode database output before it enters the application model.
- Use explicit column lists and stable projections.
- Keep reads and writes distinct in implementation modules.
- Express expected absence and conflicts as tagged domain errors.
- Map unexpected driver failures once at the infrastructure boundary.
- Use one transaction for state changes that must become visible together.
- Write the durable job and the state/event that announces it in the same
  transaction.
- Make externally retried commands idempotent with caller-provided command IDs
  or uniqueness constraints.
- Never perform network calls while holding a database transaction open.

The test suite contains repository-level Postgres integration tests plus fast
application tests using controlled test layers. Local Postgres is started by
Docker Compose, but non-database package tests and static guardrails do not
require Docker.

## AI Package

`packages/ai` is a first-class teaching package, not a thin SDK re-export. Its
public surface is provider-neutral and uses repository-owned schemas:

- `AiModel.stream(request)` returns a scoped Effect stream of normalized
  `AiModelEvent` values.
- `AiModel.generateObject(request, schema)` returns schema-decoded structured
  output or a typed generation/decoding error.
- `AiTool` pairs a name and description with Effect Schema input/output and an
  Effect handler.
- `AiModelConfig` owns the selected model, token limits, reasoning settings,
  storage policy, and safe metadata.
- `ModelRef` contains provider ID, model ID, and an optional named variant.
- `ModelCapabilities` records supported input/output modalities, tool support,
  context/output limits, and lifecycle status without exposing provider SDK
  objects.

The OpenAI adapter uses the Responses API and remains under
`packages/ai/src/internal/openai`. It demonstrates:

- typed semantic streaming events rather than untyped text chunks;
- strict function definitions generated from Effect Schema;
- tool calls correlated with outputs by `call_id`;
- Structured Outputs through `text.format`, followed by local schema decoding;
- explicit conversation-state choice instead of accidental SDK history;
- `store: false` as the template default, configurable when hosted state is
  intentionally selected;
- timeout and interruption propagation through Effect scopes;
- retry only for classified transient failures, with bounded exponential
  backoff, jitter, and `Retry-After` support;
- provider request IDs, model, latency, token usage, and finish status recorded
  without logging prompts, secrets, reasoning, or raw private content;
- provider errors decoded into a small `AiError` union while retaining safe
  diagnostic metadata;
- a deterministic fake adapter for unit tests and UI fixtures;
- live tests behind an explicit environment flag so ordinary CI never spends
  tokens.

No OpenAI SDK type crosses the package boundary. The server and worker consume
`AiModel`; the web client consumes only `AgentRunEvent` contracts.

The adapter is grounded in the current official Responses guidance for
[streaming](https://developers.openai.com/api/docs/guides/streaming-responses),
[tools](https://developers.openai.com/api/docs/guides/tools), and
[conversation/tool migration semantics](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## Agent Execution and Event Protocol

Starting a run follows this sequence:

1. The server validates the command with Effect Schema.
2. A transaction admits an idempotent run command, creates the run, appends its
   first event, and enqueues a job.
3. The worker claims the job and executes the agent program.
4. The AI adapter emits normalized model events.
5. The orchestrator executes read-only tools immediately and persists approval
   requests before side-effecting tools.
6. Every durable run event receives a monotonic per-run sequence number.
7. The server streams persisted events and can resume from the last sequence
   observed by the client.
8. Completion, failure, or cancellation updates the run, task when linked, job,
   and terminal event consistently.

`AgentRunEvent` is a versioned `Schema.TaggedUnion` containing at least:

- run started and status changed;
- assistant content delta and content completed;
- tool proposed, approval requested, approval resolved, tool result;
- artifact created and task updated;
- run completed, failed, and cancelled.

Every event has a run ID, timestamp, and protocol version. Durable events also
have a monotonic aggregate sequence. Consumers must ignore explicitly
documented additive event fields but reject unsupported protocol versions.

The protocol distinguishes durable semantic events from live-only fragments:

- `assistant.text.delta`, `reasoning.delta`, and streamed tool-input fragments
  are transient delivery events. They improve immediacy but are not persisted
  individually.
- `assistant.text.completed`, completed reasoning summaries, parsed tool calls,
  bounded tool progress checkpoints, approval changes, tool results, usage,
  and terminal run states are durable events.
- Durable events carry aggregate ID, aggregate sequence, and event-schema
  version. Event definitions are registered in one schema inventory.
- Reconnect first loads the current projection and durable events after the
  client's last durable sequence. It never depends on replaying every token
  delta.

This keeps the durable log compact while ensuring that a dropped connection can
always reconstruct a correct transcript. Current run status, messages, parts,
usage, and tool state are projections of durable events; project/task CRUD
remains conventional transactional state rather than becoming event sourced.

## Permission Policy

Tool safety is expressed as data. An `AgentProfile` owns ordered permission
rules with an action, resource pattern, and effect (`allow`, `deny`, `ask`). The
last matching rule wins, allowing a broad default followed by narrow overrides.

An approval response is `once`, `always`, or `reject`. `always` creates a
session-scoped approval rule; it does not silently change repository or user
configuration. Rejecting one approval fails that tool call with typed feedback
and cancels other pending approvals that cannot safely continue.

Permission requests include the run, message, tool call, action, affected
resources, and safe structured metadata. Approval is evaluated before executing
the side effect, and both the request and decision are durable events.

## Worker Package and Application

`packages/worker` provides the reusable runtime: handler registration, typed job
decoding, claim/heartbeat behavior, concurrency limits, retry classification,
graceful shutdown, and observability. `apps/worker` assembles live layers and
registers the template's agent-run handler.

Handlers receive decoded job payloads and return Effect programs. They do not
read process environment variables, create database pools, or instantiate SDK
clients. Those resources are layer-owned and scoped to the process lifecycle.

The worker demonstrates:

- at-least-once execution with idempotent handlers;
- bounded concurrency rather than unbounded `Promise.all`;
- cooperative cancellation and lease loss;
- retryable versus terminal tagged failures;
- dead-letter visibility;
- graceful shutdown that stops claims before interrupting active work.

## Sandbox Boundary

Sandbox support is provider-neutral and capability-based. The public
application interface is `SandboxWorkspace`, with operations for executing a
command, reading/writing files, exposing an endpoint, and terminating the
workspace. Lower-level lifecycle, command, filesystem, network, snapshot, and
metrics details stay internal unless a second adapter makes the seam real.

The default implementation is a safe local fake/process adapter for tests and
development. `packages/sandbox-opensandbox` supplies an optional production
adapter that maps OpenSandbox's control-plane, data-plane, network-policy, and
Credential Vault APIs without changing agent orchestration or leaking vendor
IDs. Command output is streamed, cancellation-aware, size-limited, and
represented with tagged exit and transport errors.

## Secrets and Sandbox Credential Brokering

`packages/secrets` owns host-side secret references and resolution. Application
records persist a `SecretRef` containing a provider, identifier, and optional
version; they never persist the resolved value. The starter supplies an
environment-backed local resolver and a deterministic test resolver. Cloud
vault adapters can be added later without changing sandbox or tool contracts.

Resolved values are short-lived scoped resources. Their wrapper has redacted
inspection and serialization behavior, and APIs expose values only through a
scoped callback. No public command, event, error, metric, span, cache key, or
database model accepts a raw secret string.

For OpenSandbox, `SandboxCredentialBroker` resolves approved `SecretRef` values
on the trusted host and writes them to OpenSandbox Credential Vault. The
sandbox process receives an empty or fake environment value when a CLI requires
one. The egress sidecar injects the real credential only when an outbound HTTPS
request matches a declared binding. The OpenSandbox control-plane credential is
separate application infrastructure configuration: it remains on the trusted
server and is never exposed to a sandbox, model, tool argument, or credential
binding.

Bindings are repository-owned schemas with:

- scheme, host, method, and narrow path matchers;
- `bearer`, `basic`, `apiKey`, `customHeaders`, or substitution-only auth;
- exact placeholder substitution restricted to selected path, query, header,
  or body surfaces;
- the `SecretRef` values needed by that binding;
- an owning tool/action and human-readable purpose.

The secure default is fail-closed:

- sandbox egress uses `defaultAction="deny"`;
- every credential host is explicitly allowlisted;
- bindings use HTTPS and the narrowest practical method/path scope;
- ambiguous matches are rejected;
- broker activation fails when the OpenSandbox runtime lacks the required
  credential-proxy, egress interception, or transport-security capability;
- real secrets are never placed in sandbox environment variables, command
  arguments, files, metadata, or snapshots;
- Credential Vault state is not considered part of a sandbox snapshot and is
  re-established from references after resume;
- credentials are deleted when a run terminates and patched when a reference is
  rotated;
- tool permission approval occurs before credential binding installation.

Credential access is server-authored. The model or sandbox may request a named
tool, but it cannot select arbitrary secret references or widen a binding. UI,
events, and audit records show the reference name, target host, action, and
outcome only. They never expose the value.

The local fake broker records binding metadata and simulates upstream injection
without placing plaintext inside the fake sandbox. Its contract suite is shared
with the OpenSandbox adapter.

The OpenSandbox integration is grounded in the current
[Credential Vault guide](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/guides/credential-vault.md),
which keeps real credentials in the egress sidecar and injects them into matched
outbound requests, plus the project's
[control-plane/data-plane architecture](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture.md).

## Server

`apps/server` is the authoritative HTTP process. It assembles configuration,
observability, database, queue, AI, sandbox, and application layers. It exposes
versioned endpoints for project/task CRUD, conversations, run commands,
approvals, and resumable server-sent events.

HTTP request, response, path, and query shapes come from `packages/contracts`
Effect Schemas. Handlers should read like orchestration: decode, authorize,
call one application capability, and encode. They do not contain SQL, provider
SDK calls, or frontend-specific view logic.

## Frontend

`apps/web` is a Vite React client organized around projects, tasks, and an agent
conversation. State ownership is explicit:

- TanStack Query owns remote cache, request deduplication, freshness,
  invalidation, optimistic mutations, and reconciliation.
- Effect owns schema decoding, typed API programs, runtime services,
  cancellation, and tracing.
- XState owns only workflows with meaningful phases and invalid transitions:
  active agent run, approval flow, reconnect/resume, and cancellation.
- React owns transient presentation state.

SSE events update the TanStack Query cache through one event projector. The
XState machine coordinates workflow state but does not duplicate cached server
entities. Query keys and invalidation are centralized by feature.

## UI System

Base UI is the primitive foundation. shadcn-generated source lives in
`packages/ui`; applications import these owned components instead of importing
Base UI directly. A structural guardrail rejects raw Base UI imports outside
`packages/ui`.

The conversation uses shadcn's first-party `MessageScroller`, `Message`,
`Bubble`, `Attachment`, and `Marker` components. `MessageScroller` owns complex
scroll behavior but not messages, transport, persistence, or AI state. Agent
event view models are mapped into these components without provider types.
The source reference is the
[June 2026 chat-components release](https://ui.shadcn.com/docs/changelog/2026-06-chat-components).

AI Elements may be adopted individually when a component supplies meaningful
behavior not present in the first-party primitives. It is not the architectural
foundation and may not introduce provider SDK types into application contracts.

## DESIGN.md Contract

`apps/web/DESIGN.md` is the machine-readable visual contract. It contains a
complete neutral default—tokens, typography, spacing, shape, motion,
accessibility, component rules, responsive behavior, and banned patterns—so a
new repository is deliberate rather than blank.

The template pins `@google/design.md` and provides `pnpm design:lint`. The
command is part of `scripts:lint`, which is part of root `guardrails` and CI. A
meta-guardrail test fails if this chain is removed. A repository-owned drift
test checks important `DESIGN.md` tokens against the runtime CSS theme.

`AGENTS.md` routes material visual work to `DESIGN.md`. When a visual change
alters tokens or durable component language, code and the design contract change
together.

## Agent Guidance

The repository's agent system has three layers:

1. `AGENTS.md`: short routing table, invariants, commands, and definition of
   done.
2. `.agents/skills/*`: focused workflows and references, owned by the template.
3. Compile-tested examples and package tests: executable truth.

The Effect skill incorporates and reorganizes useful upstream guidance rather
than vendoring another repository. Additional focused skills cover feature
delivery, architecture review, database changes, worker jobs, AI integration,
frontend state, and UI work.

Agent instructions emphasize reading public interfaces first, opening internal
implementations only when necessary, using the exact installed Effect source,
and proving changes with focused tests plus root guardrails.

## Guardrails

`pnpm guardrails` is the broad local confidence command. It includes:

- agent instruction and skill consistency checks;
- `DESIGN.md` lint and design-token drift tests;
- formatting and Oxlint;
- custom TypeScript-AST structural rules;
- architecture import-boundary tests;
- unused file/dependency checks;
- typecheck and build as separate gates;
- package tests and invariant tests;
- compile/run checks for Effect recipes.

Custom structural rules include:

- no imports from another package's `internal/` directory;
- no provider SDK imports outside their adapter directories;
- no raw Base UI imports outside `packages/ui`;
- no process environment reads outside `packages/config` and app entrypoints;
- no unvalidated `unknown` crossing transport, database, queue, or AI seams;
- no production `as never` or broad defect swallowing;
- no direct database or AI client construction in handlers.

Guardrail documentation labels claims as `lint`, `types`, `invariant-test`,
`architecture`, or `manual-review`; a check rejects unknown or unsupported
enforcement claims.

## Testing Strategy

- Pure state transitions and schema transformations use fast unit tests.
- Every public capability has contract tests that run against its test layer and
  production adapter where practical.
- Postgres behavior has focused integration tests covering transactions,
  uniqueness/idempotency, ordering, and concurrent claims.
- Secret-broker contract tests use canary values and prove they are absent from
  sandbox environment, commands, files, events, errors, logs, snapshots, and
  persisted records while the matched mock upstream receives the credential.
- Sandbox security tests prove that unmatched hosts, paths, methods, ambiguous
  bindings, and missing credential-proxy capabilities fail closed.
- The OpenAI adapter uses recorded protocol fixtures for decoding and event
  mapping; live tests are opt-in.
- Worker tests cover retries, cancellation, lease loss, concurrency, and
  shutdown.
- Server tests exercise schema rejection, error encoding, authorization, and
  SSE resume.
- Web tests exercise Query projection and XState transitions independently,
  then cover the complete mocked run/approval flow.
- One browser smoke test proves project creation, task creation, agent run,
  streamed tool approval, and completion using the deterministic fake AI layer.

Tests avoid timing sleeps. Test clocks, deferred synchronization, deterministic
IDs, and controlled layers make concurrency behavior explicit.

## Error Handling and Observability

Expected failures are small `Schema.TaggedError` unions owned by the boundary
that can resolve them. Defects are logged once with correlation context and
converted to a safe transport error at the outer boundary.

Project, task, conversation, run, job, provider request, and HTTP request IDs
propagate through Effect log annotations and spans. Logs are structured and
redact secrets and content by default. Metrics cover request duration, AI
latency and usage, active runs, queue depth, job attempts, retries, approvals,
and terminal outcomes.

## Configuration and Local Development

Environment input is decoded once in `packages/config` using Effect Schema.
Apps consume typed configuration services. `.env.example` contains safe local
defaults and no secret-shaped placeholders that look real.

The default local path runs with Docker Compose Postgres and a deterministic AI
adapter, so no API key is required. Setting `AI_PROVIDER=openai` and
`OPENAI_API_KEY` selects the live adapter. Setup, migration, development, test,
and guardrail commands are available from the repository root.

Docker Compose runs Postgres, migrations, server, worker, and web with health
checks and persistent database storage. The same application images are used by
the Helm chart. The chart supports separate server and worker scaling, ingress,
autoscaling, disruption budgets, network policies, externally managed secrets,
and EKS Pod Identity annotations. It does not provision an EKS cluster or a
production Postgres service; documented Terraform/eksctl-neutral prerequisites
keep infrastructure ownership explicit. OpenSandbox may run beside the chart
through its upstream Kubernetes controller, while this chart configures the
application's adapter endpoint and credentials.

## OpenCode Reference Decisions

The design was checked against the public OpenCode repository at commit
`ef3b67308411614b7a08c2ac81931d930e22c835` on 2026-07-16:
<https://github.com/anomalyco/opencode>.

Decisions adopted in template form:

- branded, schema-decoded IDs and records at every process boundary;
- a session/conversation containing ordered messages whose assistant content is
  a tagged union of text, bounded reasoning, and tool parts;
- tool lifecycle represented by explicit tagged states;
- a versioned event-definition inventory with aggregate sequence numbers;
- live-only stream fragments paired with replayable completed-value events;
- current read models projected from semantic durable events;
- an admitted-input record separate from execution, so idempotency and queueing
  are explicit;
- provider/model references and capabilities separated from provider runtime
  objects;
- data-driven permission rules and `once`/`always`/`reject` decisions;
- request lowering kept separate from transport execution so all provider paths
  can converge on one normalized event stream.

Decisions intentionally not copied:

- filesystem/worktree/shell concepts specific to a coding agent;
- SQLite as the production persistence model;
- broad multi-provider and compatibility machinery in the initial release;
- persisting every stream fragment;
- exposing arbitrary provider request bodies as a primary application model;
- event sourcing ordinary project and task CRUD.

OpenCode is a reference, not a dependency. No source code is copied into the
template, and its public types do not become template contracts.

## Initial Acceptance Criteria

- A fresh clone can install, configure, migrate, and start web, server, and
  worker from documented root commands.
- The default fake-AI flow supports project/task CRUD and one complete streamed
  run with a tool approval and artifact.
- The OpenAI Responses adapter compiles and has fixture-backed tests without
  requiring a key.
- Public package exports contain no OpenAI, Postgres driver, queue driver,
  sandbox vendor, or Base UI types.
- The local fake and OpenSandbox credential brokers pass the same contract
  suite; canary secrets never appear in sandbox-visible or persisted surfaces.
- `pnpm guardrails` verifies design lint, instructions, skills, structure,
  formatting, lint, types, builds, tests, and recipes.
- The Effect source reference script resolves exactly the installed version and
  writes only to a gitignored cache.
- Documentation contains no concepts inherited from the source products.
- The repository is ready to mark as a GitHub template after replacing only
  repository ownership metadata.

## Implementation Order

This master design is delivered as eight milestone commits. Each milestone must
leave its completed slice green; later milestones consume only committed public
interfaces from earlier ones.

1. Repository skeleton, toolchain, Effect truth chain, and guardrail harness.
2. Contracts, configuration, observability, database, and generic CRUD.
3. AI package with fake and OpenAI Responses adapters.
4. Queue and worker package/application with durable agent-run jobs.
5. Server HTTP/SSE endpoints and approval orchestration.
6. Web state architecture and shadcn/Base UI conversation interface.
7. Sandbox boundary, secret resolver, OpenSandbox Credential Vault adapter,
   end-to-end fake flow, documentation, and final hardening.
8. Container images, complete local Docker Compose, Helm chart, EKS reference,
   deployment validation, and template release documentation.
