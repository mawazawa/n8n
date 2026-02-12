/**
 * Alternative Generator
 * Generates alternative workflow approaches for the same goal
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getTaskRouter } from '../models/task-router';
import type { Intent, WorkflowBlueprint, AlternativeApproach } from './types';
import { WorkflowPlanner } from './planner';
import { wrapError } from '../errors';

const ALTERNATIVE_GENERATION_PROMPT = `You are an expert workflow architect. Given an intent and a primary workflow approach, generate alternative ways to achieve the same goal.

Consider different approaches:
1. Different node combinations
2. Sequential vs parallel execution
3. Code-heavy vs no-code approaches
4. Simple vs robust (with error handling)
5. Performance-optimized vs maintainable

For each alternative, explain:
- The approach taken
- Pros and cons compared to the primary approach
- When this alternative would be more suitable

Generate 2-3 viable alternatives.`;

export interface AlternativeGeneratorConfig {
  model?: BaseChatModel;
  maxAlternatives?: number;
}

export class AlternativeGenerator {
  private model: BaseChatModel;
  private maxAlternatives: number;
  private planner: WorkflowPlanner;

  constructor(config: AlternativeGeneratorConfig = {}) {
    const router = getTaskRouter();
    this.model = config.model || router.getModelForTask('building');
    this.maxAlternatives = config.maxAlternatives || 3;
    this.planner = new WorkflowPlanner();
  }

  /**
   * Generate alternative approaches for the same goal
   */
  async generate(intent: Intent, count?: number): Promise<AlternativeApproach[]> {
    const targetCount = count || Math.min(this.maxAlternatives, 3);

    try {
      const alternatives: AlternativeApproach[] = [];

      // Generate different approaches
      alternatives.push(await this.generateCodeHeavyApproach(intent));
      alternatives.push(await this.generateNoCodeApproach(intent));

      if (targetCount > 2) {
        alternatives.push(await this.generateParallelApproach(intent));
      }

      // Analyze trade-offs for each
      return alternatives.map((alt) => this.analyzeTradeoffs(alt, intent));
    } catch (error) {
      throw wrapError(error, 'Failed to generate alternatives');
    }
  }

  /**
   * Trade-off analysis per alternative
   */
  analyzeTradeoffs(
    alternative: AlternativeApproach,
    intent: Intent,
  ): AlternativeApproach {
    const pros: string[] = [];
    const cons: string[] = [];
    const suitableFor: string[] = [];

    const nodeCount = alternative.workflow.nodes.length;
    const hasCode = alternative.workflow.nodes.some((n) => n.type.includes('code'));
    const hasConditionals = alternative.workflow.nodes.some(
      (n) => n.type.includes('if') || n.type.includes('switch'),
    );

    // Analyze based on approach
    if (alternative.approach.toLowerCase().includes('code')) {
      pros.push('Highly flexible and customizable');
      pros.push('Can handle complex transformations');
      cons.push('Requires JavaScript knowledge');
      cons.push('Harder to maintain for non-developers');
      suitableFor.push('Developers');
      suitableFor.push('Complex data transformations');
    }

    if (alternative.approach.toLowerCase().includes('no-code')) {
      pros.push('Easy to understand and maintain');
      pros.push('No programming required');
      cons.push('Limited flexibility for complex logic');
      cons.push('May require more nodes');
      suitableFor.push('Non-developers');
      suitableFor.push('Simple workflows');
    }

    if (alternative.approach.toLowerCase().includes('parallel')) {
      pros.push('Faster execution');
      pros.push('Better performance');
      cons.push('More complex to debug');
      cons.push('Requires careful coordination');
      suitableFor.push('Independent operations');
      suitableFor.push('Performance-critical workflows');
    }

    if (nodeCount < 5) {
      pros.push('Simple and easy to understand');
      suitableFor.push('Quick setup');
    } else if (nodeCount > 10) {
      cons.push('Complex workflow');
      cons.push('More maintenance required');
    }

    return {
      ...alternative,
      tradeoffs: {
        pros: [...new Set(pros)],
        cons: [...new Set(cons)],
      },
      suitableFor: [...new Set(suitableFor)],
    };
  }

  /**
   * Provide recommendation with rationale
   */
  recommend(alternatives: AlternativeApproach[], intent: Intent): {
    recommended: AlternativeApproach;
    rationale: string;
  } {
    // Sort by confidence
    const sorted = [...alternatives].sort((a, b) => b.confidence - a.confidence);

    // Consider intent complexity
    let recommended = sorted[0];

    if (intent.complexity === 'simple') {
      // Prefer no-code for simple workflows
      const noCode = sorted.find((a) => a.approach.toLowerCase().includes('no-code'));
      if (noCode) recommended = noCode;
    } else if (intent.complexity === 'complex') {
      // Prefer code-heavy for complex workflows
      const codeHeavy = sorted.find((a) => a.approach.toLowerCase().includes('code'));
      if (codeHeavy) recommended = codeHeavy;
    }

    const rationale = this.generateRecommendationRationale(recommended, intent);

    return {
      recommended,
      rationale,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private async generateCodeHeavyApproach(intent: Intent): Promise<AlternativeApproach> {
    // Generate workflow with Code nodes for transformations
    const workflow = await this.planner.plan(intent, {
      preferParallel: false,
      includeErrorHandling: false,
    });

    // Replace Set nodes with Code nodes
    workflow.nodes = workflow.nodes.map((node) => {
      if (node.type.includes('set')) {
        return {
          ...node,
          type: 'n8n-nodes-base.code',
          parameters: {
            mode: 'runOnceForAllItems',
            language: 'javaScript',
            code: '// Transform data here\nreturn items;',
          },
        };
      }
      return node;
    });

    return {
      workflow,
      approach: 'Code-heavy approach using JavaScript transformations',
      confidence: 0.8,
      tradeoffs: { pros: [], cons: [] },
      suitableFor: [],
    };
  }

  private async generateNoCodeApproach(intent: Intent): Promise<AlternativeApproach> {
    // Generate workflow with only no-code nodes
    const workflow = await this.planner.plan(intent, {
      preferParallel: false,
      includeErrorHandling: true,
    });

    // Ensure no Code nodes
    workflow.nodes = workflow.nodes.filter((node) => !node.type.includes('code'));

    return {
      workflow,
      approach: 'No-code approach using only visual nodes',
      confidence: 0.75,
      tradeoffs: { pros: [], cons: [] },
      suitableFor: [],
    };
  }

  private async generateParallelApproach(intent: Intent): Promise<AlternativeApproach> {
    // Generate workflow with parallel execution where possible
    const workflow = await this.planner.plan(intent, {
      preferParallel: true,
      includeErrorHandling: true,
    });

    return {
      workflow,
      approach: 'Parallel execution for better performance',
      confidence: 0.7,
      tradeoffs: { pros: [], cons: [] },
      suitableFor: [],
    };
  }

  private generateRecommendationRationale(
    alternative: AlternativeApproach,
    intent: Intent,
  ): string {
    const reasons: string[] = [];

    if (intent.complexity === 'simple' && alternative.workflow.nodes.length < 5) {
      reasons.push('Simple workflow matches the straightforward intent');
    }

    if (intent.complexity === 'complex' && alternative.approach.includes('code')) {
      reasons.push('Code-heavy approach provides flexibility for complex requirements');
    }

    if (alternative.tradeoffs.pros.length > alternative.tradeoffs.cons.length) {
      reasons.push('Offers more advantages than disadvantages');
    }

    if (alternative.confidence > 0.8) {
      reasons.push('High confidence in this approach');
    }

    return reasons.join('. ');
  }
}

/**
 * Convenience function to generate alternatives
 */
export async function generateAlternatives(
  intent: Intent,
  count?: number,
): Promise<AlternativeApproach[]> {
  const generator = new AlternativeGenerator();
  return generator.generate(intent, count);
}
