/**
 * Architect Canvas Integration
 *
 * This composable integrates the Workflow Architect with n8n's canvas operations.
 * It provides methods to apply generated workflows to the canvas.
 */

import { computed, type Ref } from 'vue';
import { useWorkflowArchitectStore } from './architect.store';

/**
 * n8n Workflow node interface (simplified)
 */
export interface N8nNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

/**
 * n8n Workflow connection interface (simplified)
 */
export interface N8nConnection {
  source: string;
  sourceOutput: number;
  target: string;
  targetInput: number;
}

/**
 * n8n Workflow interface (simplified)
 */
export interface N8nWorkflow {
  nodes: N8nNode[];
  connections: Record<string, Record<string, N8nConnection[][]>>;
  settings?: Record<string, unknown>;
}

/**
 * Canvas operations interface (matches n8n's useCanvasOperations)
 */
export interface CanvasOperations {
  addNode: (node: N8nNode) => Promise<void>;
  addNodes: (nodes: N8nNode[]) => Promise<void>;
  addConnection: (connection: N8nConnection) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<N8nNode>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  clearCanvas: () => Promise<void>;
  centerCanvas: () => void;
  fitView: () => void;
}

/**
 * Options for applying workflow to canvas
 */
export interface ApplyWorkflowOptions {
  clearExisting?: boolean;
  centerAfter?: boolean;
  fitView?: boolean;
  animate?: boolean;
}

/**
 * Workflow transformation result
 */
export interface TransformedWorkflow {
  nodes: N8nNode[];
  connections: N8nConnection[];
  errors: string[];
}

/**
 * Use Architect Canvas composable
 *
 * This composable provides integration between the Workflow Architect and n8n canvas.
 * In n8n, it should receive useCanvasOperations as a parameter.
 */
export function useArchitectCanvas(canvasOps?: CanvasOperations) {
  const architectStore = useWorkflowArchitectStore();

  /**
   * Check if we have a workflow to apply
   */
  const hasWorkflow = computed(() => !!architectStore.currentWorkflow);

  /**
   * Transform workflow-architect format to n8n format
   */
  function transformWorkflow(workflow: unknown): TransformedWorkflow {
    const errors: string[] = [];

    if (!workflow || typeof workflow !== 'object') {
      errors.push('Invalid workflow: not an object');
      return { nodes: [], connections: [], errors };
    }

    const w = workflow as {
      nodes?: unknown[];
      connections?: Record<string, unknown>;
    };

    // Transform nodes
    const nodes: N8nNode[] = [];
    if (Array.isArray(w.nodes)) {
      for (let i = 0; i < w.nodes.length; i++) {
        const node = w.nodes[i];
        if (!node || typeof node !== 'object') {
          errors.push(`Invalid node at index ${i}`);
          continue;
        }

        const n = node as Record<string, unknown>;

        // Ensure required fields
        if (!n.id || typeof n.id !== 'string') {
          errors.push(`Node at index ${i} missing valid id`);
          continue;
        }

        if (!n.name || typeof n.name !== 'string') {
          errors.push(`Node ${n.id} missing valid name`);
          continue;
        }

        if (!n.type || typeof n.type !== 'string') {
          errors.push(`Node ${n.id} missing valid type`);
          continue;
        }

        // Extract position
        let position: [number, number] = [0, 0];
        if (Array.isArray(n.position) && n.position.length === 2) {
          position = [
            typeof n.position[0] === 'number' ? n.position[0] : 0,
            typeof n.position[1] === 'number' ? n.position[1] : 0,
          ];
        } else {
          // Auto-layout: position nodes in a vertical flow
          position = [250 + i * 350, 250];
        }

        nodes.push({
          id: n.id as string,
          name: n.name as string,
          type: n.type as string,
          position,
          parameters: (n.parameters as Record<string, unknown>) || {},
          credentials: (n.credentials as Record<string, unknown>) || undefined,
        });
      }
    } else {
      errors.push('Workflow has no nodes array');
    }

    // Transform connections
    const connections: N8nConnection[] = [];
    if (w.connections && typeof w.connections === 'object') {
      for (const [sourceId, outputs] of Object.entries(w.connections)) {
        if (!outputs || typeof outputs !== 'object') {
          continue;
        }

        for (const [outputIndex, targets] of Object.entries(outputs)) {
          if (!Array.isArray(targets)) {
            continue;
          }

          for (const targetArray of targets) {
            if (!Array.isArray(targetArray)) {
              continue;
            }

            for (const target of targetArray) {
              if (!target || typeof target !== 'object') {
                continue;
              }

              const t = target as Record<string, unknown>;

              if (!t.node || typeof t.node !== 'string') {
                errors.push(`Invalid connection target from ${sourceId}`);
                continue;
              }

              connections.push({
                source: sourceId,
                sourceOutput: parseInt(outputIndex, 10) || 0,
                target: t.node as string,
                targetInput: (typeof t.type === 'string' ? parseInt(t.type, 10) : 0) || 0,
              });
            }
          }
        }
      }
    }

    return { nodes, connections, errors };
  }

  /**
   * Apply the current workflow to the canvas
   */
  async function applyWorkflowToCanvas(
    options: ApplyWorkflowOptions = {},
  ): Promise<{ success: boolean; errors: string[] }> {
    if (!architectStore.currentWorkflow) {
      return { success: false, errors: ['No workflow to apply'] };
    }

    if (!canvasOps) {
      return { success: false, errors: ['Canvas operations not available'] };
    }

    const { clearExisting = true, centerAfter = true, fitView = true } = options;

    try {
      // Transform workflow
      const { nodes, connections, errors } = transformWorkflow(
        architectStore.currentWorkflow,
      );

      if (nodes.length === 0) {
        return { success: false, errors: ['No valid nodes in workflow', ...errors] };
      }

      // Clear existing nodes if requested
      if (clearExisting) {
        await canvasOps.clearCanvas();
      }

      // Add nodes to canvas
      await canvasOps.addNodes(nodes);

      // Add connections
      for (const connection of connections) {
        try {
          await canvasOps.addConnection(connection);
        } catch (error) {
          errors.push(
            `Failed to create connection ${connection.source} -> ${connection.target}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      // Center and fit view
      if (centerAfter) {
        canvasOps.centerCanvas();
      }

      if (fitView) {
        canvasOps.fitView();
      }

      return { success: true, errors };
    } catch (error) {
      return {
        success: false,
        errors: [
          `Failed to apply workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Apply a specific workflow (not the current one)
   */
  async function applyWorkflow(
    workflow: unknown,
    options: ApplyWorkflowOptions = {},
  ): Promise<{ success: boolean; errors: string[] }> {
    if (!canvasOps) {
      return { success: false, errors: ['Canvas operations not available'] };
    }

    const { clearExisting = true, centerAfter = true, fitView = true } = options;

    try {
      // Transform workflow
      const { nodes, connections, errors } = transformWorkflow(workflow);

      if (nodes.length === 0) {
        return { success: false, errors: ['No valid nodes in workflow', ...errors] };
      }

      // Clear existing nodes if requested
      if (clearExisting) {
        await canvasOps.clearCanvas();
      }

      // Add nodes to canvas
      await canvasOps.addNodes(nodes);

      // Add connections
      for (const connection of connections) {
        try {
          await canvasOps.addConnection(connection);
        } catch (error) {
          errors.push(
            `Failed to create connection ${connection.source} -> ${connection.target}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      // Center and fit view
      if (centerAfter) {
        canvasOps.centerCanvas();
      }

      if (fitView) {
        canvasOps.fitView();
      }

      return { success: true, errors };
    } catch (error) {
      return {
        success: false,
        errors: [
          `Failed to apply workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Preview workflow structure without applying
   */
  function previewWorkflow(workflow: unknown): TransformedWorkflow {
    return transformWorkflow(workflow);
  }

  /**
   * Get workflow as JSON
   */
  function getWorkflowJson(): unknown {
    return architectStore.currentWorkflow;
  }

  /**
   * Copy workflow JSON to clipboard
   */
  async function copyWorkflowToClipboard(): Promise<boolean> {
    if (!architectStore.currentWorkflow) {
      return false;
    }

    try {
      const json = JSON.stringify(architectStore.currentWorkflow, null, 2);
      await navigator.clipboard.writeText(json);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }

  return {
    // State
    hasWorkflow,

    // Actions
    applyWorkflowToCanvas,
    applyWorkflow,
    previewWorkflow,
    getWorkflowJson,
    copyWorkflowToClipboard,
    transformWorkflow,
  };
}

/**
 * Type export for use in n8n
 */
export type UseArchitectCanvas = ReturnType<typeof useArchitectCanvas>;
