import type { RouteConfig, RouteMatch, HttpMethod } from './types.js';

interface PathPattern {
	regex: RegExp;
	paramNames: string[];
}

interface CompiledRoute {
	route: RouteConfig;
	pattern: PathPattern;
}

/**
 * Gateway router for matching incoming requests to configured routes
 * Supports path parameters (:param) and wildcards (*)
 */
export class GatewayRouter {
	private routes: CompiledRoute[] = [];

	/**
	 * Add a route to the router
	 */
	addRoute(route: RouteConfig): void {
		if (!route.enabled) {
			return;
		}

		const pattern = this.compilePath(route.path);
		const compiled: CompiledRoute = { route, pattern };

		// Insert route based on priority (higher priority first)
		const insertIndex = this.routes.findIndex((r) => r.route.priority < route.priority);
		if (insertIndex === -1) {
			this.routes.push(compiled);
		} else {
			this.routes.splice(insertIndex, 0, compiled);
		}
	}

	/**
	 * Remove a route by path and method
	 */
	removeRoute(path: string, method?: HttpMethod): void {
		this.routes = this.routes.filter((r) => {
			if (r.route.path !== path) return true;
			if (method && r.route.method !== method) return true;
			return false;
		});
	}

	/**
	 * Match a request to a route
	 */
	match(method: HttpMethod, path: string, query: Record<string, string> = {}): RouteMatch | null {
		// Normalize path
		const normalizedPath = this.normalizePath(path);

		for (const compiled of this.routes) {
			// Check method match
			if (compiled.route.method !== method) {
				continue;
			}

			// Check path match
			const match = normalizedPath.match(compiled.pattern.regex);
			if (!match) {
				continue;
			}

			// Extract path parameters
			const params: Record<string, string> = {};
			for (let i = 0; i < compiled.pattern.paramNames.length; i++) {
				const paramName = compiled.pattern.paramNames[i];
				const paramValue = match[i + 1];
				if (paramName && paramValue) {
					params[paramName] = decodeURIComponent(paramValue);
				}
			}

			return {
				route: compiled.route,
				params,
				query,
			};
		}

		return null;
	}

	/**
	 * Get all routes
	 */
	getRoutes(): RouteConfig[] {
		return this.routes.map((r) => r.route);
	}

	/**
	 * Clear all routes
	 */
	clear(): void {
		this.routes = [];
	}

	/**
	 * Compile a path pattern to a regex
	 */
	private compilePath(path: string): PathPattern {
		const paramNames: string[] = [];
		let regexPattern = path;

		// Replace :param with capture groups
		regexPattern = regexPattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, paramName) => {
			paramNames.push(paramName);
			return '([^/]+)';
		});

		// Replace * wildcards with greedy capture
		regexPattern = regexPattern.replace(/\*/g, '(.*)');

		// Escape special regex characters except what we've already replaced
		regexPattern = regexPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

		// Restore our capture groups
		regexPattern = regexPattern.replace(/\\\(([^)]+)\\\)/g, '($1)');

		// Add anchors
		regexPattern = `^${regexPattern}$`;

		return {
			regex: new RegExp(regexPattern),
			paramNames,
		};
	}

	/**
	 * Normalize a path
	 */
	private normalizePath(path: string): string {
		// Remove query string
		const pathWithoutQuery = path.split('?')[0] ?? path;

		// Remove trailing slash (except for root)
		if (pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith('/')) {
			return pathWithoutQuery.slice(0, -1);
		}

		return pathWithoutQuery;
	}

	/**
	 * Check if a path matches a pattern
	 */
	pathMatches(pattern: string, path: string): boolean {
		const compiled = this.compilePath(pattern);
		const normalized = this.normalizePath(path);
		return compiled.regex.test(normalized);
	}
}
