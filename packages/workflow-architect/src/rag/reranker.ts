/**
 * Cross-Encoder Reranker
 * Uses a cross-encoder model to rerank search results for better relevance
 */

export interface RerankerConfig {
  model?: 'cohere' | 'local' | 'none';
  apiKey?: string;
  topK?: number;
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

/**
 * Cohere reranker implementation
 */
async function cohereRerank<T>(
  query: string,
  documents: T[],
  getContent: (doc: T) => string,
  apiKey: string,
  topK: number,
): Promise<RerankResult<T>[]> {
  const response = await fetch('https://api.cohere.ai/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-english-v2.0',
      query,
      documents: documents.map(getContent),
      top_n: topK,
      return_documents: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Cohere rerank failed: ${response.statusText}`);
  }

  const data = await response.json();

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
 * Create a reranker instance
 */
export function createReranker(config: RerankerConfig = {}) {
  const { model = 'local', apiKey, topK = 5 } = config;

  return {
    /**
     * Rerank documents based on relevance to query
     */
    async rerank<T>(input: RerankInput<T>): Promise<RerankResult<T>[]> {
      const { query, documents, getContent } = input;

      if (documents.length === 0) {
        return [];
      }

      // If fewer documents than topK, return all
      if (documents.length <= topK) {
        return documents.map((doc, index) => ({
          document: doc,
          relevanceScore: 1.0,
          originalIndex: index,
        }));
      }

      switch (model) {
        case 'cohere':
          if (!apiKey) {
            console.warn('Cohere API key not configured, falling back to local reranker');
            return localRerank(query, documents, getContent, topK);
          }
          return cohereRerank(query, documents, getContent, apiKey, topK);

        case 'local':
        default:
          return localRerank(query, documents, getContent, topK);
      }
    },

    /**
     * Get just the reranked documents
     */
    async rerankDocuments<T>(input: RerankInput<T>): Promise<T[]> {
      const results = await this.rerank(input);
      return results.map((r) => r.document);
    },
  };
}

export type Reranker = ReturnType<typeof createReranker>;
