import type { PluginTemplateOptions } from '../types';

/**
 * Generate custom node plugin template
 */
export function generateNodeTemplate(options: PluginTemplateOptions): {
	packageJson: string;
	nodeTs: string;
	readme: string;
} {
	const nodeName = toPascalCase(options.name);

	const packageJson = JSON.stringify(
		{
			name: `@n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}`,
			version: '1.0.0',
			description: options.description,
			main: 'dist/index.js',
			types: 'dist/index.d.ts',
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
				permissions: options.permissions || ['WORKFLOWS'],
				extensionPoints: ['NODE'],
				resourceLimits: {
					maxMemoryMB: 100,
					maxCpuTimeMs: 5000,
					maxExecutionTimeMs: 30000,
					maxStorageMB: 50,
					maxNetworkRequests: 100,
				},
			},
		},
		null,
		2,
	);

	const nodeTs = `/**
 * ${options.name} Node
 * ${options.description}
 */

export interface NodeConfig {
  name: string;
  type: string;
  description: string;
  defaults: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
}

export interface NodeExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export interface NodeInput {
  items: NodeExecutionData[];
}

export interface NodeOutput {
  items: NodeExecutionData[];
}

export class ${nodeName}Node {
  private config: NodeConfig;

  constructor() {
    this.config = {
      name: '${options.name}',
      type: 'n8n-plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}',
      description: '${options.description}',
      defaults: {
        name: '${options.name}',
      },
      inputs: ['main'],
      outputs: ['main'],
    };
  }

  /**
   * Get node configuration
   */
  getConfig(): NodeConfig {
    return this.config;
  }

  /**
   * Execute node
   */
  async execute(input: NodeInput): Promise<NodeOutput> {
    const items: NodeExecutionData[] = [];

    for (const item of input.items) {
      // Your node logic here
      const json = {
        ...item.json,
        processed: true,
        timestamp: new Date().toISOString(),
      };

      items.push({ json });
    }

    return { items };
  }

  /**
   * Get node properties for UI
   */
  getProperties(): Array<{
    displayName: string;
    name: string;
    type: string;
    default: unknown;
    description?: string;
  }> {
    return [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'process',
        description: 'Operation to perform',
      },
      {
        displayName: 'Field',
        name: 'field',
        type: 'string',
        default: '',
        description: 'Field to process',
      },
    ];
  }
}

export default new ${nodeName}Node();
`;

	const readme = `# ${options.name} Node Plugin

${options.description}

## Features

- Custom n8n node implementation
- Full TypeScript support
- Easy to configure and extend

## Installation

\`\`\`bash
npm install @n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}
\`\`\`

## Node Properties

The node exposes the following properties:

- **Operation**: Select the operation to perform
- **Field**: Specify the field to process

## Usage

1. Install the plugin in n8n workflow-architect
2. Add the ${options.name} node to your workflow
3. Configure the node properties
4. Connect it to other nodes

## Development

\`\`\`bash
npm run build
npm run dev
npm test
\`\`\`

## License

${options.license || 'MIT'}
`;

	return { packageJson, nodeTs, readme };
}

function toPascalCase(str: string): string {
	return str
		.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
		.replace(/^./, (chr) => chr.toUpperCase());
}
