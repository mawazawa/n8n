/**
 * RAG Store for Workflow Examples
 * Stores and retrieves workflow examples for few-shot learning
 */

import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WorkflowExample, WorkflowDefinition, WorkflowCategory } from '../types/workflow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple in-memory vector store for local development
// Can be replaced with Chroma/Pinecone for production
interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: WorkflowExample;
}

export class WorkflowRAGStore {
  private entries: VectorEntry[] = [];
  private indexPath: string;
  private workflowsPath: string;

  constructor(options?: { indexPath?: string; workflowsPath?: string }) {
    this.indexPath = options?.indexPath || join(__dirname, '../../.cache/rag-index.json');
    this.workflowsPath = options?.workflowsPath || join(__dirname, '../../../workflows');
  }

  /**
   * Load existing index from disk
   */
  async load(): Promise<void> {
    try {
      const data = await readFile(this.indexPath, 'utf-8');
      this.entries = JSON.parse(data);
      console.log(`Loaded ${this.entries.length} workflow examples from index`);
    } catch {
      console.log('No existing index found, starting fresh');
      this.entries = [];
    }
  }

  /**
   * Save index to disk
   */
  async save(): Promise<void> {
    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(this.entries, null, 2));
    console.log(`Saved ${this.entries.length} entries to index`);
  }

  /**
   * Index all workflow JSON files from the workflows directory
   */
  async indexWorkflows(): Promise<number> {
    const files = await readdir(this.workflowsPath);
    const jsonFiles = files.filter(f => f.endsWith('.workflow.json'));

    let indexed = 0;
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(this.workflowsPath, file), 'utf-8');
        const workflow = JSON.parse(content) as WorkflowDefinition;

        const example = this.workflowToExample(workflow, file);
        await this.addExample(example);
        indexed++;
      } catch (error) {
        console.error(`Error indexing ${file}:`, error);
      }
    }

    await this.save();
    return indexed;
  }

  /**
   * Convert a workflow to an example with metadata
   */
  private workflowToExample(workflow: WorkflowDefinition, filename: string): WorkflowExample {
    // Extract category from filename or node types
    const category = this.inferCategory(workflow, filename);
    const techniques = this.extractTechniques(workflow);
    const description = this.generateDescription(workflow);

    return {
      id: filename.replace('.workflow.json', ''),
      name: workflow.name,
      description,
      category,
      techniques,
      workflow,
    };
  }

  /**
   * Infer workflow category from content
   */
  private inferCategory(workflow: WorkflowDefinition, filename: string): WorkflowCategory {
    const nodeTypes = workflow.nodes.map(n => n.type.toLowerCase());

    // Check for AI-related nodes
    if (nodeTypes.some(t => t.includes('langchain') || t.includes('agent'))) {
      if (nodeTypes.some(t => t.includes('vectorstore') || t.includes('retriever'))) {
        return 'rag-pipeline';
      }
      return 'ai-agent';
    }

    // Check for data processing
    if (nodeTypes.some(t => t.includes('spreadsheet') || t.includes('csv') || t.includes('transform'))) {
      return 'data-pipeline';
    }

    // Check for integrations
    if (nodeTypes.some(t => t.includes('slack') || t.includes('github') || t.includes('jira'))) {
      return 'integration';
    }

    // Check for error handling
    if (workflow.nodes.some(n => n.name.toLowerCase().includes('error'))) {
      return 'error-handling';
    }

    // Check for approval flows
    if (workflow.nodes.some(n =>
      n.name.toLowerCase().includes('approval') ||
      n.type.includes('Wait') ||
      n.type.includes('Form')
    )) {
      return 'approval-flow';
    }

    // Check for batch processing
    if (nodeTypes.some(t => t.includes('splitinbatches') || t.includes('loop'))) {
      return 'batch-processing';
    }

    // Check filename hints
    if (filename.includes('monitor')) return 'monitoring';
    if (filename.includes('sync')) return 'data-pipeline';
    if (filename.includes('api')) return 'integration';

    return 'automation';
  }

  /**
   * Extract techniques used in the workflow
   */
  private extractTechniques(workflow: WorkflowDefinition): string[] {
    const techniques: Set<string> = new Set();

    for (const node of workflow.nodes) {
      const type = node.type.toLowerCase();

      // AI techniques
      if (type.includes('agent')) techniques.add('ai-agent');
      if (type.includes('chain')) techniques.add('llm-chain');
      if (type.includes('vectorstore')) techniques.add('vector-search');
      if (type.includes('retriever')) techniques.add('rag');
      if (type.includes('memory')) techniques.add('conversation-memory');
      if (type.includes('tool')) techniques.add('tool-use');

      // Data techniques
      if (type.includes('code')) techniques.add('custom-code');
      if (type.includes('aggregate')) techniques.add('aggregation');
      if (type.includes('filter') || type.includes('if')) techniques.add('conditional-logic');
      if (type.includes('switch')) techniques.add('routing');
      if (type.includes('merge')) techniques.add('data-merge');
      if (type.includes('splitinbatches')) techniques.add('batch-processing');

      // Trigger types
      if (type.includes('webhook')) techniques.add('webhook-trigger');
      if (type.includes('schedule')) techniques.add('scheduled');
      if (type.includes('cron')) techniques.add('cron');

      // Error handling
      if (node.name.toLowerCase().includes('error')) techniques.add('error-handling');
      if (type.includes('wait')) techniques.add('human-in-loop');
    }

    // Check for retry logic
    if (workflow.nodes.some(n => n.parameters?.retry || n.parameters?.continueOnFail)) {
      techniques.add('retry-logic');
    }

    return Array.from(techniques);
  }

  /**
   * Generate a description from workflow structure
   */
  private generateDescription(workflow: WorkflowDefinition): string {
    const triggerNode = workflow.nodes.find(n =>
      n.type.includes('Trigger') || n.type.includes('Webhook')
    );

    const actionNodes = workflow.nodes.filter(n =>
      !n.type.includes('Trigger') && !n.type.includes('Webhook')
    );

    const triggerDesc = triggerNode
      ? `Triggered by ${triggerNode.type.replace(/.*\./, '').replace('Trigger', '')}`
      : 'Manual workflow';

    const actionTypes = [...new Set(actionNodes.map(n => n.type.replace(/.*\./, '')))];
    const actionsDesc = actionTypes.slice(0, 5).join(', ');

    return `${workflow.name}: ${triggerDesc}. Uses: ${actionsDesc}. Total ${workflow.nodes.length} nodes.`;
  }

  /**
   * Add an example to the store
   */
  async addExample(example: WorkflowExample): Promise<void> {
    // Generate simple embedding (TF-IDF style)
    const embedding = this.generateEmbedding(example);

    // Remove existing entry with same ID
    this.entries = this.entries.filter(e => e.id !== example.id);

    this.entries.push({
      id: example.id,
      embedding,
      metadata: example,
    });
  }

  /**
   * Simple embedding generation based on text features
   * For production, use a real embedding model (OpenAI, Voyage, etc.)
   */
  private generateEmbedding(example: WorkflowExample): number[] {
    const text = [
      example.name,
      example.description,
      example.category,
      ...example.techniques,
      ...example.workflow.nodes.map(n => n.type),
    ].join(' ').toLowerCase();

    // Simple character-based hash embedding (256 dimensions)
    const embedding = new Array(256).fill(0);
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      embedding[charCode % 256] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map(v => v / (magnitude || 1));
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB) || 1);
  }

  /**
   * Search for similar workflows
   */
  search(query: string, options?: {
    limit?: number;
    category?: WorkflowCategory;
    techniques?: string[];
  }): WorkflowExample[] {
    const limit = options?.limit ?? 5;

    // Generate query embedding
    const queryExample: WorkflowExample = {
      id: 'query',
      name: query,
      description: query,
      category: options?.category || 'automation',
      techniques: options?.techniques || [],
      workflow: { name: '', active: false, nodes: [], connections: {} },
    };
    const queryEmbedding = this.generateEmbedding(queryExample);

    // Filter by category/techniques if specified
    let candidates = this.entries;
    if (options?.category) {
      candidates = candidates.filter(e => e.metadata.category === options.category);
    }
    if (options?.techniques?.length) {
      candidates = candidates.filter(e =>
        options.techniques!.some(t => e.metadata.techniques.includes(t))
      );
    }

    // Score and sort
    const scored = candidates.map(entry => ({
      example: entry.metadata,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.example);
  }

  /**
   * Get examples by category
   */
  getByCategory(category: WorkflowCategory, limit?: number): WorkflowExample[] {
    const matches = this.entries
      .filter(e => e.metadata.category === category)
      .map(e => e.metadata);

    return limit ? matches.slice(0, limit) : matches;
  }

  /**
   * Get examples by techniques
   */
  getByTechniques(techniques: string[], limit?: number): WorkflowExample[] {
    const matches = this.entries
      .filter(e => techniques.some(t => e.metadata.techniques.includes(t)))
      .map(e => e.metadata);

    return limit ? matches.slice(0, limit) : matches;
  }

  /**
   * Get all examples
   */
  getAll(): WorkflowExample[] {
    return this.entries.map(e => e.metadata);
  }

  /**
   * Get statistics about the store
   */
  getStats(): {
    total: number;
    byCategory: Record<WorkflowCategory, number>;
    techniques: string[];
  } {
    const byCategory: Record<string, number> = {};
    const techniques = new Set<string>();

    for (const entry of this.entries) {
      byCategory[entry.metadata.category] = (byCategory[entry.metadata.category] || 0) + 1;
      entry.metadata.techniques.forEach(t => techniques.add(t));
    }

    return {
      total: this.entries.length,
      byCategory: byCategory as Record<WorkflowCategory, number>,
      techniques: Array.from(techniques),
    };
  }
}

// Singleton instance
let storeInstance: WorkflowRAGStore | null = null;

export async function getRAGStore(): Promise<WorkflowRAGStore> {
  if (!storeInstance) {
    storeInstance = new WorkflowRAGStore();
    await storeInstance.load();
  }
  return storeInstance;
}
