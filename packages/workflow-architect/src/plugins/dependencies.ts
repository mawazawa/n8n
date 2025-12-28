import semver from 'semver';
import type { Plugin, PluginDependency } from './types';

/**
 * Dependency graph node
 */
interface DependencyNode {
	pluginId: string;
	version: string;
	dependencies: PluginDependency[];
	dependents: Set<string>;
}

/**
 * Dependency conflict
 */
export interface DependencyConflict {
	pluginId: string;
	dependency: string;
	requiredVersion: string;
	installedVersion: string;
	conflictingWith: string[];
}

/**
 * Dependency resolution result
 */
export interface DependencyResolution {
	resolved: Plugin[];
	conflicts: DependencyConflict[];
	missing: string[];
	order: string[];
}

/**
 * Dependency resolver for plugin dependencies
 */
export class DependencyResolver {
	private dependencyGraph = new Map<string, DependencyNode>();

	/**
	 * Build dependency graph from plugins
	 */
	buildGraph(plugins: Plugin[]): void {
		this.dependencyGraph.clear();

		// Create nodes
		for (const plugin of plugins) {
			const node: DependencyNode = {
				pluginId: plugin.manifest.id,
				version: plugin.manifest.version,
				dependencies: plugin.manifest.dependencies,
				dependents: new Set(),
			};
			this.dependencyGraph.set(plugin.manifest.id, node);
		}

		// Build edges
		for (const plugin of plugins) {
			for (const dep of plugin.manifest.dependencies) {
				const depNode = this.dependencyGraph.get(dep.name);
				if (depNode) {
					depNode.dependents.add(plugin.manifest.id);
				}
			}
		}
	}

	/**
	 * Resolve dependencies for a plugin
	 */
	async resolve(plugin: Plugin, availablePlugins: Plugin[]): Promise<DependencyResolution> {
		const resolved: Plugin[] = [];
		const conflicts: DependencyConflict[] = [];
		const missing: string[] = [];
		const visited = new Set<string>();

		// Helper to resolve recursively
		const resolveRecursive = (current: Plugin): void => {
			const pluginId = current.manifest.id;

			// Skip if already visited
			if (visited.has(pluginId)) {
				return;
			}

			visited.add(pluginId);

			// Resolve dependencies first
			for (const dep of current.manifest.dependencies) {
				// Find matching plugin
				const depPlugin = availablePlugins.find((p) => p.manifest.id === dep.name);

				if (!depPlugin) {
					if (!dep.optional) {
						missing.push(dep.name);
					}
					continue;
				}

				// Check version compatibility
				if (!this.isVersionCompatible(depPlugin.manifest.version, dep.version)) {
					conflicts.push({
						pluginId: current.manifest.id,
						dependency: dep.name,
						requiredVersion: dep.version,
						installedVersion: depPlugin.manifest.version,
						conflictingWith: [],
					});
					continue;
				}

				// Resolve dependencies recursively
				resolveRecursive(depPlugin);
			}

			// Add current plugin
			resolved.push(current);
		};

		// Start resolution
		resolveRecursive(plugin);

		// Determine installation order (topological sort)
		const order = this.topologicalSort(resolved);

		return { resolved, conflicts, missing, order };
	}

	/**
	 * Check for circular dependencies
	 */
	hasCircularDependency(plugin: Plugin, availablePlugins: Plugin[]): string[] | null {
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const detectCycle = (pluginId: string, path: string[]): string[] | null => {
			visited.add(pluginId);
			recursionStack.add(pluginId);

			const current = availablePlugins.find((p) => p.manifest.id === pluginId);
			if (!current) {
				return null;
			}

			for (const dep of current.manifest.dependencies) {
				if (!visited.has(dep.name)) {
					const cycle = detectCycle(dep.name, [...path, dep.name]);
					if (cycle) {
						return cycle;
					}
				} else if (recursionStack.has(dep.name)) {
					// Found cycle
					return [...path, dep.name];
				}
			}

			recursionStack.delete(pluginId);
			return null;
		};

		return detectCycle(plugin.manifest.id, [plugin.manifest.id]);
	}

	/**
	 * Find dependency conflicts
	 */
	findConflicts(plugins: Plugin[]): DependencyConflict[] {
		const conflicts: DependencyConflict[] = [];
		const pluginMap = new Map(plugins.map((p) => [p.manifest.id, p]));

		for (const plugin of plugins) {
			for (const dep of plugin.manifest.dependencies) {
				const depPlugin = pluginMap.get(dep.name);
				if (!depPlugin) {
					continue;
				}

				if (!this.isVersionCompatible(depPlugin.manifest.version, dep.version)) {
					// Find other plugins that depend on this
					const conflictingWith = plugins
						.filter((p) => p.manifest.id !== plugin.manifest.id)
						.filter((p) => p.manifest.dependencies.some((d) => d.name === dep.name))
						.map((p) => p.manifest.id);

					conflicts.push({
						pluginId: plugin.manifest.id,
						dependency: dep.name,
						requiredVersion: dep.version,
						installedVersion: depPlugin.manifest.version,
						conflictingWith,
					});
				}
			}
		}

		return conflicts;
	}

	/**
	 * Find missing dependencies
	 */
	findMissingDependencies(plugin: Plugin, availablePlugins: Plugin[]): string[] {
		const missing: string[] = [];
		const availableIds = new Set(availablePlugins.map((p) => p.manifest.id));

		for (const dep of plugin.manifest.dependencies) {
			if (!dep.optional && !availableIds.has(dep.name)) {
				missing.push(dep.name);
			}
		}

		return missing;
	}

	/**
	 * Get all dependents of a plugin
	 */
	getDependents(pluginId: string): string[] {
		const node = this.dependencyGraph.get(pluginId);
		return node ? Array.from(node.dependents) : [];
	}

	/**
	 * Get all dependencies of a plugin
	 */
	getDependencies(pluginId: string): PluginDependency[] {
		const node = this.dependencyGraph.get(pluginId);
		return node ? node.dependencies : [];
	}

	/**
	 * Check if plugin can be safely removed
	 */
	canRemove(pluginId: string): { canRemove: boolean; blockedBy: string[] } {
		const dependents = this.getDependents(pluginId);
		return {
			canRemove: dependents.length === 0,
			blockedBy: dependents,
		};
	}

	/**
	 * Topological sort for installation order
	 */
	private topologicalSort(plugins: Plugin[]): string[] {
		const sorted: string[] = [];
		const visited = new Set<string>();
		const pluginMap = new Map(plugins.map((p) => [p.manifest.id, p]));

		const visit = (pluginId: string): void => {
			if (visited.has(pluginId)) {
				return;
			}

			visited.add(pluginId);

			const plugin = pluginMap.get(pluginId);
			if (!plugin) {
				return;
			}

			// Visit dependencies first
			for (const dep of plugin.manifest.dependencies) {
				visit(dep.name);
			}

			sorted.push(pluginId);
		};

		for (const plugin of plugins) {
			visit(plugin.manifest.id);
		}

		return sorted;
	}

	/**
	 * Check if version satisfies constraint
	 */
	private isVersionCompatible(version: string, constraint: string): boolean {
		try {
			return semver.satisfies(version, constraint);
		} catch {
			return false;
		}
	}

	/**
	 * Suggest compatible version
	 */
	suggestCompatibleVersion(
		dependency: string,
		constraint: string,
		availableVersions: string[],
	): string | null {
		const compatibleVersions = availableVersions.filter((v) =>
			this.isVersionCompatible(v, constraint),
		);

		if (compatibleVersions.length === 0) {
			return null;
		}

		// Return latest compatible version
		return compatibleVersions.sort((a, b) => (semver.gt(a, b) ? -1 : 1))[0];
	}

	/**
	 * Generate dependency tree
	 */
	generateDependencyTree(plugin: Plugin, availablePlugins: Plugin[], depth: number = 0): string {
		const indent = '  '.repeat(depth);
		let tree = `${indent}${plugin.manifest.id}@${plugin.manifest.version}\n`;

		for (const dep of plugin.manifest.dependencies) {
			const depPlugin = availablePlugins.find((p) => p.manifest.id === dep.name);
			if (depPlugin) {
				tree += this.generateDependencyTree(depPlugin, availablePlugins, depth + 1);
			} else {
				tree += `${indent}  ${dep.name}@${dep.version} (missing)\n`;
			}
		}

		return tree;
	}

	/**
	 * Clear dependency graph
	 */
	clear(): void {
		this.dependencyGraph.clear();
	}
}

/**
 * Peer dependency manager
 */
export class PeerDependencyManager {
	/**
	 * Validate peer dependencies
	 */
	validate(plugin: Plugin, installedPlugins: Plugin[]): {
		valid: boolean;
		missing: string[];
		incompatible: Array<{ name: string; required: string; installed: string }>;
	} {
		const missing: string[] = [];
		const incompatible: Array<{ name: string; required: string; installed: string }> = [];

		for (const peer of plugin.manifest.peerDependencies) {
			const installed = installedPlugins.find((p) => p.manifest.id === peer.name);

			if (!installed) {
				if (!peer.optional) {
					missing.push(peer.name);
				}
				continue;
			}

			if (!semver.satisfies(installed.manifest.version, peer.version)) {
				incompatible.push({
					name: peer.name,
					required: peer.version,
					installed: installed.manifest.version,
				});
			}
		}

		return {
			valid: missing.length === 0 && incompatible.length === 0,
			missing,
			incompatible,
		};
	}
}
