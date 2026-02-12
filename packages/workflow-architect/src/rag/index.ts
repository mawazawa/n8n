/**
 * RAG Store Factory
 * Returns the appropriate vector store based on configuration
 */

import { WorkflowRAGStore } from './store';
import { SupabaseVectorStore } from './supabase-store';
import type { WorkflowCategory } from '../supabase/types';
import type { WorkflowDefinition } from '../types/workflow';

export type VectorStoreType = 'supabase' | 'local' | 'chroma';

export interface RAGStoreConfig {
  type: VectorStoreType;
  embeddingFn?: (text: string) => Promise<number[]>;
}

export interface SearchResult {
  id: string;
  name: string;
  description: string | null;
  category: string;
  techniques: string[];
  workflow: WorkflowDefinition;
  similarity: number;
}

export interface RAGStore {
  search(query: string, options?: { limit?: number; category?: string }): Promise<SearchResult[]>;
  addWorkflow(
    workflow: WorkflowDefinition,
    metadata: { name: string; description?: string; category?: string; techniques?: string[] },
  ): Promise<string>;
}

// Default embedding function using OpenAI
async function defaultEmbeddingFn(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embedding generation');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Get the configured vector store type from environment
 */
function getStoreType(): VectorStoreType {
  const type = process.env.VECTOR_STORE_TYPE || 'local';
  if (!['supabase', 'local', 'chroma'].includes(type)) {
    console.warn(`Unknown VECTOR_STORE_TYPE: ${type}, falling back to local`);
    return 'local';
  }
  return type as VectorStoreType;
}

/**
 * Create a Supabase-backed RAG store wrapper
 */
function createSupabaseStore(embeddingFn: (text: string) => Promise<number[]>): RAGStore {
  const store = new SupabaseVectorStore({}, embeddingFn);

  return {
    async search(query, options) {
      const results = await store.searchWorkflows(query, {
        limit: options?.limit || 5,
        category: options?.category as WorkflowCategory | undefined,
      });

      return results.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        techniques: r.techniques,
        workflow: r.workflow_json as unknown as WorkflowDefinition,
        similarity: r.similarity,
      }));
    },

    async addWorkflow(workflow, metadata) {
      return store.addWorkflow(workflow, {
        name: metadata.name,
        description: metadata.description,
        category: (metadata.category as WorkflowCategory) || 'automation',
        techniques: metadata.techniques || [],
        isPublic: true,
      });
    },
  };
}

/**
 * Create a local file-based RAG store wrapper
 */
async function createLocalStore(): Promise<RAGStore> {
  const store = new WorkflowRAGStore();
  await store.load();

  return {
    async search(query, options) {
      const results = store.search(query, {
        limit: options?.limit || 5,
        category: options?.category as WorkflowCategory | undefined,
      });

      return results.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        techniques: r.techniques,
        workflow: r.workflow,
        similarity: 1.0, // Local store doesn't return similarity
      }));
    },

    async addWorkflow(workflow, metadata) {
      await store.addExample({
        id: `workflow-${Date.now()}`,
        name: metadata.name,
        description: metadata.description || '',
        category: (metadata.category as WorkflowCategory) || 'automation',
        techniques: metadata.techniques || [],
        workflow,
      });
      await store.save();
      return `workflow-${Date.now()}`;
    },
  };
}

// Cached store instance
let storeInstance: RAGStore | null = null;

/**
 * Get the RAG store based on configuration
 * Returns Supabase store if configured, otherwise falls back to local
 */
export async function getRAGStore(config?: RAGStoreConfig): Promise<RAGStore> {
  if (storeInstance) {
    return storeInstance;
  }

  const storeType = config?.type || getStoreType();
  const embeddingFn = config?.embeddingFn || defaultEmbeddingFn;

  switch (storeType) {
    case 'supabase':
      // Validate Supabase configuration
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn('Supabase not configured, falling back to local store');
        storeInstance = await createLocalStore();
      } else {
        storeInstance = createSupabaseStore(embeddingFn);
      }
      break;

    case 'chroma':
      // TODO: Implement Chroma store
      console.warn('Chroma store not yet implemented, falling back to local');
      storeInstance = await createLocalStore();
      break;

    case 'local':
    default:
      storeInstance = await createLocalStore();
      break;
  }

  return storeInstance;
}

/**
 * Reset the store instance (useful for testing)
 */
export function resetRAGStore(): void {
  storeInstance = null;
}

// Re-export types and classes
export { WorkflowRAGStore } from './store';
export { SupabaseVectorStore } from './supabase-store';
export type {
  SearchOptions,
  NodeSearchOptions,
  HybridSearchOptions,
  IndexedWorkflow,
} from './supabase-store';
