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
