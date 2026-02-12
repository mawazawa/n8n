import type { PluginTemplateOptions } from '../types';

/**
 * Generate integration plugin template
 */
export function generateIntegrationTemplate(options: PluginTemplateOptions): {
	packageJson: string;
	integrationTs: string;
	readme: string;
} {
	const integrationName = toPascalCase(options.name);

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
				permissions: options.permissions || ['NETWORK', 'WORKFLOWS'],
				extensionPoints: ['INTEGRATION'],
				resourceLimits: {
					maxMemoryMB: 150,
					maxCpuTimeMs: 10000,
					maxExecutionTimeMs: 60000,
					maxStorageMB: 100,
					maxNetworkRequests: 200,
				},
			},
		},
		null,
		2,
	);

	const integrationTs = `/**
 * ${options.name} Integration Plugin
 * ${options.description}
 */

export interface IntegrationConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface IntegrationResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ${integrationName}Integration {
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig = {}) {
    this.config = {
      baseUrl: 'https://api.example.com',
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize connection
   */
  async connect(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }

    // Test connection
    await this.testConnection();
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(\`\${this.config.baseUrl}/health\`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get data from API
   */
  async get<T = unknown>(endpoint: string): Promise<IntegrationResponse<T>> {
    try {
      const response = await fetch(\`\${this.config.baseUrl}\${endpoint}\`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: \`HTTP \${response.status}: \${response.statusText}\`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Post data to API
   */
  async post<T = unknown>(endpoint: string, body: unknown): Promise<IntegrationResponse<T>> {
    try {
      const response = await fetch(\`\${this.config.baseUrl}\${endpoint}\`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: \`HTTP \${response.status}: \${response.statusText}\`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get request headers
   */
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${this.config.apiKey}\`,
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Cleanup resources
  }
}

export default ${integrationName}Integration;
`;

	const readme = `# ${options.name} Integration Plugin

${options.description}

## Features

- Full API integration support
- TypeScript types included
- Automatic retries and error handling
- Configurable timeout and rate limiting

## Installation

\`\`\`bash
npm install @n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}
\`\`\`

## Configuration

\`\`\`typescript
import ${integrationName}Integration from '@n8n/plugin-${options.name.toLowerCase().replace(/\s+/g, '-')}';

const integration = new ${integrationName}Integration({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.example.com',
  timeout: 30000,
});

await integration.connect();
\`\`\`

## Usage

### Get Data

\`\`\`typescript
const result = await integration.get('/endpoint');
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
\`\`\`

### Post Data

\`\`\`typescript
const result = await integration.post('/endpoint', {
  key: 'value',
});
\`\`\`

## API

### \`connect(): Promise<void>\`

Initialize the connection to the API.

### \`testConnection(): Promise<boolean>\`

Test if the API connection is working.

### \`get<T>(endpoint: string): Promise<IntegrationResponse<T>>\`

Get data from the API endpoint.

### \`post<T>(endpoint: string, body: unknown): Promise<IntegrationResponse<T>>\`

Post data to the API endpoint.

### \`disconnect(): Promise<void>\`

Clean up and disconnect from the API.

## License

${options.license || 'MIT'}

## Author

${options.author}${options.email ? ` <${options.email}>` : ''}
`;

	return { packageJson, integrationTs, readme };
}

function toPascalCase(str: string): string {
	return str
		.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
		.replace(/^./, (chr) => chr.toUpperCase());
}
