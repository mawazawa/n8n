import type { PluginTemplateOptions } from '../types';

/**
 * Generate basic plugin template
 */
export function generateBasicTemplate(options: PluginTemplateOptions): {
	packageJson: string;
	indexTs: string;
	readme: string;
} {
	const packageJson = JSON.stringify(
		{
			name: `@n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}`,
			version: '1.0.0',
			description: options.description,
			main: 'dist/index.js',
			types: 'dist/index.d.ts',
			scripts: {
				build: 'tsc',
				dev: 'tsc --watch',
				test: 'jest',
				lint: 'eslint src --ext .ts',
			},
			author: {
				name: options.author,
				email: options.email,
			},
			license: options.license || 'MIT',
			n8nPlugin: {
				id: options.name.toLowerCase().replace(/\s+/g, '-'),
				name: options.name,
				version: '1.0.0',
				description: options.description,
				author: {
					name: options.author,
					email: options.email,
				},
				license: options.license || 'MIT',
				main: 'dist/index.js',
				permissions: options.permissions || [],
				hooks: [],
				extensionPoints: options.extensionPoints || [],
				dependencies: [],
				peerDependencies: [],
				resourceLimits: {
					maxMemoryMB: 100,
					maxCpuTimeMs: 5000,
					maxExecutionTimeMs: 30000,
					maxStorageMB: 50,
					maxNetworkRequests: 100,
				},
			},
			devDependencies: {
				'@types/node': '^20.0.0',
				typescript: '^5.0.0',
				jest: '^29.0.0',
				'@types/jest': '^29.0.0',
				eslint: '^8.0.0',
				'@typescript-eslint/eslint-plugin': '^6.0.0',
				'@typescript-eslint/parser': '^6.0.0',
			},
		},
		null,
		2,
	);

	const indexTs = `/**
 * ${options.name}
 * ${options.description}
 */

export interface PluginContext {
  pluginId: string;
  userId?: string;
  workflowId?: string;
  executionId?: string;
  data?: Record<string, unknown>;
}

export class ${toPascalCase(options.name)}Plugin {
  /**
   * Initialize plugin
   */
  async initialize(context: PluginContext): Promise<void> {
    console.log('Initializing plugin:', context.pluginId);
  }

  /**
   * Execute plugin logic
   */
  async execute(data: unknown): Promise<unknown> {
    // Your plugin logic here
    return data;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up plugin');
  }
}

// Export plugin instance
export default new ${toPascalCase(options.name)}Plugin();
`;

	const readme = `# ${options.name}

${options.description}

## Installation

\`\`\`bash
npm install @n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}
\`\`\`

## Usage

This plugin can be loaded into n8n workflow-architect.

## Development

\`\`\`bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
\`\`\`

## API

### \`initialize(context: PluginContext): Promise<void>\`

Initialize the plugin with the given context.

### \`execute(data: unknown): Promise<unknown>\`

Execute the main plugin logic.

### \`cleanup(): Promise<void>\`

Clean up resources when plugin is unloaded.

## License

${options.license || 'MIT'}

## Author

${options.author}${options.email ? ` <${options.email}>` : ''}
`;

	return { packageJson, indexTs, readme };
}

function toPascalCase(str: string): string {
	return str
		.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
		.replace(/^./, (chr) => chr.toUpperCase());
}
