import React from 'react';
import { Search, Hammer, Settings, MessageSquare, Check } from 'lucide-react';

interface PhaseIndicatorProps {
  phase: string;
}

const PHASES = [
  { id: 'discovery', label: 'Discovering', icon: Search },
  { id: 'builder', label: 'Building', icon: Hammer },
  { id: 'configurator', label: 'Configuring', icon: Settings },
  { id: 'responder', label: 'Responding', icon: MessageSquare },
];

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const currentPhaseIndex = PHASES.findIndex((p) => p.id === phase);

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      {PHASES.map((p, index) => {
        const Icon = p.icon;
        const isActive = p.id === phase;
        const isCompleted = index < currentPhaseIndex;
        const isPending = index > currentPhaseIndex;

        return (
          <React.Fragment key={p.id}>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${
                isActive
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : isCompleted
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {isCompleted ? (
                <Check className="w-4 h-4" />
              ) : (
                <Icon className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
              )}
              <span className="text-sm font-medium">{p.label}</span>
            </div>
            {index < PHASES.length - 1 && (
              <div
                className={`w-4 h-0.5 ${
                  isCompleted
                    ? 'bg-green-400 dark:bg-green-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default PhaseIndicator;
