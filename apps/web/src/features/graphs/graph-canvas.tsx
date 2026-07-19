import type {
  GraphEdge,
  GraphNode,
  GraphNodeId,
  GraphNodeRunStatus,
} from "@repo/contracts";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Option } from "effect";
import { useCallback } from "react";
import { decodeGraphNodeId } from "./graph-identifiers.js";

interface NodeCardData extends Record<string, unknown> {
  readonly title: string;
  readonly slug: string;
  readonly status: GraphNodeRunStatus | undefined;
  readonly selected: boolean;
}

const statusRing: Readonly<Record<GraphNodeRunStatus, string>> = {
  pending: "ring-ink-subtle",
  ready: "ring-ink-subtle",
  running: "ring-blueprint",
  "awaiting-approval": "ring-warning",
  completed: "ring-success",
  failed: "ring-destructive",
  skipped: "ring-mist",
};

const NodeCard = ({ data }: { readonly data: NodeCardData }) => (
  <div
    className={`min-w-32 rounded-md border bg-panel px-3 py-2 text-left shadow-sm ${
      data.selected ? "border-blueprint" : "border-line"
    } ${data.status ? `ring-2 ${statusRing[data.status]}` : ""}`}
  >
    <Handle position={Position.Left} type="target" />
    <div className="text-xs font-medium text-ink">{data.title}</div>
    <div className="font-mono text-[10px] text-ink-subtle">{data.slug}</div>
    {data.status && (
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        {data.status}
      </div>
    )}
    <Handle position={Position.Right} type="source" />
  </div>
);

const nodeTypes = { card: NodeCard };

export interface GraphCanvasProps {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly nodeStatuses: ReadonlyMap<GraphNodeId, GraphNodeRunStatus>;
  readonly selectedNodeId: GraphNodeId | undefined;
  readonly onSelectNode: (id: GraphNodeId | undefined) => void;
  readonly onMoveNode: (
    id: GraphNodeId,
    position: { x: number; y: number },
  ) => void;
  readonly onConnect: (from: GraphNodeId, to: GraphNodeId) => void;
}

export const GraphCanvas = ({
  nodes,
  edges,
  nodeStatuses,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onConnect,
}: GraphCanvasProps) => {
  const flowNodes: Array<Node<NodeCardData>> = nodes.map((node) => ({
    id: node.id,
    type: "card",
    position: node.position,
    data: {
      title: node.name,
      slug: node.id,
      status: nodeStatuses.get(node.id),
      selected: node.id === selectedNodeId,
    },
  }));
  const flowEdges: Array<Edge> = edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
  }));

  const handleNodesChange = useCallback(
    (changes: Array<NodeChange<Node<NodeCardData>>>) => {
      for (const change of applyNodeChanges(changes, flowNodes)) {
        const original = nodes.find((node) => node.id === change.id);
        if (
          original &&
          (original.position.x !== change.position.x ||
            original.position.y !== change.position.y)
        ) {
          onMoveNode(original.id, change.position);
        }
      }
    },
    [flowNodes, nodes, onMoveNode],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const source = Option.getOrUndefined(
          decodeGraphNodeId(connection.source),
        );
        const target = Option.getOrUndefined(
          decodeGraphNodeId(connection.target),
        );
        if (source && target) onConnect(source, target);
      }
    },
    [onConnect],
  );

  return (
    <div className="h-105 rounded-lg border border-line-soft bg-surface-raised">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onNodeClick={(_event, node) =>
          onSelectNode(Option.getOrUndefined(decodeGraphNodeId(node.id)))
        }
        onPaneClick={() => onSelectNode(undefined)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
      </ReactFlow>
    </div>
  );
};
