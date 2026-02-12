/**
 * AI Workflow Generator - Main Entry Point
 * Orchestrates the complete workflow generation pipeline
 */

import type {
  GenerationRequest,
  GenerationResult,
  RefinementRequest,
  WorkflowBlueprint,
  Intent,
} from './types';
import { IntentAnalyzer } from './analyzer';
import { WorkflowPlanner } from './planner';
import { NodeSelector } from './node-selector';
import { ConnectionBuilder, autoConnectWorkflow } from './connection-builder';
import { ParameterInferer } from './parameter-inferer';
import { GenerationValidator } from './validator';
import { RefinementEngine } from './refinement';
import { ExampleRetriever } from './examples';
import { ComplexityEstimator } from './complexity-estimator';
import { ExplanationGenerator } from './explanation';
import { AlternativeGenerator } from './alternatives';
import { WorkflowPreview } from './preview';
import { BatchGenerator } from './batch';
import { wrapError } from '../errors';

export interface WorkflowGeneratorConfig {
  enableRAG?: boolean;
  enableExamples?: boolean;
  enableValidation?: boolean;
  enableAlternatives?: boolean;
  maxIterations?: number;
}

/**
 * Main Workflow Generator Class
 * Orchestrates all components to generate complete workflows
 */
export class WorkflowGenerator {
  private analyzer: IntentAnalyzer;
  private planner: WorkflowPlanner;
  private nodeSelector: NodeSelector;
  private connectionBuilder: ConnectionBuilder;
  private parameterInferer: ParameterInferer;
  private validator: GenerationValidator;
  private refinementEngine: RefinementEngine;
  private exampleRetriever: ExampleRetriever;
  private complexityEstimator: ComplexityEstimator;
  private explanationGenerator: ExplanationGenerator;
  private alternativeGenerator: AlternativeGenerator;
  private preview: WorkflowPreview;

  private enableRAG: boolean;
  private enableExamples: boolean;
  private enableValidation: boolean;
  private enableAlternatives: boolean;

  constructor(config: WorkflowGeneratorConfig = {}) {
    // Initialize all components
    this.analyzer = new IntentAnalyzer({ enableCaching: true });
    this.planner = new WorkflowPlanner();
    this.nodeSelector = new NodeSelector({ useRAG: config.enableRAG ?? true });
    this.connectionBuilder = new ConnectionBuilder();
    this.parameterInferer = new ParameterInferer();
    this.validator = new GenerationValidator();
    this.refinementEngine = new RefinementEngine({
      maxIterations: config.maxIterations || 5,
    });
    this.exampleRetriever = new ExampleRetriever();
    this.complexityEstimator = new ComplexityEstimator();
    this.explanationGenerator = new ExplanationGenerator();
    this.alternativeGenerator = new AlternativeGenerator();
    this.preview = new WorkflowPreview();

    // Configuration
    this.enableRAG = config.enableRAG ?? true;
    this.enableExamples = config.enableExamples ?? true;
    this.enableValidation = config.enableValidation ?? true;
    this.enableAlternatives = config.enableAlternatives ?? false;
  }

  /**
   * Generate a complete workflow from a natural language description
   */
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    try {
      const startTime = Date.now();

      // Step 1: Analyze intent
      const intent = await this.analyzer.analyze(request.description);

      // Step 2: Get relevant examples if enabled
      let examples: string[] = [];
      if (this.enableExamples) {
        const retrievedExamples = await this.exampleRetriever.retrieve(intent, 3);
        examples = retrievedExamples.map((ex) => ex.description);
      }

      // Step 3: Plan workflow structure
      const blueprint = await this.planner.plan(intent, {
        maxNodes: request.constraints?.maxNodes,
        includeErrorHandling: request.preferences?.errorHandling !== 'basic',
      });

      // Step 4: Auto-connect nodes
      const connected = await autoConnectWorkflow(blueprint);

      // Step 5: Infer parameters for each node
      for (const node of connected.nodes) {
        const inferred = await this.parameterInferer.infer({
          nodeType: node.type,
          nodeName: node.name,
          intent,
          description: request.description,
          previousNodes: connected.nodes.filter((n) =>
            connected.connections.some((c) => c.source === n.id && c.target === node.id),
          ),
        });

        // Merge inferred parameters
        node.parameters = {
          ...node.parameters,
          ...inferred.parameters,
        };
      }

      // Step 6: Validate workflow
      let warnings: string[] = [];
      if (this.enableValidation) {
        const validation = await this.validator.validate(connected);
        warnings = validation.warnings.map((w) => w.message);

        if (!validation.isValid) {
          warnings.push(...validation.errors.map((e) => e.message));
        }
      }

      // Step 7: Estimate complexity
      const complexity = this.complexityEstimator.estimate(connected);

      // Step 8: Generate explanation
      const explanation = await this.explanationGenerator.explain(connected);

      // Step 9: Generate alternatives if enabled
      let alternatives: WorkflowBlueprint[] | undefined;
      if (this.enableAlternatives) {
        const altApproaches = await this.alternativeGenerator.generate(intent, 2);
        alternatives = altApproaches.map((a) => a.workflow);
      }

      // Step 10: Calculate confidence
      const confidence = this.calculateConfidence(connected, intent, complexity);

      // Generate suggestions
      const suggestions = this.generateSuggestions(connected, complexity);

      const generationTime = Date.now() - startTime;

      return {
        workflow: connected,
        explanation: explanation.summary,
        confidence,
        estimatedComplexity: complexity,
        alternatives,
        warnings: warnings.length > 0 ? warnings : undefined,
        suggestions,
      };
    } catch (error) {
      throw wrapError(error, 'Failed to generate workflow');
    }
  }

  /**
   * Refine an existing workflow based on user feedback
   */
  async refine(request: RefinementRequest): Promise<WorkflowBlueprint> {
    return this.refinementEngine.refine(request);
  }

  /**
   * Generate workflow from simple description (convenience method)
   */
  async generateFromDescription(description: string): Promise<WorkflowBlueprint> {
    const result = await this.generate({ description });
    return result.workflow;
  }

  /**
   * Validate a workflow
   */
  async validate(workflow: WorkflowBlueprint): Promise<import('./types').ValidationResult> {
    return this.validator.validate(workflow);
  }

  /**
   * Explain a workflow
   */
  async explain(workflow: WorkflowBlueprint): Promise<import('./types').Explanation> {
    return this.explanationGenerator.explain(workflow);
  }

  /**
   * Preview a workflow before committing
   */
  async preview(workflow: WorkflowBlueprint): Promise<import('./types').PreviewResult> {
    return this.preview.preview(workflow);
  }

  /**
   * Generate alternatives for an intent
   */
  async alternatives(
    intent: Intent,
    count?: number,
  ): Promise<import('./types').AlternativeApproach[]> {
    return this.alternativeGenerator.generate(intent, count);
  }

  /**
   * Analyze intent from description
   */
  async analyzeIntent(description: string): Promise<Intent> {
    return this.analyzer.analyze(description);
  }

  // ============================================
  // Private Methods
  // ============================================

  private calculateConfidence(
    workflow: WorkflowBlueprint,
    intent: Intent,
    complexity: import('./types').ComplexityScore,
  ): number {
    let confidence = intent.confidence;

    // Adjust based on node confidence
    const avgNodeConfidence =
      workflow.nodes.reduce((sum, node) => sum + node.confidence, 0) / workflow.nodes.length;
    confidence *= avgNodeConfidence;

    // Penalize high complexity
    if (complexity.overall > 75) {
      confidence *= 0.9;
    }

    // Boost for simple workflows
    if (complexity.rating === 'simple') {
      confidence *= 1.1;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  private generateSuggestions(
    workflow: WorkflowBlueprint,
    complexity: import('./types').ComplexityScore,
  ): string[] {
    const suggestions: string[] = [];

    // Add complexity-based suggestions
    if (complexity.optimizationSuggestions) {
      suggestions.push(...complexity.optimizationSuggestions);
    }

    // Add general suggestions
    if (workflow.nodes.length > 10) {
      suggestions.push('Consider adding descriptive notes to nodes for better maintainability');
    }

    // Check for missing error handling
    const hasErrorHandling = workflow.nodes.some((n) =>
      n.type.includes('error') || n.type.includes('try'),
    );
    if (!hasErrorHandling && workflow.nodes.length > 5) {
      suggestions.push('Add error handling nodes to improve workflow reliability');
    }

    // Check for credentials
    const needsCredentials = workflow.nodes.filter(
      (n) => this.needsCredentials(n.type) && !n.credentials,
    );
    if (needsCredentials.length > 0) {
      suggestions.push(
        `Configure credentials for: ${needsCredentials.map((n) => n.name).join(', ')}`,
      );
    }

    return suggestions;
  }

  private needsCredentials(nodeType: string): boolean {
    const credentialNodes = [
      'gmail',
      'slack',
      'postgres',
      'mysql',
      'github',
      'stripe',
      'salesforce',
    ];
    return credentialNodes.some((service) => nodeType.toLowerCase().includes(service));
  }
}

// ============================================
// Re-export all types and classes
// ============================================

export * from './types';
export { IntentAnalyzer, analyzeIntent } from './analyzer';
export { WorkflowPlanner, planWorkflow } from './planner';
export { NodeSelector, selectNodes } from './node-selector';
export { ConnectionBuilder, buildConnections, autoConnectWorkflow } from './connection-builder';
export { ParameterInferer, inferParameters } from './parameter-inferer';
export { GenerationValidator, validateWorkflow } from './validator';
export { RefinementEngine, refineWorkflow } from './refinement';
export { ExampleRetriever, retrieveExamples } from './examples';
export { ComplexityEstimator, estimateComplexity } from './complexity-estimator';
export { ExplanationGenerator, explainWorkflow } from './explanation';
export { AlternativeGenerator, generateAlternatives } from './alternatives';
export { WorkflowPreview, previewWorkflow } from './preview';
export { BatchGenerator, generateBatch } from './batch';
export { createGeneratorAPI, mountGeneratorAPI } from './api';

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick generation - simplest way to generate a workflow
 */
export async function quickGenerate(description: string): Promise<WorkflowBlueprint> {
  const generator = new WorkflowGenerator();
  return generator.generateFromDescription(description);
}

/**
 * Generate with full results
 */
export async function generateWorkflow(
  request: GenerationRequest,
): Promise<GenerationResult> {
  const generator = new WorkflowGenerator();
  return generator.generate(request);
}
