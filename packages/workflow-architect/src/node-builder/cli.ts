/**
 * Custom Node Builder - CLI
 * Command-line interface for node development
 */

import type { NodeDefinition } from './types';

/**
 * CLI command interface
 */
interface Command {
	name: string;
	description: string;
	args?: string[];
	options?: Record<string, string>;
	handler: (args: string[], options: Record<string, string>) => Promise<void>;
}

/**
 * CLI class
 */
export class NodeBuilderCLI {
	private commands: Map<string, Command> = new Map();

	constructor() {
		this.registerDefaultCommands();
	}

	/**
	 * Register default commands
	 */
	private registerDefaultCommands(): void {
		// Init command
		this.registerCommand({
			name: 'init',
			description: 'Initialize a new node project',
			args: ['name'],
			options: {
				template: 'Template to use (restApi, database, webhook, etc.)',
				dir: 'Output directory',
			},
			handler: async (args, options) => {
				await this.handleInit(args[0], options);
			},
		});

		// Generate command
		this.registerCommand({
			name: 'generate',
			description: 'Generate node code from definition',
			args: ['input'],
			options: {
				output: 'Output file path',
				format: 'Output format (typescript, json)',
			},
			handler: async (args, options) => {
				await this.handleGenerate(args[0], options);
			},
		});

		// Test command
		this.registerCommand({
			name: 'test',
			description: 'Test a node definition',
			args: ['input'],
			options: {
				data: 'Test data file',
			},
			handler: async (args, options) => {
				await this.handleTest(args[0], options);
			},
		});

		// Package command
		this.registerCommand({
			name: 'package',
			description: 'Package node for distribution',
			args: ['input'],
			options: {
				output: 'Output directory',
				name: 'Package name',
				version: 'Package version',
			},
			handler: async (args, options) => {
				await this.handlePackage(args[0], options);
			},
		});

		// Publish command
		this.registerCommand({
			name: 'publish',
			description: 'Publish node to registry',
			args: ['input'],
			options: {
				registry: 'Registry URL',
				token: 'Auth token',
			},
			handler: async (args, options) => {
				await this.handlePublish(args[0], options);
			},
		});

		// Import command
		this.registerCommand({
			name: 'import',
			description: 'Import from OpenAPI or Postman',
			args: ['input'],
			options: {
				type: 'Input type (openapi, postman)',
				output: 'Output file path',
			},
			handler: async (args, options) => {
				await this.handleImport(args[0], options);
			},
		});

		// Validate command
		this.registerCommand({
			name: 'validate',
			description: 'Validate node definition',
			args: ['input'],
			handler: async (args, options) => {
				await this.handleValidate(args[0], options);
			},
		});

		// Docs command
		this.registerCommand({
			name: 'docs',
			description: 'Generate documentation',
			args: ['input'],
			options: {
				output: 'Output directory',
				format: 'Format (markdown, html)',
			},
			handler: async (args, options) => {
				await this.handleDocs(args[0], options);
			},
		});
	}

	/**
	 * Register a command
	 */
	registerCommand(command: Command): void {
		this.commands.set(command.name, command);
	}

	/**
	 * Parse and execute command
	 */
	async execute(argv: string[]): Promise<void> {
		const [commandName, ...rest] = argv.slice(2);

		if (!commandName || commandName === 'help') {
			this.showHelp();
			return;
		}

		const command = this.commands.get(commandName);
		if (!command) {
			console.error(`Unknown command: ${commandName}`);
			this.showHelp();
			return;
		}

		const { args, options } = this.parseArgs(rest, command.args || []);

		try {
			await command.handler(args, options);
		} catch (error) {
			console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
			process.exit(1);
		}
	}

	/**
	 * Show help
	 */
	private showHelp(): void {
		console.log('Node Builder CLI\n');
		console.log('Usage: node-builder <command> [options]\n');
		console.log('Commands:');

		this.commands.forEach((command) => {
			const argsStr = command.args ? ` <${command.args.join('> <')}>` : '';
			console.log(`  ${command.name}${argsStr}`);
			console.log(`    ${command.description}`);

			if (command.options) {
				Object.entries(command.options).forEach(([key, desc]) => {
					console.log(`      --${key}: ${desc}`);
				});
			}

			console.log('');
		});
	}

	/**
	 * Parse arguments
	 */
	private parseArgs(
		argv: string[],
		expectedArgs: string[],
	): { args: string[]; options: Record<string, string> } {
		const args: string[] = [];
		const options: Record<string, string> = {};

		for (let i = 0; i < argv.length; i++) {
			const arg = argv[i];

			if (arg.startsWith('--')) {
				const key = arg.slice(2);
				const value = argv[i + 1];
				options[key] = value;
				i++; // Skip next arg
			} else {
				args.push(arg);
			}
		}

		return { args, options };
	}

	/**
	 * Handle init command
	 */
	private async handleInit(name: string, options: Record<string, string>): Promise<void> {
		const { getTemplate } = await import('./templates');
		const { generatePackageStructure } = await import('./packaging');
		const { TemplateType } = await import('./types');

		const template = (options.template || 'restApi') as keyof typeof TemplateType;
		const nodeDefinition = getTemplate(TemplateType[template.toUpperCase() as keyof typeof TemplateType]);

		// Update node name
		nodeDefinition.name = name;
		nodeDefinition.displayName = name;

		// Generate package structure
		const packageFiles = generatePackageStructure([nodeDefinition], {
			name: `n8n-nodes-${name.toLowerCase()}`,
			version: '1.0.0',
			description: nodeDefinition.description,
		});

		console.log(`Initialized ${name} with ${template} template`);
		console.log('Generated files:', Object.keys(packageFiles).join(', '));
	}

	/**
	 * Handle generate command
	 */
	private async handleGenerate(input: string, options: Record<string, string>): Promise<void> {
		const { exportToTypeScript, exportToJson } = await import('./export');

		// Load node definition (simplified - would read from file)
		const nodeDefinition: NodeDefinition = JSON.parse(input);

		const format = options.format || 'typescript';
		const output =
			format === 'json' ? exportToJson(nodeDefinition) : exportToTypeScript(nodeDefinition);

		console.log('Generated code:');
		console.log(output);
	}

	/**
	 * Handle test command
	 */
	private async handleTest(input: string, options: Record<string, string>): Promise<void> {
		const { createTestNode, mockExecution } = await import('./testing');

		// Load node definition
		const nodeDefinition: NodeDefinition = JSON.parse(input);

		// Load test data
		const testData = options.data ? JSON.parse(options.data) : [{ json: { test: true } }];

		// Execute test
		const result = await mockExecution(nodeDefinition, {
			inputData: testData,
			nodeParameters: {},
		});

		console.log('Test result:', result.success ? 'PASS' : 'FAIL');
		if (!result.success) {
			console.error('Error:', result.error?.message);
		}
	}

	/**
	 * Handle package command
	 */
	private async handlePackage(input: string, options: Record<string, string>): Promise<void> {
		const { exportPackage } = await import('./export');

		const nodeDefinition: NodeDefinition = JSON.parse(input);
		const packageFiles = exportPackage(nodeDefinition);

		console.log('Package created:');
		console.log('- Node:', packageFiles.node.split('\n').length, 'lines');
		console.log('- Credentials:', Object.keys(packageFiles.credentials).length, 'files');
		console.log('- Package.json: Ready');
		console.log('- README.md: Ready');
	}

	/**
	 * Handle publish command
	 */
	private async handlePublish(input: string, options: Record<string, string>): Promise<void> {
		const { createRegistry } = await import('./registry');

		const nodeDefinition: NodeDefinition = JSON.parse(input);
		const registryUrl = options.registry || process.env.REGISTRY_URL || '';
		const token = options.token || process.env.REGISTRY_TOKEN || '';

		const registry = createRegistry(registryUrl, token);
		const published = await registry.register(nodeDefinition, '1.0.0', true);

		console.log(`Published ${published.nodeDefinition.displayName} to registry`);
		console.log('ID:', published.id);
	}

	/**
	 * Handle import command
	 */
	private async handleImport(input: string, options: Record<string, string>): Promise<void> {
		const { importFromOpenAPI, importFromPostman } = await import('./import');

		const type = options.type || 'openapi';
		const spec = JSON.parse(input);

		const nodes =
			type === 'openapi' ? await importFromOpenAPI(spec) : await importFromPostman(spec);

		console.log(`Imported ${nodes.length} node(s)`);
		nodes.forEach((node) => {
			console.log(`- ${node.displayName}`);
		});
	}

	/**
	 * Handle validate command
	 */
	private async handleValidate(input: string, options: Record<string, string>): Promise<void> {
		const { validateNodeDefinition } = await import('./schema');

		const nodeDefinition: NodeDefinition = JSON.parse(input);
		const result = validateNodeDefinition(nodeDefinition);

		console.log('Validation:', result.valid ? 'PASS' : 'FAIL');

		if (result.errors.length > 0) {
			console.log('\nErrors:');
			result.errors.forEach((error) => {
				console.log(`  - ${error.path}: ${error.message}`);
				if (error.suggestion) {
					console.log(`    Suggestion: ${error.suggestion}`);
				}
			});
		}

		if (result.warnings.length > 0) {
			console.log('\nWarnings:');
			result.warnings.forEach((warning) => {
				console.log(`  - ${warning.path}: ${warning.message}`);
			});
		}
	}

	/**
	 * Handle docs command
	 */
	private async handleDocs(input: string, options: Record<string, string>): Promise<void> {
		const { generateDocs } = await import('./documentation');

		const nodeDefinition: NodeDefinition = JSON.parse(input);
		const docs = generateDocs(nodeDefinition);

		console.log('Documentation generated:');
		console.log(docs);
	}
}

/**
 * Create CLI instance
 */
export function createCLI(): NodeBuilderCLI {
	return new NodeBuilderCLI();
}

/**
 * Run CLI (entry point)
 */
export async function runCLI(argv: string[]): Promise<void> {
	const cli = createCLI();
	await cli.execute(argv);
}
