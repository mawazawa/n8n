/**
 * Cross-Encoder Reranker
 * Uses cross-encoder models to rerank search results for better relevance
 *
 * Cross-encoders process query-document pairs jointly, providing more accurate
 * relevance scores than bi-encoders (used for initial retrieval).
 *
 * Supported Models:
 * - Cohere rerank-english-v3.0 (recommended for production)
 * - Local TF-IDF-based reranker (fallback)
 */

export type CohereModel = 'rerank-english-v3.0' | 'rerank-multilingual-v3.0';

export interface RerankerConfig {
  provider?: 'cohere' | 'local' | 'none';
  model?: CohereModel;
  apiKey?: string;
  topK?: number;
  maxChunksPerDoc?: number;
}

export interface RerankInput<T> {
  query: string;
  documents: T[];
  getContent: (doc: T) => string;
}

export interface RerankResult<T> {
  document: T;
  relevanceScore: number;
  originalIndex: number;
}

export interface RerankBatchResult<T> {
  results: RerankResult<T>[];
  latencyMs: number;
  tokensUsed?: number;
  provider: string;
}

/**
 * Cohere reranker implementation with v3.0 model
 * Supports both English and multilingual models
 */
async function cohereRerank<T>(
  query: string,
  documents: T[],
  getContent: (doc: T) => string,
  apiKey: string,
  topK: number,
  model: CohereModel = 'rerank-english-v3.0',
  maxChunksPerDoc?: number,
): Promise<RerankResult<T>[]> {
  const startTime = Date.now();

  const requestBody: Record<string, unknown> = {
    model,
    query,
    documents: documents.map(getContent),
    top_n: topK,
    return_documents: false,
  };

  // Add max_chunks_per_doc if specified
  if (maxChunksPerDoc !== undefined) {
    requestBody.max_chunks_per_doc = maxChunksPerDoc;
  }

  const response = await fetch('https://api.cohere.ai/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'workflow-architect',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cohere rerank failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const latency = Date.now() - startTime;

  // Log performance metrics
  console.log(`Cohere rerank completed in ${latency}ms for ${documents.length} documents`);

  return data.results.map((result: { index: number; relevance_score: number }) => ({
    document: documents[result.index],
    relevanceScore: result.relevance_score,
    originalIndex: result.index,
  }));
}

/**
 * Simple local reranker using TF-IDF similarity
 * Used as fallback when no API key is configured
 */
function localRerank<T>(
  query: string,
  documents: T[],
  getContent: (doc: T) => string,
  topK: number,
): RerankResult<T>[] {
  const queryTerms = new Set(query.toLowerCase().split(/\s+/));

  const scored = documents.map((doc, index) => {
    const content = getContent(doc).toLowerCase();
    const contentTerms = content.split(/\s+/);

    // Calculate simple term overlap score
    let matchCount = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchCount++;
        // Bonus for exact word match
        if (contentTerms.includes(term)) {
          matchCount += 0.5;
        }
      }
    }

    const relevanceScore = matchCount / queryTerms.size;

    return {
      document: doc,
      relevanceScore,
      originalIndex: index,
    };
  });

  // Sort by relevance and take top K
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, topK);
}

/**
 * Create a reranker instance with configurable provider and model
 */
export function createReranker(config: RerankerConfig = {}) {
  const {
    provider = 'local',
    model = 'rerank-english-v3.0',
    apiKey,
    topK = 10,
    maxChunksPerDoc,
  } = config;

  return {
    /**
     * Rerank documents based on relevance to query
     * Returns top-K most relevant documents with scores
     */
    async rerank<T>(input: RerankInput<T>): Promise<RerankResult<T>[]> {
      const { query, documents, getContent } = input;

      if (documents.length === 0) {
        return [];
      }

      // If fewer documents than topK, return all with normalized scores
      if (documents.length <= topK) {
        return documents.map((doc, index) => ({
          document: doc,
          relevanceScore: 1.0 - (index * 0.1), // Slightly decrease scores by position
          originalIndex: index,
        }));
      }

      switch (provider) {
        case 'cohere':
          if (!apiKey) {
            console.warn('Cohere API key not configured, falling back to local reranker');
            return localRerank(query, documents, getContent, topK);
          }
          return cohereRerank(query, documents, getContent, apiKey, topK, model, maxChunksPerDoc);

        case 'local':
        default:
          return localRerank(query, documents, getContent, topK);
      }
    },

    /**
     * Rerank and return detailed batch results with metrics
     */
    async rerankBatch<T>(input: RerankInput<T>): Promise<RerankBatchResult<T>> {
      const startTime = Date.now();
      const results = await this.rerank(input);
      const latencyMs = Date.now() - startTime;

      return {
        results,
        latencyMs,
        provider,
      };
    },

    /**
     * Get just the reranked documents (without scores)
     */
    async rerankDocuments<T>(input: RerankInput<T>): Promise<T[]> {
      const results = await this.rerank(input);
      return results.map((r) => r.document);
    },

    /**
     * Get relevance scores for all documents without filtering to topK
     * Useful for analysis and debugging
     */
    async scoreAll<T>(input: RerankInput<T>): Promise<RerankResult<T>[]> {
      const { query, documents, getContent } = input;

      if (documents.length === 0) {
        return [];
      }

      // For local reranker, score all documents
      if (provider === 'local') {
        return localRerankAll(query, documents, getContent);
      }

      // For Cohere, use topK = documents.length to get all scores
      if (provider === 'cohere' && apiKey) {
        return cohereRerank(
          query,
          documents,
          getContent,
          apiKey,
          documents.length,
          model,
          maxChunksPerDoc,
        );
      }

      // Fallback to local
      return localRerankAll(query, documents, getContent);
    },

    /**
     * Compare multiple rerankers and return results from each
     * Useful for A/B testing and evaluation
     */
    async compareRerankers<T>(
      input: RerankInput<T>,
      rerankers: Array<{ name: string; reranker: Reranker }>,
    ): Promise<Array<{ name: string; results: RerankResult<T>[]; latencyMs: number }>> {
      const comparisons = await Promise.all(
        rerankers.map(async ({ name, reranker }) => {
          const startTime = Date.now();
          const results = await reranker.rerank(input);
          const latencyMs = Date.now() - startTime;
          return { name, results, latencyMs };
        }),
      );

      return comparisons;
    },
  };
}

/**
 * Local reranker that scores all documents without filtering
 */
function localRerankAll<T>(
  query: string,
  documents: T[],
  getContent: (doc: T) => string,
): RerankResult<T>[] {
  const queryTerms = new Set(query.toLowerCase().split(/\s+/));

  const scored = documents.map((doc, index) => {
    const content = getContent(doc).toLowerCase();
    const contentTerms = content.split(/\s+/);

    // Calculate term overlap score with position weighting
    let matchCount = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchCount++;
        // Bonus for exact word match
        if (contentTerms.includes(term)) {
          matchCount += 0.5;
        }
        // Bonus for match in first 100 characters (likely title/summary)
        if (content.substring(0, 100).includes(term)) {
          matchCount += 0.3;
        }
      }
    }

    const relevanceScore = queryTerms.size > 0 ? matchCount / queryTerms.size : 0;

    return {
      document: doc,
      relevanceScore,
      originalIndex: index,
    };
  });

  // Sort by relevance
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export type Reranker = ReturnType<typeof createReranker>;
