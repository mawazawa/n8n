/**
 * Architect Keyboard Shortcuts
 *
 * This composable manages keyboard shortcuts for the Workflow Architect.
 * Primary shortcut: Cmd+Shift+A (Mac) / Ctrl+Shift+A (Windows/Linux) to open the architect.
 */

import { onMounted, onUnmounted } from 'vue';
import { useWorkflowArchitectStore } from './architect.store';

/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  handler: () => void;
}

/**
 * Shortcut action types
 */
export enum ShortcutAction {
  OPEN_ARCHITECT = 'openArchitect',
  CLOSE_ARCHITECT = 'closeArchitect',
  SEND_MESSAGE = 'sendMessage',
  CLEAR_INPUT = 'clearInput',
  NEW_CONVERSATION = 'newConversation',
  ABORT_REQUEST = 'abortRequest',
}

/**
 * Check if the current platform is Mac
 */
function isMac(): boolean {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Format shortcut key for display
 */
export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const keys: string[] = [];

  if (shortcut.ctrlKey) {
    keys.push(isMac() ? '⌃' : 'Ctrl');
  }

  if (shortcut.metaKey) {
    keys.push(isMac() ? '⌘' : 'Ctrl');
  }

  if (shortcut.shiftKey) {
    keys.push(isMac() ? '⇧' : 'Shift');
  }

  if (shortcut.altKey) {
    keys.push(isMac() ? '⌥' : 'Alt');
  }

  keys.push(shortcut.key.toUpperCase());

  return keys.join(isMac() ? '' : '+');
}

/**
 * Check if a keyboard event matches a shortcut
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  // Check modifier keys
  if (shortcut.ctrlKey && !event.ctrlKey) return false;
  if (shortcut.metaKey && !event.metaKey) return false;
  if (shortcut.shiftKey && !event.shiftKey) return false;
  if (shortcut.altKey && !event.altKey) return false;

  // Check main key (case insensitive)
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

/**
 * Use Architect Shortcuts composable
 */
export function useArchitectShortcuts() {
  const architectStore = useWorkflowArchitectStore();

  /**
   * Define all shortcuts
   */
  const shortcuts: Record<ShortcutAction, KeyboardShortcut> = {
    [ShortcutAction.OPEN_ARCHITECT]: {
      key: 'a',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      shiftKey: true,
      description: 'Open AI Workflow Architect',
      handler: () => {
        if (!architectStore.isPanelOpen) {
          architectStore.openPanel();
        } else {
          architectStore.closePanel();
        }
      },
    },

    [ShortcutAction.CLOSE_ARCHITECT]: {
      key: 'Escape',
      description: 'Close AI Workflow Architect',
      handler: () => {
        if (architectStore.isPanelOpen) {
          architectStore.closePanel();
        }
      },
    },

    [ShortcutAction.SEND_MESSAGE]: {
      key: 'Enter',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      description: 'Send message',
      handler: () => {
        // This will be handled by the chat input component
        // We emit a custom event that the component can listen to
        window.dispatchEvent(new CustomEvent('architect:sendMessage'));
      },
    },

    [ShortcutAction.CLEAR_INPUT]: {
      key: 'k',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      description: 'Clear input',
      handler: () => {
        window.dispatchEvent(new CustomEvent('architect:clearInput'));
      },
    },

    [ShortcutAction.NEW_CONVERSATION]: {
      key: 'n',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      shiftKey: true,
      description: 'Start new conversation',
      handler: () => {
        if (architectStore.isPanelOpen) {
          architectStore.newConversation();
        }
      },
    },

    [ShortcutAction.ABORT_REQUEST]: {
      key: 'Escape',
      description: 'Abort current request',
      handler: () => {
        if (architectStore.isProcessing) {
          architectStore.abortRequest();
        }
      },
    },
  };

  /**
   * Global keyboard event handler
   */
  function handleKeyDown(event: KeyboardEvent): void {
    // Don't handle shortcuts when typing in inputs (except for specific cases)
    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    // Allow Escape and some other shortcuts even in inputs
    const allowInInput = ['Escape'].includes(event.key);

    if (isInput && !allowInInput) {
      // Only handle Cmd/Ctrl+Enter in inputs (for sending messages)
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        for (const shortcut of Object.values(shortcuts)) {
          if (matchesShortcut(event, shortcut)) {
            event.preventDefault();
            shortcut.handler();
            return;
          }
        }
      }
      return;
    }

    // Check all shortcuts
    for (const shortcut of Object.values(shortcuts)) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }

  /**
   * Register keyboard shortcuts
   */
  function registerShortcuts(): void {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
  }

  /**
   * Unregister keyboard shortcuts
   */
  function unregisterShortcuts(): void {
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }

  /**
   * Get shortcut for an action
   */
  function getShortcut(action: ShortcutAction): KeyboardShortcut {
    return shortcuts[action];
  }

  /**
   * Get formatted shortcut string for display
   */
  function getShortcutString(action: ShortcutAction): string {
    return formatShortcutKey(shortcuts[action]);
  }

  /**
   * Get all shortcuts
   */
  function getAllShortcuts(): Record<ShortcutAction, KeyboardShortcut> {
    return shortcuts;
  }

  // Auto-register on mount, unregister on unmount
  onMounted(() => {
    registerShortcuts();
  });

  onUnmounted(() => {
    unregisterShortcuts();
  });

  return {
    // Actions
    registerShortcuts,
    unregisterShortcuts,
    getShortcut,
    getShortcutString,
    getAllShortcuts,

    // Utilities
    formatShortcutKey,
    isMac,
  };
}

/**
 * Hook for components that want to use shortcuts without auto-registration
 */
export function useArchitectShortcutsManual() {
  const architectStore = useWorkflowArchitectStore();

  const shortcuts: Record<ShortcutAction, KeyboardShortcut> = {
    [ShortcutAction.OPEN_ARCHITECT]: {
      key: 'a',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      shiftKey: true,
      description: 'Open AI Workflow Architect',
      handler: () => {
        if (!architectStore.isPanelOpen) {
          architectStore.openPanel();
        } else {
          architectStore.closePanel();
        }
      },
    },

    [ShortcutAction.CLOSE_ARCHITECT]: {
      key: 'Escape',
      description: 'Close AI Workflow Architect',
      handler: () => {
        if (architectStore.isPanelOpen) {
          architectStore.closePanel();
        }
      },
    },

    [ShortcutAction.SEND_MESSAGE]: {
      key: 'Enter',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      description: 'Send message',
      handler: () => {
        window.dispatchEvent(new CustomEvent('architect:sendMessage'));
      },
    },

    [ShortcutAction.CLEAR_INPUT]: {
      key: 'k',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      description: 'Clear input',
      handler: () => {
        window.dispatchEvent(new CustomEvent('architect:clearInput'));
      },
    },

    [ShortcutAction.NEW_CONVERSATION]: {
      key: 'n',
      metaKey: !isMac(),
      ctrlKey: isMac(),
      shiftKey: true,
      description: 'Start new conversation',
      handler: () => {
        if (architectStore.isPanelOpen) {
          architectStore.newConversation();
        }
      },
    },

    [ShortcutAction.ABORT_REQUEST]: {
      key: 'Escape',
      description: 'Abort current request',
      handler: () => {
        if (architectStore.isProcessing) {
          architectStore.abortRequest();
        }
      },
    },
  };

  function getShortcut(action: ShortcutAction): KeyboardShortcut {
    return shortcuts[action];
  }

  function getShortcutString(action: ShortcutAction): string {
    return formatShortcutKey(shortcuts[action]);
  }

  function getAllShortcuts(): Record<ShortcutAction, KeyboardShortcut> {
    return shortcuts;
  }

  return {
    getShortcut,
    getShortcutString,
    getAllShortcuts,
    formatShortcutKey,
    isMac,
  };
}
