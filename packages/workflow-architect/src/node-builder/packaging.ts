/**
 * Custom Node Builder - Package Generator
 * Generate NPM packages for custom nodes
 */

import type { NodeDefinition, PackageMetadata } from './types';

/**
 * Generate package.json
 */
export function generatePackageJson(
	nodes: NodeDefinition[],
	metadata: PackageMetadata,
): string {
	const packageJson = {
		name: metadata.name,
		version: metadata.version,
		description: metadata.description,
		author: metadata.author || '',
		license: metadata.license || 'MIT',
		keywords: metadata.keywords || ['n8n', 'n8n-community-node-package', ...nodes.map((n) => n.name.toLowerCase())],
		main: 'index.js',
		scripts: {
			build: 'tsc',
			dev: 'tsc --watch',
			format: 'prettier --write .',
			lint: 'eslint .',
			test: 'jest',
		},
		files: ['dist'],
		n8n: {
			n8nNodesApiVersion: 1,
			credentials: nodes.flatMap((n) => n.credentials?.map((c) => `dist/credentials/${c.name}.credentials.js`) || []),
			nodes: nodes.map((n) => `dist/nodes/${n.name}/${n.name}.node.js`),
		},
		devDependencies: {
			'@types/node': '^20.0.0',
			'n8n-workflow': '^1.0.0',
			typescript: '^5.0.0',
			prettier: '^3.0.0',
			eslint: '^8.0.0',
			jest: '^29.0.0',
		},
		peerDependencies: {
			'n8n-workflow': '*',
		},
		...(metadata.repository && { repository: metadata.repository }),
	};

	return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate tsconfig.json
 */
export function generateTsConfig(): string {
	const tsConfig = {
		compilerOptions: {
			target: 'ES2020',
			module: 'commonjs',
			lib: ['ES2020'],
			outDir: './dist',
			rootDir: './src',
			strict: true,
			esModuleInterop: true,
			skipLibCheck: true,
			forceConsistentCasingInFileNames: true,
			resolveJsonModule: true,
			declaration: true,
			declarationMap: true,
			sourceMap: true,
			noUnusedLocals: true,
			noUnusedParameters: true,
			noImplicitReturns: true,
			noFallthroughCasesInSwitch: true,
		},
		include: ['src/**/*'],
		exclude: ['node_modules', 'dist', '**/*.test.ts'],
	};

	return JSON.stringify(tsConfig, null, 2);
}

/**
 * Generate README.md
 */
export function generateReadme(nodes: NodeDefinition[], metadata: PackageMetadata): string {
	const lines: string[] = [];

	lines.push(`# ${metadata.name}`);
	lines.push('');
	lines.push(metadata.description);
	lines.push('');

	if (nodes.length > 0) {
		lines.push('## Included Nodes');
		lines.push('');
		nodes.forEach((node) => {
			lines.push(`### ${node.displayName}`);
			lines.push('');
			lines.push(node.description);
			lines.push('');

			if (node.resources && node.resources.length > 0) {
				lines.push('**Resources:**');
				lines.push('');
				node.resources.forEach((resource) => {
					lines.push(`- **${resource.displayName}**`);
					resource.operations.forEach((op) => {
						lines.push(`  - ${op.displayName}: ${op.description}`);
					});
				});
				lines.push('');
			}

			if (node.credentials && node.credentials.length > 0) {
				lines.push('**Credentials:**');
				lines.push('');
				node.credentials.forEach((cred) => {
					lines.push(`- ${cred.displayName}`);
				});
				lines.push('');
			}
		});
	}

	lines.push('## Installation');
	lines.push('');
	lines.push('Community node installation:');
	lines.push('');
	lines.push('1. Go to Settings > Community Nodes');
	lines.push('2. Select Install');
	lines.push(`3. Enter \`${metadata.name}\` in the npm Package Name field`);
	lines.push('4. Agree to the risks and click Install');
	lines.push('');

	lines.push('Manual installation:');
	lines.push('');
	lines.push('```bash');
	lines.push(`npm install ${metadata.name}`);
	lines.push('```');
	lines.push('');

	lines.push('## Usage');
	lines.push('');
	lines.push('Refer to [n8n documentation](https://docs.n8n.io/) for general usage.');
	lines.push('');

	lines.push('## Development');
	lines.push('');
	lines.push('```bash');
	lines.push('# Install dependencies');
	lines.push('npm install');
	lines.push('');
	lines.push('# Build the node');
	lines.push('npm run build');
	lines.push('');
	lines.push('# Watch mode');
	lines.push('npm run dev');
	lines.push('```');
	lines.push('');

	lines.push('## License');
	lines.push('');
	lines.push(metadata.license || 'MIT');
	lines.push('');

	return lines.join('\n');
}

/**
 * Generate .eslintrc.json
 */
export function generateEslintConfig(): string {
	const eslintConfig = {
		extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
		parser: '@typescript-eslint/parser',
		plugins: ['@typescript-eslint'],
		root: true,
		env: {
			node: true,
			es6: true,
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	};

	return JSON.stringify(eslintConfig, null, 2);
}

/**
 * Generate .prettierrc
 */
export function generatePrettierConfig(): string {
	const prettierConfig = {
		semi: true,
		trailingComma: 'all',
		singleQuote: true,
		printWidth: 100,
		tabWidth: 2,
		useTabs: true,
	};

	return JSON.stringify(prettierConfig, null, 2);
}

/**
 * Generate .gitignore
 */
export function generateGitignore(): string {
	return [
		'# Dependencies',
		'node_modules/',
		'',
		'# Build output',
		'dist/',
		'*.js',
		'*.d.ts',
		'*.map',
		'',
		'# IDE',
		'.vscode/',
		'.idea/',
		'*.swp',
		'*.swo',
		'',
		'# OS',
		'.DS_Store',
		'Thumbs.db',
		'',
		'# Logs',
		'*.log',
		'npm-debug.log*',
		'',
		'# Environment',
		'.env',
		'.env.local',
	].join('\n');
}

/**
 * Generate .npmignore
 */
export function generateNpmignore(): string {
	return [
		'# Source files',
		'src/',
		'',
		'# Tests',
		'**/*.test.ts',
		'**/*.spec.ts',
		'',
		'# Config files',
		'tsconfig.json',
		'.eslintrc.json',
		'.prettierrc',
		'',
		'# IDE',
		'.vscode/',
		'.idea/',
		'',
		'# Git',
		'.git/',
		'.gitignore',
	].join('\n');
}

/**
 * Generate complete package structure
 */
export function generatePackageStructure(
	nodes: NodeDefinition[],
	metadata: PackageMetadata,
): Record<string, string> {
	return {
		'package.json': generatePackageJson(nodes, metadata),
		'tsconfig.json': generateTsConfig(),
		'README.md': generateReadme(nodes, metadata),
		'.eslintrc.json': generateEslintConfig(),
		'.prettierrc': generatePrettierConfig(),
		'.gitignore': generateGitignore(),
		'.npmignore': generateNpmignore(),
	};
}
