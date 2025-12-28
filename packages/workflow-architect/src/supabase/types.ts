/**
 * Supabase Database Types
 * Auto-generated types for the workflow-architect database schema
 */

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

export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Database {
  public: {
    Views: Record<string, never>;
    Enums: {
      workflow_category: WorkflowCategory;
      embedding_status: EmbeddingStatus;
    };
    Tables: {
      workflow_examples: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category: WorkflowCategory;
          techniques: string[];
          workflow_json: Record<string, unknown>;
          embedding: number[] | null;
          embedding_status: EmbeddingStatus;
          embedding_model: string;
          embedding_version: number;
          user_id: string | null;
          organization_id: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
          node_count: number;
          node_types: string[];
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category?: WorkflowCategory;
          techniques?: string[];
          workflow_json: Record<string, unknown>;
          embedding?: number[] | null;
          embedding_status?: EmbeddingStatus;
          embedding_model?: string;
          embedding_version?: number;
          user_id?: string | null;
          organization_id?: string | null;
          is_public?: boolean;
        };
        Update: {
          name?: string;
          description?: string | null;
          category?: WorkflowCategory;
          techniques?: string[];
          workflow_json?: Record<string, unknown>;
          embedding?: number[] | null;
          embedding_status?: EmbeddingStatus;
          embedding_model?: string;
          embedding_version?: number;
          is_public?: boolean;
        };
      };
      workflow_node_chunks: {
        Row: {
          id: string;
          workflow_id: string;
          node_id: string;
          node_name: string;
          node_type: string;
          node_index: number;
          semantic_content: string;
          embedding: number[] | null;
          embedding_status: EmbeddingStatus;
          connected_to: string[];
          connected_from: string[];
          is_trigger: boolean;
          is_ai_node: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          workflow_id: string;
          node_id: string;
          node_name: string;
          node_type: string;
          node_index: number;
          semantic_content: string;
          embedding?: number[] | null;
          embedding_status?: EmbeddingStatus;
          connected_to?: string[];
          connected_from?: string[];
          is_trigger?: boolean;
          is_ai_node?: boolean;
        };
        Update: {
          semantic_content?: string;
          embedding?: number[] | null;
          embedding_status?: EmbeddingStatus;
          connected_to?: string[];
          connected_from?: string[];
        };
      };
    };
    Functions: {
      match_workflows: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_category?: WorkflowCategory | null;
          filter_techniques?: string[] | null;
          filter_public?: boolean | null;
        };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          category: WorkflowCategory;
          techniques: string[];
          workflow_json: Record<string, unknown>;
          node_count: number;
          node_types: string[];
          similarity: number;
        }[];
      };
      match_nodes: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_node_type?: string | null;
          filter_is_trigger?: boolean | null;
          filter_is_ai?: boolean | null;
        };
        Returns: {
          id: string;
          workflow_id: string;
          node_id: string;
          node_name: string;
          node_type: string;
          semantic_content: string;
          connected_to: string[];
          connected_from: string[];
          similarity: number;
        }[];
      };
      hybrid_search_workflows: {
        Args: {
          query_text: string;
          query_embedding: number[];
          match_count?: number;
          semantic_weight?: number;
          keyword_weight?: number;
        };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          category: WorkflowCategory;
          techniques: string[];
          workflow_json: Record<string, unknown>;
          semantic_score: number;
          keyword_score: number;
          combined_score: number;
        }[];
      };
    };
  };
}

// Helper types for query results
export type WorkflowExample = Database['public']['Tables']['workflow_examples']['Row'];
export type WorkflowExampleInsert = Database['public']['Tables']['workflow_examples']['Insert'];
export type WorkflowExampleUpdate = Database['public']['Tables']['workflow_examples']['Update'];

export type WorkflowNodeChunk = Database['public']['Tables']['workflow_node_chunks']['Row'];
export type WorkflowNodeChunkInsert = Database['public']['Tables']['workflow_node_chunks']['Insert'];
export type WorkflowNodeChunkUpdate = Database['public']['Tables']['workflow_node_chunks']['Update'];

export type MatchWorkflowResult = Database['public']['Functions']['match_workflows']['Returns'][0];
export type MatchNodeResult = Database['public']['Functions']['match_nodes']['Returns'][0];
export type HybridSearchResult =
  Database['public']['Functions']['hybrid_search_workflows']['Returns'][0];
