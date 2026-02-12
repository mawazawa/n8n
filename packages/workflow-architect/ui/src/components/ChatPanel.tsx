import React, { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { PhaseIndicator } from './PhaseIndicator';
import type { Message } from '../hooks/useWorkflowStream';

interface ChatPanelProps {
  messages: Message[];
  isStreaming: boolean;
  currentPhase: string | null;
  onSend: (message: string) => void;
  onClear?: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  currentPhase,
  onSend,
  onClear,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Workflow Architect</h2>
        </div>
        {onClear && messages.length > 0 && (
          <button
            onClick={onClear}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Welcome to Workflow Architect
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              Describe the automation you want to build in natural language. I'll create an n8n
              workflow for you with the right nodes, connections, and configurations.
            </p>
            <div className="mt-6 space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <p>Try something like:</p>
              <ul className="space-y-1">
                <li>"Send a Slack message when a new GitHub issue is created"</li>
                <li>"Sync new Airtable records to Google Sheets daily"</li>
                <li>"Build an AI agent that answers questions from a PDF"</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}

        {/* Streaming indicators */}
        {isStreaming && (
          <div className="p-4 space-y-3">
            {currentPhase && <PhaseIndicator phase={currentPhase} />}
            <TypingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} disabled={isStreaming} />
    </div>
  );
}

export default ChatPanel;
