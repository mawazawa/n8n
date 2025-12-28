/**
 * AnimatedConnection Component
 * Displays a connection between nodes with drawing animation
 */

import React, { useEffect, useState } from 'react';
import type { CanvasConnection } from '../hooks/useCanvasStream';

export interface AnimatedConnectionProps {
  connection: CanvasConnection;
  sourcePosition: [number, number];
  targetPosition: [number, number];
  onClick?: () => void;
  selected?: boolean;
}

export function AnimatedConnection({
  connection,
  sourcePosition,
  targetPosition,
  onClick,
  selected = false,
}: AnimatedConnectionProps) {
  const [animationProgress, setAnimationProgress] = useState(connection.isAnimating ? 0 : 1);

  useEffect(() => {
    if (connection.isAnimating) {
      let startTime: number | null = null;
      const duration = 300; // Animation duration in ms

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);

        setAnimationProgress(progress);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [connection.isAnimating]);

  // Calculate connection path
  const [sourceX, sourceY] = sourcePosition;
  const [targetX, targetY] = targetPosition;

  // Add node width offset (connection points are on the right/left edges)
  const startX = sourceX + 200; // Assuming 200px node width
  const startY = sourceY + 40; // Center of node (assuming 80px height)
  const endX = targetX;
  const endY = targetY + 40;

  // Calculate control points for smooth curve
  const controlPointOffset = Math.abs(endX - startX) * 0.5;
  const cp1x = startX + controlPointOffset;
  const cp1y = startY;
  const cp2x = endX - controlPointOffset;
  const cp2y = endY;

  // SVG path for Bezier curve
  const path = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

  // Calculate path length for animation
  const pathLength = Math.sqrt(
    Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
  );

  // Connection type colors
  const connectionColors: Record<string, string> = {
    main: '#6b7280', // gray-500
    ai_languageModel: '#3b82f6', // blue-500
    ai_tool: '#10b981', // green-500
    ai_memory: '#f59e0b', // amber-500
    ai_vectorStore: '#8b5cf6', // violet-500
    ai_outputParser: '#ec4899', // pink-500
  };

  const strokeColor = connectionColors[connection.type] || connectionColors.main;
  const strokeWidth = selected ? 3 : 2;

  // Calculate bounding box for SVG
  const minX = Math.min(startX, endX, cp1x, cp2x) - 10;
  const minY = Math.min(startY, endY, cp1y, cp2y) - 10;
  const maxX = Math.max(startX, endX, cp1x, cp2x) + 10;
  const maxY = Math.max(startY, endY, cp1y, cp2y) + 10;
  const width = maxX - minX;
  const height = maxY - minY;

  // Adjust path for SVG coordinate system
  const adjustedPath = `M ${startX - minX} ${startY - minY} C ${cp1x - minX} ${cp1y - minY}, ${cp2x - minX} ${cp2y - minY}, ${endX - minX} ${endY - minY}`;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: selected ? 10 : 1,
      }}
      onClick={onClick}
    >
      {/* Shadow/outline for better visibility */}
      <path
        d={adjustedPath}
        fill="none"
        stroke="white"
        strokeWidth={strokeWidth + 2}
        opacity={0.5}
      />

      {/* Main connection line */}
      <path
        d={adjustedPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={connection.isAnimating ? pathLength : 'none'}
        strokeDashoffset={connection.isAnimating ? pathLength * (1 - animationProgress) : 0}
        className={`transition-all duration-200 ${onClick ? 'pointer-events-auto cursor-pointer hover:opacity-80' : ''}`}
        opacity={selected ? 1 : 0.7}
      />

      {/* Animated flow indicator */}
      {!connection.isAnimating && (
        <>
          <circle
            r="3"
            fill={strokeColor}
            opacity={0.8}
            className="animate-flow"
          >
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={adjustedPath}
            />
          </circle>

          {/* Arrow head */}
          <defs>
            <marker
              id={`arrowhead-${connection.source}-${connection.target}`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L0,6 L9,3 z"
                fill={strokeColor}
              />
            </marker>
          </defs>
          <path
            d={adjustedPath}
            fill="none"
            stroke="transparent"
            strokeWidth={strokeWidth}
            markerEnd={`url(#arrowhead-${connection.source}-${connection.target})`}
          />
        </>
      )}

      {/* Connection type label */}
      {connection.type !== 'main' && (
        <text
          x={(startX - minX + endX - minX) / 2}
          y={(startY - minY + endY - minY) / 2 - 10}
          fontSize="10"
          fill={strokeColor}
          textAnchor="middle"
          className="font-mono"
          opacity={0.8}
        >
          {connection.type.replace('ai_', '')}
        </text>
      )}
    </svg>
  );
}
