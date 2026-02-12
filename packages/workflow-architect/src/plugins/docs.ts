import type { PluginManifest, PluginPermission, ExtensionPoint, HookType } from './types';

/**
 * Documentation generator for plugins
 */
export class DocGenerator {
	/**
	 * Generate markdown documentation from manifest
	 */
	generateFromManifest(manifest: PluginManifest): string {
		const sections: string[] = [];

		// Header
		sections.push(`# ${manifest.name}`);
		sections.push('');
		sections.push(manifest.description);
		sections.push('');

		// Metadata
		sections.push('## Plugin Information');
		sections.push('');
		sections.push(`- **Version:** ${manifest.version}`);
		sections.push(`- **Author:** ${manifest.author.name}${manifest.author.email ? ` <${manifest.author.email}>` : ''}`);
		sections.push(`- **License:** ${manifest.license}`);

		if (manifest.repository) {
			sections.push(`- **Repository:** ${manifest.repository}`);
		}

		if (manifest.homepage) {
			sections.push(`- **Homepage:** ${manifest.homepage}`);
		}

		sections.push('');

		// Installation
		sections.push('## Installation');
		sections.push('');
		sections.push('```bash');
		sections.push(`npm install ${manifest.id}`);
		sections.push('```');
		sections.push('');

		// Permissions
		if (manifest.permissions.length > 0) {
			sections.push('## Required Permissions');
			sections.push('');
			sections.push('This plugin requires the following permissions:');
			sections.push('');

			for (const permission of manifest.permissions) {
				sections.push(`- **${permission}**: ${this.getPermissionDescription(permission)}`);
			}

			sections.push('');
		}

		// Extension points
		if (manifest.extensionPoints.length > 0) {
			sections.push('## Extension Points');
			sections.push('');
			sections.push('This plugin extends the following points:');
			sections.push('');

			for (const point of manifest.extensionPoints) {
				sections.push(`- **${point}**: ${this.getExtensionPointDescription(point)}`);
			}

			sections.push('');
		}

		// Hooks
		if (manifest.hooks.length > 0) {
			sections.push('## Lifecycle Hooks');
			sections.push('');
			sections.push('This plugin uses the following hooks:');
			sections.push('');

			for (const hook of manifest.hooks) {
				sections.push(`- **${hook}**: ${this.getHookDescription(hook)}`);
			}

			sections.push('');
		}

		// Dependencies
		if (manifest.dependencies.length > 0) {
			sections.push('## Dependencies');
			sections.push('');
			sections.push('| Dependency | Version | Optional |');
			sections.push('|------------|---------|----------|');

			for (const dep of manifest.dependencies) {
				sections.push(`| ${dep.name} | ${dep.version} | ${dep.optional ? 'Yes' : 'No'} |`);
			}

			sections.push('');
		}

		// Resource limits
		if (manifest.resourceLimits) {
			sections.push('## Resource Limits');
			sections.push('');
			sections.push('| Resource | Limit |');
			sections.push('|----------|-------|');
			sections.push(`| Memory | ${manifest.resourceLimits.maxMemoryMB} MB |`);
			sections.push(`| CPU Time | ${manifest.resourceLimits.maxCpuTimeMs} ms |`);
			sections.push(`| Execution Time | ${manifest.resourceLimits.maxExecutionTimeMs} ms |`);
			sections.push(`| Storage | ${manifest.resourceLimits.maxStorageMB} MB |`);
			sections.push(`| Network Requests | ${manifest.resourceLimits.maxNetworkRequests} |`);
			sections.push('');
		}

		// Configuration
		if (manifest.config && Object.keys(manifest.config).length > 0) {
			sections.push('## Configuration');
			sections.push('');
			sections.push('This plugin can be configured with the following options:');
			sections.push('');
			sections.push('```json');
			sections.push(JSON.stringify(manifest.config, null, 2));
			sections.push('```');
			sections.push('');
		}

		// Keywords
		if (manifest.keywords.length > 0) {
			sections.push('## Keywords');
			sections.push('');
			sections.push(manifest.keywords.map((k) => `\`${k}\``).join(', '));
			sections.push('');
		}

		return sections.join('\n');
	}

	/**
	 * Generate API documentation
	 */
	generateAPIDoc(pluginExports: Record<string, unknown>): string {
		const sections: string[] = [];

		sections.push('## API Reference');
		sections.push('');

		for (const [name, value] of Object.entries(pluginExports)) {
			if (typeof value === 'function') {
				sections.push(`### \`${name}()\``);
				sections.push('');
				sections.push(`Function: ${name}`);
				sections.push('');
			} else if (typeof value === 'object' && value !== null) {
				sections.push(`### \`${name}\``);
				sections.push('');
				sections.push(`Object: ${name}`);
				sections.push('');
			}
		}

		return sections.join('\n');
	}

	/**
	 * Generate usage examples
	 */
	generateUsageExamples(manifest: PluginManifest): string {
		const sections: string[] = [];

		sections.push('## Usage Examples');
		sections.push('');
		sections.push('### Basic Usage');
		sections.push('');
		sections.push('```typescript');
		sections.push(`import plugin from '${manifest.id}';`);
		sections.push('');
		sections.push('// Initialize plugin');
		sections.push('await plugin.initialize({');
		sections.push(`  pluginId: '${manifest.id}',`);
		sections.push('  userId: "user-id",');
		sections.push('});');
		sections.push('');
		sections.push('// Use plugin');
		sections.push('const result = await plugin.execute(data);');
		sections.push('```');
		sections.push('');

		return sections.join('\n');
	}

	/**
	 * Generate changelog
	 */
	generateChangelog(
		versions: Array<{ version: string; date: Date; changes: string[] }>,
	): string {
		const sections: string[] = [];

		sections.push('# Changelog');
		sections.push('');

		for (const version of versions) {
			sections.push(`## [${version.version}] - ${version.date.toISOString().split('T')[0]}`);
			sections.push('');

			for (const change of version.changes) {
				sections.push(`- ${change}`);
			}

			sections.push('');
		}

		return sections.join('\n');
	}

	/**
	 * Get permission description
	 */
	private getPermissionDescription(permission: PluginPermission): string {
		switch (permission) {
			case 'NETWORK':
				return 'Make HTTP requests to external services';
			case 'STORAGE':
				return 'Store and retrieve data locally';
			case 'WORKFLOWS':
				return 'Access and manage workflows';
			case 'CREDENTIALS':
				return 'Access stored credentials';
			case 'EXECUTIONS':
				return 'View and manage workflow executions';
			case 'USERS':
				return 'Access user information';
			case 'ADMIN':
				return 'Full administrative access';
			default:
				return 'Unknown permission';
		}
	}

	/**
	 * Get extension point description
	 */
	private getExtensionPointDescription(point: ExtensionPoint): string {
		switch (point) {
			case 'NODE':
				return 'Adds custom workflow nodes';
			case 'TRIGGER':
				return 'Adds custom triggers';
			case 'CREDENTIAL':
				return 'Adds custom credential types';
			case 'UI':
				return 'Extends the user interface';
			case 'API':
				return 'Adds custom API endpoints';
			case 'WORKFLOW':
				return 'Extends workflow functionality';
			case 'EXECUTION':
				return 'Extends execution engine';
			default:
				return 'Unknown extension point';
		}
	}

	/**
	 * Get hook description
	 */
	private getHookDescription(hook: HookType): string {
		switch (hook) {
			case 'BEFORE_EXECUTE':
				return 'Called before workflow execution';
			case 'AFTER_EXECUTE':
				return 'Called after workflow execution';
			case 'ON_ERROR':
				return 'Called when an error occurs';
			case 'ON_LOAD':
				return 'Called when plugin is loaded';
			case 'ON_UNLOAD':
				return 'Called when plugin is unloaded';
			case 'BEFORE_SAVE':
				return 'Called before saving workflow';
			case 'AFTER_SAVE':
				return 'Called after saving workflow';
			case 'BEFORE_DELETE':
				return 'Called before deleting workflow';
			case 'AFTER_DELETE':
				return 'Called after deleting workflow';
			default:
				return 'Unknown hook';
		}
	}
}

/**
 * README template generator
 */
export class ReadmeGenerator {
	/**
	 * Generate complete README
	 */
	generate(
		manifest: PluginManifest,
		sections: {
			features?: string[];
			installation?: string;
			usage?: string;
			api?: string;
			contributing?: string;
			license?: string;
		} = {},
	): string {
		const parts: string[] = [];

		// Header
		parts.push(`# ${manifest.name}`);
		parts.push('');
		parts.push(manifest.description);
		parts.push('');

		// Badges
		parts.push(
			`[![Version](https://img.shields.io/badge/version-${manifest.version}-blue.svg)](https://github.com)`,
		);
		parts.push(
			`[![License](https://img.shields.io/badge/license-${manifest.license}-green.svg)](LICENSE)`,
		);
		parts.push('');

		// Features
		if (sections.features && sections.features.length > 0) {
			parts.push('## Features');
			parts.push('');
			for (const feature of sections.features) {
				parts.push(`- ${feature}`);
			}
			parts.push('');
		}

		// Installation
		parts.push('## Installation');
		parts.push('');
		parts.push(sections.installation || `npm install ${manifest.id}`);
		parts.push('');

		// Usage
		if (sections.usage) {
			parts.push('## Usage');
			parts.push('');
			parts.push(sections.usage);
			parts.push('');
		}

		// API
		if (sections.api) {
			parts.push('## API');
			parts.push('');
			parts.push(sections.api);
			parts.push('');
		}

		// Contributing
		if (sections.contributing) {
			parts.push('## Contributing');
			parts.push('');
			parts.push(sections.contributing);
			parts.push('');
		}

		// License
		parts.push('## License');
		parts.push('');
		parts.push(sections.license || `${manifest.license}`);
		parts.push('');

		// Author
		parts.push('## Author');
		parts.push('');
		parts.push(`${manifest.author.name}${manifest.author.email ? ` <${manifest.author.email}>` : ''}`);
		parts.push('');

		return parts.join('\n');
	}
}
