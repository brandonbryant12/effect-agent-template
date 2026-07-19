import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentClient, effectClient } from "@/lib/client";
import { newCommandId } from "@/lib/command-id";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  GraphNodeId,
  GraphNodeRunStatus,
  GraphRunId,
  ProjectId,
} from "@repo/contracts";
import { GraphNodeId as GraphNodeIdSchema } from "@repo/contracts";
import {
  graphQueryOptions,
  graphRunQueryOptions,
  queryKeys,
} from "@repo/client-react";
import { useMachine } from "@xstate/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { Play, Plus, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { GraphCanvas } from "./graph-canvas.js";
import { graphEditorMachine } from "./graph-editor-machine.js";
import { graphRunMachine } from "./graph-run-machine.js";

interface Draft {
  readonly name: string;
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
}

const slugify = (value: string): GraphNodeId | undefined => {
  const candidate = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 40);
  return /^[a-z][a-z0-9-]{0,39}$/.test(candidate)
    ? Schema.decodeUnknownSync(GraphNodeIdSchema)(candidate)
    : undefined;
};

const planNodeId = Schema.decodeUnknownSync(GraphNodeIdSchema)("plan");
const executeNodeId = Schema.decodeUnknownSync(GraphNodeIdSchema)("execute");

const starterDraft: Draft = {
  name: "New graph",
  nodes: [
    {
      id: planNodeId,
      name: "Plan",
      promptTemplate: "Plan how to accomplish: {{input}}",
      position: { x: 0, y: 80 },
    },
    {
      id: executeNodeId,
      name: "Execute",
      promptTemplate: "Execute this plan:\n{{nodes.plan.output}}",
      position: { x: 260, y: 80 },
    },
  ],
  edges: [{ from: planNodeId, to: executeNodeId }],
};

export const GraphsPanel = ({ projectId }: { projectId: ProjectId }) => {
  const queryClient = useQueryClient();
  const graphsQuery = useQuery(graphQueryOptions(effectClient, projectId));
  const graphs = graphsQuery.data ?? [];
  const [selectedGraphId, setSelectedGraphId] = useState<Graph["id"]>();
  const selectedGraph =
    graphs.find((graph) => graph.id === selectedGraphId) ?? graphs[0];

  const [draft, setDraft] = useState<Draft>();
  const [selectedNodeId, setSelectedNodeId] = useState<GraphNodeId>();
  const [saveError, setSaveError] = useState("");
  const [runInput, setRunInput] = useState("");
  const [activeRunId, setActiveRunId] = useState<GraphRunId>();
  const [editorState, sendEditor] = useMachine(graphEditorMachine);
  const [runState, sendRun] = useMachine(graphRunMachine);

  const runQuery = useQuery(graphRunQueryOptions(effectClient, activeRunId));
  const runDetail = activeRunId ? runQuery.data : undefined;
  const runStatus = runDetail?.run.status;
  useEffect(() => {
    // The statechart decides which states react to STATUS; states without
    // a generated transition simply drop the event.
    if (runStatus) sendRun({ type: "STATUS", status: runStatus });
  }, [runStatus, sendRun]);

  const definition: Draft | undefined =
    draft ??
    (selectedGraph
      ? {
          name: selectedGraph.name,
          nodes: selectedGraph.nodes,
          edges: selectedGraph.edges,
        }
      : undefined);
  const selectedNode = definition?.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const nodeStatuses = new Map<GraphNodeId, GraphNodeRunStatus>(
    (runDetail?.nodes ?? []).map((node) => [node.nodeId, node.status]),
  );

  const edit = (mutate: (current: Draft) => Draft) => {
    if (!definition) return;
    sendEditor({ type: "EDIT" });
    setDraft(mutate(draft ?? definition));
  };

  const save = async () => {
    if (!selectedGraph || !draft) return;
    sendEditor({ type: "SAVE" });
    setSaveError("");
    try {
      await agentClient.graphs.update(selectedGraph.id, draft);
      sendEditor({ type: "SAVED" });
      setDraft(undefined);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.graphs.byProject(projectId),
      });
    } catch (error) {
      sendEditor({ type: "SAVE_FAILED" });
      setSaveError(
        typeof error === "object" && error !== null && "_tag" in error
          ? `Save rejected (${String(error._tag)})`
          : "Save failed",
      );
    }
  };

  const createGraph = async () => {
    const created = await agentClient.graphs.create(projectId, starterDraft);
    setSelectedGraphId(created.id);
    setDraft(undefined);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.graphs.byProject(projectId),
    });
  };

  const addNode = () => {
    edit((current) => {
      let index = current.nodes.length + 1;
      let id = slugify(`step-${index}`);
      while (id && current.nodes.some((node) => node.id === id)) {
        index += 1;
        id = slugify(`step-${index}`);
      }
      if (!id) return current;
      const node: GraphNode = {
        id,
        name: `Step ${index}`,
        promptTemplate: "Continue with: {{input}}",
        position: { x: 40 + index * 60, y: 200 },
      };
      return { ...current, nodes: [...current.nodes, node] };
    });
  };

  const removeSelectedNode = () => {
    if (!selectedNodeId) return;
    edit((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
      edges: current.edges.filter(
        (edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId,
      ),
    }));
    setSelectedNodeId(undefined);
  };

  const startRun = async () => {
    if (!selectedGraph || !runInput.trim()) return;
    sendRun({ type: "START" });
    try {
      const started = await agentClient.graphRuns.start(
        selectedGraph.id,
        newCommandId(),
        { input: runInput },
      );
      setActiveRunId(started.id);
      sendRun({ type: "STARTED" });
    } catch {
      sendRun({ type: "START_FAILED" });
    }
  };

  return (
    <div className="mt-8 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="size-4 text-blueprint" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
            Agent graphs
          </span>
        </div>
        <Button onClick={() => void createGraph()} size="sm" variant="outline">
          <Plus className="size-3.5" /> New graph
        </Button>
      </div>

      {graphs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {graphs.map((graph) => (
            <button
              className={`rounded-md border px-2.5 py-1 text-xs ${
                graph.id === selectedGraph?.id
                  ? "border-blueprint bg-blueprint text-panel"
                  : "border-line text-ink-muted hover:border-mist"
              }`}
              key={graph.id}
              onClick={() => {
                setSelectedGraphId(graph.id);
                setDraft(undefined);
                setSelectedNodeId(undefined);
              }}
              type="button"
            >
              {graph.name}
            </button>
          ))}
        </div>
      )}

      {definition && selectedGraph && (
        <div className="mt-4 grid gap-4">
          <GraphCanvas
            edges={definition.edges}
            nodeStatuses={nodeStatuses}
            nodes={definition.nodes}
            onConnect={(from, to) =>
              edit((current) =>
                current.edges.some(
                  (edge) => edge.from === from && edge.to === to,
                ) || from === to
                  ? current
                  : { ...current, edges: [...current.edges, { from, to }] },
              )
            }
            onMoveNode={(id, position) =>
              edit((current) => ({
                ...current,
                nodes: current.nodes.map((node) =>
                  node.id === id ? { ...node, position } : node,
                ),
              }))
            }
            onSelectNode={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={addNode} size="sm" variant="outline">
              Add node
            </Button>
            <Button
              disabled={!selectedNodeId}
              onClick={removeSelectedNode}
              size="sm"
              variant="ghost"
            >
              Remove node
            </Button>
            <Button
              disabled={
                editorState.value !== "editing" &&
                editorState.value !== "saveFailed"
              }
              onClick={() => void save()}
              size="sm"
            >
              Save graph
            </Button>
            {saveError && (
              <span className="text-xs text-destructive">{saveError}</span>
            )}
          </div>

          {selectedNode && (
            <div className="grid gap-2 rounded-lg border border-line-soft p-3">
              <label className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                Node {selectedNode.id}
              </label>
              <Input
                onChange={(event) =>
                  edit((current) => ({
                    ...current,
                    nodes: current.nodes.map((node) =>
                      node.id === selectedNode.id
                        ? { ...node, name: event.target.value }
                        : node,
                    ),
                  }))
                }
                value={selectedNode.name}
              />
              <textarea
                className="min-h-24 rounded-md border border-line bg-panel p-2 text-xs"
                onChange={(event) =>
                  edit((current) => ({
                    ...current,
                    nodes: current.nodes.map((node) =>
                      node.id === selectedNode.id
                        ? { ...node, promptTemplate: event.target.value }
                        : node,
                    ),
                  }))
                }
                value={selectedNode.promptTemplate}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-md"
              onChange={(event) => setRunInput(event.target.value)}
              placeholder="Kickoff prompt for this graph"
              value={runInput}
            />
            <Button
              disabled={runState.value === "starting"}
              onClick={() => void startRun()}
              size="sm"
              className="bg-signal text-panel hover:bg-signal-strong"
            >
              <Play className="size-3.5" /> Run graph
            </Button>
            {runStatus && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                run: {runStatus}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
