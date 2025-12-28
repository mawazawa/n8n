/**
 * Custom Node Builder - Testing Utilities
 * Test harness for custom nodes
 */

import type { NodeDefinition, ExecutionResult } from './types';
import { generateNodeClass } from './generator';

/**
 * Mock execution context
 */
interface MockExecutionContext {
	inputData: Array<{ json: Record<string, unknown> }>;
	nodeParameters: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	mode?: 'manual' | 'trigger' | 'webhook';
}

/**
 * Create test node instance from definition
 */
export function createTestNode(definition: NodeDefinition): unknown {
	// Generate the node class code
	const nodeCode = generateNodeClass(definition);

	// In a real implementation, this would compile and instantiate the node
	// For now, return a mock object with the definition
	return {
		description: {
			displayName: definition.displayName,
			name: definition.name,
			version: definition.version,
			description: definition.description,
			defaults: definition.defaults,
			inputs: definition.inputs || ['main'],
			outputs: definition.outputs || ['main'],
			properties: definition.properties || [],
		},
		execute: async (context: MockExecutionContext): Promise<ExecutionResult> => {
			// Mock execution logic
			return {
				success: true,
				data: context.inputData,
			};
		},
	};
}

/**
 * Mock node execution
 */
export async function mockExecution(
	definition: NodeDefinition,
	context: MockExecutionContext,
): Promise<ExecutionResult> {
	try {
		// Validate input data
		if (!context.inputData || !Array.isArray(context.inputData)) {
			return {
				success: false,
				error: {
					message: 'Invalid input data: must be an array',
				},
			};
		}

		// Create mock node
		const node = createTestNode(definition);

		// Execute
		if (typeof node === 'object' && node !== null && 'execute' in node) {
			const executeFunc = (node as { execute: (ctx: MockExecutionContext) => Promise<ExecutionResult> }).execute;
			return await executeFunc(context);
		}

		// Default success response
		return {
			success: true,
			data: context.inputData,
		};
	} catch (error) {
		return {
			success: false,
			error: {
				message: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			},
		};
	}
}

/**
 * Validate output against expected schema
 */
export function validateOutput(
	output: ExecutionResult,
	schema?: {
		required?: string[];
		properties?: Record<string, { type: string }>;
	},
): boolean {
	if (!output.success) {
		return false;
	}

	if (!output.data || !Array.isArray(output.data)) {
		return false;
	}

	// If no schema provided, just check basic structure
	if (!schema) {
		return output.data.every((item) => typeof item === 'object' && item !== null);
	}

	// Validate against schema
	return output.data.every((item) => {
		if (typeof item !== 'object' || item === null) {
			return false;
		}

		const itemData = item as Record<string, unknown>;

		// Check required fields
		if (schema.required) {
			for (const field of schema.required) {
				if (!(field in itemData)) {
					return false;
				}
			}
		}

		// Check property types
		if (schema.properties) {
			for (const [key, propSchema] of Object.entries(schema.properties)) {
				if (key in itemData) {
					const value = itemData[key];
					const expectedType = propSchema.type;

					if (expectedType === 'string' && typeof value !== 'string') {
						return false;
					}
					if (expectedType === 'number' && typeof value !== 'number') {
						return false;
					}
					if (expectedType === 'boolean' && typeof value !== 'boolean') {
						return false;
					}
					if (expectedType === 'object' && (typeof value !== 'object' || value === null)) {
						return false;
					}
					if (expectedType === 'array' && !Array.isArray(value)) {
						return false;
					}
				}
			}
		}

		return true;
	});
}

/**
 * Test utilities
 */
export const testUtils = {
	/**
	 * Create mock input data
	 */
	createMockInput(data: Record<string, unknown>[]): Array<{ json: Record<string, unknown> }> {
		return data.map((item) => ({ json: item }));
	},

	/**
	 * Create mock credentials
	 */
	createMockCredentials(type: string, data: Record<string, unknown>): Record<string, unknown> {
		return {
			type,
			...data,
		};
	},

	/**
	 * Assert execution success
	 */
	assertSuccess(result: ExecutionResult): asserts result is ExecutionResult & { success: true } {
		if (!result.success) {
			throw new Error(`Execution failed: ${result.error?.message || 'Unknown error'}`);
		}
	},

	/**
	 * Assert execution error
	 */
	assertError(result: ExecutionResult, expectedMessage?: string): void {
		if (result.success) {
			throw new Error('Expected execution to fail, but it succeeded');
		}

		if (expectedMessage && !result.error?.message.includes(expectedMessage)) {
			throw new Error(
				`Expected error message to include "${expectedMessage}", got "${result.error?.message}"`,
			);
		}
	},

	/**
	 * Assert output data count
	 */
	assertOutputCount(result: ExecutionResult, expectedCount: number): void {
		testUtils.assertSuccess(result);

		if (!result.data || result.data.length !== expectedCount) {
			throw new Error(
				`Expected ${expectedCount} output items, got ${result.data?.length || 0}`,
			);
		}
	},

	/**
	 * Assert output contains field
	 */
	assertOutputContains(
		result: ExecutionResult,
		field: string,
		value?: unknown,
	): void {
		testUtils.assertSuccess(result);

		if (!result.data || result.data.length === 0) {
			throw new Error('No output data to check');
		}

		const firstItem = result.data[0] as Record<string, unknown>;

		if (!(field in firstItem)) {
			throw new Error(`Output does not contain field "${field}"`);
		}

		if (value !== undefined && firstItem[field] !== value) {
			throw new Error(
				`Expected field "${field}" to be ${JSON.stringify(value)}, got ${JSON.stringify(firstItem[field])}`,
			);
		}
	},
};

/**
 * Test suite builder
 */
export class TestSuite {
	private tests: Array<{
		name: string;
		fn: () => Promise<void> | void;
	}> = [];

	/**
	 * Add a test
	 */
	test(name: string, fn: () => Promise<void> | void): this {
		this.tests.push({ name, fn });
		return this;
	}

	/**
	 * Run all tests
	 */
	async run(): Promise<{
		passed: number;
		failed: number;
		results: Array<{ name: string; success: boolean; error?: string }>;
	}> {
		const results: Array<{ name: string; success: boolean; error?: string }> = [];
		let passed = 0;
		let failed = 0;

		for (const test of this.tests) {
			try {
				await test.fn();
				results.push({ name: test.name, success: true });
				passed++;
			} catch (error) {
				results.push({
					name: test.name,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
				failed++;
			}
		}

		return { passed, failed, results };
	}
}

/**
 * Create a test suite
 */
export function createTestSuite(): TestSuite {
	return new TestSuite();
}
