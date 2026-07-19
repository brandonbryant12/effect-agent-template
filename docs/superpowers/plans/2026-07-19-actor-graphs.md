# Actor Graphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users define multi-agent orchestration graphs (dependency DAGs of
agent tasks) in a visual editor and run them durably through the existing
session/run/approval machinery.

**Architecture:** Graph and GraphRun are first-class domain aggregates
(contracts schemas, core Context.Services, Postgres tables, ApiRoutes
entries). A worker coordinator job advances the node frontier by admitting
ordinary AgentRuns with deterministic command ids. The web app adds an
@xyflow/react canvas governed by XState machines whose states are bound to
the core transition tables by a test.

**Tech Stack:** Effect 4 beta (Schema, Context.Service, Layer, Clock),
effect/unstable/sql, vitest, XState v5, @xyflow/react, TanStack Query.

## Global Constraints

- `pnpm guardrails` green after every task group; commit per task.
- All new SQL inside `packages/*/src/internal/` or annotated app files.
- Errors are `Schema.TaggedErrorClass`; no `Effect.fail(new Error(...))`.
- Time from Clock (`nowTimestamp` in core internals); no `new Date()`.
- No hex literals in web code — DESIGN.md token utilities only.
- Route additions go through `ApiRoutes`; handler map is exhaustive.
- Spec: `docs/superpowers/specs/2026-07-19-actor-graphs-design.md`.

---

### Task 1: Graph contracts

**Files:**

- Modify: `packages/contracts/src/ids.ts` (add GraphId, GraphNodeId, GraphRunId)
- Create: `packages/contracts/src/graph.ts`
- Modify: `packages/contracts/src/index.ts` (export graph module)
- Modify: `packages/contracts/package.json` (add `./graph` subpath)
- Test: `packages/contracts/test/graph.test.ts`

**Interfaces:**

- Produces: `GraphId`, `GraphNodeId`, `GraphRunId`, `GraphNode`,
  `GraphEdge`, `Graph`, `GraphRun`, `GraphRunNode`, `GraphRunStatus`,
  `GraphNodeRunStatus`, `CreateGraph`, `UpdateGraph`, `StartGraphRun`.

- [ ] **Step 1: Write failing schema round-trip test**

```ts
// packages/contracts/test/graph.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CreateGraph, Graph, StartGraphRun } from "../src/graph.js";

describe("graph contracts", () => {
  it("decodes a well-formed graph definition", () => {
    const graph = Schema.decodeUnknownSync(Graph)({
      id: "graph_01JY0000000000000000000000",
      projectId: "project_01JY0000000000000000000000",
      name: "Ship feature",
      nodes: [
        {
          id: "plan",
          name: "Plan",
          promptTemplate: "Plan: {{input}}",
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
      createdAt: "2026-07-19T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(graph.nodes[0]?.id).toBe("plan");
  });

  it("rejects malformed node ids and empty names", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateGraph)({
        name: "",
        nodes: [],
        edges: [],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(StartGraphRun)({ input: "" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run packages/contracts/test/graph.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement ids + graph module**

ids.ts additions follow the existing `brandedId` helper in that file (same
prefix pattern as `AgentRunId`): `GraphId` prefix `graph_`, `GraphRunId`
prefix `graphrun_`. `GraphNodeId` is a slug, not a ulid id:

```ts
export const GraphNodeId = Schema.String.check(
  Schema.isRegex(/^[a-z][a-z0-9-]{0,39}$/),
).pipe(Schema.brand("GraphNodeId"));
export type GraphNodeId = typeof GraphNodeId.Type;
```

graph.ts:

```ts
import { Schema } from "effect";
import { Name, Timestamp } from "./common.js";
import {
  AgentRunId,
  AgentSessionId,
  GraphId,
  GraphNodeId,
  GraphRunId,
  ProjectId,
} from "./ids.js";

export const GraphNode = Schema.Struct({
  id: GraphNodeId,
  name: Name,
  promptTemplate: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(20_000),
  ),
  position: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
});
export const GraphEdge = Schema.Struct({ from: GraphNodeId, to: GraphNodeId });
export const Graph = Schema.Struct({
  id: GraphId,
  projectId: ProjectId,
  name: Name,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const GraphRunStatus = Schema.Literals([
  "queued",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "cancelled",
]);
export const GraphNodeRunStatus = Schema.Literals([
  "pending",
  "ready",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "skipped",
]);
export const GraphRun = Schema.Struct({
  id: GraphRunId,
  graphId: GraphId,
  projectId: ProjectId,
  status: GraphRunStatus,
  input: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100_000),
  ),
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const GraphRunNode = Schema.Struct({
  graphRunId: GraphRunId,
  nodeId: GraphNodeId,
  status: GraphNodeRunStatus,
  agentRunId: Schema.NullOr(AgentRunId),
  sessionId: Schema.NullOr(AgentSessionId),
  updatedAt: Timestamp,
});
export const CreateGraph = Schema.Struct({
  name: Name,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
});
export const UpdateGraph = CreateGraph;
export const StartGraphRun = Schema.Struct({
  input: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100_000),
  ),
});
// plus `export type X = typeof X.Type` for each
```

Barrel: `export * from "./graph.js";` in index.ts; `"./graph": "./src/graph.ts"` in exports.

- [ ] **Step 4: Test passes; typecheck passes.**
- [ ] **Step 5: Commit** `feat: graph contracts`.

### Task 2: validateGraph + transition tables + errors (core, pure)

**Files:**

- Create: `packages/core/src/graph-validation.ts`
- Create: `packages/core/src/graph-run-transitions.ts`
- Create: `packages/core/src/graph-errors.ts` (GraphNotFound, GraphRunNotFound, InvalidGraph, InvalidGraphRunTransition)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/graph-validation.test.ts`

**Interfaces:**

- Produces: `validateGraph(definition: { nodes; edges }): InvalidGraph | undefined`
  (undefined = valid, mirroring `transitionTask`'s result style);
  `allowedGraphRunTransitions`, `allowedGraphNodeTransitions`;
  `graphTemplateReferences(template: string): ReadonlyArray<string>`.

- [ ] **Step 1: Failing tests** — cycle rejection, duplicate node id,
      unknown edge target, self-edge, non-ancestor `{{nodes.x.output}}`
      reference, size caps (26 nodes), and a valid diamond graph accepted:

```ts
const diamond = {
  nodes: [
    n("plan"),
    n("research"),
    n("code"),
    n("review", "Use {{nodes.plan.output}}"),
  ],
  edges: [
    e("plan", "research"),
    e("plan", "code"),
    e("research", "review"),
    e("code", "review"),
  ],
};
expect(validateGraph(diamond)).toBeUndefined();
const cycle = { nodes: [n("a"), n("b")], edges: [e("a", "b"), e("b", "a")] };
expect(validateGraph(cycle)?.reason).toBe("cycle");
```

- [ ] **Step 2: Implement** — Kahn topological sort for acyclicity and
      ancestor sets; `graphTemplateReferences` = `/\{\{nodes\.([a-z][a-z0-9-]*)\.output\}\}/g`
      matches. Reasons: `"empty" | "duplicate-node" | "unknown-edge-node" |
"self-edge" | "duplicate-edge" | "cycle" | "unknown-reference" |
"non-ancestor-reference" | "too-large"`. Transition tables exactly per
      spec §State machines.
- [ ] **Step 3: Tests pass; commit** `feat: graph validation and transition tables`.

### Task 3: DB migration

**Files:**

- Modify: `packages/db/src/migrations.ts` (follow existing migration list pattern)

```sql
CREATE TABLE IF NOT EXISTS graphs (
  id text PRIMARY KEY, tenant_id text NOT NULL, owner_user_id text NOT NULL,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL, nodes jsonb NOT NULL, edges jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS graph_runs (
  id text PRIMARY KEY, graph_id text NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  project_id text NOT NULL, tenant_id text NOT NULL, owner_user_id text NOT NULL,
  status text NOT NULL, input text NOT NULL, nodes jsonb NOT NULL, edges jsonb NOT NULL,
  command_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS graph_run_nodes (
  graph_run_id text NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL, status text NOT NULL,
  agent_run_id text NULL, session_id text NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (graph_run_id, node_id)
);
```

- [ ] Steps: add migration, run `pnpm db:migrate` against compose Postgres,
      commit `feat: graph tables migration`.

### Task 4: GraphService (core)

**Files:**

- Create: `packages/core/src/graph-service.ts` (Context.Service + Test layer)
- Create: `packages/core/src/internal/graph-live.ts`
- Modify: `packages/core/src/live.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/graph-service.test.ts`

**Interfaces:**

- Produces: `GraphService` shape:
  `create(scope, projectId, input: CreateGraph) → Graph | InvalidGraph | PersistenceError`
  `get(scope, id) → Graph | GraphNotFound | PersistenceError`
  `listByProject(scope, projectId) → ReadonlyArray<Graph> | PersistenceError`
  `update(scope, id, input: UpdateGraph) → Graph | InvalidGraph | GraphNotFound | PersistenceError`
  `remove(scope, id) → void | GraphNotFound | PersistenceError`
  plus `GraphServiceTest` layer (in-memory maps, fixed timestamps, ulid ids).

- [ ] Steps: failing Test-layer tests (create validates via `validateGraph`,
      scope isolation like ProjectService tests, update rejects cycles), then
      Live implementation (jsonb via `JSON.stringify`/schema decode with
      `normalizeTimestamps` + `nowTimestamp`), tests pass, commit
      `feat: graph service`.

### Task 5: GraphRunService (core)

**Files:**

- Create: `packages/core/src/graph-run-service.ts`
- Create: `packages/core/src/internal/graph-run-live.ts`
- Modify: `packages/core/src/live.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/graph-run-service.test.ts`, extend
  `packages/db/test/postgres.integration.test.ts` with start-idempotency.

**Interfaces:**

- Produces: `GraphRunService` shape:
  `start(scope, graphId, commandId: CommandId, input) → GraphRun | GraphNotFound | PersistenceError`
  `get(scope, id) → { run: GraphRun; nodes: ReadonlyArray<GraphRunNode> } | GraphRunNotFound | PersistenceError`
  `listByGraph(scope, graphId) → ReadonlyArray<GraphRun> | PersistenceError`
  `cancel(scope, id) → GraphRun | GraphRunNotFound | InvalidGraphRunTransition | PersistenceError`

- [ ] Steps: Test-layer tests (start snapshots definition, replay with the
      same commandId returns the same run, cancel skips pending nodes), Live:
      single transaction inserting graph_run (`ON CONFLICT (command_id) DO NOTHING`
      then select existing), node rows `pending`, and a `graph-run` job row
      (same insert shape approval-live uses for jobs; payload
      `{ graphRunId }`, kind `graph-run`, max_attempts 5). Cancel: node runs
      with `agent_run_id` are cancelled by delegating to
      `ApprovalService.cancelRun` from the server handler instead — core
      cancel only transitions rows; in-flight agent-run cancellation is
      orchestrated in the API handler (keeps core services uncoupled).
      Postgres integration test proves idempotent start. Commit
      `feat: graph run service`.

### Task 6: Routes + server handlers + client

**Files:**

- Modify: `packages/contracts/src/http.ts` (8 new routes per spec §API)
- Modify: `apps/server/src/api.ts` (handlers + errorStatus entries)
- Modify: `apps/server/src/main.ts` (provide GraphService/GraphRunService layers + ApiServices fields)
- Modify: `packages/client/src/client.ts`, `packages/client/src/promise.ts`
- Test: existing `packages/contracts/test/http.test.ts` covers table
  integrity automatically; extend `apps/server/test/api.integration.test.ts`
  with graph CRUD + start/cancel round-trip.

**Interfaces:**

- Produces routes: `listGraphs`, `createGraph`, `getGraph`, `updateGraph`,
  `deleteGraph`, `startGraphRun`, `listGraphRuns`, `getGraphRun`,
  `cancelGraphRun` — exactly the spec paths. Client namespace:
  `client.graphs.{list,create,get,update,remove}` and
  `client.graphRuns.{start,list,get,cancel}`.
- errorStatus additions: `GraphNotFound: 404`, `GraphRunNotFound: 404`,
  `InvalidGraph: 409`, `InvalidGraphRunTransition: 409`.

- [ ] Steps: add routes (compiler forces handlers), handlers decode → call
      service → json (cancelGraphRun handler also cancels in-flight node agent
      runs via `services.approvals.cancelRun` for each node with an
      `agentRunId` in a non-terminal status, ignoring `RunControlRejected`),
      wire layers in main, client methods from the table, integration tests
      green with Postgres, commit `feat: graph API surface`.

### Task 7: Coordinator logic (packages/worker)

**Files:**

- Create: `packages/worker/src/graph-run.ts`
- Modify: `packages/worker/src/index.ts`
- Test: `packages/worker/test/graph-run.test.ts`

**Interfaces:**

- Produces: `GraphCoordinatorJournal` interface (the injected port):

```ts
export interface GraphCoordinatorJournal {
  readonly load: (
    id: GraphRunId,
  ) => Effect.Effect<GraphRunState, GraphJournalError>;
  readonly markReady: (
    id: GraphRunId,
    nodes: ReadonlyArray<GraphNodeId>,
  ) => Effect.Effect<void, GraphJournalError>;
  readonly dispatch: (
    id: GraphRunId,
    nodeId: GraphNodeId,
    prompt: string,
  ) => Effect.Effect<DispatchedNode, GraphJournalError>;
  readonly reconcile: (
    id: GraphRunId,
  ) => Effect.Effect<void, GraphJournalError>;
  readonly finalize: (
    id: GraphRunId,
  ) => Effect.Effect<GraphRunStatus, GraphJournalError>;
  readonly nodeOutput: (
    id: GraphRunId,
    nodeId: GraphNodeId,
  ) => Effect.Effect<string, GraphJournalError>;
  readonly requeue: (id: GraphRunId) => Effect.Effect<void, GraphJournalError>;
}
```

and `makeGraphRunHandler(journal): JobHandler` decoding payload
`{ graphRunId: GraphRunId }`, plus pure helpers
`readyNodes(state)`, `descendantsOf(state, nodeId)`,
`substituteTemplate(template, input, outputs) → string | UnresolvedReference`.
`GraphRunState` = `{ run: GraphRun; nodes: ReadonlyArray<GraphRunNode> }`.

- [ ] Steps: failing tests with an in-memory fake journal — frontier
      admits roots; diamond join waits for both parents; failure skips
      descendants and finalizes `failed`; replay of a pass never re-dispatches
      a node that has `agentRunId`; unresolved template reference fails the
      node. Implement handler: load → reconcile → skip-propagation →
      frontier(markReady + substitute + dispatch) → finalize or requeue.
      Commit `feat: graph run coordinator`.

### Task 8: Worker journal binding (apps/worker)

**Files:**

- Create: `apps/worker/src/graph-journal.ts` (`// architecture-allow: raw-sql -- app-owned Postgres binding of the GraphCoordinatorJournal port`)
- Modify: `apps/worker/src/main.ts` (register `"graph-run"` handler)
- Test: `apps/worker/test/graph-journal.test.ts` (pure mapping bits) and
  Postgres-gated coordinator round-trip in `packages/queue`-style
  integration file `apps/worker/test/graph.integration.test.ts`.

Implementation notes (concrete): `dispatch` creates conversation +
session + admits the run entirely through core services provided by the
worker's Postgres layer (`ConversationService`, `AgentSessionService`,
`AgentRunService` — add their Live layers to `WorkerInfrastructureLive`),
with commandId `Schema.decodeUnknownSync(CommandId)(deterministic 26-char
hash of graphRunId+nodeId via ulid-alphabet encoding)`; `reconcile` maps
agent_run statuses onto node rows with `runStatusForEvent` semantics
(read `agent_runs.status` directly); `nodeOutput` selects the last
`AssistantTextCompleted` event text for the node's run; `requeue` inserts
the coordinator job with `available_at = now + 5 seconds` and
`ON CONFLICT DO NOTHING` on a deterministic per-pass command id is not
needed — the runtime's claim loop dedupes because the previous job is
completed before requeue.

- [ ] Steps: bind, wire, integration test with fake agent runtime through
      compose Postgres (full graph completes), commit
      `feat: durable graph execution`.

### Task 9: client-react + XState machines

**Files:**

- Modify: `packages/client-react/src/index.ts` + create `packages/client-react/src/graph-queries.ts`
- Create: `apps/web/src/features/graphs/graph-editor-machine.ts`
- Create: `apps/web/src/features/graphs/graph-run-machine.ts`
- Test: `apps/web/src/features/graphs/graph-machines.test.ts`

**Interfaces:**

- Produces: `graphQueryOptions(client, projectId)`,
  `graphDetailQueryOptions(client, graphId)`,
  `graphRunQueryOptions(client, graphRunId)` (with
  `refetchInterval` while non-terminal); machines:
  `graphEditorMachine` states `viewing | editing | saving | saveFailed`,
  events `EDIT | SAVE | SAVED | SAVE_FAILED | RESET`;
  `graphRunMachine` states `idle | starting | running | awaitingApproval |
completed | failed | cancelled`, events `START | STARTED | STATUS`
  (STATUS carries `GraphRunStatus` and self-routes).

- [ ] Steps: machine transition tests plus the consistency test — for
      every machine state that mirrors a `GraphRunStatus`, assert the status
      exists in `allowedGraphRunTransitions` and that machine edges are a
      subset of table edges (import the table from `@repo/core`). Commit
      `feat: graph client state`.

### Task 10: Graph editor UI

**Files:**

- Modify: `apps/web/package.json` (add `@xyflow/react`)
- Create: `apps/web/src/features/graphs/graph-canvas.tsx` (canvas + node
  status coloring via token classes)
- Create: `apps/web/src/features/graphs/graphs-panel.tsx` (list, editor
  shell, inspector, run controls)
- Modify: `apps/web/src/app.tsx` (mount Graphs section beside tasks panel)
- Test: machines already tested; canvas exercised manually + design lint.

Concrete requirements: node card = `rounded-md border border-line bg-white
px-3 py-2`; status ring classes map exactly `pending→ring-ink-subtle,
running→ring-blueprint, awaiting-approval→ring-warning,
completed→ring-success, failed→ring-destructive, skipped→ring-mist`;
xyflow default styles imported once (`@xyflow/react/dist/style.css`);
inspector edits write through `graphEditorMachine`; Save calls
`client.graphs.update` and surfaces `InvalidGraph.reason` inline; Run
prompts for kickoff input, calls `graphRuns.start` with a generated
CommandId (same generator as startRun in app.tsx, extracted to
`apps/web/src/lib/command-id.ts` and reused by both call sites).

- [ ] Steps: build, `pnpm --filter @repo/web build` green, design lint
      green, commit `feat: graph editor`.

### Task 11: Finalization

- [ ] Update `docs/patterns.md` (Graphs section pointer) and
      `docs/decisions.md` §17 (graphs reuse run machinery; why coordinator
      re-enqueues instead of long-leasing).
- [ ] `pnpm guardrails` + Postgres suites + `pnpm build` all green.
- [ ] Commit `docs: graph patterns and decisions` and push.

## Self-review

- Spec coverage: contracts (T1), validation (T2), tables (T3), services
  (T4-5), API (T6), coordinator (T7-8), machines+queries (T9), editor
  (T10), docs (T11). Approvals/cancel flow through existing paths (T6/T8).
- No placeholder phrases; interfaces named consistently
  (`GraphCoordinatorJournal`, `makeGraphRunHandler`, statuses per spec).
- Types: node statuses and route names match the spec exactly.
