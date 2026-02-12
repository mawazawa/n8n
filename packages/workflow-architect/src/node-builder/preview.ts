/**
 * Custom Node Builder - Preview
 * Live preview and execution in sandbox
 */

import type { NodeDefinition, CompiledNode, ExecutionResult } from './types';
import { generateNodeClass } from './generator';
import { validateNodeDefinition } from './schema';

/**
 * Node preview class for testing and live preview
 */
export class NodePreview {
	private compiledNode: CompiledNode | null = null;
	private nodeDefinition: NodeDefinition | null = null;

	/**
	 * Compile node definition
	 */
	async compile(definition: NodeDefinition): Promise<CompiledNode> {
		// Validate first
		const validation = validateNodeDefinition(definition);
		if (!validation.valid) {
			throw new Error(
				`Invalid node definition: ${validation.errors.map((e) => e.message).join(', ')}`,
			);
		}

		this.nodeDefinition = definition;

		// Generate code
		const code = generateNodeClass(definition);

		// Generate credentials if needed
		let credentialCode = '';
		if (definition.credentials) {
			const { generateCredentialClass } = await import('./generator');
			credentialCode = definition.credentials
				.map((cred) => generateCredentialClass(cred))
				.join('\n\n');
		}

		// Combine code
		const fullCode = `${credentialCode}\n\n${code}`;

		this.compiledNode = {
			code: fullCode,
			dependencies: ['n8n-workflow'],
		};

		return this.compiledNode;
	}

	/**
	 * Execute node with sample input
	 */
	async execute(
		input: Array<{ json: Record<string, unknown> }>,
		parameters?: Record<string, unknown>,
		credentials?: Record<string, unknown>,
	): Promise<ExecutionResult> {
		if (!this.compiledNode || !this.nodeDefinition) {
			throw new Error('Node must be compiled before execution');
		}

		try {
			// Mock execution context
			const mockContext = {
				getInputData: () => input,
				getNodeParameter: (param: string) => parameters?.[param],
				getCredentials: () => credentials,
				continueOnFail: () => false,
			};

			// In a real implementation, this would execute the compiled code
			// For now, return a mock result
			return {
				success: true,
				data: input,
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
	 * Get compiled code
	 */
	getCode(): string | null {
		return this.compiledNode?.code || null;
	}

	/**
	 * Get node definition
	 */
	getDefinition(): NodeDefinition | null {
		return this.nodeDefinition;
	}
}

/**
 * Create isolated execution environment
 */
export class SandboxEnvironment {
	private timeout: number;

	constructor(timeout: number = 30000) {
		this.timeout = timeout;
	}

	/**
	 * Execute code in sandbox
	 */
	async execute(code: string, input: unknown): Promise<unknown> {
		// In a real implementation, this would use vm2 or isolated-vm
		// For now, return mock result

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error('Execution timeout'));
			}, this.timeout);

			try {
				// Mock execution
				resolve(input);
			} catch (error) {
				reject(error);
			} finally {
				clearTimeout(timer);
			}
		});
	}

	/**
	 * Validate code for security issues
	 */
	validateCode(code: string): { safe: boolean; issues: string[] } {
		const issues: string[] = [];

		// Check for dangerous patterns
		if (code.includes('eval(')) {
			issues.push('Use of eval() is not allowed');
		}

		if (code.includes('Function(')) {
			issues.push('Use of Function() constructor is not allowed');
		}

		if (code.includes('child_process')) {
			issues.push('Use of child_process is not allowed');
		}

		if (code.includes('require(') && !code.includes("require('n8n-workflow')")) {
			issues.push('Only n8n-workflow module can be required');
		}

		return {
			safe: issues.length === 0,
			issues,
		};
	}
}

/**
 * Preview utilities
 */
export const previewUtils = {
	/**
	 * Create sample input data
	 */
	createSampleInput(count: number = 1): Array<{ json: Record<string, unknown> }> {
		const samples = [];
		for (let i = 0; i < count; i++) {
			samples.push({
				json: {
					id: i + 1,
					name: `Sample ${i + 1}`,
					email: `sample${i + 1}@example.com`,
					createdAt: new Date().toISOString(),
				},
			});
		}
		return samples;
	},

	/**
	 * Create sample credentials
	 */
	createSampleCredentials(type: string): Record<string, unknown> {
		switch (type) {
			case 'apiKey':
				return {
					apiKey: 'sample_api_key_12345',
				};

			case 'oauth2':
				return {
					accessToken: 'sample_access_token',
					refreshToken: 'sample_refresh_token',
				};

			case 'basic':
				return {
					username: 'sample_user',
					password: 'sample_password',
				};

			default:
				return {};
		}
	},

	/**
	 * Format execution result for display
	 */
	formatResult(result: ExecutionResult): string {
		if (!result.success) {
			return `Error: ${result.error?.message || 'Unknown error'}`;
		}

		if (!result.data || result.data.length === 0) {
			return 'No output data';
		}

		return JSON.stringify(result.data, null, 2);
	},

	/**
	 * Measure execution time
	 */
	async measureExecutionTime(
		fn: () => Promise<ExecutionResult>,
	): Promise<{ result: ExecutionResult; duration: number }> {
		const start = Date.now();
		const result = await fn();
		const duration = Date.now() - start;

		return { result, duration };
	},
};

/**
 * Create preview instance
 */
export function createPreview(): NodePreview {
	return new NodePreview();
}

/**
 * Create sandbox environment
 */
export function createSandbox(timeout?: number): SandboxEnvironment {
	return new SandboxEnvironment(timeout);
}
