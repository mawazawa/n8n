/**
 * Grok-Specific Prompt Optimization
 * Optimized prompts and strategies for xAI's Grok models
 */

export interface GrokPromptOptions {
  task: string;
  context?: string;
  useRealTimeData?: boolean;
  requireReasoning?: boolean;
  outputFormat?: 'json' | 'markdown' | 'text';
}

/**
 * Grok best practices for prompt engineering
 */
export const GROK_BEST_PRACTICES = {
  // Grok excels at real-time information and current events
  leverageRealTimeData: true,

  // Grok has strong reasoning capabilities
  useDeepReasoning: true,

  // Grok responds well to conversational, direct prompts
  useConversationalTone: true,

  // Grok can handle nuanced, complex questions
  supportsComplexity: true,

  // Grok appreciates context and background
  provideContext: true,

  // Optimal temperature ranges
  temperatures: {
    creative: 0.8,
    balanced: 0.6,
    precise: 0.4,
  },
};

/**
 * Optimize a prompt for Grok models
 */
export function optimizeForGrok(options: GrokPromptOptions): string {
  const parts: string[] = [];

  // Grok responds well to conversational openings
  if (options.useRealTimeData) {
    parts.push('Using your access to real-time information and current data:');
    parts.push('');
  }

  // Add context
  if (options.context) {
    parts.push('Context:');
    parts.push(options.context);
    parts.push('');
  }

  // Add the task
  parts.push('Task:');
  parts.push(options.task);
  parts.push('');

  // Add reasoning instructions
  if (options.requireReasoning) {
    parts.push('Requirements:');
    parts.push('- Think through this problem systematically');
    parts.push('- Consider multiple perspectives');
    parts.push('- Provide clear reasoning for your conclusions');
    parts.push('- Identify any assumptions you make');
    parts.push('');
  }

  // Add output format
  if (options.outputFormat) {
    parts.push('Output Format:');
    switch (options.outputFormat) {
      case 'json':
        parts.push('Provide your response as valid JSON. Structure it clearly and ensure all data is properly formatted.');
        break;
      case 'markdown':
        parts.push('Provide your response in Markdown format with clear structure and formatting.');
        break;
      case 'text':
        parts.push('Provide your response as well-organized plain text.');
        break;
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Create a Grok-optimized system prompt
 */
export function createGrokSystemPrompt(role: string, specialization?: string[]): string {
  const parts: string[] = [];

  parts.push(`You are ${role}.`);
  parts.push('');

  if (specialization && specialization.length > 0) {
    parts.push('Your areas of specialization:');
    specialization.forEach(spec => parts.push(`- ${spec}`));
    parts.push('');
  }

  parts.push('Your strengths:');
  parts.push('- Access to real-time information and current events');
  parts.push('- Strong reasoning and analytical capabilities');
  parts.push('- Ability to handle complex, nuanced questions');
  parts.push('- Clear, direct communication');
  parts.push('');

  parts.push('Approach:');
  parts.push('- Be thorough in your analysis');
  parts.push('- Leverage current data when relevant');
  parts.push('- Explain your reasoning clearly');
  parts.push('- Provide actionable insights');

  return parts.join('\n');
}

/**
 * Create a workflow building prompt optimized for Grok
 */
export function createWorkflowPrompt(params: {
  goal: string;
  availableNodes: string[];
  constraints?: string[];
  useCurrentBestPractices?: boolean;
}): string {
  const parts: string[] = [];

  if (params.useCurrentBestPractices) {
    parts.push('Using current industry best practices and standards:');
    parts.push('');
  }

  parts.push('Workflow Design Challenge:');
  parts.push(params.goal);
  parts.push('');

  parts.push('Available Building Blocks:');
  params.availableNodes.forEach(node => parts.push(`- ${node}`));
  parts.push('');

  if (params.constraints && params.constraints.length > 0) {
    parts.push('Constraints to Consider:');
    params.constraints.forEach(c => parts.push(`- ${c}`));
    parts.push('');
  }

  parts.push('Your Task:');
  parts.push('Design an optimal workflow that:');
  parts.push('1. Achieves the stated goal efficiently');
  parts.push('2. Follows current best practices');
  parts.push('3. Handles edge cases appropriately');
  parts.push('4. Is maintainable and scalable');
  parts.push('');

  parts.push('Think through the design systematically, considering:');
  parts.push('- The optimal sequence of operations');
  parts.push('- Data flow and transformations');
  parts.push('- Error handling strategies');
  parts.push('- Performance implications');

  return parts.join('\n');
}

/**
 * Create a debugging prompt optimized for Grok
 */
export function createDebugPrompt(params: {
  workflow: string;
  error: string;
  context?: string;
  useRealTimeKnowledge?: boolean;
}): string {
  const parts: string[] = [];

  if (params.useRealTimeKnowledge) {
    parts.push('Using your knowledge of current APIs, frameworks, and common issues:');
    parts.push('');
  }

  parts.push('Debug This Workflow:');
  parts.push('');
  parts.push('Workflow Definition:');
  parts.push('```');
  parts.push(params.workflow);
  parts.push('```');
  parts.push('');

  parts.push('Error Encountered:');
  parts.push('```');
  parts.push(params.error);
  parts.push('```');
  parts.push('');

  if (params.context) {
    parts.push('Additional Context:');
    parts.push(params.context);
    parts.push('');
  }

  parts.push('Analysis Required:');
  parts.push('1. Identify the root cause of this error');
  parts.push('2. Explain why it\'s happening');
  parts.push('3. Propose the best solution');
  parts.push('4. Consider if there are related issues to address');
  parts.push('5. Suggest preventive measures');
  parts.push('');

  parts.push('Provide a thorough analysis with clear reasoning at each step.');

  return parts.join('\n');
}

/**
 * Create an optimization prompt for Grok
 */
export function createOptimizationPrompt(params: {
  workflow: string;
  metrics?: Record<string, number>;
  goals: string[];
  considerModernAlternatives?: boolean;
}): string {
  const parts: string[] = [];

  if (params.considerModernAlternatives) {
    parts.push('Considering current best practices and modern alternatives:');
    parts.push('');
  }

  parts.push('Workflow Optimization Challenge:');
  parts.push('');

  parts.push('Current Workflow:');
  parts.push('```');
  parts.push(params.workflow);
  parts.push('```');
  parts.push('');

  if (params.metrics) {
    parts.push('Current Performance Metrics:');
    Object.entries(params.metrics).forEach(([key, value]) => {
      parts.push(`- ${key}: ${value}`);
    });
    parts.push('');
  }

  parts.push('Optimization Objectives:');
  params.goals.forEach(goal => parts.push(`- ${goal}`));
  parts.push('');

  parts.push('Your Task:');
  parts.push('Analyze this workflow and provide optimization recommendations that:');
  parts.push('1. Address the stated objectives');
  parts.push('2. Improve overall performance');
  parts.push('3. Enhance reliability and maintainability');
  parts.push('4. Leverage modern best practices');
  parts.push('');

  parts.push('For each recommendation:');
  parts.push('- Explain the current issue or limitation');
  parts.push('- Describe your proposed solution');
  parts.push('- Justify why this improves the workflow');
  parts.push('- Estimate the expected impact');

  return parts.join('\n');
}

/**
 * Create a real-time analysis prompt leveraging Grok's capabilities
 */
export function createRealTimeAnalysisPrompt(params: {
  topic: string;
  analysisType: 'trends' | 'comparison' | 'evaluation' | 'prediction';
  timeframe?: string;
}): string {
  const parts: string[] = [];

  parts.push('Real-Time Analysis Request:');
  parts.push('');

  parts.push(`Topic: ${params.topic}`);
  parts.push(`Analysis Type: ${params.analysisType}`);
  if (params.timeframe) {
    parts.push(`Timeframe: ${params.timeframe}`);
  }
  parts.push('');

  parts.push('Using your access to current information:');

  switch (params.analysisType) {
    case 'trends':
      parts.push('1. Identify current trends and patterns');
      parts.push('2. Analyze their trajectory and momentum');
      parts.push('3. Compare with historical patterns');
      parts.push('4. Highlight emerging developments');
      break;
    case 'comparison':
      parts.push('1. Compare current state with alternatives');
      parts.push('2. Analyze relative strengths and weaknesses');
      parts.push('3. Consider context and use cases');
      parts.push('4. Provide balanced assessment');
      break;
    case 'evaluation':
      parts.push('1. Assess current state and performance');
      parts.push('2. Identify strengths and areas for improvement');
      parts.push('3. Consider broader context and implications');
      parts.push('4. Provide actionable insights');
      break;
    case 'prediction':
      parts.push('1. Analyze current trajectory and indicators');
      parts.push('2. Consider influencing factors');
      parts.push('3. Outline likely scenarios');
      parts.push('4. Identify key uncertainties');
      break;
  }

  parts.push('');
  parts.push('Provide a thorough, well-reasoned analysis backed by current data.');

  return parts.join('\n');
}

/**
 * Create a reasoning-focused prompt for Grok
 */
export function createReasoningPrompt(params: {
  problem: string;
  requireStepByStep?: boolean;
  considerAlternatives?: boolean;
}): string {
  const parts: string[] = [];

  parts.push('Reasoning Challenge:');
  parts.push(params.problem);
  parts.push('');

  parts.push('Approach this systematically:');
  parts.push('');

  if (params.requireStepByStep) {
    parts.push('Step-by-Step Analysis:');
    parts.push('1. Problem Understanding: Restate and clarify the problem');
    parts.push('2. Information Gathering: Identify what we know and what we need');
    parts.push('3. Reasoning: Work through the logic systematically');
    parts.push('4. Solution: Arrive at a well-supported conclusion');
    parts.push('5. Verification: Check the solution for consistency');
    parts.push('');
  }

  if (params.considerAlternatives) {
    parts.push('Additionally:');
    parts.push('- Consider alternative approaches');
    parts.push('- Evaluate trade-offs');
    parts.push('- Identify assumptions and limitations');
    parts.push('- Discuss confidence level in the solution');
    parts.push('');
  }

  parts.push('Provide clear reasoning throughout, explaining your thought process at each stage.');

  return parts.join('\n');
}

/**
 * Create a comparative analysis prompt
 */
export function createComparisonPrompt(params: {
  items: string[];
  criteria: string[];
  context?: string;
}): string {
  const parts: string[] = [];

  if (params.context) {
    parts.push('Context:');
    parts.push(params.context);
    parts.push('');
  }

  parts.push('Comparison Task:');
  parts.push('');

  parts.push('Items to Compare:');
  params.items.forEach(item => parts.push(`- ${item}`));
  parts.push('');

  parts.push('Comparison Criteria:');
  params.criteria.forEach(criterion => parts.push(`- ${criterion}`));
  parts.push('');

  parts.push('Your Analysis Should:');
  parts.push('1. Evaluate each item against all criteria');
  parts.push('2. Provide objective, balanced assessment');
  parts.push('3. Highlight key differentiators');
  parts.push('4. Consider use case suitability');
  parts.push('5. Draw clear, actionable conclusions');
  parts.push('');

  parts.push('Structure your comparison clearly and support claims with reasoning.');

  return parts.join('\n');
}

/**
 * Extract JSON from Grok's response
 */
export function extractJSON<T>(response: string): T {
  // Remove common prefixes Grok might use
  const cleaned = response
    .replace(/^Here's the JSON:?\s*/i, '')
    .replace(/^Response:?\s*/i, '')
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find JSON object or array
  const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  // Try parsing the whole cleaned response
  return JSON.parse(cleaned);
}
