# Architecture

The repository uses ports and adapters with Effect Layers. A feature should be understandable by reading `packages/contracts`, then a service interface in `packages/core`, then its live adapter under `internal`. Vendor mechanics belong one level deeper and are optional reading.

## Dependency direction

```text
browser / CLI
      │ shared @repo/client contract
      ▼
server handlers ──► core service ports ──► Postgres adapters
                         │
                         └── transactional job + event admission
                                           │
                                           ▼
worker ──► AgentRuntime / SandboxWorkspace ports ──► OpenCode / OpenSandbox
```

Contracts do not import frameworks or vendors. Core application services depend on contracts. Apps assemble Layers and translate transport concerns. The architecture checker prevents Better Auth, OpenAI, OpenCode, OpenSandbox, AWS, and Base UI imports outside their owning adapters.

## State ownership

- Postgres owns users, projects, tasks, conversations, sessions, runs, commands, approvals, durable events, artifacts, jobs, and leases.
- TanStack Query owns browser server-state caches.
- XState owns ephemeral browser workflow state such as connecting, reconnecting, awaiting approval, and terminal display.
- One worker process owns interaction with a runtime session. OpenCode is an execution engine, not the business database.
- A sandbox belongs to one application `AgentSession`, not to a user or tenant.

## Write pattern

The preferred write is: decode → authenticate → authorize by scoped query → execute one application service → transactionally change state and append its command/event/job → return a schema-decoded projection. Idempotency keys are required for run admission. Workers use at-least-once jobs, so handlers and journals must tolerate retries.

## Effect style

Use `Context.Service` for capabilities, `Schema.TaggedErrorClass` for expected failures, `Layer` only at assembly boundaries, and `Effect.gen` for readable workflows. Do not construct clients inside handlers. Do not leak vendor types from exported APIs. `examples/effect-recipes` and `.agents/skills` are the executable reference; `pnpm effect:reference:sync` checks out the exact installed Effect source under ignored `.cache/effect` when deeper research is needed.

## Streaming

Run events are durable, versioned records with monotonic per-run sequence numbers. SSE is a projection of those records and accepts `Last-Event-ID`/`after` cursors. Reconnect is ordinary behavior; completion comes from a durable terminal event, not the socket closing.
