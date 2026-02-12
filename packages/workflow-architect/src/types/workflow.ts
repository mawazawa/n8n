/**
 * n8n Workflow Type Definitions
 * Based on n8n's IWorkflowBase interface
 */

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  webhookId?: string;
}

export interface NodeConnection {
  node: string;
  type: string;
  index: number;
}

export interface WorkflowConnections {
  [sourceNode: string]: {
    [connectionType: string]: NodeConnection[][];
  };
}

export interface WorkflowSettings {
  executionOrder?: 'v1';
  saveDataSuccessExecution?: 'all' | 'none';
  saveDataErrorExecution?: 'all' | 'none';
  saveManualExecutions?: boolean;
  timezone?: string;
  errorWorkflow?: string;
}

export interface WorkflowDefinition {
  id?: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  settings?: WorkflowSettings;
  staticData?: Record<string, unknown>;
  tags?: Array<{ id?: string; name: string }>;
  pinData?: Record<string, unknown[]>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowOperation {
  type: 'clear' | 'addNodes' | 'removeNode' | 'updateNode' | 'setConnections' | 'mergeConnections' | 'removeConnection' | 'setName';
  nodeIds?: string[];
  nodes?: WorkflowNode[];
  nodeId?: string;
  updates?: Partial<WorkflowNode>;
  connections?: WorkflowConnections;
  sourceNode?: string;
  targetNode?: string;
  name?: string;
}

export interface ExecutionResult {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  status: 'success' | 'error' | 'waiting' | 'running';
  data?: {
    resultData: {
      runData: Record<string, unknown[]>;
      error?: {
        message: string;
        node?: { name: string; type: string };
      };
    };
  };
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

// Connection types for AI workflows
export const ConnectionTypes = {
  Main: 'main',
  AiAgent: 'ai_agent',
  AiTool: 'ai_tool',
  AiLanguageModel: 'ai_languageModel',
  AiMemory: 'ai_memory',
  AiEmbedding: 'ai_embedding',
  AiRetriever: 'ai_retriever',
  AiDocument: 'ai_document',
  AiVectorStore: 'ai_vectorStore',
  AiTextSplitter: 'ai_textSplitter',
  AiOutputParser: 'ai_outputParser',
} as const;

export type ConnectionType = typeof ConnectionTypes[keyof typeof ConnectionTypes];

// Workflow categories for RAG
export type WorkflowCategory =
  | 'ai-agent'
  | 'rag-pipeline'
  | 'data-pipeline'
  | 'integration'
  | 'automation'
  | 'monitoring'
  | 'approval-flow'
  | 'error-handling'
  | 'batch-processing';

export interface WorkflowExample {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  techniques: string[];
  workflow: WorkflowDefinition;
  embedding?: number[];
}
