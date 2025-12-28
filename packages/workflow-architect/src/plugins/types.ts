import { z } from 'zod';

/**
 * Extension points where plugins can hook into
 */
export enum ExtensionPoint {
	NODE = 'node',
	TRIGGER = 'trigger',
	CREDENTIAL = 'credential',
	UI = 'ui',
	API = 'api',
	WORKFLOW = 'workflow',
	EXECUTION = 'execution',
}

/**
 * Hook types for lifecycle events
 */
export enum HookType {
	BEFORE_EXECUTE = 'before_execute',
	AFTER_EXECUTE = 'after_execute',
	ON_ERROR = 'on_error',
	ON_LOAD = 'on_load',
	ON_UNLOAD = 'on_unload',
	BEFORE_SAVE = 'before_save',
	AFTER_SAVE = 'after_save',
	BEFORE_DELETE = 'before_delete',
	AFTER_DELETE = 'after_delete',
}

/**
 * Plugin lifecycle states
 */
export enum PluginState {
	INSTALLED = 'installed',
	ACTIVE = 'active',
	DISABLED = 'disabled',
	ERROR = 'error',
	UPDATING = 'updating',
	UNINSTALLING = 'uninstalling',
}

/**
 * Permission types for plugins
 */
export enum PluginPermission {
	NETWORK = 'network',
	STORAGE = 'storage',
	WORKFLOWS = 'workflows',
	CREDENTIALS = 'credentials',
	EXECUTIONS = 'executions',
	USERS = 'users',
	ADMIN = 'admin',
}

/**
 * Resource limit types
 */
export interface ResourceLimits {
	maxMemoryMB: number;
	maxCpuTimeMs: number;
	maxExecutionTimeMs: number;
	maxStorageMB: number;
	maxNetworkRequests: number;
}

/**
 * Plugin dependency specification
 */
export const PluginDependencySchema = z.object({
	name: z.string().min(1),
	version: z.string().regex(/^[~^]?\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/),
	optional: z.boolean().default(false),
});

export type PluginDependency = z.infer<typeof PluginDependencySchema>;

/**
 * Plugin manifest schema
 */
export const PluginManifestSchema = z.object({
	id: z.string().min(1).regex(/^[a-z0-9-]+$/),
	name: z.string().min(1),
	version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/),
	description: z.string(),
	author: z.object({
		name: z.string().min(1),
		email: z.string().email().optional(),
		url: z.string().url().optional(),
	}),
	license: z.string().default('MIT'),
	repository: z.string().url().optional(),
	homepage: z.string().url().optional(),
	keywords: z.array(z.string()).default([]),
	main: z.string().default('index.js'),
	permissions: z.array(z.nativeEnum(PluginPermission)).default([]),
	hooks: z.array(z.nativeEnum(HookType)).default([]),
	extensionPoints: z.array(z.nativeEnum(ExtensionPoint)).default([]),
	dependencies: z.array(PluginDependencySchema).default([]),
	peerDependencies: z.array(PluginDependencySchema).default([]),
	minVersion: z.string().optional(),
	maxVersion: z.string().optional(),
	resourceLimits: z
		.object({
			maxMemoryMB: z.number().positive().default(100),
			maxCpuTimeMs: z.number().positive().default(5000),
			maxExecutionTimeMs: z.number().positive().default(30000),
			maxStorageMB: z.number().positive().default(50),
			maxNetworkRequests: z.number().positive().default(100),
		})
		.default({}),
	config: z.record(z.unknown()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Plugin configuration schema
 */
export const PluginConfigSchema = z.object({
	enabled: z.boolean().default(true),
	settings: z.record(z.unknown()).default({}),
	overrideLimits: z
		.object({
			maxMemoryMB: z.number().positive().optional(),
			maxCpuTimeMs: z.number().positive().optional(),
			maxExecutionTimeMs: z.number().positive().optional(),
			maxStorageMB: z.number().positive().optional(),
			maxNetworkRequests: z.number().positive().optional(),
		})
		.optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Plugin interface
 */
export interface Plugin {
	manifest: PluginManifest;
	config: PluginConfig;
	state: PluginState;
	installedAt: Date;
	updatedAt: Date;
	activatedAt?: Date;
	error?: string;
	exports?: Record<string, unknown>;
}

/**
 * Plugin installation info
 */
export interface PluginInstallation {
	pluginId: string;
	version: string;
	installedBy: string;
	installedAt: Date;
	config: PluginConfig;
	state: PluginState;
}

/**
 * Plugin version info
 */
export interface PluginVersion {
	pluginId: string;
	version: string;
	releaseDate: Date;
	changelog: string;
	downloadUrl: string;
	checksum: string;
	downloads: number;
	deprecated: boolean;
}

/**
 * Hook handler function type
 */
export type HookHandler<TContext = unknown, TResult = unknown> = (
	context: TContext,
) => Promise<TResult> | TResult;

/**
 * Hook subscription
 */
export interface HookSubscription {
	id: string;
	pluginId: string;
	hookType: HookType;
	handler: HookHandler;
	priority: number;
	once: boolean;
}

/**
 * Plugin execution context
 */
export interface PluginExecutionContext {
	pluginId: string;
	userId?: string;
	workflowId?: string;
	executionId?: string;
	data?: Record<string, unknown>;
	permissions: Set<PluginPermission>;
}

/**
 * Plugin execution result
 */
export interface PluginExecutionResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	executionTime: number;
	resourceUsage: {
		memoryUsedMB: number;
		cpuTimeMs: number;
	};
}

/**
 * Plugin marketplace listing
 */
export interface PluginListing {
	id: string;
	name: string;
	description: string;
	version: string;
	author: {
		name: string;
		email?: string;
		url?: string;
	};
	icon?: string;
	screenshots: string[];
	tags: string[];
	rating: number;
	ratingCount: number;
	downloads: number;
	verified: boolean;
	featured: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Plugin marketplace details
 */
export interface PluginDetails extends PluginListing {
	readme: string;
	changelog: string;
	versions: PluginVersion[];
	dependencies: PluginDependency[];
	permissions: PluginPermission[];
	reviews: PluginReview[];
	support: {
		email?: string;
		url?: string;
		issues?: string;
	};
}

/**
 * Plugin review
 */
export interface PluginReview {
	id: string;
	pluginId: string;
	userId: string;
	userName: string;
	rating: number;
	comment: string;
	version: string;
	createdAt: Date;
	helpful: number;
}

/**
 * Plugin update info
 */
export interface PluginUpdate {
	pluginId: string;
	currentVersion: string;
	latestVersion: string;
	releaseDate: Date;
	changelog: string;
	breaking: boolean;
	security: boolean;
}

/**
 * Plugin filter options
 */
export interface PluginFilters {
	state?: PluginState | PluginState[];
	extensionPoint?: ExtensionPoint | ExtensionPoint[];
	permission?: PluginPermission | PluginPermission[];
	search?: string;
	author?: string;
	installed?: boolean;
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
	valid: boolean;
	errors: Array<{
		field: string;
		message: string;
		code: string;
	}>;
	warnings: Array<{
		field: string;
		message: string;
		code: string;
	}>;
}

/**
 * Plugin test context
 */
export interface PluginTestContext {
	pluginId: string;
	mockAPI: Record<string, unknown>;
	mockStorage: Map<string, unknown>;
	mockNetwork: boolean;
	hooks: Map<HookType, HookHandler[]>;
}

/**
 * Plugin template type
 */
export enum PluginTemplateType {
	BASIC = 'basic',
	NODE = 'node',
	TRIGGER = 'trigger',
	INTEGRATION = 'integration',
	UI_EXTENSION = 'ui-extension',
	API_EXTENSION = 'api-extension',
}

/**
 * Plugin template options
 */
export interface PluginTemplateOptions {
	type: PluginTemplateType;
	name: string;
	description: string;
	author: string;
	email?: string;
	license?: string;
	permissions?: PluginPermission[];
	extensionPoints?: ExtensionPoint[];
}

/**
 * Plugin build options
 */
export interface PluginBuildOptions {
	minify: boolean;
	sourcemap: boolean;
	target: 'node' | 'browser';
	format: 'esm' | 'cjs';
	externals: string[];
}

/**
 * Plugin CLI command
 */
export type PluginCLICommand = 'create' | 'build' | 'test' | 'publish' | 'dev' | 'validate';

/**
 * Plugin storage interface
 */
export interface PluginStorage {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set<T = unknown>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<void>;
	list(prefix?: string): Promise<string[]>;
	clear(): Promise<void>;
}

/**
 * Plugin HTTP client interface
 */
export interface PluginHttpClient {
	get<T = unknown>(url: string, options?: RequestInit): Promise<T>;
	post<T = unknown>(url: string, data?: unknown, options?: RequestInit): Promise<T>;
	put<T = unknown>(url: string, data?: unknown, options?: RequestInit): Promise<T>;
	delete<T = unknown>(url: string, options?: RequestInit): Promise<T>;
}

/**
 * Plugin event emitter interface
 */
export interface PluginEventEmitter {
	emit(event: string, data?: unknown): void;
	on(event: string, handler: (data?: unknown) => void): () => void;
	once(event: string, handler: (data?: unknown) => void): () => void;
	off(event: string, handler: (data?: unknown) => void): void;
}
