# Actor Graphs Design

**Status:** Approved design; ready for implementation planning

**Date:** 2026-07-19

## Summary

Users define multi-agent orchestration graphs in a visual editor and run
them durably. A graph's nodes are agent tasks (each executed as its own
`AgentSession` + `AgentRun`); edges mean "runs after". Independent branches
execute in parallel, a node with several incoming edges waits for all of
them, and downstream prompts can reference upstream outputs. Execution
reuses the existing durable machinery — idempotent admission, the job
queue, approvals, the event journal, one-sandbox-per-session isolation —
rather than introducing a second orchestration engine.

Decisions taken during brainstorming:

- Graph meaning: multi-agent orchestration (not message-routing actors,
  not per-run step pipelines, not visualization-only).
- Authoring: visual editor in `apps/web`; the editor reads and writes the
  same schema-validated contract the API exposes.
- Edge semantics v1: dependency DAG with parallel branches and all-of
  joins. No conditional routing, no loops.
- Architecture: Graph as a first-class domain aggregate (approach A),
  delivered in three independently green stages.
- State machines: explicit and single-sourced; XState owns the client
  workflow machines, core owns the transition tables, and a test binds
  them together.

## Domain model (packages/contracts)

New branded IDs: `GraphId` (`graph_<ulid>`), `GraphNodeId` (author-chosen
slug, unique within a graph), `GraphRunId` (`graphrun_<ulid>`).

```
GraphNode  { id: GraphNodeId, name, promptTemplate, position: { x, y } }
GraphEdge  { from: GraphNodeId, to: GraphNodeId }
Graph      { id, projectId, name, nodes: GraphNode[], edges: GraphEdge[],
             createdAt, updatedAt }
GraphRun   { id, graphId, projectId, status: GraphRunStatus, input,
             nodes: GraphNode[], edges: GraphEdge[],   // definition snapshot
             createdAt, updatedAt }
GraphRunNode { graphRunId, nodeId, status: GraphNodeRunStatus,
               agentRunId | null, sessionId | null, updatedAt }
```

- `GraphRunStatus`: `queued | running | awaiting-approval | completed |
failed | cancelled`.
- `GraphNodeRunStatus`: `pending | ready | running | awaiting-approval |
completed | failed | skipped`.
- `CreateGraph` / `UpdateGraph` / `StartGraphRun` request schemas live in
  contracts and are shared by server and client (route-table rule).
- `position` exists for the editor only; execution ignores it.

Prompt templates may reference `{{input}}` (the graph run's kickoff
prompt) and `{{nodes.<id>.output}}` (the referenced node's final assistant
text, taken from its run's `AssistantTextCompleted` events). Referencing a
node that is not an ancestor is a validation error. Unresolved
placeholders at dispatch time fail the node with a tagged error rather
than dispatching a malformed prompt.

## Structural validation

One pure function in `packages/core` (`validateGraph`) enforces:

- at least one node; node ids unique; names non-empty;
- every edge references existing nodes; no self-edges; no duplicate edges;
- acyclic, verified with Kahn's algorithm;
- every `{{nodes.<id>.output}}` reference points to an ancestor of the
  referencing node;
- bounded size for v1: at most 25 nodes and 100 edges.

`GraphService.create/update` run it and fail with `InvalidGraph`
(tagged, with a `reason` field) on violation. The editor calls the same
validation through the API before save; there is no second client-side
implementation of the rules.

## State machines

`packages/core/src/graph-run-transitions.ts` declares the two transition
tables — the same idiom as `allowedSessionTransitions`:

- graph run: `queued → running`; `running ↔ awaiting-approval`;
  `running | awaiting-approval → completed | failed | cancelled`.
- node: `pending → ready → running`; `running ↔ awaiting-approval`;
  `running | awaiting-approval → completed | failed`;
  `pending | ready → skipped` (dependency failed or run cancelled).

The worker coordinator and SQL layers consult these tables; illegal
transitions fail with `InvalidGraphRunTransition`.

In `apps/web`, XState owns the client workflows:

- `graphEditorMachine`: `viewing → editing → saving → viewing`, with
  `saveFailed` handling — governs the canvas, dirty state, and save flow.
- `graphRunMachine`: `idle → starting → running ↔ awaitingApproval →
completed | failed | cancelled` — governs the run overlay, driven by
  polled `GraphRun` status.

A test asserts every status the web machines model appears in the core
transition tables with the same reachability, so the frontend statechart
and backend guards cannot drift.

## Persistence (packages/db + core internals)

Three tables, SQL confined to `internal/*-live.ts`:

- `graphs` (definition columns plus `nodes`/`edges` as `jsonb`, decoded
  through the contract schema on read);
- `graph_runs` (including the `nodes`/`edges` definition snapshot as
  `jsonb`, so edits to the graph never affect in-flight runs);
- `graph_run_nodes` (primary key `(graph_run_id, node_id)`).

`GraphService` (CRUD, validation) and `GraphRunService` (start, get with
node statuses, list by graph, cancel) are `Context.Service` classes with
Live layers in `internal/` and in-memory Test layers, exported per the
package-anatomy pattern.

Starting a run follows the durable-admission pattern: one transaction
inserts the `graph_run` row, all `graph_run_nodes` rows as `pending`, and
enqueues one `graph-run` coordinator job. The caller supplies an
idempotency command id; replays return the existing run.

## Execution (worker coordinator)

New `graph-run` job handler in `apps/worker` (wiring) over reusable logic
in `packages/worker`:

1. Load the run and node states.
2. Frontier pass: every `pending` node whose incoming edges are all
   `completed` becomes `ready`; for each `ready` node, create a
   conversation and `AgentSession`, substitute the prompt template, and
   admit an `AgentRun` through `AgentRunService.admit` with deterministic
   command id `<graphRunId>/<nodeId>` — crash-safe: replays cannot
   double-spawn. Parallel branches are simply multiple admitted runs.
3. Reconcile: map each node's underlying agent-run status onto the node
   table (`running`, `awaiting-approval`, `completed`, `failed`).
4. Failure: a `failed` node marks every descendant `skipped`; the graph
   run becomes `failed` once no node is in flight.
5. Terminal check: all nodes terminal → graph run `completed` (all
   completed) or `failed`; otherwise re-enqueue the coordinator job with a
   short delay (5 seconds) and finish the pass.

Cancel: `GraphRunService.cancel` cancels in-flight node runs through the
existing run-cancel path, marks `pending`/`ready` nodes `skipped`, and the
run `cancelled`. Approvals need no new machinery: a node run awaiting
approval surfaces as node status `awaiting-approval` and graph status
`awaiting-approval`; the user approves through the existing approval UI.

Node runs inherit all existing behavior: one sandbox per session, retries
via job attempts, durable events with monotonic sequences.

## API surface

New `ApiRoutes` entries (handler-map exhaustiveness forces server
coverage; client methods derive from the same table):

- `listGraphs` GET `/projects/:projectId/graphs`
- `createGraph` POST `/projects/:projectId/graphs` (201)
- `getGraph` GET `/graphs/:graphId`
- `updateGraph` PATCH `/graphs/:graphId`
- `deleteGraph` DELETE `/graphs/:graphId` (204)
- `startGraphRun` POST `/graphs/:graphId/runs` (202, idempotency-key
  header, body `StartGraphRun { input }`)
- `listGraphRuns` GET `/graphs/:graphId/runs`
- `getGraphRun` GET `/graph-runs/:graphRunId` (run + node statuses)
- `cancelGraphRun` POST `/graph-runs/:graphRunId/cancel`

New tagged errors enter the `errorStatus` table: `GraphNotFound` and
`GraphRunNotFound` → 404, `InvalidGraph` and `InvalidGraphRunTransition`
→ 409.

Run observation in v1: the web polls `getGraphRun` (TanStack Query
`refetchInterval` while non-terminal). Selecting a node streams that
node's underlying agent-run events over the existing SSE route. A
graph-level SSE stream is deferred.

## Web editor (apps/web)

A Graphs section per project:

- graph list (create, rename, delete);
- canvas editor on `@xyflow/react`: add node, connect edges, drag
  positions, inspector panel for name and prompt template, save (API
  validation errors surface inline), Run button with kickoff prompt;
- run overlay: the same canvas colors nodes by status using DESIGN.md
  tokens — pending `ink-subtle`, running `blueprint`, awaiting-approval
  `warning`, completed `success`, failed `destructive`, skipped `mist` —
  with the `graphRunMachine` governing the workflow and a node click
  opening that node's transcript via the existing event stream.

`@xyflow/react` is a new dependency of `apps/web` only; canvas chrome
follows DESIGN.md (no hex literals — token utilities only). New reusable
visual tokens, if any, update DESIGN.md in the same change.

## Testing

- `validateGraph`: unit tests for each rule, including cycle and
  non-ancestor-reference rejection.
- Contracts: schema round-trips; the route-table integrity test covers the
  new routes automatically.
- Core services: Test-layer unit tests; Postgres integration tests for
  start-run idempotency (same command id → same run) and transactional
  admission.
- Coordinator: fake-runtime tests (existing deterministic doubles) for
  parallel frontier, all-of join, failure-skip propagation, cancel, and
  crash-replay (coordinator pass repeated → no duplicate node runs).
- Web: XState machine transition tests plus the machine/table consistency
  test; editor logic beyond machines is exercised manually in v1.
- `pnpm guardrails` green at the end of every stage.

## Delivery stages

1. **Domain**: contracts, `GraphService`/`GraphRunService`, migrations,
   routes, client methods, validation + idempotency tests.
2. **Execution**: coordinator handler, transition enforcement, reconcile
   loop, cancel path, coordinator test suite.
3. **Editor**: `@xyflow/react` canvas, XState machines, run overlay,
   machine-consistency test.

Each stage lands as its own commit with guardrails green.

## Non-goals (v1)

- Conditional edges, loops, or per-edge data mapping.
- Graph-level SSE streaming (polling suffices).
- Graph versioning/history; an edit overwrites the definition and does
  not affect in-flight runs (runs snapshot the definition at start).
- Shared sessions between nodes; every node is its own session/sandbox.
- Reusable graph templates across projects.
