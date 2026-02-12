import type { Scenario, ScenarioStep } from './types';
import { ScenarioSchema, ScenarioStepSchema } from './types';

/**
 * Scenario Builder for creating test scenarios
 */

export class ScenarioBuilder {
	private scenario: Partial<Scenario>;
	private steps: ScenarioStep[] = [];

	constructor(name: string) {
		this.scenario = {
			id: this.generateId(),
			name,
			steps: [],
			tags: [],
			assertions: [],
		};
	}

	/**
	 * Set scenario description
	 */
	description(desc: string): this {
		this.scenario.description = desc;
		return this;
	}

	/**
	 * Add tags to scenario
	 */
	tags(...tags: string[]): this {
		this.scenario.tags = [...(this.scenario.tags ?? []), ...tags];
		return this;
	}

	/**
	 * Add a trigger step
	 */
	trigger(nodeId: string, data?: Record<string, unknown>): this {
		this.steps.push(
			ScenarioStepSchema.parse({
				name: 'Trigger workflow',
				type: 'trigger',
				nodeId,
				data,
			}),
		);
		return this;
	}

	/**
	 * Add a node execution step
	 */
	node(nodeId: string, data?: Record<string, unknown>): this {
		this.steps.push(
			ScenarioStepSchema.parse({
				name: `Execute node ${nodeId}`,
				type: 'node',
				nodeId,
				data,
			}),
		);
		return this;
	}

	/**
	 * Add a condition step
	 */
	condition(nodeId: string, data?: Record<string, unknown>): this {
		this.steps.push(
			ScenarioStepSchema.parse({
				name: `Evaluate condition ${nodeId}`,
				type: 'condition',
				nodeId,
				data,
			}),
		);
		return this;
	}

	/**
	 * Add a delay step
	 */
	delay(duration: number): this {
		this.steps.push(
			ScenarioStepSchema.parse({
				name: `Wait ${duration}ms`,
				type: 'delay',
				timeout: duration,
			}),
		);
		return this;
	}

	/**
	 * Add an assertion
	 */
	assert(
		field: string,
		operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'exists',
		value: unknown,
	): this {
		this.steps.push(
			ScenarioStepSchema.parse({
				name: `Assert ${field} ${operator} ${value}`,
				type: 'assertion',
				assertion: { field, operator, value },
			}),
		);
		return this;
	}

	/**
	 * Set expected outcome
	 */
	expectSuccess(): this {
		this.scenario.expectedOutcome = 'success';
		return this;
	}

	expectError(): this {
		this.scenario.expectedOutcome = 'error';
		return this;
	}

	expectTimeout(): this {
		this.scenario.expectedOutcome = 'timeout';
		return this;
	}

	/**
	 * Add setup configuration
	 */
	setup(config: { mockData?: Record<string, unknown>; environment?: Record<string, string> }): this {
		this.scenario.setup = config;
		return this;
	}

	/**
	 * Build the scenario
	 */
	build(): Scenario {
		this.scenario.steps = this.steps;
		return ScenarioSchema.parse(this.scenario);
	}

	private generateId(): string {
		return `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}

/**
 * Pre-built scenarios for common test cases
 */
export class PredefinedScenarios {
	/**
	 * Happy path scenario - everything works
	 */
	static happyPath(workflowId: string): Scenario {
		return new ScenarioBuilder('Happy Path')
			.description('Standard successful execution')
			.tags('happy-path', 'success')
			.trigger('start')
			.node('process-data')
			.node('transform')
			.node('output')
			.assert('result.status', 'equals', 'success')
			.expectSuccess()
			.build();
	}

	/**
	 * Error handling scenario
	 */
	static errorHandling(workflowId: string): Scenario {
		return new ScenarioBuilder('Error Handling')
			.description('Test error handling and recovery')
			.tags('error', 'recovery')
			.trigger('start')
			.node('process-data')
			.node('failing-node')
			.expectError()
			.build();
	}

	/**
	 * Timeout scenario
	 */
	static timeout(workflowId: string): Scenario {
		return new ScenarioBuilder('Timeout')
			.description('Test timeout handling')
			.tags('timeout', 'edge-case')
			.trigger('start')
			.node('slow-node')
			.delay(60000)
			.expectTimeout()
			.build();
	}

	/**
	 * Large data volume scenario
	 */
	static largeDataVolume(workflowId: string): Scenario {
		return new ScenarioBuilder('Large Data Volume')
			.description('Test handling of large data sets')
			.tags('performance', 'data-volume')
			.trigger('start')
			.setup({
				mockData: {
					items: Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `item-${i}` })),
				},
			})
			.node('process-large-data')
			.assert('result.itemsProcessed', 'equals', 10000)
			.expectSuccess()
			.build();
	}

	/**
	 * Concurrent execution scenario
	 */
	static concurrentExecution(workflowId: string): Scenario {
		return new ScenarioBuilder('Concurrent Execution')
			.description('Test concurrent node execution')
			.tags('performance', 'concurrency')
			.trigger('start')
			.node('parallel-1')
			.node('parallel-2')
			.node('parallel-3')
			.node('merge')
			.expectSuccess()
			.build();
	}

	/**
	 * Data transformation scenario
	 */
	static dataTransformation(workflowId: string): Scenario {
		return new ScenarioBuilder('Data Transformation')
			.description('Test data transformation and mapping')
			.tags('transformation', 'data')
			.trigger('start')
			.setup({
				mockData: {
					input: { name: 'John Doe', age: 30, city: 'New York' },
				},
			})
			.node('transform')
			.assert('result.fullName', 'equals', 'John Doe')
			.assert('result.location', 'equals', 'New York')
			.expectSuccess()
			.build();
	}

	/**
	 * Conditional logic scenario
	 */
	static conditionalLogic(workflowId: string): Scenario {
		return new ScenarioBuilder('Conditional Logic')
			.description('Test conditional branching')
			.tags('logic', 'conditions')
			.trigger('start')
			.node('check-value')
			.condition('is-greater-than-100')
			.node('high-value-path')
			.expectSuccess()
			.build();
	}

	/**
	 * Loop execution scenario
	 */
	static loopExecution(workflowId: string): Scenario {
		return new ScenarioBuilder('Loop Execution')
			.description('Test loop node execution')
			.tags('loop', 'iteration')
			.trigger('start')
			.setup({
				mockData: {
					items: [1, 2, 3, 4, 5],
				},
			})
			.node('loop-start')
			.node('process-item')
			.node('loop-end')
			.assert('result.processedCount', 'equals', 5)
			.expectSuccess()
			.build();
	}

	/**
	 * External API scenario
	 */
	static externalApi(workflowId: string): Scenario {
		return new ScenarioBuilder('External API')
			.description('Test external API integration')
			.tags('api', 'integration')
			.trigger('start')
			.node('api-request')
			.assert('response.status', 'equals', 200)
			.assert('response.data', 'exists', true)
			.expectSuccess()
			.build();
	}

	/**
	 * Retry logic scenario
	 */
	static retryLogic(workflowId: string): Scenario {
		return new ScenarioBuilder('Retry Logic')
			.description('Test retry mechanism')
			.tags('retry', 'resilience')
			.trigger('start')
			.node('unreliable-service')
			.node('retry-handler')
			.assert('result.attempts', 'greaterThan', 1)
			.expectSuccess()
			.build();
	}

	/**
	 * Get all predefined scenarios
	 */
	static getAll(workflowId: string): Scenario[] {
		return [
			this.happyPath(workflowId),
			this.errorHandling(workflowId),
			this.timeout(workflowId),
			this.largeDataVolume(workflowId),
			this.concurrentExecution(workflowId),
			this.dataTransformation(workflowId),
			this.conditionalLogic(workflowId),
			this.loopExecution(workflowId),
			this.externalApi(workflowId),
			this.retryLogic(workflowId),
		];
	}

	/**
	 * Get scenarios by tag
	 */
	static getByTag(workflowId: string, tag: string): Scenario[] {
		return this.getAll(workflowId).filter((s) => s.tags.includes(tag));
	}
}

/**
 * Scenario Composer - combine multiple scenarios
 */
export class ScenarioComposer {
	private scenarios: Scenario[] = [];

	/**
	 * Add a scenario
	 */
	add(scenario: Scenario): this {
		this.scenarios.push(scenario);
		return this;
	}

	/**
	 * Add multiple scenarios
	 */
	addAll(scenarios: Scenario[]): this {
		this.scenarios.push(...scenarios);
		return this;
	}

	/**
	 * Filter scenarios by tag
	 */
	filterByTag(tag: string): this {
		this.scenarios = this.scenarios.filter((s) => s.tags.includes(tag));
		return this;
	}

	/**
	 * Get all scenarios
	 */
	getAll(): Scenario[] {
		return this.scenarios;
	}

	/**
	 * Create test suite from scenarios
	 */
	toTestSuite(): {
		name: string;
		scenarios: Scenario[];
	} {
		return {
			name: `Test Suite - ${this.scenarios.length} scenarios`,
			scenarios: this.scenarios,
		};
	}
}

/**
 * Assertion Helpers
 */
export class AssertionHelpers {
	static equals(actual: unknown, expected: unknown): boolean {
		return actual === expected;
	}

	static contains(actual: unknown, expected: unknown): boolean {
		if (typeof actual === 'string' && typeof expected === 'string') {
			return actual.includes(expected);
		}
		if (Array.isArray(actual)) {
			return actual.includes(expected);
		}
		return false;
	}

	static greaterThan(actual: unknown, expected: unknown): boolean {
		return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
	}

	static lessThan(actual: unknown, expected: unknown): boolean {
		return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
	}

	static exists(actual: unknown): boolean {
		return actual !== null && actual !== undefined;
	}

	/**
	 * Evaluate assertion
	 */
	static evaluate(
		actual: unknown,
		operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'exists',
		expected: unknown,
	): boolean {
		switch (operator) {
			case 'equals':
				return this.equals(actual, expected);
			case 'contains':
				return this.contains(actual, expected);
			case 'greaterThan':
				return this.greaterThan(actual, expected);
			case 'lessThan':
				return this.lessThan(actual, expected);
			case 'exists':
				return this.exists(actual);
			default:
				return false;
		}
	}
}
