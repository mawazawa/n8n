import { useEffect, useCallback } from 'react';

export interface ShortcutHandlers {
  onSubmit?: () => void;
  onCancel?: () => void;
  onNewSession?: () => void;
  onToggleTheme?: () => void;
  onFocusInput?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { key, metaKey, ctrlKey, shiftKey } = e;
      const isMod = metaKey || ctrlKey;

      // Cmd/Ctrl + Enter: Submit
      if (isMod && key === 'Enter') {
        e.preventDefault();
        handlers.onSubmit?.();
        return;
      }

      // Escape: Cancel
      if (key === 'Escape') {
        e.preventDefault();
        handlers.onCancel?.();
        return;
      }

      // Cmd/Ctrl + Shift + N: New session
      if (isMod && shiftKey && key === 'n') {
        e.preventDefault();
        handlers.onNewSession?.();
        return;
      }

      // Cmd/Ctrl + Shift + L: Toggle theme
      if (isMod && shiftKey && key === 'l') {
        e.preventDefault();
        handlers.onToggleTheme?.();
        return;
      }

      // Cmd/Ctrl + K or /: Focus input
      if ((isMod && key === 'k') || key === '/') {
        // Don't prevent if already in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        handlers.onFocusInput?.();
        return;
      }
    },
    [handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function KeyboardShortcutsHelp() {
  const shortcuts = [
    { keys: ['⌘', 'Enter'], description: 'Send message' },
    { keys: ['Esc'], description: 'Cancel / Close' },
    { keys: ['⌘', '⇧', 'N'], description: 'New session' },
    { keys: ['⌘', '⇧', 'L'], description: 'Toggle theme' },
    { keys: ['⌘', 'K'], description: 'Focus input' },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Keyboard Shortcuts</h3>
      <div className="space-y-1">
        {shortcuts.map(({ keys, description }) => (
          <div key={description} className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{description}</span>
            <div className="flex items-center gap-1">
              {keys.map((key, i) => (
                <kbd
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
