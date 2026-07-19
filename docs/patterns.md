# Canonical Implementation Patterns

This file is the tie-breaker. When two styles seem plausible, use the one
written here. Every rule below is either enforced by `pnpm guardrails`
(marked **enforced**) or verified by review (marked **review**).

The reasoning behind each rule lives in [docs/decisions.md](decisions.md)
("why §N" below). Read the matching entry before arguing with a rule or
extending one — the rationale states what would have to be true for the
decision to change.

## Package anatomy

```text
src/
  index.ts        deliberate public exports only
  service.ts      Context.Service capability + its tagged errors
  model.ts        public schemas and branded identifiers
  errors.ts       cross-cutting errors shared by several services
  live.ts         barrel of every production layer in the package
  internal/       SQL, SDK mapping, and helpers (one *-live.ts per service)
  test.ts         deterministic in-memory implementation
```

- Every production `Layer` lives in `internal/<name>-live.ts` and is exported
  through `live.ts`. Interface files never contain implementation (why §1).
- No file imports another package's `internal/` path (**enforced**).
- Deterministic doubles (`*Test`, `*Fake`, `make*Test`) are real providers:
  local development selects them through `AppConfig` (`AI_PROVIDER=fake`,
  `SANDBOX_PROVIDER=fake`). They ship from the public barrel on purpose.

## Domain services (packages/core)

Declare capabilities as `Context.Service` classes (why §2) and errors as
`Schema.TaggedErrorClass` (why §3):

```ts
export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "ProjectNotFound",
  { projectId: ProjectIdSchema },
) {}

export class ProjectService extends Context.Service<
  ProjectService,
  {
    readonly get: (
      scope: AccessScope,
      id: ProjectId,
    ) => Effect.Effect<Project, ProjectNotFound | PersistenceError>;
  }
>()("repo/ProjectService") {}
```

- Cross-cutting errors (`PersistenceError`) live in `errors.ts`, never inside
  one domain's service file.
- Raw SQL belongs in data-access modules (why §9): `packages/db`,
  `packages/queue/src`, or a package's `internal/*-live.ts` (**enforced**).
  When an app file genuinely must issue SQL (a readiness probe, an app-owned
  port binding), annotate the file with
  `// architecture-allow: raw-sql -- <reason>` so the exception is visible
  and justified.
- Decode every row leaving SQL with `Schema.decodeUnknownEffect`; normalize
  `Date` columns with `normalizeTimestamps` from `internal/sql-helpers.ts`
  instead of writing a new inline converter.
- Live layers take time from the Effect Clock (why §10) — use `nowTimestamp` from
  `internal/sql-helpers.ts` (core) or a local `Clock.currentTimeMillis`
  mapping — never `new Date()` / `Date.now()` (**enforced**; escape hatch:
  `// architecture-allow: wall-clock -- <reason>`). Test layers keep fixed
  ISO strings, and TestClock can now drive Live layers deterministically.

## Provider ports and adapters

Ports that wrap an external system (`AiService`, `SandboxWorkspace`,
`AgentRuntime`, `SecretStore`) are plain interfaces with `make*` factories —
they are constructed and wired explicitly in app entrypoints, not resolved
from the Effect context (why §2, §8). When adding a provider:

1. The port package owns the interface, repository schemas, and one tagged
   error union with an `operation`, `reason`, and `retryable` field.
2. The adapter lives in a dedicated package (`sandbox-opensandbox`,
   `agent-runtime-opencode`) or behind a deliberate subpath export
   (`@repo/ai/openai`). Provider SDK imports stay inside the adapter
   (**enforced**).
3. Decode every SDK response with a repository schema before it crosses the
   port boundary. No SDK type appears in a port signature (**review**).
4. Map SDK failures into the port's tagged error and preserve the
   distinguishing reason; do not collapse everything to `unavailable`.
5. Ship a deterministic double next to the port (`test.ts`) that implements
   the same interface without processes or network.

## HTTP surface

`ApiRoutes` in `packages/contracts/src/http.ts` is the single authority for
the public API (why §5): method, path template, branded param schemas, request and
response schemas, and success status. The server router iterates the table
and dispatches to an exhaustive handler map; the Effect client builds every
request from the same definitions. To add an endpoint:

1. Add request/response schemas to the owning `packages/contracts` module.
2. Add the route to `ApiRoutes` — the server now fails to compile until a
   handler exists in `apps/server/src/api.ts` (`RouteHandlers` is keyed by
   `RouteName`).
3. Write the handler: it receives schema-decoded `params` and `body`.
4. Add a client method in `packages/client/src/client.ts` using
   `buildPath(ApiRoutes.<name>, params)` and the route's schemas, and expose
   it through the Promise facade (`promise.ts`).
5. Add an `errorStatus` entry in `apps/server/src/api.ts` for every new
   tagged error the handler can surface. Unknown tags intentionally become 500.
6. Add a query/mutation option factory in `packages/client-react` when the
   web app consumes the endpoint.

`packages/contracts/test/http.test.ts` guards table integrity (param/token
agreement, no duplicate method+path, matcher round-trips).

## Configuration

- `process.env` is read only in `packages/config` and app `main.ts`
  entrypoints (**enforced**).
- `decodeAppConfig` throws on invalid boot configuration by design (why §7):
  a config error must kill the process before any listener starts. Everything after
  boot receives the typed `AppConfig` value.

## Frontend state

- TanStack Query owns remote state; query keys and option factories live in
  `packages/client-react`.
- XState owns only real workflows (active run, approval, reconnect).
- Base UI is imported only inside `packages/ui`; `radix-ui`/`cmdk` only
  inside the vendored `apps/web/src/components/ui/` directory or
  `packages/ui` (**enforced**).
- Visual tokens come from `apps/web/DESIGN.md` (why §15), are declared as Tailwind
  `@theme` colors in `src/styles.css`, and are used as named utilities
  (`text-blueprint`, `border-line`). Hex literals in non-vendored web code
  are rejected (**enforced**), and `src/design-tokens.test.ts` fails when
  DESIGN.md and the CSS theme drift apart. Update the contract and the code
  in the same change.

## Testing

- Unit tests use vitest with `Effect.runPromise(Effect.provide(program,
TestLayer))` and the deterministic doubles; no timing sleeps (why §12).
  Control time with `TestClock` from `effect/testing`
  (`packages/core/test/clock.test.ts` is the reference).
- Postgres integration suites self-skip unless `DATABASE_URL` is set; CI
  always runs them.
- `pnpm guardrails` is the definition of done (why §14). Do not claim it
  passed without running it.

## Known deferred work

These are accepted gaps — do not "fix" them incidentally, and do not copy
them into new code as precedent:

- Provider ports may later move onto `Context.Service` layers for symmetric
  wiring with `packages/core` (see decisions §2 for when).
- The shared `@repo/node-http` bridge may later be replaced by
  `@effect/platform` HttpServer once it stabilizes (decisions §6).
