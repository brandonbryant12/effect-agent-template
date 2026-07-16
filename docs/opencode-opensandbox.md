# OpenCode and OpenSandbox

Local mode uses `SANDBOX_PROVIDER=fake`, which runs the same worker contracts with deterministic in-memory adapters. Live mode uses `SANDBOX_PROVIDER=opensandbox` and requires `OPEN_SANDBOX_API_KEY`, `OPEN_SANDBOX_DOMAIN`, and an image containing the pinned OpenCode CLI.

The CLI and SDK versions are kept identical in `packages/agent-runtime-opencode/src/config.ts`. The worker creates one OpenSandbox workspace for the application session, starts `opencode serve` inside it with a random password, exposes its private endpoint, creates an OpenCode session through the official SDK, sends prompts asynchronously, maps decoded runtime events into repository-owned events, and handles approvals/cancellation through worker control jobs.

Build a sandbox image from your hardened base with Node, Git, project tooling, and:

```bash
npm install --global opencode-ai@1.18.3
```

Set `OPEN_SANDBOX_ALLOWED_HOSTS` to the minimum host list required by the chosen model providers and source-control integrations. A host allowlist only permits network reachability; credentials still require an exact vault binding for scheme, host, method, path, and auth injection.

OpenCode session state is not authoritative. If the runtime disappears, Postgres still has admission, approvals, status, and event history. A production recovery policy should explicitly choose whether to reprovision and replay safe commands or fail the run for operator retry.
