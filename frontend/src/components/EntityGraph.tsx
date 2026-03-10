import { useRef, useEffect, useMemo, useCallback } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { RelationshipWithEntities } from '@ledger/shared';

// Node/link types for the graph
interface GraphNode {
  id: string;
  name: string;
  type: string;
  connectionCount: number;
  isFocus?: boolean;
}

interface GraphLink {
  source: string;
  target: string;
  relationshipType: string;
  label: string;
  ownershipPercentage?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Entity type → color
const entityTypeColors: Record<string, string> = {
  CORPORATION: '#3b82f6',            // blue
  AGENCY: '#8b5cf6',                 // purple
  NONPROFIT: '#22c55e',              // green
  VENDOR: '#f97316',                 // orange
  INDIVIDUAL_PUBLIC_OFFICIAL: '#ef4444', // red
};
const DEFAULT_NODE_COLOR = '#6b7280'; // gray

// Relationship type → color
const relationshipTypeColors: Record<string, string> = {
  OWNS: '#3b82f6',
  CONTROLS: '#8b5cf6',
  SUBSIDIARY_OF: '#06b6d4',
  ACQUIRED: '#f59e0b',
  DIVESTED: '#ef4444',
  PARENT_OF: '#3b82f6',
  CONTRACTOR_TO: '#f97316',
  REGULATED_BY: '#8b5cf6',
  BOARD_INTERLOCK: '#ec4899',
  LOBBIED_BY: '#a855f7',
  JV_PARTNER: '#14b8a6',
  AFFILIATED: '#6b7280',
  OTHER: '#9ca3af',
};
const DEFAULT_LINK_COLOR = '#d1d5db';

// Relationship type → human label
const relationshipLabels: Record<string, string> = {
  OWNS: 'Owns',
  CONTROLS: 'Controls',
  SUBSIDIARY_OF: 'Subsidiary Of',
  ACQUIRED: 'Acquired',
  DIVESTED: 'Divested',
  JV_PARTNER: 'JV Partner',
  AFFILIATED: 'Affiliated',
  PARENT_OF: 'Parent Of',
  CONTRACTOR_TO: 'Contractor To',
  REGULATED_BY: 'Regulated By',
  BOARD_INTERLOCK: 'Board Interlock',
  LOBBIED_BY: 'Lobbied By',
  OTHER: 'Other',
};

interface EntityGraphProps {
  relationships: RelationshipWithEntities[];
  focusEntityId?: string;
  width?: number;
  height?: number;
  onNodeClick?: (entityId: string) => void;
}

/**
 * Transform RelationshipWithEntities[] into graph nodes + links.
 */
function buildGraphData(
  relationships: RelationshipWithEntities[],
  focusEntityId?: string
): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  for (const rel of relationships) {
    // Add from entity
    if (!nodeMap.has(rel.fromEntity.entityId)) {
      nodeMap.set(rel.fromEntity.entityId, {
        id: rel.fromEntity.entityId,
        name: rel.fromEntity.name,
        type: rel.fromEntity.type,
        connectionCount: 0,
        isFocus: rel.fromEntity.entityId === focusEntityId,
      });
    }
    nodeMap.get(rel.fromEntity.entityId)!.connectionCount++;

    // Add to entity
    if (!nodeMap.has(rel.toEntity.entityId)) {
      nodeMap.set(rel.toEntity.entityId, {
        id: rel.toEntity.entityId,
        name: rel.toEntity.name,
        type: rel.toEntity.type,
        connectionCount: 0,
        isFocus: rel.toEntity.entityId === focusEntityId,
      });
    }
    nodeMap.get(rel.toEntity.entityId)!.connectionCount++;

    // Build edge label
    let label = relationshipLabels[rel.type] || rel.type;
    if (rel.ownershipPercentage !== undefined) {
      label += ` (${rel.ownershipPercentage}%)`;
    }

    links.push({
      source: rel.fromEntityId,
      target: rel.toEntityId,
      relationshipType: rel.type,
      label,
      ownershipPercentage: rel.ownershipPercentage,
    });
  }

  return { nodes: Array.from(nodeMap.values()), links };
}

export default function EntityGraph({
  relationships,
  focusEntityId,
  width,
  height = 500,
  onNodeClick,
}: EntityGraphProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = useMemo(
    () => buildGraphData(relationships, focusEntityId),
    [relationships, focusEntityId]
  );

  // Center on focus node after initial render
  useEffect(() => {
    if (focusEntityId && graphRef.current) {
      const timer = setTimeout(() => {
        const node = graphData.nodes.find((n) => n.id === focusEntityId);
        if (node && graphRef.current) {
          graphRef.current.centerAt(
            (node as GraphNode & { x?: number }).x,
            (node as GraphNode & { y?: number }).y,
            500
          );
          graphRef.current.zoom(1.5, 500);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [focusEntityId, graphData.nodes]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  // Custom node rendering with labels
  const paintNode = useCallback(
    (node: GraphNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const baseSize = 4 + Math.min(node.connectionCount * 2, 12);
      const size = node.isFocus ? baseSize * 1.4 : baseSize;
      const color = entityTypeColors[node.type] || DEFAULT_NODE_COLOR;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Focus ring
      if (node.isFocus) {
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw label if zoomed in enough
      if (globalScale > 0.6) {
        const fontSize = Math.max(10 / globalScale, 3);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#1f2937';
        ctx.fillText(node.name, x, y + size + 2);
      }
    },
    []
  );

  if (graphData.nodes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No relationships to display.</p>
      </div>
    );
  }

  function handleZoomIn() {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom * 1.5, 300);
    }
  }

  function handleZoomOut() {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom / 1.5, 300);
    }
  }

  function handleZoomFit() {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 40);
    }
  }

  return (
    <div ref={containerRef} className="border rounded-lg overflow-hidden bg-gray-50 relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow-sm text-gray-700 hover:bg-gray-50 flex items-center justify-center text-lg font-bold"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow-sm text-gray-700 hover:bg-gray-50 flex items-center justify-center text-lg font-bold"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={handleZoomFit}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow-sm text-gray-700 hover:bg-gray-50 flex items-center justify-center text-xs"
          title="Fit to view"
        >
          Fit
        </button>
      </div>

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={width || containerRef.current?.clientWidth || 800}
        height={height}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: GraphNode & { x?: number; y?: number }, color, ctx) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const size = 4 + Math.min(node.connectionCount * 2, 12);
          ctx.beginPath();
          ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        onNodeClick={handleNodeClick}
        nodeLabel={(node: GraphNode) =>
          `${node.name} (${node.type.replace(/_/g, ' ').toLowerCase()})`
        }
        linkLabel={(link: GraphLink) => link.label}
        linkColor={(link: GraphLink) =>
          relationshipTypeColors[link.relationshipType] || DEFAULT_LINK_COLOR
        }
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.85}
        linkWidth={1.5}
        linkCurvature={0.15}
        cooldownTicks={100}
        enableNodeDrag={true}
      />
    </div>
  );
}

// Re-export maps for use in legend/filters
export { entityTypeColors, relationshipTypeColors, relationshipLabels };
