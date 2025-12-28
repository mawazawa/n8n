/**
 * Navigation Voice Commands
 * Handles canvas navigation, zoom, and view controls
 */

import type { VoiceCommand, VoiceCommandHandler, VoiceCommandResult } from '../types.js';
import type { WorkflowNode } from '../../types/workflow.js';

/**
 * Navigation command context (injected by session manager)
 */
export interface NavigationCommandContext {
  onNavigateToNode?: (nodeId: string) => Promise<void>;
  onZoom?: (direction: 'in' | 'out', amount?: number) => Promise<void>;
  onFitView?: () => Promise<void>;
  onCenterView?: () => Promise<void>;
  onPanTo?: (x: number, y: number) => Promise<void>;
  findNodeByName?: (name: string) => WorkflowNode | undefined;
  getCurrentZoom?: () => number;
}

let context: NavigationCommandContext = {};

/**
 * Set navigation command context
 */
export function setNavigationCommandContext(ctx: NavigationCommandContext): void {
  context = ctx;
}

/**
 * Navigate command handler
 */
export const navigateHandler: VoiceCommandHandler = {
  type: 'navigate',
  patterns: [
    '(?:go\\s+to|navigate\\s+to|show)',
    'zoom\\s+(?:in|out)',
    'fit\\s+to\\s+view',
    'show\\s+all',
    'focus\\s+on',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const action = command.entities.action as string;
    const target = command.entities.target as string;

    try {
      // Handle zoom commands
      if (action === 'zoom_in') {
        return await handleZoomIn();
      }

      if (action === 'zoom_out') {
        return await handleZoomOut();
      }

      // Handle fit to view
      if (action === 'fit_view') {
        return await handleFitView();
      }

      // Handle center view
      if (action === 'center') {
        return await handleCenterView();
      }

      // Handle navigation to specific node or location
      if (target) {
        return await handleNavigateToTarget(target);
      }

      return {
        success: false,
        message: 'Could not determine navigation action',
        speak: "I'm not sure where you want to navigate. Can you be more specific?",
      };
    } catch (error) {
      return {
        success: false,
        message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't perform that navigation. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Handle zoom in
 */
async function handleZoomIn(): Promise<VoiceCommandResult> {
  try {
    if (context.onZoom) {
      await context.onZoom('in', 0.1);
    }

    const currentZoom = context.getCurrentZoom?.() || 1.0;
    const newZoom = Math.round((currentZoom + 0.1) * 100);

    return {
      success: true,
      message: 'Zoomed in',
      speak: `Zoomed in to ${newZoom} percent.`,
      action: { zoom: 'in' },
    };
  } catch (error) {
    return {
      success: false,
      message: `Zoom failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't zoom in.",
    };
  }
}

/**
 * Handle zoom out
 */
async function handleZoomOut(): Promise<VoiceCommandResult> {
  try {
    if (context.onZoom) {
      await context.onZoom('out', 0.1);
    }

    const currentZoom = context.getCurrentZoom?.() || 1.0;
    const newZoom = Math.round((currentZoom - 0.1) * 100);

    return {
      success: true,
      message: 'Zoomed out',
      speak: `Zoomed out to ${newZoom} percent.`,
      action: { zoom: 'out' },
    };
  } catch (error) {
    return {
      success: false,
      message: `Zoom failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't zoom out.",
    };
  }
}

/**
 * Handle fit to view
 */
async function handleFitView(): Promise<VoiceCommandResult> {
  try {
    if (context.onFitView) {
      await context.onFitView();
    }

    return {
      success: true,
      message: 'Fit to view',
      speak: 'Showing all nodes in view.',
      action: { fitView: true },
    };
  } catch (error) {
    return {
      success: false,
      message: `Fit to view failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't fit the view.",
    };
  }
}

/**
 * Handle center view
 */
async function handleCenterView(): Promise<VoiceCommandResult> {
  try {
    if (context.onCenterView) {
      await context.onCenterView();
    }

    return {
      success: true,
      message: 'Centered view',
      speak: 'View centered.',
      action: { center: true },
    };
  } catch (error) {
    return {
      success: false,
      message: `Center view failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't center the view.",
    };
  }
}

/**
 * Handle navigation to specific target
 */
async function handleNavigateToTarget(target: string): Promise<VoiceCommandResult> {
  try {
    // Check for special targets
    if (target.toLowerCase() === 'trigger' || target.toLowerCase() === 'start') {
      return await navigateToTrigger();
    }

    if (target.toLowerCase() === 'end' || target.toLowerCase() === 'last') {
      return await navigateToLastNode();
    }

    // Try to find node by name
    const node = context.findNodeByName?.(target);

    if (!node) {
      return {
        success: false,
        message: `Node not found: ${target}`,
        speak: `I couldn't find a node named "${target}".`,
      };
    }

    if (context.onNavigateToNode) {
      await context.onNavigateToNode(node.id);
    }

    return {
      success: true,
      message: `Navigated to ${node.name}`,
      speak: `Showing "${node.name}".`,
      action: {
        nodeId: node.id,
        nodeName: node.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: `Sorry, I couldn't navigate to "${target}".`,
    };
  }
}

/**
 * Navigate to trigger node
 */
async function navigateToTrigger(): Promise<VoiceCommandResult> {
  try {
    // Find trigger node (typically the first node or a node with "trigger" in the type)
    const triggerNode = context.findNodeByName?.('trigger');

    if (!triggerNode) {
      return {
        success: false,
        message: 'No trigger node found',
        speak: "I couldn't find a trigger node in this workflow.",
      };
    }

    if (context.onNavigateToNode) {
      await context.onNavigateToNode(triggerNode.id);
    }

    return {
      success: true,
      message: `Navigated to trigger: ${triggerNode.name}`,
      speak: `Showing the trigger node.`,
      action: {
        nodeId: triggerNode.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't navigate to the trigger.",
    };
  }
}

/**
 * Navigate to last node
 */
async function navigateToLastNode(): Promise<VoiceCommandResult> {
  try {
    // This would need access to all nodes to find the last one
    // For now, return a message
    return {
      success: false,
      message: 'Navigate to last node not implemented',
      speak: "I can't navigate to the last node yet. Please specify a node name.",
    };
  } catch (error) {
    return {
      success: false,
      message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speak: "Sorry, I couldn't navigate to the last node.",
    };
  }
}

/**
 * Execute workflow command handler
 */
export const executeHandler: VoiceCommandHandler = {
  type: 'execute',
  patterns: [
    '(?:run|execute|start)\\s+(?:the\\s+)?workflow',
    'test\\s+(?:the\\s+)?workflow',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const mode = (command.entities.mode as string) || 'manual';

    return {
      success: true,
      message: `Workflow execution requested in ${mode} mode`,
      speak: mode === 'test' ? 'Starting workflow in test mode.' : 'Executing the workflow.',
      action: {
        execute: true,
        mode,
      },
    };
  },
};

/**
 * Help command handler
 */
export const helpHandler: VoiceCommandHandler = {
  type: 'help',
  patterns: [
    '^help$',
    'what\\s+can\\s+(?:i|you)',
    'how\\s+do\\s+i',
    'show\\s+(?:me\\s+)?(?:help|commands)',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const helpText = `
Available voice commands:

Workflow Management:
- "Create a new workflow called [name]"
- "Add a [node type] node"
- "Connect [source] to [target]"
- "Delete the [node name] node"

Navigation:
- "Go to [node name]"
- "Zoom in" / "Zoom out"
- "Show all nodes" / "Fit to view"
- "Focus on trigger"

Execution:
- "Run the workflow"
- "Test the workflow"

Other:
- "Undo" / "Redo"
- "Help"
    `.trim();

    return {
      success: true,
      message: 'Help requested',
      speak: 'I can help you create workflows, add and connect nodes, navigate the canvas, and execute workflows. What would you like to do?',
      action: {
        helpText,
      },
    };
  },
};

/**
 * Undo command handler
 */
export const undoHandler: VoiceCommandHandler = {
  type: 'undo',
  patterns: ['^undo$', 'undo\\s+(?:that|last|previous)'],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    return {
      success: true,
      message: 'Undo requested',
      speak: 'Undoing last action.',
      action: {
        undo: true,
      },
    };
  },
};

/**
 * Redo command handler
 */
export const redoHandler: VoiceCommandHandler = {
  type: 'redo',
  patterns: ['^redo$', 'redo\\s+(?:that|last)'],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    return {
      success: true,
      message: 'Redo requested',
      speak: 'Redoing action.',
      action: {
        redo: true,
      },
    };
  },
};

/**
 * Get all navigation command handlers
 */
export function getNavigationHandlers(): VoiceCommandHandler[] {
  return [navigateHandler, executeHandler, helpHandler, undoHandler, redoHandler];
}
