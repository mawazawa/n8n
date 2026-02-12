import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { PluginCLICommand, PluginTemplateType, PluginTemplateOptions } from './types';
import { generateBasicTemplate } from './templates/basic';
import { generateNodeTemplate } from './templates/node';
import { generateIntegrationTemplate } from './templates/integration';
import { ManifestValidator } from './validator';

const execAsync = promisify(exec);

/**
 * Plugin development CLI
 */
export class PluginCLI {
	/**
	 * Execute CLI command
	 */
	async execute(command: PluginCLICommand, args: string[]): Promise<void> {
		switch (command) {
			case 'create':
				await this.create(args);
				break;
			case 'build':
				await this.build(args);
				break;
			case 'test':
				await this.test(args);
				break;
			case 'publish':
				await this.publish(args);
				break;
			case 'dev':
				await this.dev(args);
				break;
			case 'validate':
				await this.validate(args);
				break;
			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	/**
	 * Create new plugin from template
	 */
	private async create(args: string[]): Promise<void> {
		console.log('Creating new plugin...');

		// Parse arguments
		const options = this.parseCreateArgs(args);

		// Generate plugin files
		let template: { packageJson: string; indexTs?: string; nodeTs?: string; integrationTs?: string; readme: string };

		switch (options.type) {
			case 'basic':
				template = generateBasicTemplate(options);
				break;
			case 'node':
				template = generateNodeTemplate(options);
				break;
			case 'integration':
				template = generateIntegrationTemplate(options);
				break;
			default:
				throw new Error(`Unknown template type: ${options.type}`);
		}

		// Create plugin directory
		const pluginDir = path.join(
			process.cwd(),
			options.name.toLowerCase().replace(/\s+/g, '-'),
		);
		await fs.mkdir(pluginDir, { recursive: true });
		await fs.mkdir(path.join(pluginDir, 'src'), { recursive: true });
		await fs.mkdir(path.join(pluginDir, 'dist'), { recursive: true });

		// Write files
		await fs.writeFile(path.join(pluginDir, 'package.json'), template.packageJson);
		await fs.writeFile(path.join(pluginDir, 'README.md'), template.readme);

		if (template.indexTs) {
			await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), template.indexTs);
		}

		if (template.nodeTs) {
			await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), template.nodeTs);
		}

		if (template.integrationTs) {
			await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), template.integrationTs);
		}

		// Create TypeScript config
		const tsconfig = {
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
				declaration: true,
			},
			include: ['src/**/*'],
			exclude: ['node_modules', 'dist'],
		};

		await fs.writeFile(path.join(pluginDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

		// Create .gitignore
		const gitignore = `node_modules/
dist/
*.log
.DS_Store
`;
		await fs.writeFile(path.join(pluginDir, '.gitignore'), gitignore);

		console.log(`✅ Plugin created successfully at ${pluginDir}`);
		console.log('\nNext steps:');
		console.log(`  cd ${path.basename(pluginDir)}`);
		console.log('  npm install');
		console.log('  npm run build');
	}

	/**
	 * Build plugin
	 */
	private async build(args: string[]): Promise<void> {
		console.log('Building plugin...');

		const pluginDir = args[0] || process.cwd();

		// Run TypeScript compiler
		try {
			const { stdout, stderr } = await execAsync('npm run build', {
				cwd: pluginDir,
			});

			if (stdout) console.log(stdout);
			if (stderr) console.error(stderr);

			console.log('✅ Build completed successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Build failed: ${message}`);
		}
	}

	/**
	 * Run tests
	 */
	private async test(args: string[]): Promise<void> {
		console.log('Running tests...');

		const pluginDir = args[0] || process.cwd();

		try {
			const { stdout, stderr } = await execAsync('npm test', {
				cwd: pluginDir,
			});

			if (stdout) console.log(stdout);
			if (stderr) console.error(stderr);

			console.log('✅ Tests passed');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Tests failed: ${message}`);
		}
	}

	/**
	 * Publish plugin
	 */
	private async publish(args: string[]): Promise<void> {
		console.log('Publishing plugin...');

		const pluginDir = args[0] || process.cwd();

		// Validate manifest
		await this.validate([pluginDir]);

		// Build plugin
		await this.build([pluginDir]);

		// Run tests
		await this.test([pluginDir]);

		// Publish to npm
		try {
			const { stdout, stderr } = await execAsync('npm publish --access public', {
				cwd: pluginDir,
			});

			if (stdout) console.log(stdout);
			if (stderr) console.error(stderr);

			console.log('✅ Plugin published successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Publish failed: ${message}`);
		}
	}

	/**
	 * Start development server
	 */
	private async dev(args: string[]): Promise<void> {
		console.log('Starting development server...');

		const pluginDir = args[0] || process.cwd();

		// Run TypeScript in watch mode
		const child = exec('npm run dev', { cwd: pluginDir });

		child.stdout?.on('data', (data) => {
			process.stdout.write(data);
		});

		child.stderr?.on('data', (data) => {
			process.stderr.write(data);
		});

		child.on('exit', (code) => {
			if (code !== 0) {
				console.error(`Development server exited with code ${code}`);
			}
		});

		// Keep process running
		await new Promise(() => {});
	}

	/**
	 * Validate plugin manifest
	 */
	private async validate(args: string[]): Promise<void> {
		console.log('Validating plugin...');

		const pluginDir = args[0] || process.cwd();
		const packageJsonPath = path.join(pluginDir, 'package.json');

		// Read package.json
		const content = await fs.readFile(packageJsonPath, 'utf-8');
		const pkg = JSON.parse(content) as Record<string, unknown>;

		// Validate manifest
		const validator = new ManifestValidator();
		const result = validator.validate(pkg.n8nPlugin);

		if (!result.valid) {
			console.error('❌ Validation failed:');
			for (const error of result.errors) {
				console.error(`  ${error.field}: ${error.message} (${error.code})`);
			}
			throw new Error('Plugin validation failed');
		}

		if (result.warnings.length > 0) {
			console.warn('⚠️  Warnings:');
			for (const warning of result.warnings) {
				console.warn(`  ${warning.field}: ${warning.message} (${warning.code})`);
			}
		}

		console.log('✅ Plugin is valid');
	}

	/**
	 * Parse create command arguments
	 */
	private parseCreateArgs(args: string[]): PluginTemplateOptions {
		const options: PluginTemplateOptions = {
			type: 'basic' as PluginTemplateType,
			name: '',
			description: '',
			author: '',
		};

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];

			switch (arg) {
				case '--type':
				case '-t':
					options.type = args[++i] as PluginTemplateType;
					break;
				case '--name':
				case '-n':
					options.name = args[++i];
					break;
				case '--description':
				case '-d':
					options.description = args[++i];
					break;
				case '--author':
				case '-a':
					options.author = args[++i];
					break;
				case '--email':
				case '-e':
					options.email = args[++i];
					break;
				case '--license':
				case '-l':
					options.license = args[++i];
					break;
			}
		}

		// Validate required fields
		if (!options.name) {
			throw new Error('Plugin name is required (--name)');
		}

		if (!options.description) {
			throw new Error('Plugin description is required (--description)');
		}

		if (!options.author) {
			throw new Error('Plugin author is required (--author)');
		}

		return options;
	}
}

/**
 * CLI entry point
 */
export async function runCLI(args: string[]): Promise<void> {
	const command = args[0] as PluginCLICommand;
	const commandArgs = args.slice(1);

	const cli = new PluginCLI();

	try {
		await cli.execute(command, commandArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${message}`);
		process.exit(1);
	}
}
