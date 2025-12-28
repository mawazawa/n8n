/**
 * AI Workflow Generator - Type Definitions
 * Types for workflow generation, intent analysis, and refinement
 */

import { z } from 'zod';
import type { WorkflowDefinition, WorkflowNode, WorkflowConnections } from '../types/workflow';

// ============================================
// Request & Response Types
// ============================================

export const GenerationRequestSchema = z.object({
  description: z.string().min(10).max(5000),
  constraints: z
    .object({
      maxNodes: z.number().int().positive().optional(),
      allowedNodeTypes: z.array(z.string()).optional(),
      excludedNodeTypes: z.array(z.string()).optional(),
      requireAuth: z.boolean().optional(),
    })
    .optional(),
  preferences: z
    .object({
      complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
      style: z.enum(['sequential', 'parallel', 'hybrid']).optional(),
      errorHandling: z.enum(['basic', 'advanced', 'comprehensive']).optional(),
    })
    .optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

export interface GenerationResult {
  workflow: WorkflowBlueprint;
  explanation: string;
  confidence: number;
  estimatedComplexity: ComplexityScore;
  alternatives?: WorkflowBlueprint[];
  warnings?: string[];
  suggestions?: string[];
}

// ============================================
// Workflow Blueprint (before n8n format conversion)
// ============================================

export interface WorkflowBlueprint {
  name: string;
  description: string;
  nodes: NodeBlueprint[];
  connections: ConnectionBlueprint[];
  metadata: {
    category: string;
    techniques: string[];
    estimatedDuration?: number;
    requiredCredentials?: string[];
  };
}

export interface NodeBlueprint {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
  notes?: string;
  confidence: number;
  rationale?: string;
}

export interface ConnectionBlueprint {
  source: string;
  sourceOutput: string;
  target: string;
  targetInput: string;
}

// ============================================
// Intent Analysis
// ============================================

export const IntentSchema = z.object({
  primaryAction: z.string(),
  actionVerbs: z.array(z.string()),
  dataSources: z.array(z.string()),
  dataTargets: z.array(z.string()),
  conditions: z.array(z.string()),
  transformations: z.array(z.string()),
  workflowType: z.enum([
    'etl',
    'automation',
    'notification',
    'approval',
    'monitoring',
    'integration',
    'ai-agent',
    'data-processing',
    'webhook',
  ]),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  requiredCapabilities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type Intent = z.infer<typeof IntentSchema>;

// ============================================
// Node Selection
// ============================================

export interface NodeSuggestion {
  nodeType: string;
  displayName: string;
  confidence: number;
  rationale: string;
  alternatives?: Array<{ nodeType: string; confidence: number }>;
  requiredCredentials?: string[];
  estimatedConfig?: Record<string, unknown>;
}

export interface NodeSelectionContext {
  intent: Intent;
  existingNodes: NodeBlueprint[];
  availableCredentials: string[];
}

// ============================================
// Validation
// ============================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
  severity: 'warning';
}

// ============================================
// Refinement
// ============================================

export const GenerationFeedbackSchema = z.object({
  type: z.enum([
    'correct-node',
    'add-node',
    'remove-node',
    'change-parameter',
    'change-connection',
    'improve-explanation',
  ]),
  targetNodeId: z.string().optional(),
  correction: z.string(),
  additionalContext: z.record(z.string(), z.unknown()).optional(),
});

export type GenerationFeedback = z.infer<typeof GenerationFeedbackSchema>;

export interface RefinementRequest {
  workflow: WorkflowBlueprint;
  feedback: GenerationFeedback[];
  iteration: number;
}

// ============================================
// Complexity Estimation
// ============================================

export interface ComplexityScore {
  overall: number; // 0-100
  factors: {
    nodeCount: number;
    branchingFactor: number;
    loopCount: number;
    externalCallCount: number;
    credentialCount: number;
    conditionalLogicComplexity: number;
  };
  rating: 'simple' | 'moderate' | 'complex' | 'very-complex';
  bottlenecks?: string[];
  optimizationSuggestions?: string[];
}

// ============================================
// Explanation
// ============================================

export interface Explanation {
  summary: string;
  stepByStep: ExplanationStep[];
  keyDecisions: Array<{
    decision: string;
    rationale: string;
    alternatives?: string[];
  }>;
  assumptions: string[];
}

export interface ExplanationStep {
  stepNumber: number;
  nodeId: string;
  nodeName: string;
  action: string;
  description: string;
  inputs?: string[];
  outputs?: string[];
}

// ============================================
// Examples (Few-shot Learning)
// ============================================

export interface GenerationExample {
  id: string;
  description: string;
  intent: Intent;
  workflow: WorkflowBlueprint;
  explanation: string;
  metadata: {
    category: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    popularity?: number;
  };
}

// ============================================
// Preview
// ============================================

export interface PreviewResult {
  workflow: WorkflowDefinition;
  visualGraph: {
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      source: string;
      target: string;
      label?: string;
    }>;
  };
  simulationResults?: SimulationResult;
  estimatedCosts?: {
    apiCalls: number;
    estimatedCost: number;
    breakdown: Array<{ service: string; calls: number; cost: number }>;
  };
}

export interface SimulationResult {
  status: 'success' | 'error' | 'partial';
  executionPath: string[];
  sampleOutputs: Record<string, unknown>;
  errors?: Array<{ nodeId: string; message: string }>;
  warnings?: Array<{ nodeId: string; message: string }>;
}

// ============================================
// Batch Generation
// ============================================

export interface BatchGenerationRequest {
  requests: GenerationRequest[];
  options?: {
    parallel?: boolean;
    maxConcurrency?: number;
    stopOnError?: boolean;
  };
}

export interface BatchGenerationResult {
  results: Array<GenerationResult | { error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    averageConfidence?: number;
    totalDuration: number;
  };
}

// ============================================
// Alternative Generation
// ============================================

export interface AlternativeApproach {
  workflow: WorkflowBlueprint;
  approach: string;
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  suitableFor: string[];
  confidence: number;
}

// ============================================
// API Response Types
// ============================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: {
    requestId: string;
    timestamp: number;
    duration: number;
  };
}

// ============================================
// Helper Type Guards
// ============================================

export function isValidIntent(value: unknown): value is Intent {
  try {
    IntentSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidGenerationRequest(value: unknown): value is GenerationRequest {
  try {
    GenerationRequestSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidGenerationFeedback(value: unknown): value is GenerationFeedback {
  try {
    GenerationFeedbackSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}
