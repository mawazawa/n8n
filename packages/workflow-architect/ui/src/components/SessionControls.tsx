import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, MessageSquare } from 'lucide-react';
import type { Session } from '../hooks/useSession';

interface SessionControlsProps {
  sessions: Session[];
  currentSessionId: string | null;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
}

export function SessionControls({
  sessions,
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
}: SessionControlsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startEditing = (session: Session) => {
    setEditingId(session.id);
    setEditName(session.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onRenameSession(editingId, editName.trim());
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="p-2 space-y-1">
      {/* New session button */}
      <button
        onClick={onCreateSession}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        New chat
      </button>

      {/* Session list */}
      <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              session.id === currentSessionId
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />

            {editingId === session.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  className="flex-1 bg-transparent border-b border-primary-500 focus:outline-none text-sm"
                  autoFocus
                />
                <button
                  onClick={saveEdit}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <Check className="w-3 h-3 text-green-500" />
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-3 h-3 text-red-500" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSwitchSession(session.id)}
                  className="flex-1 text-left text-sm truncate"
                >
                  {session.name}
                </button>
                <button
                  onClick={() => startEditing(session)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onDeleteSession(session.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <p className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500 text-center">
          No sessions yet
        </p>
      )}
    </div>
  );
}

export default SessionControls;
