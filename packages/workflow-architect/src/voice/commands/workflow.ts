/**
 * Workflow Voice Commands
 * Handles workflow creation, node manipulation, and configuration
 */

import type { VoiceCommand, VoiceCommandHandler, VoiceCommandResult } from '../types.js';
import type { WorkflowNode, WorkflowDefinition } from '../../types/workflow.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow command context (injected by session manager)
 */
export interface WorkflowCommandContext {
  currentWorkflow?: WorkflowDefinition;
  onWorkflowCreate?: (name: string) => Promise<WorkflowDefinition>;
  onNodeAdd?: (node: WorkflowNode) => Promise<void>;
  onNodeDelete?: (nodeId: string) => Promise<void>;
  onNodeUpdate?: (nodeId: string, updates: Partial<WorkflowNode>) => Promise<void>;
  onNodesConnect?: (sourceId: string, targetId: string) => Promise<void>;
  findNodeByName?: (name: string) => WorkflowNode | undefined;
}

let context: WorkflowCommandContext = {};

/**
 * Set workflow command context
 */
export function setWorkflowCommandContext(ctx: WorkflowCommandContext): void {
  context = ctx;
}

/**
 * Create workflow command handler
 */
export const createWorkflowHandler: VoiceCommandHandler = {
  type: 'create_workflow',
  patterns: [
    'create\\s+(?:a\\s+)?(?:new\\s+)?workflow',
    'new\\s+workflow',
    'start\\s+(?:a\\s+)?(?:new\\s+)?workflow',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const workflowName = (command.entities.name as string) || 'New Workflow';

    try {
      if (context.onWorkflowCreate) {
        const workflow = await context.onWorkflowCreate(workflowName);
        return {
          success: true,
          message: `Created workflow: ${workflow.name}`,
          speak: `Workflow "${workflowName}" has been created successfully.`,
          action: { workflow },
        };
      }

      // Fallback: create basic workflow structure
      const workflow: WorkflowDefinition = {
        name: workflowName,
        active: false,
        nodes: [],
        connections: {},
        settings: {
          executionOrder: 'v1',
        },
      };

      return {
        success: true,
        message: `Created workflow: ${workflowName}`,
        speak: `Workflow "${workflowName}" has been created. You can now add nodes to it.`,
        action: { workflow },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't create the workflow. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Add node command handler
 */
export const addNodeHandler: VoiceCommandHandler = {
  type: 'add_node',
  patterns: [
    'add\\s+(?:a\\s+)?(?:new\\s+)?\\w+\\s+node',
    'insert\\s+(?:a\\s+)?\\w+',
    'create\\s+(?:a\\s+)?\\w+\\s+node',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const nodeType = (command.entities.nodeType as string) || 'n8n-nodes-base.manualTrigger';
    const nodeName = (command.entities.nodeName as string) || generateNodeName(nodeType);

    try {
      const node: WorkflowNode = {
        id: uuidv4(),
        name: nodeName,
        type: nodeType,
        typeVersion: 1,
        position: [250, 300], // Default position
        parameters: {},
      };

      if (context.onNodeAdd) {
        await context.onNodeAdd(node);
      }

      return {
        success: true,
        message: `Added ${nodeType} node: ${nodeName}`,
        speak: `I've added a ${formatNodeType(nodeType)} node called "${nodeName}".`,
        action: { node },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to add node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't add that node. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Connect nodes command handler
 */
export const connectNodesHandler: VoiceCommandHandler = {
  type: 'connect_nodes',
  patterns: [
    'connect\\s+.+?\\s+(?:to|with)',
    'link\\s+.+?\\s+(?:to|with)',
    'from\\s+.+?\\s+to\\s+',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const sourceName = command.entities.source as string;
    const targetName = command.entities.target as string;

    if (!sourceName || !targetName) {
      return {
        success: false,
        message: 'Could not identify source and target nodes',
        speak: "I couldn't identify which nodes you want to connect. Please specify both the source and target node names.",
      };
    }

    try {
      // Find nodes by name
      const sourceNode = context.findNodeByName?.(sourceName);
      const targetNode = context.findNodeByName?.(targetName);

      if (!sourceNode) {
        return {
          success: false,
          message: `Source node not found: ${sourceName}`,
          speak: `I couldn't find a node named "${sourceName}".`,
        };
      }

      if (!targetNode) {
        return {
          success: false,
          message: `Target node not found: ${targetName}`,
          speak: `I couldn't find a node named "${targetName}".`,
        };
      }

      if (context.onNodesConnect) {
        await context.onNodesConnect(sourceNode.id, targetNode.id);
      }

      return {
        success: true,
        message: `Connected ${sourceName} to ${targetName}`,
        speak: `I've connected "${sourceName}" to "${targetName}".`,
        action: {
          sourceId: sourceNode.id,
          targetId: targetNode.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect nodes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't connect those nodes. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Configure node command handler
 */
export const configureNodeHandler: VoiceCommandHandler = {
  type: 'configure_node',
  patterns: [
    'configure\\s+.+?\\s+(?:to|with)',
    'set\\s+.+?\\s+to',
    'update\\s+.+?\\s+with',
    'change\\s+.+?\\s+to',
  ],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const nodeName = command.entities.nodeName as string;
    const parameters = command.entities.parameters as string;

    if (!nodeName) {
      return {
        success: false,
        message: 'Could not identify node to configure',
        speak: "I couldn't identify which node you want to configure. Please specify the node name.",
      };
    }

    try {
      const node = context.findNodeByName?.(nodeName);

      if (!node) {
        return {
          success: false,
          message: `Node not found: ${nodeName}`,
          speak: `I couldn't find a node named "${nodeName}".`,
        };
      }

      // Parse parameters (this is simplified - real implementation would be more sophisticated)
      const updates: Partial<WorkflowNode> = {
        notes: parameters,
      };

      if (context.onNodeUpdate) {
        await context.onNodeUpdate(node.id, updates);
      }

      return {
        success: true,
        message: `Configured node ${nodeName}`,
        speak: `I've updated the configuration for "${nodeName}".`,
        action: {
          nodeId: node.id,
          updates,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to configure node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't configure that node. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Delete node command handler
 */
export const deleteNodeHandler: VoiceCommandHandler = {
  type: 'delete_node',
  patterns: ['delete\\s+(?:the\\s+)?\\w+', 'remove\\s+(?:the\\s+)?\\w+'],
  handler: async (command: VoiceCommand): Promise<VoiceCommandResult> => {
    const nodeName = command.entities.nodeName as string;

    if (!nodeName) {
      return {
        success: false,
        message: 'Could not identify node to delete',
        speak: "I couldn't identify which node you want to delete. Please specify the node name.",
      };
    }

    try {
      const node = context.findNodeByName?.(nodeName);

      if (!node) {
        return {
          success: false,
          message: `Node not found: ${nodeName}`,
          speak: `I couldn't find a node named "${nodeName}".`,
        };
      }

      if (context.onNodeDelete) {
        await context.onNodeDelete(node.id);
      }

      return {
        success: true,
        message: `Deleted node: ${nodeName}`,
        speak: `I've deleted the "${nodeName}" node.`,
        action: {
          nodeId: node.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: `Sorry, I couldn't delete that node. ${error instanceof Error ? error.message : ''}`,
      };
    }
  },
};

/**
 * Helper: Generate node name from type
 */
function generateNodeName(nodeType: string): string {
  const parts = nodeType.split('.');
  const baseName = parts[parts.length - 1];

  // Convert camelCase to Title Case
  const name = baseName
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return name;
}

/**
 * Helper: Format node type for speaking
 */
function formatNodeType(nodeType: string): string {
  const parts = nodeType.split('.');
  const baseName = parts[parts.length - 1];

  // Convert camelCase to readable text
  return baseName
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
}

/**
 * Get all workflow command handlers
 */
export function getWorkflowHandlers(): VoiceCommandHandler[] {
  return [
    createWorkflowHandler,
    addNodeHandler,
    connectNodesHandler,
    configureNodeHandler,
    deleteNodeHandler,
  ];
}
