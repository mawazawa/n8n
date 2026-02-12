/**
 * MiniCanvas Component
 * Shows a mini preview of the workflow canvas in the chat panel
 */

import React, { useRef, useEffect } from 'react';
import type { CanvasNode, CanvasConnection } from '../hooks/useCanvasStream';

export interface MiniCanvasProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function MiniCanvas({
  nodes,
  connections,
  width = 300,
  height = 200,
  className = '',
  onClick,
  showGrid = true,
  showLabels = false,
}: MiniCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid background
    if (showGrid) {
      drawGrid(ctx, width, height);
    }

    if (nodes.length === 0) {
      // Show empty state
      drawEmptyState(ctx, width, height);
      return;
    }

    // Calculate bounding box for all nodes
    const bounds = calculateBounds(nodes);
    const scale = calculateScale(bounds, width, height);
    const offset = calculateOffset(bounds, scale, width, height);

    // Draw connections
    connections.forEach((conn) => {
      const sourceNode = nodes.find((n) => n.name === conn.source || n.id === conn.source);
      const targetNode = nodes.find((n) => n.name === conn.target || n.id === conn.target);

      if (sourceNode && targetNode) {
        drawConnection(ctx, sourceNode, targetNode, scale, offset, conn.type);
      }
    });

    // Draw nodes
    nodes.forEach((node) => {
      drawNode(ctx, node, scale, offset, showLabels);
    });
  }, [nodes, connections, width, height, showGrid, showLabels]);

  return (
    <div
      className={`relative bg-gray-50 rounded-lg border border-gray-200 overflow-hidden ${
        onClick ? 'cursor-pointer hover:border-blue-400 transition-colors' : ''
      } ${className}`}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full"
      />

      {/* Node count badge */}
      {nodes.length > 0 && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-medium px-2 py-1 rounded-full">
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Click hint */}
      {onClick && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded">
          Click to view full canvas
        </div>
      )}
    </div>
  );
}

/**
 * Draw grid background
 */
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;

  const gridSize = 20;

  // Vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Draw empty state
 */
function drawEmptyState(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#9ca3af';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No nodes yet', width / 2, height / 2);
}

/**
 * Calculate bounding box for all nodes
 */
function calculateBounds(nodes: CanvasNode[]) {
  const positions = nodes.map((n) => n.position);
  const xs = positions.map((p) => p[0]);
  const ys = positions.map((p) => p[1]);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs) + 200, // Add node width
    minY: Math.min(...ys),
    maxY: Math.max(...ys) + 80, // Add node height
  };
}

/**
 * Calculate scale to fit all nodes
 */
function calculateScale(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  width: number,
  height: number
) {
  const padding = 20;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;

  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;

  return Math.min(scaleX, scaleY, 1); // Don't scale up
}

/**
 * Calculate offset to center content
 */
function calculateOffset(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  scale: number,
  width: number,
  height: number
) {
  const contentWidth = (bounds.maxX - bounds.minX) * scale;
  const contentHeight = (bounds.maxY - bounds.minY) * scale;

  return {
    x: (width - contentWidth) / 2 - bounds.minX * scale,
    y: (height - contentHeight) / 2 - bounds.minY * scale,
  };
}

/**
 * Draw a node
 */
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  scale: number,
  offset: { x: number; y: number },
  showLabel: boolean
) {
  const [x, y] = node.position;
  const scaledX = x * scale + offset.x;
  const scaledY = y * scale + offset.y;
  const nodeWidth = 200 * scale;
  const nodeHeight = 80 * scale;

  // Node background
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(scaledX, scaledY, nodeWidth, nodeHeight, 4 * scale);
  ctx.fill();
  ctx.stroke();

  // Node accent (type indicator)
  ctx.fillStyle = getNodeColor(node.type);
  ctx.fillRect(scaledX, scaledY, nodeWidth, 3 * scale);

  // Node label (if enabled and scale is large enough)
  if (showLabel && scale > 0.5) {
    ctx.fillStyle = '#374151';
    ctx.font = `${Math.max(10 * scale, 8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = nodeWidth - 10 * scale;
    const truncatedName = truncateText(ctx, node.name, maxWidth);
    ctx.fillText(truncatedName, scaledX + nodeWidth / 2, scaledY + nodeHeight / 2);
  }
}

/**
 * Draw a connection
 */
function drawConnection(
  ctx: CanvasRenderingContext2D,
  source: CanvasNode,
  target: CanvasNode,
  scale: number,
  offset: { x: number; y: number },
  connectionType: string
) {
  const [sx, sy] = source.position;
  const [tx, ty] = target.position;

  const startX = (sx + 200) * scale + offset.x; // Right edge of source
  const startY = (sy + 40) * scale + offset.y; // Center of source
  const endX = tx * scale + offset.x; // Left edge of target
  const endY = (ty + 40) * scale + offset.y; // Center of target

  // Draw curved connection
  ctx.strokeStyle = getConnectionColor(connectionType);
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(startX, startY);

  const cp1x = startX + 50 * scale;
  const cp2x = endX - 50 * scale;
  ctx.bezierCurveTo(cp1x, startY, cp2x, endY, endX, endY);
  ctx.stroke();

  // Draw arrow
  const arrowSize = 6 * scale;
  const angle = Math.atan2(endY - startY, endX - startX);

  ctx.fillStyle = getConnectionColor(connectionType);
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowSize * Math.cos(angle - Math.PI / 6),
    endY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - arrowSize * Math.cos(angle + Math.PI / 6),
    endY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Get color for node type
 */
function getNodeColor(type: string): string {
  if (type.includes('trigger') || type.includes('webhook')) return '#10b981'; // green
  if (type.includes('langchain') || type.includes('ai')) return '#3b82f6'; // blue
  if (type.includes('code') || type.includes('function')) return '#8b5cf6'; // purple
  return '#6b7280'; // gray
}

/**
 * Get color for connection type
 */
function getConnectionColor(type: string): string {
  const colors: Record<string, string> = {
    main: '#6b7280',
    ai_languageModel: '#3b82f6',
    ai_tool: '#10b981',
    ai_memory: '#f59e0b',
    ai_vectorStore: '#8b5cf6',
  };
  return colors[type] || colors.main;
}

/**
 * Truncate text to fit width
 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const metrics = ctx.measureText(text);
  if (metrics.width <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
