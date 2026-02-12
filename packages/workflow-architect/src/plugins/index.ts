/**
 * Plugin & Extension System
 * Complete plugin system with marketplace, security, and development tools
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type {
	Plugin,
	PluginManifest,
	PluginConfig,
	PluginDependency,
	PluginInstallation,
	PluginVersion,
	PluginFilters,
	PluginValidationResult,
	PluginExecutionContext,
	PluginExecutionResult,
	PluginListing,
	PluginDetails,
	PluginReview,
	PluginUpdate,
	PluginTestContext,
	PluginTemplateOptions,
	PluginBuildOptions,
	PluginStorage,
	PluginHttpClient,
	PluginEventEmitter,
	HookHandler,
	HookSubscription,
	ResourceLimits,
} from './types';

export {
	ExtensionPoint,
	HookType,
	PluginState,
	PluginPermission,
	PluginTemplateType,
	PluginManifestSchema,
	PluginDependencySchema,
	PluginConfigSchema,
} from './types';

// ============================================================================
// CORE EXPORTS
// ============================================================================

// Registry
export { PluginRegistry } from './registry';

// Loader
export { PluginLoader, DependencyLoader } from './loader';

// Sandbox
export {
	PluginSandbox,
	VMSandbox,
	ExecutionTimeoutError,
	MemoryLimitError,
	CpuTimeLimitError,
} from './sandbox';

// Hooks
export { HookManager, HookMiddleware, WithHooks } from './hooks';

// API
export {
	PluginAPI,
	InMemoryPluginStorage,
	ProxiedHttpClient,
	SimpleEventEmitter,
} from './api';

// Permissions
export { PermissionManager } from './permissions';
export type { PermissionRequest } from './permissions';

// Marketplace
export { MarketplaceClient } from './marketplace';
export type { MarketplaceSearchFilters } from './marketplace';

// Validator
export { ManifestValidator, CodeValidator, CompatibilityValidator } from './validator';

// Updater
export { PluginUpdater, UpdateStrategy } from './updater';
export type { UpdateSchedule } from './updater';

// Dependencies
export { DependencyResolver, PeerDependencyManager } from './dependencies';
export type { DependencyConflict, DependencyResolution } from './dependencies';

// Config
export {
	ConfigSchemaBuilder,
	ConfigSectionBuilder,
	ConfigValidator,
	ConfigUIGenerator,
	ConfigUIComponent,
} from './config';
export type { ConfigField, ConfigSection, ConfigSchema } from './config';

// Testing
export {
	PluginTestRunner,
	MockPluginStorage,
	MockHttpClient,
	MockEventEmitter,
	TestHelpers,
	IntegrationTestHelper,
} from './testing';

// CLI
export { PluginCLI, runCLI } from './cli';

// Docs
export { DocGenerator, ReadmeGenerator } from './docs';

// Templates
export { generateBasicTemplate } from './templates/basic';
export { generateNodeTemplate } from './templates/node';
export { generateIntegrationTemplate } from './templates/integration';

// ============================================================================
// PLUGIN SYSTEM CLASS
// ============================================================================

/**
 * Main PluginSystem class that orchestrates all components
 */
export class PluginSystem {
	public readonly registry: PluginRegistry;
	public readonly loader: PluginLoader;
	public readonly sandbox: PluginSandbox;
	public readonly hookManager: HookManager;
	public readonly permissionManager: PermissionManager;
	public readonly marketplace: MarketplaceClient;
	public readonly validator: ManifestValidator;
	public readonly updater: PluginUpdater;
	public readonly dependencyResolver: DependencyResolver;

	constructor(config?: {
		pluginDir?: string;
		supabaseUrl?: string;
		supabaseKey?: string;
		platformVersion?: string;
	}) {
		// Initialize core components
		this.registry = new PluginRegistry(config?.supabaseUrl, config?.supabaseKey);
		this.loader = new PluginLoader(config?.pluginDir);
		this.sandbox = new PluginSandbox();
		this.hookManager = new HookManager();
		this.permissionManager = new PermissionManager(config?.supabaseUrl, config?.supabaseKey);
		this.marketplace = new MarketplaceClient(
			this.registry,
			this.loader,
			config?.supabaseUrl,
			config?.supabaseKey,
		);
		this.validator = new ManifestValidator();
		this.updater = new PluginUpdater(this.registry, this.loader, this.marketplace);
		this.dependencyResolver = new DependencyResolver();
	}

	/**
	 * Initialize the plugin system
	 */
	async initialize(): Promise<void> {
		await this.registry.initialize();
	}

	/**
	 * Install a plugin
	 */
	async install(pluginId: string, version?: string): Promise<void> {
		await this.marketplace.install(pluginId, version);
	}

	/**
	 * Uninstall a plugin
	 */
	async uninstall(pluginId: string): Promise<void> {
		await this.marketplace.uninstall(pluginId);
	}

	/**
	 * Enable a plugin
	 */
	async enable(pluginId: string): Promise<void> {
		await this.registry.updateState(pluginId, PluginState.ACTIVE);
	}

	/**
	 * Disable a plugin
	 */
	async disable(pluginId: string): Promise<void> {
		await this.registry.updateState(pluginId, PluginState.DISABLED);
	}

	/**
	 * Update a plugin
	 */
	async update(pluginId: string, version?: string): Promise<void> {
		await this.updater.update(pluginId, version);
	}

	/**
	 * Check for updates
	 */
	async checkForUpdates(): Promise<PluginUpdate[]> {
		return this.updater.checkForUpdates();
	}

	/**
	 * Get plugin by ID
	 */
	async getPlugin(pluginId: string): Promise<Plugin | undefined> {
		return this.registry.get(pluginId);
	}

	/**
	 * List all plugins
	 */
	async listPlugins(filters?: PluginFilters): Promise<Plugin[]> {
		return this.registry.list(filters);
	}

	/**
	 * Search marketplace
	 */
	async search(query: string): Promise<PluginListing[]> {
		return this.marketplace.search({ query });
	}

	/**
	 * Cleanup and shutdown
	 */
	async cleanup(): Promise<void> {
		await this.sandbox.terminateAll();
		this.hookManager.clear();
		this.updater.cleanup();
		this.dependencyResolver.clear();
		await this.loader.cleanup();
	}
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a new plugin system instance
 */
export function createPluginSystem(config?: {
	pluginDir?: string;
	supabaseUrl?: string;
	supabaseKey?: string;
	platformVersion?: string;
}): PluginSystem {
	return new PluginSystem(config);
}

/**
 * Validate a plugin manifest
 */
export function validateManifest(manifest: unknown): PluginValidationResult {
	const validator = new ManifestValidator();
	return validator.validate(manifest);
}

/**
 * Generate plugin documentation
 */
export function generateDocs(manifest: PluginManifest): string {
	const generator = new DocGenerator();
	return generator.generateFromManifest(manifest);
}

/**
 * Create plugin from template
 */
export function createPlugin(
	type: PluginTemplateType,
	options: PluginTemplateOptions,
): { packageJson: string; indexTs?: string; nodeTs?: string; integrationTs?: string; readme: string } {
	switch (type) {
		case PluginTemplateType.BASIC:
			return generateBasicTemplate(options);
		case PluginTemplateType.NODE:
			return generateNodeTemplate(options);
		case PluginTemplateType.INTEGRATION:
			return generateIntegrationTemplate(options);
		default:
			throw new Error(`Unknown template type: ${type}`);
	}
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default PluginSystem;
