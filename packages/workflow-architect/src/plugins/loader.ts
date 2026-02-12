import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Plugin, PluginManifest, PluginState, PluginConfig } from './types';

const execAsync = promisify(exec);

/**
 * Plugin loader for dynamic loading from various sources
 */
export class PluginLoader {
	private loadedPlugins = new Map<string, NodeModule>();
	private watchedPaths = new Map<string, NodeJS.FSWatcher>();
	private hotReloadCallbacks = new Map<string, Array<(plugin: Plugin) => void>>();

	constructor(private pluginDir: string = './plugins') {}

	/**
	 * Load plugin from local filesystem path
	 */
	async load(pluginPath: string): Promise<Plugin> {
		try {
			// Resolve absolute path
			const absolutePath = path.resolve(pluginPath);

			// Check if directory exists
			const stats = await fs.stat(absolutePath);
			if (!stats.isDirectory()) {
				throw new Error(`Plugin path is not a directory: ${pluginPath}`);
			}

			// Load package.json/manifest
			const manifest = await this.loadManifest(absolutePath);

			// Load main file
			const mainPath = path.join(absolutePath, manifest.main);
			const pluginModule = await this.loadModule(mainPath);

			// Store loaded module
			this.loadedPlugins.set(manifest.id, pluginModule);

			// Create plugin object
			const plugin: Plugin = {
				manifest,
				config: {
					enabled: true,
					settings: {},
				},
				state: PluginState.INSTALLED,
				installedAt: new Date(),
				updatedAt: new Date(),
				exports: pluginModule.exports as Record<string, unknown>,
			};

			return plugin;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to load plugin from ${pluginPath}: ${message}`);
		}
	}

	/**
	 * Load plugin from URL
	 */
	async loadFromUrl(url: string): Promise<Plugin> {
		try {
			// Download plugin archive
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const buffer = await response.arrayBuffer();
			const tempDir = path.join(this.pluginDir, 'temp', this.generateId());

			// Create temp directory
			await fs.mkdir(tempDir, { recursive: true });

			// Save archive
			const archivePath = path.join(tempDir, 'plugin.tar.gz');
			await fs.writeFile(archivePath, Buffer.from(buffer));

			// Extract archive
			await execAsync(`tar -xzf ${archivePath} -C ${tempDir}`);

			// Load from extracted directory
			const plugin = await this.load(tempDir);

			// Move to permanent location
			const permanentDir = path.join(this.pluginDir, plugin.manifest.id);
			await fs.rename(tempDir, permanentDir);

			return plugin;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to load plugin from URL ${url}: ${message}`);
		}
	}

	/**
	 * Load plugin from npm package
	 */
	async loadFromNpm(packageName: string, version?: string): Promise<Plugin> {
		try {
			const pkgSpec = version ? `${packageName}@${version}` : packageName;
			const tempDir = path.join(this.pluginDir, 'temp', this.generateId());

			// Create temp directory
			await fs.mkdir(tempDir, { recursive: true });

			// Install package
			await execAsync(`npm install ${pkgSpec} --prefix ${tempDir} --no-save`);

			// Find package location
			const packagePath = path.join(tempDir, 'node_modules', packageName);

			// Load plugin
			const plugin = await this.load(packagePath);

			// Move to permanent location
			const permanentDir = path.join(this.pluginDir, plugin.manifest.id);
			await fs.rename(packagePath, permanentDir);

			// Cleanup temp directory
			await fs.rm(tempDir, { recursive: true, force: true });

			return plugin;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to load plugin from npm ${packageName}: ${message}`);
		}
	}

	/**
	 * Unload plugin and clean up resources
	 */
	async unload(pluginId: string): Promise<void> {
		// Stop watching if enabled
		this.stopWatching(pluginId);

		// Remove from cache
		this.loadedPlugins.delete(pluginId);
		this.hotReloadCallbacks.delete(pluginId);

		// Clear require cache
		const pluginPath = path.join(this.pluginDir, pluginId);
		for (const key of Object.keys(require.cache)) {
			if (key.startsWith(pluginPath)) {
				delete require.cache[key];
			}
		}
	}

	/**
	 * Reload plugin (hot reload)
	 */
	async reload(pluginId: string): Promise<Plugin> {
		const pluginPath = path.join(this.pluginDir, pluginId);

		// Unload current version
		await this.unload(pluginId);

		// Load new version
		const plugin = await this.load(pluginPath);

		// Trigger callbacks
		const callbacks = this.hotReloadCallbacks.get(pluginId) || [];
		for (const callback of callbacks) {
			callback(plugin);
		}

		return plugin;
	}

	/**
	 * Enable hot reload for a plugin
	 */
	enableHotReload(pluginId: string, callback?: (plugin: Plugin) => void): void {
		if (callback) {
			const callbacks = this.hotReloadCallbacks.get(pluginId) || [];
			callbacks.push(callback);
			this.hotReloadCallbacks.set(pluginId, callbacks);
		}

		// Start watching plugin directory
		this.startWatching(pluginId);
	}

	/**
	 * Disable hot reload for a plugin
	 */
	disableHotReload(pluginId: string): void {
		this.stopWatching(pluginId);
		this.hotReloadCallbacks.delete(pluginId);
	}

	/**
	 * Get loaded module for a plugin
	 */
	getModule(pluginId: string): NodeModule | undefined {
		return this.loadedPlugins.get(pluginId);
	}

	/**
	 * Check if plugin is loaded
	 */
	isLoaded(pluginId: string): boolean {
		return this.loadedPlugins.has(pluginId);
	}

	/**
	 * Load plugin manifest
	 */
	private async loadManifest(pluginPath: string): Promise<PluginManifest> {
		const manifestPath = path.join(pluginPath, 'package.json');

		try {
			const content = await fs.readFile(manifestPath, 'utf-8');
			const pkg = JSON.parse(content) as Record<string, unknown>;

			// Extract n8n plugin manifest
			const n8nPlugin = pkg.n8nPlugin as PluginManifest | undefined;
			if (!n8nPlugin) {
				throw new Error('Missing n8nPlugin field in package.json');
			}

			// Merge package.json fields with plugin manifest
			return {
				...n8nPlugin,
				name: (pkg.name as string) || n8nPlugin.name,
				version: (pkg.version as string) || n8nPlugin.version,
				description: (pkg.description as string) || n8nPlugin.description,
				author:
					typeof pkg.author === 'string'
						? { name: pkg.author }
						: (pkg.author as PluginManifest['author']) || n8nPlugin.author,
				license: (pkg.license as string) || n8nPlugin.license || 'MIT',
				main: (pkg.main as string) || n8nPlugin.main || 'index.js',
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to load manifest: ${message}`);
		}
	}

	/**
	 * Load Node module
	 */
	private async loadModule(modulePath: string): Promise<NodeModule> {
		try {
			// Check if file exists
			await fs.access(modulePath);

			// Load module
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const module = require(modulePath);
			return module;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to load module ${modulePath}: ${message}`);
		}
	}

	/**
	 * Start watching plugin directory for changes
	 */
	private startWatching(pluginId: string): void {
		if (this.watchedPaths.has(pluginId)) {
			return;
		}

		const pluginPath = path.join(this.pluginDir, pluginId);

		const watcher = fs.watch(pluginPath, { recursive: true }, async (eventType, filename) => {
			if (filename && (filename.endsWith('.js') || filename.endsWith('.ts'))) {
				console.log(`Plugin ${pluginId} changed, reloading...`);
				try {
					await this.reload(pluginId);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`Failed to reload plugin ${pluginId}: ${message}`);
				}
			}
		}) as NodeJS.FSWatcher;

		this.watchedPaths.set(pluginId, watcher);
	}

	/**
	 * Stop watching plugin directory
	 */
	private stopWatching(pluginId: string): void {
		const watcher = this.watchedPaths.get(pluginId);
		if (watcher) {
			watcher.close();
			this.watchedPaths.delete(pluginId);
		}
	}

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return createHash('sha256').update(Date.now().toString()).digest('hex').substring(0, 16);
	}

	/**
	 * Cleanup all resources
	 */
	async cleanup(): Promise<void> {
		// Stop all watchers
		for (const pluginId of this.watchedPaths.keys()) {
			this.stopWatching(pluginId);
		}

		// Clear all caches
		this.loadedPlugins.clear();
		this.hotReloadCallbacks.clear();
	}
}

/**
 * Dependency resolver for plugins
 */
export class DependencyLoader {
	constructor(private loader: PluginLoader) {}

	/**
	 * Load plugin with all its dependencies
	 */
	async loadWithDependencies(pluginId: string, pluginPath: string): Promise<Plugin[]> {
		const loaded: Plugin[] = [];
		const toLoad = new Set<string>([pluginId]);
		const loading = new Map<string, Promise<Plugin>>();

		while (toLoad.size > 0) {
			const current = Array.from(toLoad)[0];
			toLoad.delete(current);

			// Skip if already loading or loaded
			if (loading.has(current) || loaded.some((p) => p.manifest.id === current)) {
				continue;
			}

			// Load plugin
			const loadPromise = this.loader.load(current === pluginId ? pluginPath : current);
			loading.set(current, loadPromise);

			const plugin = await loadPromise;
			loaded.push(plugin);

			// Add dependencies to queue
			for (const dep of plugin.manifest.dependencies) {
				if (!dep.optional) {
					toLoad.add(dep.name);
				}
			}
		}

		return loaded;
	}

	/**
	 * Resolve dependency order
	 */
	resolveDependencyOrder(plugins: Plugin[]): Plugin[] {
		const sorted: Plugin[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (plugin: Plugin): void => {
			const pluginId = plugin.manifest.id;

			if (visited.has(pluginId)) {
				return;
			}

			if (visiting.has(pluginId)) {
				throw new Error(`Circular dependency detected: ${pluginId}`);
			}

			visiting.add(pluginId);

			// Visit dependencies first
			for (const dep of plugin.manifest.dependencies) {
				const depPlugin = plugins.find((p) => p.manifest.id === dep.name);
				if (depPlugin) {
					visit(depPlugin);
				}
			}

			visiting.delete(pluginId);
			visited.add(pluginId);
			sorted.push(plugin);
		};

		for (const plugin of plugins) {
			visit(plugin);
		}

		return sorted;
	}
}
