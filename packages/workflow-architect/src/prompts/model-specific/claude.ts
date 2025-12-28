/**
 * Claude-Specific Prompt Optimization
 * Optimized prompts and strategies for Anthropic's Claude models
 */

export interface ClaudePromptOptions {
  task: string;
  context?: string;
  examples?: string[];
  outputFormat?: 'json' | 'markdown' | 'text';
  thinkingBudget?: 'low' | 'medium' | 'high';
}

/**
 * Claude best practices for prompt engineering
 */
export const CLAUDE_BEST_PRACTICES = {
  // Claude responds well to clear, direct instructions
  useDirectInstructions: true,

  // Claude benefits from XML tags for structure
  useXMLTags: true,

  // Claude can handle long, detailed prompts effectively
  supportsLongPrompts: true,

  // Claude excels with examples in <examples> tags
  useExampleTags: true,

  // Claude supports thinking tags for complex reasoning
  supportsThinking: true,

  // Optimal temperature ranges
  temperatures: {
    creative: 0.7,
    balanced: 0.5,
    precise: 0.3,
  },
};

/**
 * Optimize a prompt for Claude models
 */
export function optimizeForClaude(options: ClaudePromptOptions): string {
  const parts: string[] = [];

  // Add system context if provided
  if (options.context) {
    parts.push(`<context>\n${options.context}\n</context>\n`);
  }

  // Add examples if provided (Claude loves examples)
  if (options.examples && options.examples.length > 0) {
    parts.push('<examples>');
    options.examples.forEach((example, index) => {
      parts.push(`<example index="${index + 1}">\n${example}\n</example>`);
    });
    parts.push('</examples>\n');
  }

  // Add the main task with clear instructions
  parts.push(`<task>\n${options.task}\n</task>\n`);

  // Add output format instructions
  if (options.outputFormat) {
    parts.push(`<output_format>`);
    switch (options.outputFormat) {
      case 'json':
        parts.push('Provide your response as valid JSON. Ensure all keys are quoted and values are properly formatted.');
        break;
      case 'markdown':
        parts.push('Provide your response in well-formatted Markdown with appropriate headers, lists, and code blocks.');
        break;
      case 'text':
        parts.push('Provide your response as clear, well-structured text.');
        break;
    }
    parts.push('</output_format>\n');
  }

  // Add thinking instructions for complex tasks
  if (options.thinkingBudget && options.thinkingBudget !== 'low') {
    parts.push('<instructions>');
    parts.push('Before providing your final answer, think through the problem step-by-step.');
    if (options.thinkingBudget === 'high') {
      parts.push('Take your time to consider edge cases, alternatives, and potential issues.');
    }
    parts.push('</instructions>\n');
  }

  return parts.join('\n');
}

/**
 * Create a Claude-optimized system prompt
 */
export function createClaudeSystemPrompt(role: string, capabilities: string[]): string {
  return `You are ${role}.

Your capabilities include:
${capabilities.map(c => `- ${c}`).join('\n')}

When responding:
1. Be clear, direct, and accurate
2. Use structured formatting when appropriate
3. Provide detailed explanations when needed
4. Think step-by-step for complex problems
5. Use XML tags to organize your response when helpful`;
}

/**
 * Create a workflow building prompt optimized for Claude
 */
export function createWorkflowPrompt(params: {
  goal: string;
  availableNodes: string[];
  constraints?: string[];
  existingWorkflow?: string;
}): string {
  let prompt = '<workflow_task>\n';
  prompt += `<goal>${params.goal}</goal>\n\n`;

  prompt += '<available_nodes>\n';
  prompt += params.availableNodes.map(node => `- ${node}`).join('\n');
  prompt += '\n</available_nodes>\n\n';

  if (params.constraints && params.constraints.length > 0) {
    prompt += '<constraints>\n';
    prompt += params.constraints.map(c => `- ${c}`).join('\n');
    prompt += '\n</constraints>\n\n';
  }

  if (params.existingWorkflow) {
    prompt += '<existing_workflow>\n';
    prompt += params.existingWorkflow;
    prompt += '\n</existing_workflow>\n\n';
  }

  prompt += `<instructions>
Design a workflow that achieves the specified goal using the available nodes.

Think through:
1. What are the key steps needed?
2. Which nodes best accomplish each step?
3. How should data flow between nodes?
4. What error handling is needed?

Provide your workflow design in a clear, structured format.
</instructions>
</workflow_task>`;

  return prompt;
}

/**
 * Create a debugging prompt optimized for Claude
 */
export function createDebugPrompt(params: {
  workflow: string;
  error: string;
  context?: string;
}): string {
  return `<debug_task>
<workflow>
${params.workflow}
</workflow>

<error>
${params.error}
</error>

${params.context ? `<context>\n${params.context}\n</context>\n` : ''}

<instructions>
Analyze this workflow and error carefully.

1. First, understand what the workflow is trying to accomplish
2. Identify where the error is occurring
3. Determine the root cause
4. Suggest a specific fix

Think step-by-step through the debugging process before providing your final answer.
</instructions>
</debug_task>`;
}

/**
 * Create an optimization prompt for Claude
 */
export function createOptimizationPrompt(params: {
  workflow: string;
  metrics?: Record<string, number>;
  goals: string[];
}): string {
  let prompt = '<optimization_task>\n';
  prompt += `<current_workflow>\n${params.workflow}\n</current_workflow>\n\n`;

  if (params.metrics) {
    prompt += '<current_metrics>\n';
    Object.entries(params.metrics).forEach(([key, value]) => {
      prompt += `${key}: ${value}\n`;
    });
    prompt += '</current_metrics>\n\n';
  }

  prompt += '<optimization_goals>\n';
  prompt += params.goals.map(g => `- ${g}`).join('\n');
  prompt += '\n</optimization_goals>\n\n';

  prompt += `<instructions>
Analyze the current workflow and suggest optimizations to achieve the stated goals.

Consider:
1. Opportunities to reduce execution time
2. Ways to simplify the workflow structure
3. Better node choices or configurations
4. Error handling improvements
5. Resource usage optimization

Provide specific, actionable recommendations.
</instructions>
</optimization_task>`;

  return prompt;
}

/**
 * Format a multi-step task for Claude
 */
export function createMultiStepPrompt(steps: Array<{
  step: number;
  description: string;
  details?: string;
}>): string {
  let prompt = '<multi_step_task>\n';

  steps.forEach(({ step, description, details }) => {
    prompt += `<step number="${step}">\n`;
    prompt += `<description>${description}</description>\n`;
    if (details) {
      prompt += `<details>${details}</details>\n`;
    }
    prompt += '</step>\n\n';
  });

  prompt += `<instructions>
Complete each step in order. For each step:
1. Understand what is required
2. Think through the approach
3. Execute the step
4. Verify the result

Provide your response organized by step number.
</instructions>
</multi_step_task>`;

  return prompt;
}

/**
 * Extract JSON from Claude's response (handles markdown code blocks)
 */
export function extractJSON<T>(response: string): T {
  // Try to extract JSON from markdown code block
  const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    return JSON.parse(jsonBlockMatch[1]);
  }

  // Try to extract JSON between curly braces
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  // Try parsing the whole response
  return JSON.parse(response);
}
