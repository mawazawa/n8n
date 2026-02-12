/**
 * AnimatedNode Component
 * Displays a workflow node with fade-in animation
 */

import React, { useEffect, useState } from 'react';
import type { CanvasNode } from '../hooks/useCanvasStream';

export interface AnimatedNodeProps {
  node: CanvasNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  selected?: boolean;
}

export function AnimatedNode({ node, onClick, onDoubleClick, selected = false }: AnimatedNodeProps) {
  const [isVisible, setIsVisible] = useState(!node.isAnimating);

  useEffect(() => {
    if (node.isAnimating) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, node.animationDelay || 0);

      return () => clearTimeout(timer);
    }
  }, [node.isAnimating, node.animationDelay]);

  const baseClasses = [
    'absolute',
    'bg-white',
    'border-2',
    'border-gray-300',
    'rounded-lg',
    'shadow-md',
    'cursor-pointer',
    'transition-all',
    'duration-500',
    'ease-out',
  ];

  const animationClasses = isVisible
    ? ['opacity-100', 'scale-100', 'translate-y-0']
    : ['opacity-0', 'scale-95', 'translate-y-2'];

  const selectedClasses = selected
    ? ['border-blue-500', 'shadow-lg', 'ring-2', 'ring-blue-300']
    : ['hover:border-gray-400', 'hover:shadow-lg'];

  const allClasses = [...baseClasses, ...animationClasses, ...selectedClasses].join(' ');

  const [x, y] = node.position;

  return (
    <div
      className={allClasses}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        minWidth: '200px',
        minHeight: '80px',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-node-id={node.id}
      data-node-type={node.type}
    >
      <div className="p-4">
        {/* Node Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center text-white text-sm font-bold">
            {getNodeIcon(node.type)}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{node.name}</div>
            <div className="text-xs text-gray-500 truncate">{node.type}</div>
          </div>
        </div>

        {/* Execution Status Indicator (placeholder) */}
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: '0%' }} />
        </div>

        {/* Connection Points */}
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md" />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-md" />
      </div>

      {/* Animation Pulse Effect */}
      {node.isAnimating && isVisible && (
        <div className="absolute inset-0 rounded-lg animate-ping opacity-25 bg-blue-400 pointer-events-none" />
      )}
    </div>
  );
}

/**
 * Get icon/emoji for node type
 */
function getNodeIcon(type: string): string {
  // Map common node types to icons
  const iconMap: Record<string, string> = {
    'n8n-nodes-base.start': '▶',
    'n8n-nodes-base.manualTrigger': '👆',
    'n8n-nodes-base.webhook': '🌐',
    'n8n-nodes-base.httpRequest': '🔗',
    'n8n-nodes-base.code': '💻',
    'n8n-nodes-base.set': '📝',
    'n8n-nodes-base.if': '🔀',
    'n8n-nodes-base.switch': '🔄',
    'n8n-nodes-base.merge': '🔗',
    'n8n-nodes-base.split': '✂',
    'n8n-nodes-base.function': 'ƒ',
    'n8n-nodes-base.slack': 'S',
    'n8n-nodes-base.gmail': '✉',
    'n8n-nodes-base.googleSheets': '📊',
    'n8n-nodes-base.notion': 'N',
    '@n8n/n8n-nodes-langchain.agent': '🤖',
    '@n8n/n8n-nodes-langchain.chainLlm': '⛓',
    '@n8n/n8n-nodes-langchain.lmChatOpenAi': '🧠',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic': '🤖',
    '@n8n/n8n-nodes-langchain.toolCode': '🛠',
    '@n8n/n8n-nodes-langchain.toolCalculator': '🔢',
    '@n8n/n8n-nodes-langchain.memoryBufferWindow': '💾',
    '@n8n/n8n-nodes-langchain.vectorStoreInMemory': '📚',
  };

  return iconMap[type] || '⚙';
}
