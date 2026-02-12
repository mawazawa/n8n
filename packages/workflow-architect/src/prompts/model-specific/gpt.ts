/**
 * GPT-Specific Prompt Optimization
 * Optimized prompts and strategies for OpenAI's GPT models
 */

export interface GPTPromptOptions {
  task: string;
  context?: string;
  examples?: string[];
  outputFormat?: 'json' | 'markdown' | 'text';
  useChainOfThought?: boolean;
}

/**
 * GPT best practices for prompt engineering
 */
export const GPT_BEST_PRACTICES = {
  // GPT responds well to numbered lists and bullet points
  useStructuredLists: true,

  // GPT prefers markdown formatting
  useMarkdown: true,

  // GPT works well with role-based prompting
  useRolePrompting: true,

  // GPT benefits from few-shot examples
  useFewShot: true,

  // GPT supports JSON mode for structured output
  supportsJSONMode: true,

  // Optimal temperature ranges
  temperatures: {
    creative: 0.8,
    balanced: 0.7,
    precise: 0.2,
  },
};

/**
 * Optimize a prompt for GPT models
 */
export function optimizeForGPT(options: GPTPromptOptions): string {
  const parts: string[] = [];

  // Add context if provided
  if (options.context) {
    parts.push('## Context');
    parts.push(options.context);
    parts.push('');
  }

  // Add examples if provided (GPT loves few-shot examples)
  if (options.examples && options.examples.length > 0) {
    parts.push('## Examples');
    options.examples.forEach((example, index) => {
      parts.push(`### Example ${index + 1}`);
      parts.push(example);
      parts.push('');
    });
  }

  // Add the main task
  parts.push('## Task');
  parts.push(options.task);
  parts.push('');

  // Add chain-of-thought instructions
  if (options.useChainOfThought) {
    parts.push('## Instructions');
    parts.push('Think step-by-step:');
    parts.push('1. Analyze the requirements');
    parts.push('2. Plan your approach');
    parts.push('3. Execute the solution');
    parts.push('4. Verify the result');
    parts.push('');
  }

  // Add output format instructions
  if (options.outputFormat) {
    parts.push('## Output Format');
    switch (options.outputFormat) {
      case 'json':
        parts.push('Provide your response as valid JSON only. No markdown code blocks, just pure JSON.');
        parts.push('Ensure all keys are quoted and the structure is valid.');
        break;
      case 'markdown':
        parts.push('Provide your response in well-formatted Markdown.');
        parts.push('Use headers, lists, code blocks, and other formatting as appropriate.');
        break;
      case 'text':
        parts.push('Provide your response as clear, well-structured plain text.');
        break;
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Create a GPT-optimized system prompt
 */
export function createGPTSystemPrompt(role: string, capabilities: string[], constraints?: string[]): string {
  const parts: string[] = [];

  parts.push(`You are ${role}.`);
  parts.push('');

  if (capabilities.length > 0) {
    parts.push('Your capabilities:');
    capabilities.forEach(cap => parts.push(`- ${cap}`));
    parts.push('');
  }

  if (constraints && constraints.length > 0) {
    parts.push('Important constraints:');
    constraints.forEach(con => parts.push(`- ${con}`));
    parts.push('');
  }

  parts.push('Guidelines:');
  parts.push('- Be precise and accurate');
  parts.push('- Use clear, structured formatting');
  parts.push('- Provide examples when helpful');
  parts.push('- Think through complex problems step-by-step');
  parts.push('- Ask clarifying questions if needed');

  return parts.join('\n');
}

/**
 * Create a workflow building prompt optimized for GPT
 */
export function createWorkflowPrompt(params: {
  goal: string;
  availableNodes: string[];
  constraints?: string[];
  existingWorkflow?: string;
}): string {
  const parts: string[] = [];

  parts.push('# Workflow Design Task');
  parts.push('');
  parts.push('## Goal');
  parts.push(params.goal);
  parts.push('');

  parts.push('## Available Nodes');
  params.availableNodes.forEach(node => parts.push(`- ${node}`));
  parts.push('');

  if (params.constraints && params.constraints.length > 0) {
    parts.push('## Constraints');
    params.constraints.forEach(c => parts.push(`- ${c}`));
    parts.push('');
  }

  if (params.existingWorkflow) {
    parts.push('## Existing Workflow');
    parts.push('```json');
    parts.push(params.existingWorkflow);
    parts.push('```');
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push('Design a workflow that achieves the goal using the available nodes.');
  parts.push('');
  parts.push('Consider:');
  parts.push('1. What are the required steps?');
  parts.push('2. Which nodes best fit each step?');
  parts.push('3. How should data flow between nodes?');
  parts.push('4. What error handling is needed?');
  parts.push('5. How can the workflow be optimized?');
  parts.push('');
  parts.push('Provide a detailed workflow design with clear explanations.');

  return parts.join('\n');
}

/**
 * Create a debugging prompt optimized for GPT
 */
export function createDebugPrompt(params: {
  workflow: string;
  error: string;
  context?: string;
}): string {
  const parts: string[] = [];

  parts.push('# Workflow Debugging Task');
  parts.push('');

  parts.push('## Workflow');
  parts.push('```json');
  parts.push(params.workflow);
  parts.push('```');
  parts.push('');

  parts.push('## Error');
  parts.push('```');
  parts.push(params.error);
  parts.push('```');
  parts.push('');

  if (params.context) {
    parts.push('## Additional Context');
    parts.push(params.context);
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push('Debug this workflow and fix the error.');
  parts.push('');
  parts.push('Steps:');
  parts.push('1. Analyze the workflow structure');
  parts.push('2. Identify where the error occurs');
  parts.push('3. Determine the root cause');
  parts.push('4. Propose a specific fix');
  parts.push('5. Explain why this fix resolves the issue');

  return parts.join('\n');
}

/**
 * Create an optimization prompt for GPT
 */
export function createOptimizationPrompt(params: {
  workflow: string;
  metrics?: Record<string, number>;
  goals: string[];
}): string {
  const parts: string[] = [];

  parts.push('# Workflow Optimization Task');
  parts.push('');

  parts.push('## Current Workflow');
  parts.push('```json');
  parts.push(params.workflow);
  parts.push('```');
  parts.push('');

  if (params.metrics) {
    parts.push('## Current Metrics');
    Object.entries(params.metrics).forEach(([key, value]) => {
      parts.push(`- **${key}**: ${value}`);
    });
    parts.push('');
  }

  parts.push('## Optimization Goals');
  params.goals.forEach(goal => parts.push(`- ${goal}`));
  parts.push('');

  parts.push('## Instructions');
  parts.push('Analyze and optimize this workflow to achieve the stated goals.');
  parts.push('');
  parts.push('Consider:');
  parts.push('1. Performance bottlenecks');
  parts.push('2. Redundant operations');
  parts.push('3. Better node alternatives');
  parts.push('4. Improved data flow');
  parts.push('5. Error handling enhancements');
  parts.push('');
  parts.push('Provide specific, actionable optimization recommendations.');

  return parts.join('\n');
}

/**
 * Create a JSON schema prompt for structured output
 */
export function createJSONSchemaPrompt(schema: object, task: string): string {
  const parts: string[] = [];

  parts.push('# Task');
  parts.push(task);
  parts.push('');

  parts.push('# Output Schema');
  parts.push('Your response must match this JSON schema exactly:');
  parts.push('```json');
  parts.push(JSON.stringify(schema, null, 2));
  parts.push('```');
  parts.push('');

  parts.push('# Important');
  parts.push('- Return ONLY valid JSON matching the schema');
  parts.push('- Do not include markdown code blocks');
  parts.push('- Do not include any text before or after the JSON');
  parts.push('- Ensure all required fields are present');
  parts.push('- Use the correct data types for each field');

  return parts.join('\n');
}

/**
 * Create a function calling prompt
 */
export function createFunctionPrompt(params: {
  task: string;
  availableFunctions: Array<{
    name: string;
    description: string;
    parameters: object;
  }>;
}): string {
  const parts: string[] = [];

  parts.push('# Task');
  parts.push(params.task);
  parts.push('');

  parts.push('# Available Functions');
  params.availableFunctions.forEach(fn => {
    parts.push(`## ${fn.name}`);
    parts.push(fn.description);
    parts.push('');
    parts.push('Parameters:');
    parts.push('```json');
    parts.push(JSON.stringify(fn.parameters, null, 2));
    parts.push('```');
    parts.push('');
  });

  parts.push('# Instructions');
  parts.push('Use the available functions to complete the task.');
  parts.push('Call functions in the correct order with appropriate parameters.');

  return parts.join('\n');
}

/**
 * Extract JSON from GPT's response
 */
export function extractJSON<T>(response: string): T {
  // Remove markdown code blocks if present
  const cleaned = response
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // Try to find JSON object or array
  const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  // Try parsing the whole cleaned response
  return JSON.parse(cleaned);
}

/**
 * Create a reasoning prompt that leverages GPT's capabilities
 */
export function createReasoningPrompt(problem: string, constraints?: string[]): string {
  const parts: string[] = [];

  parts.push('# Problem');
  parts.push(problem);
  parts.push('');

  if (constraints && constraints.length > 0) {
    parts.push('# Constraints');
    constraints.forEach(c => parts.push(`- ${c}`));
    parts.push('');
  }

  parts.push('# Reasoning Process');
  parts.push('Solve this problem using systematic reasoning:');
  parts.push('');
  parts.push('1. **Understanding**: Restate the problem in your own words');
  parts.push('2. **Analysis**: Break down the problem into components');
  parts.push('3. **Approach**: Identify potential solution strategies');
  parts.push('4. **Solution**: Work through your chosen approach step-by-step');
  parts.push('5. **Verification**: Check your solution against the constraints');
  parts.push('');
  parts.push('Provide your complete reasoning process followed by the final answer.');

  return parts.join('\n');
}
