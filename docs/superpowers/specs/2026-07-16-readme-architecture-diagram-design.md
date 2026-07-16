# README Architecture Diagram Design

**Status:** Approved

**Date:** 2026-07-16

## Purpose

Add one GitHub-rendered Mermaid diagram to the README that explains both the
monorepo's package boundaries and the end-to-end runtime flow. A reader should
understand the system before following links into the detailed architecture and
security documents.

## Selected approach

Use one layered flowchart rather than separate runtime and package diagrams.
The layers are:

1. browser and CLI clients;
2. shared client, contracts, and application interfaces;
3. server-side API, authentication, persistence, queue, and credential ingress;
4. worker-owned agent execution;
5. external Postgres, secret-store, OpenSandbox, OpenCode, and AI-provider
   infrastructure.

The diagram will use repository paths in node labels where doing so identifies
ownership. Edges will carry short protocol or responsibility labels instead of
duplicating explanations below the diagram.

## Security and ownership cues

- Browser and CLI requests converge through `packages/client` and
  `packages/contracts`.
- The application server admits work and persists durable state; it does not run
  agent sessions itself.
- The credential value travels directly from a client to the write-only broker,
  while metadata and upload-token issuance travel through the server.
- The worker is the only application process that controls the per-session
  sandbox and private OpenCode server.
- OpenSandbox credential bindings allow narrowly scoped upstream access without
  exposing plaintext credentials inside the sandbox.

## Placement and presentation

Place an `## Architecture` section after the introductory toolchain paragraph
and before `## Run it`. Keep the supporting prose to one sentence before the
diagram and one sentence after it linking to the detailed architecture and
security documentation. Use Mermaid's default GitHub theme and avoid custom
styling so the diagram remains readable in light and dark modes.

## Verification

- Mermaid syntax is valid and uses only GitHub-supported flowchart features.
- All named paths and ownership claims match the repository and architecture
  documents.
- Markdown formatting passes the repository guardrails.
