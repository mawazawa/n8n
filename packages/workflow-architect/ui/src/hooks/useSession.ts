import { useState, useEffect, useCallback } from 'react';
import type { Message, WorkflowState } from './useWorkflowStream';

export interface Session {
  id: string;
  name: string;
  messages: Message[];
  workflow: WorkflowState | null;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'workflow-architect-sessions';
const MAX_SESSIONS = 10;

export function useSession() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Session[];
        setSessions(parsed);
        // Set current session to most recent
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
        }
      }
    } catch {
      console.error('Failed to load sessions');
    }
  }, []);

  // Save sessions to localStorage
  const saveSessions = useCallback((newSessions: Session[]) => {
    try {
      // Keep only the most recent sessions
      const trimmed = newSessions.slice(0, MAX_SESSIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      setSessions(trimmed);
    } catch {
      console.error('Failed to save sessions');
    }
  }, []);

  const currentSession = sessions.find((s) => s.id === currentSessionId) || null;

  const createSession = useCallback(
    (name?: string): string => {
      const newSession: Session = {
        id: `session-${Date.now()}`,
        name: name || `Chat ${sessions.length + 1}`,
        messages: [],
        workflow: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      saveSessions([newSession, ...sessions]);
      setCurrentSessionId(newSession.id);
      return newSession.id;
    },
    [sessions, saveSessions],
  );

  const updateSession = useCallback(
    (sessionId: string, updates: Partial<Pick<Session, 'name' | 'messages' | 'workflow'>>) => {
      const newSessions = sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              ...updates,
              updatedAt: Date.now(),
            }
          : s,
      );
      saveSessions(newSessions.sort((a, b) => b.updatedAt - a.updatedAt));
    },
    [sessions, saveSessions],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      const newSessions = sessions.filter((s) => s.id !== sessionId);
      saveSessions(newSessions);

      if (currentSessionId === sessionId) {
        setCurrentSessionId(newSessions[0]?.id || null);
      }
    },
    [sessions, currentSessionId, saveSessions],
  );

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const renameSession = useCallback(
    (sessionId: string, name: string) => {
      updateSession(sessionId, { name });
    },
    [updateSession],
  );

  return {
    sessions,
    currentSession,
    currentSessionId,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    renameSession,
  };
}
