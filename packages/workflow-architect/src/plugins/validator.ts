import { z } from 'zod';
import semver from 'semver';
import type { PluginManifest, PluginValidationResult } from './types';
import { PluginManifestSchema } from './types';

/**
 * Security validation rules
 */
const SECURITY_RULES = {
	// Disallowed package names (potentially malicious)
	disallowedPackages: [
		'eval',
		'child_process',
		'fs',
		'process',
		'cluster',
		'worker_threads',
		'os',
		'path',
	],

	// Suspicious patterns in code
	suspiciousPatterns: [
		/eval\(/g,
		/Function\(/g,
		/require\(/g,
		/import\(/g,
		/process\.env/g,
		/child_process/g,
		/exec\(/g,
		/spawn\(/g,
		/__dirname/g,
		/__filename/g,
	],

	// Maximum file size (10MB)
	maxFileSize: 10 * 1024 * 1024,

	// Maximum dependencies
	maxDependencies: 50,
};

/**
 * Plugin manifest validator
 */
export class ManifestValidator {
	private errors: Array<{ field: string; message: string; code: string }> = [];
	private warnings: Array<{ field: string; message: string; code: string }> = [];

	/**
	 * Validate plugin manifest
	 */
	validate(manifest: unknown): PluginValidationResult {
		this.errors = [];
		this.warnings = [];

		// Schema validation
		const schemaResult = this.validateSchema(manifest);
		if (!schemaResult.success) {
			return {
				valid: false,
				errors: this.errors,
				warnings: this.warnings,
			};
		}

		const validManifest = schemaResult.data;

		// Additional validations
		this.validateVersionFormat(validManifest);
		this.validateDependencies(validManifest);
		this.validatePermissions(validManifest);
		this.validateResourceLimits(validManifest);
		this.validateSecurity(validManifest);

		return {
			valid: this.errors.length === 0,
			errors: this.errors,
			warnings: this.warnings,
		};
	}

	/**
	 * Validate schema using Zod
	 */
	private validateSchema(manifest: unknown): z.SafeParseReturnType<unknown, PluginManifest> {
		const result = PluginManifestSchema.safeParse(manifest);

		if (!result.success) {
			for (const error of result.error.errors) {
				this.errors.push({
					field: error.path.join('.'),
					message: error.message,
					code: 'SCHEMA_VALIDATION_ERROR',
				});
			}
		}

		return result;
	}

	/**
	 * Validate version format
	 */
	private validateVersionFormat(manifest: PluginManifest): void {
		if (!semver.valid(manifest.version)) {
			this.errors.push({
				field: 'version',
				message: `Invalid semantic version: ${manifest.version}`,
				code: 'INVALID_VERSION',
			});
		}

		// Check min/max version constraints
		if (manifest.minVersion && !semver.valid(manifest.minVersion)) {
			this.errors.push({
				field: 'minVersion',
				message: `Invalid minVersion: ${manifest.minVersion}`,
				code: 'INVALID_MIN_VERSION',
			});
		}

		if (manifest.maxVersion && !semver.valid(manifest.maxVersion)) {
			this.errors.push({
				field: 'maxVersion',
				message: `Invalid maxVersion: ${manifest.maxVersion}`,
				code: 'INVALID_MAX_VERSION',
			});
		}

		// Warn about pre-release versions
		if (semver.prerelease(manifest.version)) {
			this.warnings.push({
				field: 'version',
				message: 'Pre-release version detected',
				code: 'PRERELEASE_VERSION',
			});
		}
	}

	/**
	 * Validate dependencies
	 */
	private validateDependencies(manifest: PluginManifest): void {
		const allDeps = [...manifest.dependencies, ...manifest.peerDependencies];

		// Check dependency count
		if (allDeps.length > SECURITY_RULES.maxDependencies) {
			this.errors.push({
				field: 'dependencies',
				message: `Too many dependencies: ${allDeps.length} (max: ${SECURITY_RULES.maxDependencies})`,
				code: 'TOO_MANY_DEPENDENCIES',
			});
		}

		// Validate each dependency
		for (const dep of allDeps) {
			// Check version format
			if (!this.isValidVersionConstraint(dep.version)) {
				this.errors.push({
					field: 'dependencies',
					message: `Invalid version constraint for ${dep.name}: ${dep.version}`,
					code: 'INVALID_DEPENDENCY_VERSION',
				});
			}

			// Check for disallowed packages
			if (SECURITY_RULES.disallowedPackages.includes(dep.name)) {
				this.errors.push({
					field: 'dependencies',
					message: `Disallowed dependency: ${dep.name}`,
					code: 'DISALLOWED_DEPENDENCY',
				});
			}

			// Warn about optional dependencies
			if (dep.optional) {
				this.warnings.push({
					field: 'dependencies',
					message: `Optional dependency: ${dep.name}`,
					code: 'OPTIONAL_DEPENDENCY',
				});
			}
		}

		// Check for circular dependencies
		const depNames = new Set(allDeps.map((d) => d.name));
		if (depNames.has(manifest.id)) {
			this.errors.push({
				field: 'dependencies',
				message: 'Circular dependency detected: plugin depends on itself',
				code: 'CIRCULAR_DEPENDENCY',
			});
		}
	}

	/**
	 * Validate permissions
	 */
	private validatePermissions(manifest: PluginManifest): void {
		// Warn about high-risk permissions
		const highRiskPermissions = ['CREDENTIALS', 'ADMIN'];
		for (const permission of manifest.permissions) {
			if (highRiskPermissions.includes(permission)) {
				this.warnings.push({
					field: 'permissions',
					message: `High-risk permission requested: ${permission}`,
					code: 'HIGH_RISK_PERMISSION',
				});
			}
		}

		// Check for unnecessary permissions
		if (manifest.permissions.length === 0 && manifest.extensionPoints.length > 0) {
			this.warnings.push({
				field: 'permissions',
				message: 'No permissions requested but extension points defined',
				code: 'MISSING_PERMISSIONS',
			});
		}
	}

	/**
	 * Validate resource limits
	 */
	private validateResourceLimits(manifest: PluginManifest): void {
		const limits = manifest.resourceLimits;

		if (limits) {
			// Check memory limit
			if (limits.maxMemoryMB > 500) {
				this.warnings.push({
					field: 'resourceLimits.maxMemoryMB',
					message: `High memory limit: ${limits.maxMemoryMB}MB`,
					code: 'HIGH_MEMORY_LIMIT',
				});
			}

			// Check execution time
			if (limits.maxExecutionTimeMs > 60000) {
				this.warnings.push({
					field: 'resourceLimits.maxExecutionTimeMs',
					message: `Long execution timeout: ${limits.maxExecutionTimeMs}ms`,
					code: 'LONG_EXECUTION_TIME',
				});
			}

			// Check storage limit
			if (limits.maxStorageMB > 1000) {
				this.warnings.push({
					field: 'resourceLimits.maxStorageMB',
					message: `High storage limit: ${limits.maxStorageMB}MB`,
					code: 'HIGH_STORAGE_LIMIT',
				});
			}

			// Validate limits are positive
			if (limits.maxMemoryMB <= 0) {
				this.errors.push({
					field: 'resourceLimits.maxMemoryMB',
					message: 'Memory limit must be positive',
					code: 'INVALID_MEMORY_LIMIT',
				});
			}
		}
	}

	/**
	 * Validate security aspects
	 */
	private validateSecurity(manifest: PluginManifest): void {
		// Check for suspicious patterns in description
		for (const pattern of SECURITY_RULES.suspiciousPatterns) {
			if (pattern.test(manifest.description)) {
				this.warnings.push({
					field: 'description',
					message: 'Suspicious pattern detected in description',
					code: 'SUSPICIOUS_PATTERN',
				});
			}
		}

		// Validate author information
		if (!manifest.author.email && !manifest.repository) {
			this.warnings.push({
				field: 'author',
				message: 'No contact information provided',
				code: 'NO_CONTACT_INFO',
			});
		}

		// Check for missing license
		if (!manifest.license || manifest.license === 'UNLICENSED') {
			this.warnings.push({
				field: 'license',
				message: 'No license specified',
				code: 'NO_LICENSE',
			});
		}

		// Validate repository URL
		if (manifest.repository && !this.isValidUrl(manifest.repository)) {
			this.errors.push({
				field: 'repository',
				message: 'Invalid repository URL',
				code: 'INVALID_REPOSITORY_URL',
			});
		}
	}

	/**
	 * Validate version constraint format
	 */
	private isValidVersionConstraint(constraint: string): boolean {
		// Remove constraint operators
		const version = constraint.replace(/^[\^~>=<]*/, '');
		return semver.valid(version) !== null || constraint === '*' || constraint === 'latest';
	}

	/**
	 * Validate URL format
	 */
	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Code validator for plugin source code
 */
export class CodeValidator {
	private errors: Array<{ line: number; message: string; code: string }> = [];
	private warnings: Array<{ line: number; message: string; code: string }> = [];

	/**
	 * Validate plugin code
	 */
	validate(code: string): { valid: boolean; errors: typeof this.errors; warnings: typeof this.warnings } {
		this.errors = [];
		this.warnings = [];

		const lines = code.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Check for suspicious patterns
			for (const pattern of SECURITY_RULES.suspiciousPatterns) {
				if (pattern.test(line)) {
					this.warnings.push({
						line: i + 1,
						message: `Suspicious pattern detected: ${pattern.source}`,
						code: 'SUSPICIOUS_CODE_PATTERN',
					});
				}
			}

			// Check for direct Node.js API usage
			if (line.includes('require(') && !line.includes('//')) {
				this.warnings.push({
					line: i + 1,
					message: 'Direct require() usage detected',
					code: 'DIRECT_REQUIRE',
				});
			}
		}

		return {
			valid: this.errors.length === 0,
			errors: this.errors,
			warnings: this.warnings,
		};
	}
}

/**
 * Compatibility validator
 */
export class CompatibilityValidator {
	constructor(private platformVersion: string) {}

	/**
	 * Check if plugin is compatible with platform version
	 */
	isCompatible(manifest: PluginManifest): boolean {
		if (manifest.minVersion && semver.lt(this.platformVersion, manifest.minVersion)) {
			return false;
		}

		if (manifest.maxVersion && semver.gt(this.platformVersion, manifest.maxVersion)) {
			return false;
		}

		return true;
	}

	/**
	 * Get compatibility message
	 */
	getCompatibilityMessage(manifest: PluginManifest): string {
		if (manifest.minVersion && semver.lt(this.platformVersion, manifest.minVersion)) {
			return `Requires platform version ${manifest.minVersion} or higher (current: ${this.platformVersion})`;
		}

		if (manifest.maxVersion && semver.gt(this.platformVersion, manifest.maxVersion)) {
			return `Requires platform version ${manifest.maxVersion} or lower (current: ${this.platformVersion})`;
		}

		return 'Compatible';
	}
}
