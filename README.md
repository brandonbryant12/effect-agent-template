# Effect Agent Template

A batteries-included, opinionated TypeScript template for CRUD applications that also run long-lived AI agents. The example domain—projects, tasks, conversations, and agent sessions—is deliberately generic. Replace it while keeping the interfaces, dependency direction, durable command model, and security boundaries.

## Run it

Requirements: Docker Desktop. For host development, also install Node 26 and pnpm 10.23.

```bash
docker compose up --build
```

Open <http://localhost:5173>, create an account, add a project, and run a prompt. Local mode uses a deterministic runtime, so it needs no AI or sandbox credentials. Postgres is exposed at `localhost:5433`; the API is at `localhost:3000`; the write-only credential broker is at `localhost:3001`.

To work on source with only Postgres in Docker:

```bash
docker compose up -d postgres
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

Validate the same contracts CI enforces:

```bash
pnpm guardrails
pnpm build
pnpm infra:check
```

## What is included

- Effect 4 services, Layers, Schema contracts, typed failures, recipes, and a pinned source-reference workflow.
- Better Auth with browser cookies and OAuth Device Authorization for the CLI, behind repository-owned interfaces.
- A React workbench using TanStack Query for server state and XState for client workflow state.
- shadcn source components, AI Elements source components, and Base UI isolated behind `packages/ui`.
- Durable Postgres admission, event history, approvals, cancellation, leases, retries, and worker processes.
- A provider-neutral `AgentRuntime`, a direct Effect/OpenAI Responses example, and pinned OpenCode SDK/CLI adapters.
- One OpenSandbox workspace per agent session, default-deny egress, and credential-vault bindings.
- A narrow, write-only secret upload broker with memory and AWS Secrets Manager implementations.
- Non-root Docker images, complete Docker Compose development, Helm deployment, and an optional EKS Terraform baseline.
- Agent instructions, architecture checks, `DESIGN.md` drift linting, Effect recipes, and template/domain-leak checks.

## Repository map

```text
apps/
  server/             public application and Better Auth API
  web/                browser client and design system
  cli/                device-authenticated terminal client
  worker/             durable jobs and runtime ownership
  credential-broker/  write-only secret ingress
packages/
  contracts/          Effect Schema protocol and domain values
  core/               readable application service interfaces
  db/ queue/           Postgres adapters and leases
  client/ client-react shared transport and Query integration
  agent-runtime/       provider-neutral agent port and deterministic fake
  agent-runtime-opencode/ OpenCode adapter
  sandbox/ sandbox-opensandbox/ isolation ports and adapter
  secrets/ ai/ auth/ ui/ config/ observability/
examples/effect-recipes/ focused idiomatic Effect examples
deploy/               Helm and optional EKS Terraform
```

Start with [architecture](docs/architecture.md), [security](docs/security.md), and [adoption](docs/adoption.md). Deployment details are in [deployment](docs/deployment.md); live agent setup is in [OpenCode and OpenSandbox](docs/opencode-opensandbox.md).

## Template philosophy

Public interfaces should read like the application. Adapters should contain vendor and protocol detail. Decode data at every boundary. Use transactions for a state change and its durable work record. Never hand credentials or runtime connection material to a client. Keep deterministic implementations strong enough to test complete behavior without network access.

See [AGENTS.md](AGENTS.md) before changing code and [apps/web/DESIGN.md](apps/web/DESIGN.md) before changing the interface.
