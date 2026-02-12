/**
 * Query Expansion for Enhanced Search
 *
 * Expands user queries with synonyms, related terms, and domain-specific vocabulary
 * to improve search recall and handle vocabulary mismatch between queries and documents.
 *
 * Techniques:
 * - Synonym expansion using predefined dictionaries
 * - Domain-specific term mapping (automation, integration, AI)
 * - Acronym expansion
 * - Query reformulation
 */

/**
 * Domain-specific synonym dictionary for workflow automation
 * Organized by common automation concepts
 */
const AUTOMATION_SYNONYMS: Record<string, string[]> = {
  // Email & Communication
  email: ['mail', 'smtp', 'gmail', 'outlook', 'sendgrid', 'mailchimp', 'ses'],
  message: ['notify', 'notification', 'alert', 'send message'],
  chat: ['slack', 'discord', 'teams', 'telegram', 'whatsapp', 'mattermost'],

  // Databases & Storage
  database: ['db', 'sql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'supabase', 'firebase'],
  storage: ['s3', 'google drive', 'dropbox', 'onedrive', 'azure storage', 'file storage'],
  cache: ['redis', 'memcached', 'in-memory'],

  // AI & Machine Learning
  ai: ['artificial intelligence', 'ml', 'machine learning', 'openai', 'gpt', 'claude', 'anthropic'],
  agent: ['ai agent', 'autonomous agent', 'langchain', 'llm agent'],
  embedding: ['vector', 'embeddings', 'semantic search', 'vector search'],
  llm: ['large language model', 'gpt', 'claude', 'openai', 'anthropic'],

  // Web & APIs
  api: ['rest', 'rest api', 'graphql', 'http', 'endpoint', 'web service'],
  webhook: ['trigger', 'http trigger', 'webhook trigger', 'callback'],
  request: ['http request', 'fetch', 'call api', 'api call'],

  // Workflow Triggers
  schedule: ['cron', 'timer', 'interval', 'periodic', 'recurring'],
  trigger: ['start', 'initiate', 'begin', 'webhook', 'event'],
  event: ['listener', 'handler', 'on event', 'trigger'],

  // Data Operations
  transform: ['convert', 'parse', 'format', 'extract', 'map', 'process'],
  filter: ['where', 'condition', 'if', 'conditional'],
  aggregate: ['sum', 'count', 'group by', 'reduce', 'collect'],
  join: ['merge', 'combine', 'concatenate', 'union'],

  // File Operations
  file: ['document', 'attachment', 'upload', 'download'],
  csv: ['spreadsheet', 'excel', 'tsv', 'tabular data'],
  json: ['object', 'data structure', 'payload'],

  // Monitoring & Logging
  log: ['logging', 'logger', 'write log', 'console'],
  monitor: ['watch', 'observe', 'track', 'check'],
  error: ['exception', 'failure', 'error handling', 'catch'],

  // Authentication & Security
  auth: ['authentication', 'authorize', 'login', 'oauth', 'sso'],
  token: ['jwt', 'api key', 'access token', 'bearer token'],
  credential: ['password', 'secret', 'api key', 'auth'],

  // Automation Patterns
  loop: ['iterate', 'foreach', 'repeat', 'iteration'],
  wait: ['delay', 'sleep', 'pause', 'timeout'],
  retry: ['retry logic', 'error retry', 'retry failed'],
  parallel: ['concurrent', 'async', 'simultaneous'],
};

/**
 * Common acronym expansions
 */
const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  crm: ['customer relationship management', 'salesforce', 'hubspot'],
  erp: ['enterprise resource planning', 'sap', 'oracle'],
  cms: ['content management system', 'wordpress', 'contentful'],
  etl: ['extract transform load', 'data pipeline'],
  sms: ['text message', 'twilio', 'sms message'],
  rss: ['feed', 'rss feed', 'news feed'],
  iot: ['internet of things', 'device', 'sensor'],
  cicd: ['ci/cd', 'continuous integration', 'continuous deployment', 'github actions'],
};

/**
 * Workflow category-specific terms
 */
const CATEGORY_TERMS: Record<string, string[]> = {
  'ai-agent': ['agent', 'llm', 'ai', 'autonomous', 'langchain', 'openai', 'claude'],
  'rag-pipeline': ['retrieval', 'embedding', 'vector search', 'semantic search', 'rag'],
  'data-pipeline': ['etl', 'transform', 'aggregate', 'process', 'batch'],
  integration: ['connect', 'sync', 'api', 'webhook', 'third-party'],
  automation: ['workflow', 'automate', 'trigger', 'schedule', 'recurring'],
  monitoring: ['alert', 'watch', 'track', 'observe', 'log'],
  'approval-flow': ['approve', 'review', 'workflow', 'human in loop'],
  'error-handling': ['retry', 'catch', 'error', 'exception', 'fallback'],
  'batch-processing': ['batch', 'bulk', 'parallel', 'queue', 'process multiple'],
};

/**
 * Expand query with synonyms and related terms
 */
export function expandQuery(query: string, options: {
  maxExpansions?: number;
  includeSynonyms?: boolean;
  includeAcronyms?: boolean;
  category?: string;
} = {}): string[] {
  const {
    maxExpansions = 10,
    includeSynonyms = true,
    includeAcronyms = true,
    category,
  } = options;

  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 0);
  const expandedTerms = new Set<string>(words);

  // Add original query
  expandedTerms.add(queryLower);

  // Expand with synonyms
  if (includeSynonyms) {
    for (const word of words) {
      const synonyms = AUTOMATION_SYNONYMS[word];
      if (synonyms) {
        synonyms.slice(0, 3).forEach((syn) => expandedTerms.add(syn));
      }

      // Partial matches (e.g., "scheduling" matches "schedule")
      for (const [key, values] of Object.entries(AUTOMATION_SYNONYMS)) {
        if (word.includes(key) || key.includes(word)) {
          values.slice(0, 2).forEach((syn) => expandedTerms.add(syn));
        }
      }
    }
  }

  // Expand acronyms
  if (includeAcronyms) {
    for (const word of words) {
      const expansions = ACRONYM_EXPANSIONS[word];
      if (expansions) {
        expansions.slice(0, 2).forEach((exp) => expandedTerms.add(exp));
      }
    }
  }

  // Add category-specific terms
  if (category && CATEGORY_TERMS[category]) {
    CATEGORY_TERMS[category].slice(0, 3).forEach((term) => expandedTerms.add(term));
  }

  // Limit total expansions
  const result = Array.from(expandedTerms).slice(0, maxExpansions);
  return result;
}

/**
 * Expand query and return as search string
 */
export function expandQueryAsString(query: string, options?: Parameters<typeof expandQuery>[1]): string {
  return expandQuery(query, options).join(' ');
}

/**
 * Get synonyms for a specific term
 */
export function getSynonyms(term: string): string[] {
  const termLower = term.toLowerCase();
  return AUTOMATION_SYNONYMS[termLower] || [];
}

/**
 * Add custom synonym to dictionary (useful for domain-specific customization)
 */
export function addSynonym(term: string, synonyms: string[]): void {
  const termLower = term.toLowerCase();
  if (AUTOMATION_SYNONYMS[termLower]) {
    AUTOMATION_SYNONYMS[termLower].push(...synonyms);
  } else {
    AUTOMATION_SYNONYMS[termLower] = synonyms;
  }
}

/**
 * Generate query variations for multi-search strategy
 * Returns different reformulations of the same query
 */
export function generateQueryVariations(query: string): string[] {
  const variations = new Set<string>();

  // Original query
  variations.add(query);

  // Lowercase
  variations.add(query.toLowerCase());

  // Remove common stop words
  const stopWords = new Set(['how', 'to', 'a', 'an', 'the', 'with', 'for', 'and', 'or', 'in', 'on']);
  const withoutStopWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !stopWords.has(w))
    .join(' ');
  if (withoutStopWords) {
    variations.add(withoutStopWords);
  }

  // Extract key terms (nouns/verbs - simple heuristic)
  const words = query.toLowerCase().split(/\s+/);
  const keyTerms = words.filter((w) => w.length > 3); // Likely more meaningful
  if (keyTerms.length > 0) {
    variations.add(keyTerms.join(' '));
  }

  // Add expanded version
  const expanded = expandQuery(query, { maxExpansions: 5 });
  variations.add(expanded.join(' '));

  return Array.from(variations);
}

/**
 * Analyze query and suggest better search terms
 */
export function suggestBetterQuery(query: string): {
  suggestions: string[];
  expandedTerms: string[];
  detectedCategories: string[];
} {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);

  // Find expandable terms
  const expandedTerms: string[] = [];
  for (const word of words) {
    if (AUTOMATION_SYNONYMS[word]) {
      expandedTerms.push(word);
    }
  }

  // Detect potential categories
  const detectedCategories: string[] = [];
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    const hasMatch = terms.some((term) =>
      queryLower.includes(term) || words.some((w) => term.includes(w)),
    );
    if (hasMatch) {
      detectedCategories.push(category);
    }
  }

  // Generate suggestions
  const suggestions: string[] = [];

  // Suggest adding specific tool names
  if (queryLower.includes('email')) {
    suggestions.push('Try: "gmail" or "sendgrid" for specific email services');
  }
  if (queryLower.includes('database')) {
    suggestions.push('Try: "postgres" or "mongodb" for specific databases');
  }
  if (queryLower.includes('ai')) {
    suggestions.push('Try: "openai" or "claude" for specific AI providers');
  }

  return {
    suggestions,
    expandedTerms,
    detectedCategories,
  };
}

/**
 * Extract key phrases from query (2-3 word combinations)
 * Useful for highlighting and analysis
 */
export function extractKeyPhrases(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const phrases: string[] = [];

  // Bigrams (2-word phrases)
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }

  // Trigrams (3-word phrases)
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  return phrases;
}

/**
 * Export synonym dictionaries for external use
 */
export function getSynonymDictionary(): Record<string, string[]> {
  return { ...AUTOMATION_SYNONYMS };
}

export function getAcronymDictionary(): Record<string, string[]> {
  return { ...ACRONYM_EXPANSIONS };
}

export function getCategoryTerms(): Record<string, string[]> {
  return { ...CATEGORY_TERMS };
}
