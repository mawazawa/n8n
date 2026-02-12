import React, { useState } from 'react';
import { GitBranch, ChevronDown, ChevronUp, Clock, Check } from 'lucide-react';

export interface ConversationBranch {
  id: string;
  name: string;
  parentBranchId?: string;
  createdAt: number;
  messageCount: number;
  lastMessage?: string;
}

interface BranchSelectorProps {
  branches: ConversationBranch[];
  currentBranchId: string;
  onSelectBranch: (branchId: string) => void;
  onCreateBranch?: (fromBranchId: string, name: string) => void;
}

export function BranchSelector({
  branches,
  currentBranchId,
  onSelectBranch,
  onCreateBranch,
}: BranchSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNewBranchForm, setShowNewBranchForm] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const currentBranch = branches.find((b) => b.id === currentBranchId);

  const handleCreateBranch = () => {
    if (newBranchName.trim() && onCreateBranch) {
      onCreateBranch(currentBranchId, newBranchName.trim());
      setNewBranchName('');
      setShowNewBranchForm(false);
    }
  };

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* Current branch header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        aria-expanded={isExpanded}
        aria-label="Toggle conversation branches"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {currentBranch?.name || 'Main conversation'}
          </span>
          {branches.length > 1 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {branches.length} branches
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Branch list */}
      {isExpanded && (
        <div className="px-4 py-2 space-y-1 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          {branches.map((branch) => {
            const isActive = branch.id === currentBranchId;
            const isNested = !!branch.parentBranchId;

            return (
              <button
                key={branch.id}
                onClick={() => {
                  onSelectBranch(branch.id);
                  setIsExpanded(false);
                }}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                } ${isNested ? 'ml-4' : ''}`}
              >
                {/* Branch icon */}
                <div className="flex-shrink-0 mt-1">
                  {isActive ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <GitBranch className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                {/* Branch info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{branch.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {branch.messageCount} msgs
                    </span>
                  </div>

                  {branch.lastMessage && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {branch.lastMessage}
                    </p>
                  )}

                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimestamp(branch.createdAt)}</span>
                  </div>
                </div>
              </button>
            );
          })}

          {/* New branch form */}
          {showNewBranchForm ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-primary-300 dark:border-primary-700">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBranch();
                  if (e.key === 'Escape') {
                    setShowNewBranchForm(false);
                    setNewBranchName('');
                  }
                }}
                placeholder="Branch name..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-gray-900 dark:text-gray-100"
                autoFocus
              />
              <button
                onClick={handleCreateBranch}
                className="p-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded"
                aria-label="Create branch"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setShowNewBranchForm(false);
                  setNewBranchName('');
                }}
                className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                aria-label="Cancel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          ) : (
            onCreateBranch && (
              <button
                onClick={() => setShowNewBranchForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <GitBranch className="w-4 h-4" />
                Create new branch
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default BranchSelector;
