/**
 * Example Retriever
 * Retrieves relevant workflow examples for few-shot learning
 */

import type { Intent, GenerationExample } from './types';
import { getRAGStore } from '../rag';
import { wrapError } from '../errors';

export interface ExampleRetrieverConfig {
  minSimilarity?: number;
  diversityWeight?: number;
}

export class ExampleRetriever {
  private minSimilarity: number;
  private diversityWeight: number;
  private exampleCache: Map<string, GenerationExample[]>;

  constructor(config: ExampleRetrieverConfig = {}) {
    this.minSimilarity = config.minSimilarity || 0.7;
    this.diversityWeight = config.diversityWeight || 0.3;
    this.exampleCache = new Map();
  }

  /**
   * Retrieve k most relevant examples for an intent
   */
  async retrieve(intent: Intent, k = 3): Promise<GenerationExample[]> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(intent);
      if (this.exampleCache.has(cacheKey)) {
        return this.exampleCache.get(cacheKey)!.slice(0, k);
      }

      // Vector similarity search
      const examples = await this.vectorSearch(intent, k * 2);

      // Rank examples
      const ranked = this.rankExamples(examples, intent);

      // Apply diversity filter
      const diverse = this.selectDiverse(ranked, k);

      // Cache results
      this.exampleCache.set(cacheKey, diverse);

      return diverse;
    } catch (error) {
      throw wrapError(error, 'Failed to retrieve examples');
    }
  }

  /**
   * Vector similarity search for relevant examples
   */
  private async vectorSearch(intent: Intent, k: number): Promise<GenerationExample[]> {
    try {
      const ragStore = await getRAGStore();

      // Search using primary action and workflow type
      const query = `${intent.primaryAction} ${intent.workflowType}`;

      const results = await ragStore.search(query, {
        limit: k,
        category: intent.workflowType,
      });

      // Convert to GenerationExample format
      return results.map((r, index) => ({
        id: r.id,
        description: r.description || r.name,
        intent: intent, // Would need to be stored/inferred
        workflow: {
          name: r.name,
          description: r.description || '',
          nodes: r.workflow.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            position: { x: n.position[0], y: n.position[1] },
            parameters: n.parameters,
            credentials: n.credentials,
            confidence: 1.0,
          })),
          connections: this.convertConnections(r.workflow.connections),
          metadata: {
            category: r.category,
            techniques: r.techniques,
          },
        },
        explanation: `Example workflow: ${r.name}`,
        metadata: {
          category: r.category,
          difficulty: this.inferDifficulty(r.workflow.nodes.length),
          popularity: r.similarity,
        },
      }));
    } catch (error) {
      // If RAG fails, return empty examples
      return [];
    }
  }

  /**
   * Use examples in LLM prompts
   */
  formatExamplesForPrompt(examples: GenerationExample[]): string {
    return examples
      .map((example, index) => {
        return `
Example ${index + 1}:
Description: ${example.description}
Nodes: ${example.workflow.nodes.map((n) => n.type).join(', ')}
Workflow Type: ${example.metadata.category}
`;
      })
      .join('\n---\n');
  }

  /**
   * Curate and rank examples
   */
  private rankExamples(examples: GenerationExample[], intent: Intent): GenerationExample[] {
    return examples
      .map((example) => {
        let score = 0;

        // Workflow type match
        if (example.metadata.category === intent.workflowType) {
          score += 0.4;
        }

        // Complexity match
        const exampleComplexity = this.inferComplexity(example.workflow.nodes.length);
        if (exampleComplexity === intent.complexity) {
          score += 0.3;
        }

        // Popularity
        if (example.metadata.popularity) {
          score += example.metadata.popularity * 0.3;
        }

        return { example, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.example);
  }

  /**
   * Select diverse examples (avoid too similar examples)
   */
  private selectDiverse(examples: GenerationExample[], k: number): GenerationExample[] {
    if (examples.length <= k) {
      return examples;
    }

    const selected: GenerationExample[] = [];
    const remaining = [...examples];

    // Always include top example
    selected.push(remaining.shift()!);

    while (selected.length < k && remaining.length > 0) {
      // Find most diverse example from remaining
      let maxDiversity = -1;
      let maxIndex = 0;

      remaining.forEach((candidate, index) => {
        const diversity = this.calculateDiversity(candidate, selected);
        if (diversity > maxDiversity) {
          maxDiversity = diversity;
          maxIndex = index;
        }
      });

      selected.push(remaining.splice(maxIndex, 1)[0]);
    }

    return selected;
  }

  /**
   * Calculate diversity score
   */
  private calculateDiversity(
    candidate: GenerationExample,
    selected: GenerationExample[],
  ): number {
    if (selected.length === 0) return 1.0;

    const similarities = selected.map((example) => {
      return this.calculateSimilarity(candidate, example);
    });

    // Return average dissimilarity
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    return 1.0 - avgSimilarity;
  }

  /**
   * Calculate similarity between two examples
   */
  private calculateSimilarity(a: GenerationExample, b: GenerationExample): number {
    let similarity = 0;

    // Category match
    if (a.metadata.category === b.metadata.category) {
      similarity += 0.3;
    }

    // Node type overlap
    const aTypes = new Set(a.workflow.nodes.map((n) => n.type));
    const bTypes = new Set(b.workflow.nodes.map((n) => n.type));
    const intersection = new Set([...aTypes].filter((x) => bTypes.has(x)));
    const union = new Set([...aTypes, ...bTypes]);
    similarity += (intersection.size / union.size) * 0.7;

    return similarity;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private getCacheKey(intent: Intent): string {
    return `${intent.workflowType}-${intent.complexity}-${intent.primaryAction.slice(0, 20)}`;
  }

  private convertConnections(connections: unknown): Array<{
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
  }> {
    // Convert n8n connection format to blueprint format
    // This is a simplified version
    return [];
  }

  private inferDifficulty(nodeCount: number): 'beginner' | 'intermediate' | 'advanced' {
    if (nodeCount <= 3) return 'beginner';
    if (nodeCount <= 7) return 'intermediate';
    return 'advanced';
  }

  private inferComplexity(nodeCount: number): 'simple' | 'moderate' | 'complex' {
    if (nodeCount <= 3) return 'simple';
    if (nodeCount <= 7) return 'moderate';
    return 'complex';
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.exampleCache.clear();
  }
}

/**
 * Convenience function to retrieve examples
 */
export async function retrieveExamples(intent: Intent, k = 3): Promise<GenerationExample[]> {
  const retriever = new ExampleRetriever();
  return retriever.retrieve(intent, k);
}
