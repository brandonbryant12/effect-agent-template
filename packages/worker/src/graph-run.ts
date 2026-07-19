import type {
  GraphEdge,
  GraphNodeId,
  GraphRun,
  GraphRunId,
  GraphRunNode,
  GraphRunStatus,
} from "@repo/contracts";
import {
  GraphRunId as GraphRunIdSchema,
  isTerminalGraphRunStatus,
} from "@repo/contracts";
import { Effect, Schema } from "effect";
import type { JobHandler } from "./runtime.js";
import { JobHandlerError } from "./runtime.js";

export class GraphJournalError extends Schema.TaggedErrorClass<GraphJournalError>()(
  "GraphJournalError",
  { operation: Schema.String, retryable: Schema.Boolean },
) {}

export interface GraphRunState {
  readonly run: GraphRun;
  readonly nodes: ReadonlyArray<GraphRunNode>;
}

export interface DispatchedNode {
  readonly nodeId: GraphNodeId;
}

/**
 * Durable port the coordinator drives. The app binds it to Postgres and the
 * existing conversation/session/run services; tests bind it in memory.
 */
export interface GraphCoordinatorJournal {
  readonly load: (
    id: GraphRunId,
  ) => Effect.Effect<GraphRunState, GraphJournalError>;
  /** Maps underlying agent-run statuses onto node rows. */
  readonly reconcile: (
    id: GraphRunId,
  ) => Effect.Effect<void, GraphJournalError>;
  readonly markReady: (
    id: GraphRunId,
    nodes: ReadonlyArray<GraphNodeId>,
  ) => Effect.Effect<void, GraphJournalError>;
  /** Creates conversation + session and admits the node's agent run. */
  readonly dispatch: (
    id: GraphRunId,
    nodeId: GraphNodeId,
    prompt: string,
  ) => Effect.Effect<DispatchedNode, GraphJournalError>;
  readonly failNode: (
    id: GraphRunId,
    nodeId: GraphNodeId,
    code: string,
  ) => Effect.Effect<void, GraphJournalError>;
  readonly skip: (
    id: GraphRunId,
    nodes: ReadonlyArray<GraphNodeId>,
  ) => Effect.Effect<void, GraphJournalError>;
  /** Final assistant text of a completed node's run. */
  readonly nodeOutput: (
    id: GraphRunId,
    nodeId: GraphNodeId,
  ) => Effect.Effect<string, GraphJournalError>;
  /** Derives and persists the run status from node rows; returns it. */
  readonly finalize: (
    id: GraphRunId,
  ) => Effect.Effect<GraphRunStatus, GraphJournalError>;
  /** Schedules the next coordinator pass. */
  readonly requeue: (id: GraphRunId) => Effect.Effect<void, GraphJournalError>;
}

const GraphRunPayload = Schema.Struct({ graphRunId: GraphRunIdSchema });

export const descendantsOf = (
  edges: ReadonlyArray<GraphEdge>,
  start: GraphNodeId,
): ReadonlySet<GraphNodeId> => {
  const result = new Set<GraphNodeId>();
  const queue: Array<GraphNodeId> = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const edge of edges) {
      if (edge.from === current && !result.has(edge.to)) {
        result.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return result;
};

export const readyNodes = (
  state: GraphRunState,
): ReadonlyArray<GraphNodeId> => {
  const statusOf = new Map(
    state.nodes.map((node) => [node.nodeId, node.status]),
  );
  return state.nodes
    .filter((node) => node.status === "pending")
    .filter((node) =>
      state.run.edges
        .filter((edge) => edge.to === node.nodeId)
        .every((edge) => statusOf.get(edge.from) === "completed"),
    )
    .map((node) => node.nodeId);
};

export interface UnresolvedReference {
  readonly _tag: "UnresolvedReference";
  readonly reference: string;
}

export const substituteTemplate = (
  template: string,
  input: string,
  outputs: ReadonlyMap<string, string>,
): string | UnresolvedReference => {
  let unresolved: string | undefined;
  const result = template
    .replaceAll("{{input}}", input)
    .replaceAll(
      /\{\{nodes\.([a-z][a-z0-9-]*)\.output\}\}/g,
      (_match, id: string) => {
        const output = outputs.get(id);
        if (output === undefined) {
          unresolved = unresolved ?? id;
          return "";
        }
        return output;
      },
    );
  return unresolved === undefined
    ? result
    : { _tag: "UnresolvedReference", reference: unresolved };
};

const journalFailure = (error: GraphJournalError): JobHandlerError =>
  new JobHandlerError({
    code: "graph_journal_unavailable",
    retryable: error.retryable,
  });

export const makeGraphRunHandler =
  (journal: GraphCoordinatorJournal): JobHandler =>
  (job) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeUnknownEffect(GraphRunPayload)(
        job.payload,
      ).pipe(
        Effect.mapError(
          () =>
            new JobHandlerError({
              code: "invalid_graph_run_job",
              retryable: false,
            }),
        ),
      );
      const id = payload.graphRunId;

      yield* journal.reconcile(id).pipe(Effect.mapError(journalFailure));
      const state = yield* journal
        .load(id)
        .pipe(Effect.mapError(journalFailure));
      if (isTerminalGraphRunStatus(state.run.status)) return;

      // Failure propagation: descendants of failed nodes can never run.
      const failed = state.nodes.filter((node) => node.status === "failed");
      const skippable = new Set<GraphNodeId>();
      for (const node of failed) {
        for (const descendant of descendantsOf(state.run.edges, node.nodeId)) {
          const target = state.nodes.find((n) => n.nodeId === descendant);
          if (target?.status === "pending" || target?.status === "ready") {
            skippable.add(descendant);
          }
        }
      }
      if (skippable.size > 0) {
        yield* journal
          .skip(id, [...skippable])
          .pipe(Effect.mapError(journalFailure));
      }

      // Frontier: pending nodes whose dependencies all completed.
      const frontier = readyNodes(state).filter(
        (nodeId) => !skippable.has(nodeId),
      );
      if (frontier.length > 0) {
        yield* journal
          .markReady(id, frontier)
          .pipe(Effect.mapError(journalFailure));
      }
      for (const nodeId of frontier) {
        const definition = state.run.nodes.find((node) => node.id === nodeId);
        if (!definition) continue;
        const references = [
          ...definition.promptTemplate.matchAll(
            /\{\{nodes\.([a-z][a-z0-9-]*)\.output\}\}/g,
          ),
        ].map((match) => match[1] ?? "");
        const nodeIds = new Map<string, GraphNodeId>(
          state.run.nodes.map((node) => [node.id, node.id]),
        );
        const outputs = new Map<string, string>();
        for (const reference of references) {
          const referenceId = nodeIds.get(reference);
          if (referenceId === undefined) continue;
          const output = yield* journal
            .nodeOutput(id, referenceId)
            .pipe(Effect.mapError(journalFailure));
          outputs.set(reference, output);
        }
        const prompt = substituteTemplate(
          definition.promptTemplate,
          state.run.input,
          outputs,
        );
        if (typeof prompt !== "string") {
          yield* journal
            .failNode(id, nodeId, "unresolved_reference")
            .pipe(Effect.mapError(journalFailure));
          continue;
        }
        yield* journal
          .dispatch(id, nodeId, prompt)
          .pipe(Effect.mapError(journalFailure));
      }

      const status = yield* journal
        .finalize(id)
        .pipe(Effect.mapError(journalFailure));
      if (!isTerminalGraphRunStatus(status)) {
        yield* journal.requeue(id).pipe(Effect.mapError(journalFailure));
      }
    });
