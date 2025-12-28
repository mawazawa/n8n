import React, { useRef, useEffect } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { WorkflowPreview } from './components/WorkflowPreview';
import { ThemeToggle } from './components/ThemeToggle';
import { SessionControls } from './components/SessionControls';
import { useWorkflowStream } from './hooks/useWorkflowStream';
import { useSession } from './hooks/useSession';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Menu, X, Zap } from 'lucide-react';

function App() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { toggleTheme } = useTheme();
  const {
    sessions,
    currentSession,
    currentSessionId,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    renameSession,
  } = useSession();

  const {
    messages,
    workflow,
    currentPhase,
    isStreaming,
    sendMessage,
    clearMessages,
  } = useWorkflowStream({
    threadId: currentSessionId || undefined,
    onWorkflowUpdate: (newWorkflow) => {
      if (currentSessionId) {
        updateSession(currentSessionId, { workflow: newWorkflow });
      }
    },
  });

  // Sync messages with session
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      updateSession(currentSessionId, { messages });
    }
  }, [messages, currentSessionId, updateSession]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewSession: () => createSession(),
    onToggleTheme: toggleTheme,
    onFocusInput: () => inputRef.current?.focus(),
    onCancel: () => setSidebarOpen(false),
  });

  const handleNewChat = () => {
    createSession();
    clearMessages();
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              Workflow Architect
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Session controls */}
        <SessionControls
          sessions={sessions}
          currentSessionId={currentSessionId}
          onCreateSession={handleNewChat}
          onSwitchSession={switchSession}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
        />

        {/* Sidebar footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-800">
          <ThemeToggle showLabels />
        </div>
      </aside>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 lg:hidden" />
          <div className="hidden lg:block">
            {currentSession && (
              <h1 className="font-medium text-gray-900 dark:text-gray-100">
                {currentSession.name}
              </h1>
            )}
          </div>
          <ThemeToggle />
        </header>

        {/* Chat and preview */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat panel */}
          <div className="flex-1 flex flex-col min-w-0">
            <ChatPanel
              messages={currentSession?.messages || messages}
              isStreaming={isStreaming}
              currentPhase={currentPhase}
              onSend={sendMessage}
              onClear={clearMessages}
            />
          </div>

          {/* Workflow preview (desktop only) */}
          <div className="hidden lg:block w-96 border-l border-gray-200 dark:border-gray-700 overflow-auto">
            <WorkflowPreview workflow={currentSession?.workflow || workflow} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
