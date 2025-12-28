import { getSupabaseAdminClient } from '../supabase/client';
import type {
  WorkflowExample,
  WorkflowExampleInsert,
  WorkflowNodeChunk,
  WorkflowNodeChunkInsert,
  WorkflowCategory,
  MatchWorkflowResult,
  MatchNodeResult,
  HybridSearchResult,
} from '../supabase/types';
import type { WorkflowDefinition } from '../types/workflow';

// Helper to work around Supabase's complex type inference
// The types ARE correct, but TypeScript struggles with Supabase's generic inference
const db = {
  from: (table: string) => {
    const client = getSupabaseAdminClient();
    return (client.from as Function)(table);
  },
  rpc: (fn: string, args: Record<string, unknown>) => {
    const client = getSupabaseAdminClient();
    return (client.rpc as Function)(fn, args);
  },
};

export interface VectorStoreConfig {
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface SearchOptions {
  threshold?: number;
  limit?: number;
  category?: WorkflowCategory;
  techniques?: string[];
  publicOnly?: boolean;
}

export interface NodeSearchOptions {
  threshold?: number;
  limit?: number;
  nodeType?: string;
  isTrigger?: boolean;
  isAiNode?: boolean;
}

export interface HybridSearchOptions {
  limit?: number;
  semanticWeight?: number;
  keywordWeight?: number;
}

export interface IndexedWorkflow {
  id: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  techniques: string[];
  workflow: WorkflowDefinition;
  nodeCount: number;
  nodeTypes: string[];
}

/**
 * Supabase Vector Store for workflow RAG
 * Implements semantic search using pgvector with HNSW indexing
 */
export class SupabaseVectorStore {
  private config: VectorStoreConfig;
  private generateEmbedding: (text: string) => Promise<number[]>;

  constructor(
    config: VectorStoreConfig = {},
    embeddingFn: (text: string) => Promise<number[]>,
  ) {
    this.config = {
      embeddingModel: config.embeddingModel || 'text-embedding-3-small',
      embeddingDimensions: config.embeddingDimensions || 1536,
    };
    this.generateEmbedding = embeddingFn;
  }

  /**
   * Add a workflow to the vector store
   */
  async addWorkflow(
    workflow: WorkflowDefinition,
    metadata: {
      name: string;
      description?: string;
      category?: WorkflowCategory;
      techniques?: string[];
      isPublic?: boolean;
      userId?: string;
      organizationId?: string;
    },
  ): Promise<string> {

    // Generate semantic content for embedding
    const semanticContent = this.generateWorkflowSemanticContent(workflow, metadata);
    const embedding = await this.generateEmbedding(semanticContent);

    const insertData: WorkflowExampleInsert = {
      name: metadata.name,
      description: metadata.description || null,
      category: metadata.category || 'automation',
      techniques: metadata.techniques || [],
      workflow_json: workflow as unknown as Record<string, unknown>,
      embedding,
      embedding_status: 'completed',
      embedding_model: this.config.embeddingModel,
      is_public: metadata.isPublic ?? false,
      user_id: metadata.userId || null,
      organization_id: metadata.organizationId || null,
    };

    const { data, error } = await db
      .from('workflow_examples')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to add workflow: ${error.message}`);
    }

    const result = data as { id: string };

    // Index individual nodes for fine-grained search
    await this.indexWorkflowNodes(result.id, workflow);

    return result.id;
  }

  /**
   * Index individual nodes for fine-grained semantic search
   */
  private async indexWorkflowNodes(
    workflowId: string,
    workflow: WorkflowDefinition,
  ): Promise<void> {
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || {};

    // Build connection map
    const connectedTo = new Map<string, string[]>();
    const connectedFrom = new Map<string, string[]>();

    for (const [sourceNode, targets] of Object.entries(connections)) {
      for (const connection of Object.values(targets).flat()) {
        for (const target of connection) {
          const targetNode = target.node;
          if (!connectedTo.has(sourceNode)) {
            connectedTo.set(sourceNode, []);
          }
          connectedTo.get(sourceNode)!.push(targetNode);

          if (!connectedFrom.has(targetNode)) {
            connectedFrom.set(targetNode, []);
          }
          connectedFrom.get(targetNode)!.push(sourceNode);
        }
      }
    }

    // Generate embeddings for each node
    const nodeChunks: WorkflowNodeChunkInsert[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeId = node.id || `node_${i}`;
      const nodeName = node.name || node.type;

      // Generate semantic content including context
      const semanticContent = this.generateNodeSemanticContent(node, {
        connectedTo: connectedTo.get(nodeName) || [],
        connectedFrom: connectedFrom.get(nodeName) || [],
        workflowContext: workflow.name,
      });

      const embedding = await this.generateEmbedding(semanticContent);

      const isTrigger =
        node.type.includes('Trigger') ||
        node.type.includes('Webhook') ||
        node.type.includes('Schedule');
      const isAiNode =
        node.type.includes('Agent') ||
        node.type.includes('LangChain') ||
        node.type.includes('OpenAI') ||
        node.type.includes('Anthropic');

      nodeChunks.push({
        workflow_id: workflowId,
        node_id: nodeId,
        node_name: nodeName,
        node_type: node.type,
        node_index: i,
        semantic_content: semanticContent,
        embedding,
        embedding_status: 'completed',
        connected_to: connectedTo.get(nodeName) || [],
        connected_from: connectedFrom.get(nodeName) || [],
        is_trigger: isTrigger,
        is_ai_node: isAiNode,
      });
    }

    // Batch insert node chunks
    if (nodeChunks.length > 0) {
      const { error } = await db.from('workflow_node_chunks').insert(nodeChunks);

      if (error) {
        console.error(`Failed to index workflow nodes: ${error.message}`);
      }
    }
  }

  /**
   * Generate semantic content for a workflow (for embedding)
   */
  private generateWorkflowSemanticContent(
    workflow: WorkflowDefinition,
    metadata: { name: string; description?: string; techniques?: string[] },
  ): string {
    const parts: string[] = [
      `Workflow: ${metadata.name}`,
      metadata.description ? `Description: ${metadata.description}` : '',
      `Techniques: ${(metadata.techniques || []).join(', ')}`,
      `Nodes: ${(workflow.nodes || []).map((n) => n.type).join(', ')}`,
      `Node count: ${(workflow.nodes || []).length}`,
    ];

    // Add node details
    for (const node of workflow.nodes || []) {
      parts.push(`Node ${node.name}: ${node.type}`);
      if (node.parameters) {
        const paramKeys = Object.keys(node.parameters).slice(0, 5);
        parts.push(`  Parameters: ${paramKeys.join(', ')}`);
      }
    }

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Generate semantic content for a node (for fine-grained embedding)
   */
  private generateNodeSemanticContent(
    node: WorkflowDefinition['nodes'][0],
    context: {
      connectedTo: string[];
      connectedFrom: string[];
      workflowContext?: string;
    },
  ): string {
    const parts: string[] = [
      `Node: ${node.name}`,
      `Type: ${node.type}`,
      context.workflowContext ? `In workflow: ${context.workflowContext}` : '',
      context.connectedFrom.length > 0
        ? `Receives from: ${context.connectedFrom.join(', ')}`
        : '',
      context.connectedTo.length > 0 ? `Sends to: ${context.connectedTo.join(', ')}` : '',
    ];

    // Add key parameters
    if (node.parameters) {
      const importantParams = ['operation', 'resource', 'method', 'url', 'prompt', 'model'];
      for (const key of importantParams) {
        if (node.parameters[key]) {
          parts.push(`${key}: ${JSON.stringify(node.parameters[key])}`);
        }
      }
    }

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Search for similar workflows using vector similarity
   */
  async searchWorkflows(
    query: string,
    options: SearchOptions = {},
  ): Promise<MatchWorkflowResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const { data, error } = await db.rpc('match_workflows', {
      query_embedding: queryEmbedding,
      match_threshold: options.threshold ?? 0.7,
      match_count: options.limit ?? 5,
      filter_category: options.category ?? null,
      filter_techniques: options.techniques ?? null,
      filter_public: options.publicOnly ?? null,
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    return (data || []) as MatchWorkflowResult[];
  }

  /**
   * Search for similar nodes (fine-grained search)
   */
  async searchNodes(query: string, options: NodeSearchOptions = {}): Promise<MatchNodeResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const { data, error } = await db.rpc('match_nodes', {
      query_embedding: queryEmbedding,
      match_threshold: options.threshold ?? 0.6,
      match_count: options.limit ?? 10,
      filter_node_type: options.nodeType ?? null,
      filter_is_trigger: options.isTrigger ?? null,
      filter_is_ai: options.isAiNode ?? null,
    });

    if (error) {
      throw new Error(`Node search failed: ${error.message}`);
    }

    return (data || []) as MatchNodeResult[];
  }

  /**
   * Hybrid search combining vector similarity and full-text search
   */
  async hybridSearch(
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const { data, error } = await db.rpc('hybrid_search_workflows', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: options.limit ?? 5,
      semantic_weight: options.semanticWeight ?? 0.7,
      keyword_weight: options.keywordWeight ?? 0.3,
    });

    if (error) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }

    return (data || []) as HybridSearchResult[];
  }

  /**
   * Delete a workflow from the store
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    // Node chunks are deleted automatically via CASCADE
    const { error } = await db.from('workflow_examples').delete().eq('id', workflowId);

    if (error) {
      throw new Error(`Failed to delete workflow: ${error.message}`);
    }
  }

  /**
   * Get all workflows (for migration/export)
   */
  async getAllWorkflows(): Promise<IndexedWorkflow[]> {
    const { data, error } = await db.from('workflow_examples').select('*');

    if (error) {
      throw new Error(`Failed to get workflows: ${error.message}`);
    }

    return ((data || []) as WorkflowExample[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      techniques: row.techniques,
      workflow: row.workflow_json as unknown as WorkflowDefinition,
      nodeCount: row.node_count,
      nodeTypes: row.node_types,
    }));
  }

  /**
   * Update a workflow's metadata
   */
  async updateWorkflow(
    workflowId: string,
    updates: {
      name?: string;
      description?: string;
      category?: WorkflowCategory;
      techniques?: string[];
      isPublic?: boolean;
    },
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.techniques !== undefined) updateData.techniques = updates.techniques;
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;

    const { error } = await db
      .from('workflow_examples')
      .update(updateData)
      .eq('id', workflowId);

    if (error) {
      throw new Error(`Failed to update workflow: ${error.message}`);
    }
  }

  /**
   * Re-embed a workflow (for when embedding model is updated)
   */
  async reembedWorkflow(workflowId: string): Promise<void> {
    // Get the workflow
    const { data: workflowData, error: fetchError } = await db
      .from('workflow_examples')
      .select('*')
      .eq('id', workflowId)
      .single();

    const workflow = workflowData as WorkflowExample | null;

    if (fetchError || !workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Generate new embedding
    const semanticContent = this.generateWorkflowSemanticContent(
      workflow.workflow_json as unknown as WorkflowDefinition,
      {
        name: workflow.name,
        description: workflow.description || undefined,
        techniques: workflow.techniques,
      },
    );

    const embedding = await this.generateEmbedding(semanticContent);

    // Update workflow embedding
    const { error: updateError } = await db
      .from('workflow_examples')
      .update({
        embedding,
        embedding_status: 'completed',
        embedding_model: this.config.embeddingModel,
      })
      .eq('id', workflowId);

    if (updateError) {
      throw new Error(`Failed to update embedding: ${updateError.message}`);
    }

    // Re-index node chunks
    await db.from('workflow_node_chunks').delete().eq('workflow_id', workflowId);

    await this.indexWorkflowNodes(
      workflowId,
      workflow.workflow_json as unknown as WorkflowDefinition,
    );
  }

  /**
   * Get statistics about the store
   */
  async getStats(): Promise<{
    totalWorkflows: number;
    totalNodeChunks: number;
    pendingEmbeddings: number;
    failedEmbeddings: number;
  }> {
    const [workflowCount, nodeCount, pendingCount, failedCount] = await Promise.all([
      db.from('workflow_examples').select('id', { count: 'exact', head: true }),
      db.from('workflow_node_chunks').select('id', { count: 'exact', head: true }),
      db
        .from('workflow_examples')
        .select('id', { count: 'exact', head: true })
        .eq('embedding_status', 'pending'),
      db
        .from('workflow_examples')
        .select('id', { count: 'exact', head: true })
        .eq('embedding_status', 'failed'),
    ]);

    return {
      totalWorkflows: (workflowCount as { count: number }).count || 0,
      totalNodeChunks: (nodeCount as { count: number }).count || 0,
      pendingEmbeddings: (pendingCount as { count: number }).count || 0,
      failedEmbeddings: (failedCount as { count: number }).count || 0,
    };
  }
}
