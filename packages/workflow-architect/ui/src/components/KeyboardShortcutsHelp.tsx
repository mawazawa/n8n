import React from 'react';

/**
 * Keyboard Shortcuts Help Component
 * Displays a list of available keyboard shortcuts
 */
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

export default KeyboardShortcutsHelp;
