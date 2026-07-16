# Effect Agent Template Design

**Status:** Approved architecture; revised implementation handoff

**Date:** 2026-07-16

## Summary

Build a public GitHub template for an AI-agent product using Effect 4 as the
application foundation. The repository is an opinionated production starter
and a readable framework kit: a useful application runs immediately, while
each subsystem also demonstrates the preferred way to model contracts, access
Postgres, authenticate browser and CLI clients, call AI APIs, execute background
work through OpenCode in isolated sandboxes, stream agent events, manage
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
  Effect, with OpenAI Responses as the direct-API reference adapter.
- Use OpenCode's headless server and official SDK as the default agent runtime
  instead of implementing a second model/tool/session harness.
- Ship one transport-neutral client SDK used by both a browser application and
  a terminal CLI.
- Use Better Auth for browser sessions, CLI device authorization, and bearer
  authentication at the public API boundary.
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
- Organization management, organization selection, or organization-owned
  credentials in the first release. The server retains one internal default
  tenant identifier without exposing it in the client API.
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

For agent execution, three runtime approaches were evaluated inside this
starter: a custom model/tool loop, parsing `opencode run` terminal output, and a
private `opencode serve` process controlled through the official SDK. The
server/SDK approach is selected because it provides structured sessions,
messages, event streaming, permissions, cancellation, compaction, and provider
support without making terminal output an application protocol. A
repository-owned Effect interface prevents OpenCode from becoming the public
application contract.

## Repository Shape

```text
apps/
  web/                 AI-agent client
  cli/                 Terminal client using the same public SDK
  server/              Multi-client HTTP API, auth, and event stream
  credential-broker/   Narrow write-only secret ingestion process
  worker/              Durable job execution process
packages/
  ai/                   Direct-AI Effect recipes and OpenAI Responses adapter
  agent-runtime/        Provider-neutral agent session capability
  agent-runtime-opencode/ OpenCode server/SDK production adapter
  auth/                 Better Auth server, browser, CLI, and Principal boundary
  client/               Transport-neutral Effect SDK and Promise facade
  client-react/         TanStack Query options and React-specific bindings
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
- `AgentSession`: one authenticated, isolated runtime context that maps to one
  sandbox and one OpenCode session for its lifetime.
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
session and run, streaming its events, approving a tool, and observing a
worker-owned task reach a terminal state.

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

`packages/ai` is a first-class direct-API teaching package, not the default
agent orchestrator and not a thin SDK re-export. Its public surface is
provider-neutral and uses repository-owned schemas:

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

No OpenAI SDK type crosses the package boundary. Focused examples and opt-in
applications may consume `AiModel`; the default worker consumes
`AgentRuntime`. Browser and CLI clients consume only repository-owned session,
run, and event contracts.

The adapter is grounded in the current official Responses guidance for
[streaming](https://developers.openai.com/api/docs/guides/streaming-responses),
[tools](https://developers.openai.com/api/docs/guides/tools), and
[conversation/tool migration semantics](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## OpenCode Agent Runtime

`packages/agent-runtime` defines the stable Effect capability used by the
worker. Its public operations create or resume a session, submit a prompt,
stream normalized events, answer a permission request, cancel active work, and
close the runtime. It exposes repository-owned schemas and tagged errors only.

`packages/agent-runtime-opencode` is the production implementation. For each
application `AgentSession`, the worker creates or resumes exactly one
OpenSandbox workspace, launches one password-protected `opencode serve`
process inside it, and controls it with the pinned `@opencode-ai/sdk`. The CLI
and SDK versions are identical and exact. The OpenCode server binds privately
and is reachable only through the assigned worker/control-plane connection;
neither public client can address it.

OpenCode owns provider integration, the model/tool loop, context compaction,
runtime messages and parts, tool execution, and its internal SQLite session
state. Postgres remains authoritative for users, projects, tasks, admitted run
commands, approvals, audit history, sandbox leases, and the normalized
UI-facing event projection. The adapter consumes OpenCode's event stream and
decodes and maps every event at the boundary before it becomes an
`AgentRunEvent`.

The sandbox is the security and lifecycle boundary, not the OpenCode session
ID. Sandboxes are never shared between application sessions or users. A
session sandbox may be paused and resumed for continuity, but its filesystem,
OpenCode data directory, server password, service account, network policy, and
Credential Vault state remain exclusive to that session. Termination destroys
the runtime and its live vault bindings; durable application history remains
in Postgres.

OpenCode permission requests are projected into durable `ApprovalRequest`
records. A client decision is authorized and recorded by the application
server, then the worker translates it to OpenCode's `once`, `always`, or
`reject` permission reply. The template does not operate a second independent
tool loop or parse `opencode run` output. A deterministic `AgentRuntimeTest`
implements the same contracts without starting OpenCode, a sandbox, or a paid
model.

## Agent Execution and Event Protocol

Starting a run follows this sequence:

1. The server validates the command with Effect Schema.
2. A transaction admits an idempotent run command, creates the run, appends its
   first event, and enqueues a job.
3. The worker claims the job and acquires the run's exclusive session sandbox.
4. The OpenCode runtime adapter submits the prompt and maps its event stream.
5. OpenCode executes permitted tools; permission events become durable
   application approvals before side effects continue.
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

The agent-run handler also owns the lease on one session sandbox. Losing the
job or sandbox lease interrupts the OpenCode request, records a typed runtime
failure, and prevents two workers from driving the same session concurrently.

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

The default test implementation is deterministic and process-free.
`packages/sandbox-opensandbox` supplies the production adapter that maps
OpenSandbox's control-plane, data-plane, network-policy, and Credential Vault
APIs without changing agent orchestration or leaking vendor IDs. Local Compose
may use the deterministic adapter by default and documents how to connect a
real OpenSandbox deployment. Command output is streamed, cancellation-aware,
size-limited, and represented with tagged exit and transport errors.

Every `AgentSession` owns exactly one sandbox. A new run may reuse only that
session's sandbox; no sandbox pool may cross session or user boundaries.

## Secrets and Sandbox Credential Brokering

`packages/secrets` owns host-side secret references, ingestion, and resolution.
Application records persist a `CredentialId` and `SecretRef` containing a
provider, identifier, and optional version; they never persist the resolved
value. The production adapter uses AWS Secrets Manager with KMS. The starter
also supplies a deterministic local/test store that is explicitly unsuitable
for real credentials.

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

Clients upload API keys through a two-step, one-time protocol. The public
server authenticates the Better Auth principal, validates ownership, creates a
short-lived pending upload, and returns a signed single-use upload token. The
browser or CLI then sends the redacted value over TLS to
`apps/credential-broker`, whose sensitive route has body logging and content
capture disabled, a strict size limit, `Cache-Control: no-store`, rate limits,
and generic errors. The broker writes the value immediately to `SecretStore`,
atomically consumes the upload token, and returns sanitized credential
metadata. The general API never receives the plaintext and no read-secret API
exists.

Credentials are personal in the initial release. The authenticated user and
one deployment-configured default `TenantId` are derived server-side; neither
is accepted as an authority-bearing client field. The internal tenant column
is retained for query scoping and future adoption, but organization selection
and organization-owned credentials are absent from the UI and SDK.

Starting a session accepts authorized `CredentialId` values, never raw secret
material or arbitrary secret references. The server freezes the session's
credential set, and the worker installs only the corresponding narrow bindings
into that session's Credential Vault. Attaching a credential later is an
explicit authorized operation. Revocation interrupts sessions using the
credential and removes their live bindings.

The local fake broker records binding metadata and simulates upstream injection
without placing plaintext inside the fake sandbox. Its contract suite is shared
with the OpenSandbox adapter.

The OpenSandbox integration is grounded in the current
[Credential Vault guide](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/guides/credential-vault.md),
which keeps real credentials in the egress sidecar and injects them into matched
outbound requests, plus the project's
[control-plane/data-plane architecture](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture.md).

## Authentication

Better Auth is the concrete authentication system in `packages/auth`. The
browser uses secure HttpOnly session cookies. The CLI uses Better Auth's Device
Authorization plugin: it requests a device code, opens or prints the browser
verification URL, polls at the instructed interval, and stores the resulting
signed bearer token in the operating-system keychain. The server enables the
Better Auth bearer integration with signature verification required for
non-cookie clients. Production device authorization validates registered CLI
client IDs, uses HTTPS, enforces expiration and polling intervals, and records
approval and denial audit events.

The runnable local default supports email/password sign-in without requiring
an external identity provider. Optional social-provider examples stay behind
configuration. Better Auth tables share Postgres with the application but are
accessed only through the auth package and required Better Auth hooks.

Both cookie and bearer authentication are converted into one repository-owned
`Principal`. Application use cases depend on `Principal`, `UserId`, and
authorization capabilities rather than Better Auth types. Authentication is
not authorization: every project, session, credential, approval, and event
operation is scoped to the authenticated user and internal default tenant.

## Common Client SDK and Applications

`packages/client` is the only supported public application client. It depends
on standard fetch, Effect, Effect Schema, and repository-owned contracts; it
contains no React, DOM, Node filesystem, terminal, Better Auth, OpenCode, or
OpenSandbox implementation dependency. Its Effect API exposes projects, tasks,
sessions, runs, approvals, credentials, and resumable typed event streams. A
thin Promise/`AsyncIterable` facade delegates to the same implementation.

Authentication is injected through a small client transport interface. The
browser adapter uses cookies, while the CLI adapter supplies its keychain-held
bearer token. Streaming uses fetch-based SSE rather than browser-only
`EventSource`, allowing headers, cancellation, cursors, and reconnection to
behave identically in both clients.

`packages/client-react` owns TanStack Query keys, query/mutation option
factories, and React-specific bindings. It does not duplicate HTTP logic.
`apps/web` consumes it for the graphical client. `apps/cli` consumes the core
Effect client directly for login, project/task operations, interactive agent
sessions, approvals, credential upload through hidden input, cancellation, and
event rendering. Secrets are never accepted as command-line arguments or
written to CLI configuration files.

## Server

`apps/server` is the authoritative public HTTP process. It assembles
configuration, observability, Better Auth, database, queue, and application
layers. It exposes versioned endpoints for project/task CRUD, sessions, run
commands, approvals, credential-upload intents, and resumable server-sent
events. It never proxies arbitrary OpenCode routes.

HTTP request, response, path, and query shapes come from `packages/contracts`
Effect Schemas. Handlers should read like orchestration: decode, authorize,
call one application capability, and encode. They do not contain SQL, provider
SDK calls, or frontend-specific view logic.

## Frontend

`apps/web` is a Vite React consumer of the common SDK, organized around
projects, tasks, credentials, and an agent conversation. State ownership is
explicit:

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
- Auth tests cover cookie and signed-bearer principal resolution, device-code
  expiry/denial/polling, and cross-user authorization rejection.
- Client contract tests run the same project/session/stream scenarios through
  browser-cookie and CLI-bearer transports.
- Credential-ingestion tests prove token expiry, single use, strict ownership,
  absent body logging, cleanup after partial failure, and no read-secret API.
- OpenCode adapter fixture tests cover event mapping, permission bridging,
  cancellation, server authentication, SDK/CLI version mismatch, and runtime
  loss without requiring a live provider.
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

The default local path runs with Docker Compose Postgres, Better Auth, a
deterministic agent runtime, and a deterministic secret store, so no API key or
external identity provider is required. A documented live profile connects
OpenSandbox, launches pinned OpenCode servers inside session sandboxes, and
uses uploaded provider credentials. The direct OpenAI adapter remains an
opt-in package example. Setup, migration, development, test, and guardrail
commands are available from the repository root.

Docker Compose runs Postgres, migrations, server, credential broker, worker,
CLI development tooling, and web with health checks and persistent database
storage. The same application images are used by the Helm chart. The chart
supports separate server, broker, and worker scaling, ingress route separation,
autoscaling, disruption budgets, network policies, externally managed secrets,
and distinct EKS Pod Identity roles. The broker receives write-only secret
permissions; the worker receives narrowly scoped read permissions; sandbox
service accounts receive neither. The chart does not provision an EKS cluster
or a production Postgres service. OpenSandbox runs beside the chart through
its upstream Kubernetes controller.

## OpenCode Dependency Decisions

The design was checked against the public OpenCode repository at commit
`ef3b67308411614b7a08c2ac81931d930e22c835` on 2026-07-16:
<https://github.com/anomalyco/opencode>.

The inspected implementation exposes headless serving, an official generated
SDK, async prompting, cancellation, messages, SSE events, permission replies,
and SQLite-backed session state. The template therefore adopts OpenCode as a
pinned private runtime dependency behind `AgentRuntime`, not as a public API.

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

Decisions intentionally not exposed or copied:

- filesystem/worktree/shell concepts specific to a coding agent;
- SQLite as the application persistence model; it remains OpenCode-private
  runtime state inside one session sandbox;
- persisting every stream fragment;
- exposing arbitrary provider request bodies as a primary application model;
- event sourcing ordinary project and task CRUD.

No OpenCode source code is copied into the template, and its public types do
not become template contracts. CLI and SDK versions are pinned together and
checked by configuration and adapter tests.

## Initial Acceptance Criteria

- A fresh clone can install, configure, migrate, and start web, CLI, server,
  credential broker, and worker from documented root commands.
- Better Auth supports a browser session and a CLI device-authorization login;
  both clients exercise the same transport-neutral SDK contracts.
- The default deterministic-runtime flow supports project/task CRUD and one
  complete streamed run with a tool approval and artifact.
- The production runtime adapter launches a private, password-protected
  OpenCode server in one exclusive sandbox per application session and maps its
  events and permissions into stable application contracts.
- The OpenAI Responses adapter compiles and has fixture-backed tests without
  requiring a key.
- Public package exports contain no OpenAI, Postgres driver, queue driver,
  sandbox vendor, or Base UI types.
- The local fake and OpenSandbox credential brokers pass the same contract
  suite; canary secrets never appear in sandbox-visible or persisted surfaces.
- A browser or CLI can complete the one-time credential upload flow, but cannot
  retrieve plaintext or reference another user's credential.
- `pnpm guardrails` verifies design lint, instructions, skills, structure,
  formatting, lint, types, builds, tests, and recipes.
- The Effect source reference script resolves exactly the installed version and
  writes only to a gitignored cache.
- Documentation contains no concepts inherited from the source products.
- The repository is ready to mark as a GitHub template after replacing only
  repository ownership metadata.

## Implementation Order

This master design is delivered as nine milestone commits. Each milestone must
leave its completed slice green; later milestones consume only committed public
interfaces from earlier ones.

1. Repository skeleton, toolchain, Effect truth chain, and guardrail harness.
2. Contracts, configuration, observability, database, and generic CRUD.
3. Better Auth, Principal authorization, common client SDK, and CLI/browser auth
   contract tests.
4. Direct AI package plus provider-neutral `AgentRuntime` and deterministic
   runtime fixtures.
5. Queue and worker package/application with durable agent-session/run jobs.
6. OpenCode runtime, one-sandbox-per-session lifecycle, credential ingestion,
   AWS secret store, and OpenSandbox Credential Vault bridge.
7. Server HTTP/SSE endpoints, browser and CLI flows, approval orchestration,
   and end-to-end deterministic execution.
8. Web state architecture and shadcn/Base UI conversation interface.
9. Container images, complete local Docker Compose, Helm chart, EKS reference,
   deployment validation, documentation, and final hardening.
