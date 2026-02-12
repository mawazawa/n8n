/**
 * BuildProgress Component
 * Shows progress indicator during multi-node workflow creation
 */

import React from 'react';

export interface BuildProgressProps {
  current: number;
  total: number;
  phase?: string | null;
  isBuilding?: boolean;
  className?: string;
}

export function BuildProgress({
  current,
  total,
  phase = null,
  isBuilding = false,
  className = '',
}: BuildProgressProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  if (!isBuilding && current === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isBuilding && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          <h3 className="text-sm font-semibold text-gray-800">
            {isBuilding ? 'Building Workflow' : 'Build Complete'}
          </h3>
        </div>
        <span className="text-xs text-gray-500">
          {current} / {total} nodes
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        >
          {/* Animated shimmer effect */}
          {isBuilding && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer" />
          )}
        </div>
      </div>

      {/* Details */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {isBuilding ? getProgressMessage(current, total) : '✓ All nodes created'}
        </span>
        <span className="text-xs font-medium text-blue-600">{percentage}%</span>
      </div>

      {/* Phase Indicator */}
      {phase && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-600 capitalize">{phase}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generate progress message based on current state
 */
function getProgressMessage(current: number, total: number): string {
  const remaining = total - current;

  if (current === 0) {
    return 'Starting...';
  }

  if (current === total) {
    return 'Finishing up...';
  }

  const messages = [
    `Creating node ${current} of ${total}...`,
    `Building workflow (${remaining} remaining)...`,
    `Adding nodes (${current}/${total})...`,
  ];

  // Rotate through messages based on current count
  return messages[current % messages.length];
}

/**
 * Compact version for inline display
 */
export function BuildProgressCompact({
  current,
  total,
  isBuilding = false,
}: Omit<BuildProgressProps, 'className' | 'phase'>) {
  if (!isBuilding && current === 0) {
    return null;
  }

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      {isBuilding && (
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}
      <span>
        {isBuilding ? 'Building' : 'Built'}: {current}/{total}
      </span>
      <div className="flex-1 min-w-[60px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-blue-600 font-medium">{percentage}%</span>
    </div>
  );
}

/**
 * Floating overlay version for canvas
 */
export function BuildProgressOverlay({
  current,
  total,
  phase = null,
  isBuilding = false,
}: Omit<BuildProgressProps, 'className'>) {
  if (!isBuilding && current === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-from-top">
      <BuildProgress
        current={current}
        total={total}
        phase={phase}
        isBuilding={isBuilding}
        className="min-w-[300px]"
      />
    </div>
  );
}
