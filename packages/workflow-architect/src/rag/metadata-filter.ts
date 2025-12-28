/**
 * Metadata Filtering for Search Results
 *
 * Provides flexible filtering and boosting based on workflow metadata:
 * - Category filtering
 * - Technique/tag filtering
 * - Node type filtering
 * - Custom metadata predicates
 *
 * Supports both hard filters (exclude non-matching) and soft filters (boost matching)
 */

import type { WorkflowCategory } from '../supabase/types';

export interface WorkflowMetadata {
  id: string;
  category: WorkflowCategory;
  techniques: string[];
  node_types?: string[];
  node_count?: number;
  [key: string]: unknown;
}

export interface MetadataFilterOptions {
  category?: WorkflowCategory | WorkflowCategory[];
  techniques?: string[];
  nodeTypes?: string[];
  minNodeCount?: number;
  maxNodeCount?: number;
  customPredicate?: (metadata: WorkflowMetadata) => boolean;
}

export interface MetadataBoostOptions {
  categoryBoost?: Record<WorkflowCategory, number>;
  techniqueBoost?: Record<string, number>;
  nodeTypeBoost?: Record<string, number>;
  defaultBoost?: number;
}

export type MetadataFilterPredicate = (item: WorkflowMetadata) => boolean;

/**
 * Create a metadata filter predicate from options
 */
export function createMetadataFilter(options: MetadataFilterOptions): MetadataFilterPredicate {
  return (item: WorkflowMetadata): boolean => {
    // Category filter
    if (options.category) {
      const categories = Array.isArray(options.category) ? options.category : [options.category];
      if (!categories.includes(item.category)) {
        return false;
      }
    }

    // Techniques filter (item must have at least one of the specified techniques)
    if (options.techniques && options.techniques.length > 0) {
      const itemTechniques = item.techniques.map((t) => t.toLowerCase());
      const filterTechniques = options.techniques.map((t) => t.toLowerCase());

      const hasMatch = filterTechniques.some((ft) => itemTechniques.includes(ft));
      if (!hasMatch) {
        return false;
      }
    }

    // Node types filter
    if (options.nodeTypes && options.nodeTypes.length > 0 && item.node_types) {
      const itemNodeTypes = item.node_types.map((t) => t.toLowerCase());
      const filterNodeTypes = options.nodeTypes.map((t) => t.toLowerCase());

      const hasMatch = filterNodeTypes.some((nt) => itemNodeTypes.includes(nt));
      if (!hasMatch) {
        return false;
      }
    }

    // Node count filters
    if (options.minNodeCount !== undefined && item.node_count !== undefined) {
      if (item.node_count < options.minNodeCount) {
        return false;
      }
    }

    if (options.maxNodeCount !== undefined && item.node_count !== undefined) {
      if (item.node_count > options.maxNodeCount) {
        return false;
      }
    }

    // Custom predicate
    if (options.customPredicate) {
      return options.customPredicate(item);
    }

    return true;
  };
}

/**
 * Calculate metadata-based boost score for a workflow
 */
export function calculateMetadataBoost(
  item: WorkflowMetadata,
  options: MetadataBoostOptions,
): number {
  let boost = options.defaultBoost || 1.0;

  // Category boost
  if (options.categoryBoost && options.categoryBoost[item.category]) {
    boost *= options.categoryBoost[item.category];
  }

  // Technique boost (additive for multiple matching techniques)
  if (options.techniqueBoost && item.techniques) {
    const techniqueBoosts = item.techniques
      .map((t) => options.techniqueBoost![t.toLowerCase()] || 0)
      .filter((b) => b > 0);

    if (techniqueBoosts.length > 0) {
      // Average of matching technique boosts
      const avgTechniqueBoost = techniqueBoosts.reduce((sum, b) => sum + b, 0) / techniqueBoosts.length;
      boost *= avgTechniqueBoost;
    }
  }

  // Node type boost
  if (options.nodeTypeBoost && item.node_types) {
    const nodeTypeBoosts = item.node_types
      .map((nt) => options.nodeTypeBoost![nt.toLowerCase()] || 0)
      .filter((b) => b > 0);

    if (nodeTypeBoosts.length > 0) {
      // Take maximum node type boost
      const maxNodeTypeBoost = Math.max(...nodeTypeBoosts);
      boost *= maxNodeTypeBoost;
    }
  }

  return boost;
}

/**
 * Apply metadata filter and return filtered results
 */
export function applyMetadataFilter<T extends WorkflowMetadata>(
  items: T[],
  options: MetadataFilterOptions,
): T[] {
  const predicate = createMetadataFilter(options);
  return items.filter(predicate);
}

/**
 * Apply metadata boost to search results (modifies scores)
 */
export function applyMetadataBoost<T extends WorkflowMetadata & { score?: number }>(
  items: T[],
  boostOptions: MetadataBoostOptions,
): Array<T & { boostedScore: number; boostFactor: number }> {
  return items.map((item) => {
    const boostFactor = calculateMetadataBoost(item, boostOptions);
    const originalScore = item.score || 1.0;
    const boostedScore = originalScore * boostFactor;

    return {
      ...item,
      boostedScore,
      boostFactor,
    };
  });
}

/**
 * Combined filter and boost operation
 * First filters, then applies boosting, and re-sorts by boosted score
 */
export function filterAndBoost<T extends WorkflowMetadata & { score?: number }>(
  items: T[],
  filterOptions: MetadataFilterOptions,
  boostOptions: MetadataBoostOptions,
): Array<T & { boostedScore: number; boostFactor: number }> {
  // First apply hard filters
  const filtered = applyMetadataFilter(items, filterOptions);

  // Then apply boosts
  const boosted = applyMetadataBoost(filtered, boostOptions);

  // Re-sort by boosted score
  return boosted.sort((a, b) => b.boostedScore - a.boostedScore);
}

/**
 * Create a metadata-based similarity score
 * Measures how well a workflow matches preferred metadata criteria
 */
export function calculateMetadataSimilarity(
  item: WorkflowMetadata,
  preferences: {
    preferredCategory?: WorkflowCategory;
    preferredTechniques?: string[];
    preferredNodeTypes?: string[];
  },
): number {
  let score = 0;
  let maxScore = 0;

  // Category similarity (binary: match or not)
  if (preferences.preferredCategory) {
    maxScore += 1.0;
    if (item.category === preferences.preferredCategory) {
      score += 1.0;
    }
  }

  // Technique similarity (Jaccard similarity)
  if (preferences.preferredTechniques && preferences.preferredTechniques.length > 0) {
    maxScore += 1.0;
    const itemTechniques = new Set(item.techniques.map((t) => t.toLowerCase()));
    const prefTechniques = new Set(preferences.preferredTechniques.map((t) => t.toLowerCase()));

    const intersection = [...itemTechniques].filter((t) => prefTechniques.has(t)).length;
    const union = new Set([...itemTechniques, ...prefTechniques]).size;

    if (union > 0) {
      score += intersection / union;
    }
  }

  // Node type similarity (Jaccard similarity)
  if (preferences.preferredNodeTypes && preferences.preferredNodeTypes.length > 0 && item.node_types) {
    maxScore += 1.0;
    const itemNodeTypes = new Set(item.node_types.map((t) => t.toLowerCase()));
    const prefNodeTypes = new Set(preferences.preferredNodeTypes.map((t) => t.toLowerCase()));

    const intersection = [...itemNodeTypes].filter((t) => prefNodeTypes.has(t)).length;
    const union = new Set([...itemNodeTypes, ...prefNodeTypes]).size;

    if (union > 0) {
      score += intersection / union;
    }
  }

  // Normalize to [0, 1]
  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Analyze metadata distribution in search results
 * Useful for understanding what types of results are being returned
 */
export function analyzeMetadataDistribution<T extends WorkflowMetadata>(
  items: T[],
): {
  categoryDistribution: Record<WorkflowCategory, number>;
  topTechniques: Array<{ technique: string; count: number }>;
  topNodeTypes: Array<{ nodeType: string; count: number }>;
  avgNodeCount: number;
} {
  const categoryDistribution: Record<string, number> = {};
  const techniqueCount: Record<string, number> = {};
  const nodeTypeCount: Record<string, number> = {};
  let totalNodes = 0;
  let nodeCountItems = 0;

  for (const item of items) {
    // Category distribution
    categoryDistribution[item.category] = (categoryDistribution[item.category] || 0) + 1;

    // Technique counts
    for (const technique of item.techniques) {
      techniqueCount[technique] = (techniqueCount[technique] || 0) + 1;
    }

    // Node type counts
    if (item.node_types) {
      for (const nodeType of item.node_types) {
        nodeTypeCount[nodeType] = (nodeTypeCount[nodeType] || 0) + 1;
      }
    }

    // Node count stats
    if (item.node_count !== undefined) {
      totalNodes += item.node_count;
      nodeCountItems++;
    }
  }

  // Sort techniques by count
  const topTechniques = Object.entries(techniqueCount)
    .map(([technique, count]) => ({ technique, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Sort node types by count
  const topNodeTypes = Object.entries(nodeTypeCount)
    .map(([nodeType, count]) => ({ nodeType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const avgNodeCount = nodeCountItems > 0 ? totalNodes / nodeCountItems : 0;

  return {
    categoryDistribution: categoryDistribution as Record<WorkflowCategory, number>,
    topTechniques,
    topNodeTypes,
    avgNodeCount,
  };
}

/**
 * Create a composite filter combining multiple filter strategies
 */
export function createCompositeFilter(
  filters: MetadataFilterPredicate[],
  combineWith: 'AND' | 'OR' = 'AND',
): MetadataFilterPredicate {
  return (item: WorkflowMetadata): boolean => {
    if (combineWith === 'AND') {
      return filters.every((filter) => filter(item));
    } else {
      return filters.some((filter) => filter(item));
    }
  };
}

/**
 * Create an inverted filter (exclude matching items)
 */
export function invertFilter(filter: MetadataFilterPredicate): MetadataFilterPredicate {
  return (item: WorkflowMetadata): boolean => !filter(item);
}

/**
 * Pre-defined filter presets for common use cases
 */
export const FilterPresets = {
  /**
   * AI/ML workflows only
   */
  aiWorkflows: createMetadataFilter({
    category: 'ai-agent',
    techniques: ['openai', 'anthropic', 'langchain', 'agent'],
  }),

  /**
   * Data processing workflows
   */
  dataWorkflows: createMetadataFilter({
    category: ['data-pipeline', 'batch-processing'],
  }),

  /**
   * Simple automation (< 10 nodes)
   */
  simpleAutomation: createMetadataFilter({
    category: 'automation',
    maxNodeCount: 10,
  }),

  /**
   * Complex workflows (> 15 nodes)
   */
  complexWorkflows: createMetadataFilter({
    minNodeCount: 15,
  }),

  /**
   * Integration workflows with external services
   */
  integrationWorkflows: createMetadataFilter({
    category: 'integration',
  }),
};

/**
 * Pre-defined boost presets
 */
export const BoostPresets = {
  /**
   * Boost AI/ML workflows
   */
  boostAI: {
    categoryBoost: {
      'ai-agent': 1.5,
      'rag-pipeline': 1.3,
    } as Record<WorkflowCategory, number>,
    techniqueBoost: {
      openai: 1.2,
      anthropic: 1.2,
      langchain: 1.1,
    },
  },

  /**
   * Boost simpler workflows
   */
  boostSimple: {
    defaultBoost: 1.0,
    categoryBoost: {
      automation: 1.2,
      integration: 1.1,
    } as Record<WorkflowCategory, number>,
  },

  /**
   * Boost based on popularity indicators
   */
  boostPopular: {
    defaultBoost: 1.0,
    // Could be extended with usage statistics
  },
};
