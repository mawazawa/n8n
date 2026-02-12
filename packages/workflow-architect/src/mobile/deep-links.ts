/**
 * Deep Link Handling
 * Universal links (iOS) and App Links (Android)
 */

import { EventEmitter } from 'events';
import { type DeepLinkData, DeepLinkDataSchema, MobilePlatform } from './types';

/**
 * Deep link handler
 */
export class DeepLinkHandler extends EventEmitter {
	private platform: MobilePlatform | null;
	private registeredSchemes: Set<string> = new Set();
	private routes: Map<string, (params: Record<string, string>) => void> = new Map();

	constructor() {
		super();
		this.platform = this.detectPlatform();
		this.setupListeners();
	}

	/**
	 * Detect platform
	 */
	private detectPlatform(): MobilePlatform | null {
		if (typeof navigator === 'undefined') {
			return null;
		}

		const ua = navigator.userAgent.toLowerCase();
		if (/iphone|ipad|ipod/.test(ua)) {
			return MobilePlatform.IOS;
		}
		if (/android/.test(ua)) {
			return MobilePlatform.ANDROID;
		}

		return null;
	}

	/**
	 * Setup deep link listeners
	 */
	private setupListeners(): void {
		// This would register native listeners
		// For web, we can use window location
		if (typeof window !== 'undefined') {
			window.addEventListener('popstate', () => {
				this.handleURL(window.location.href);
			});
		}
	}

	/**
	 * Register URL scheme
	 */
	registerScheme(scheme: string): void {
		this.registeredSchemes.add(scheme);
		this.emit('schemeRegistered', scheme);
	}

	/**
	 * Register route handler
	 */
	registerRoute(path: string, handler: (params: Record<string, string>) => void): void {
		this.routes.set(path, handler);
		this.emit('routeRegistered', path);
	}

	/**
	 * Handle incoming deep link
	 */
	handleURL(url: string): void {
		try {
			const deepLinkData = this.parseURL(url);
			const validated = DeepLinkDataSchema.parse(deepLinkData);

			this.emit('deepLinkReceived', validated);

			// Find matching route
			const handler = this.findRouteHandler(validated.path ?? '');
			if (handler) {
				handler(validated.params);
			} else {
				this.emit('unhandledDeepLink', validated);
			}
		} catch (error) {
			this.emit('deepLinkError', error);
		}
	}

	/**
	 * Parse URL into deep link data
	 */
	private parseURL(url: string): DeepLinkData {
		const urlObj = new URL(url);

		const params: Record<string, string> = {};
		urlObj.searchParams.forEach((value, key) => {
			params[key] = value;
		});

		return {
			url,
			scheme: urlObj.protocol.replace(':', ''),
			host: urlObj.hostname || undefined,
			path: urlObj.pathname || undefined,
			params,
			timestamp: Date.now(),
		};
	}

	/**
	 * Find route handler
	 */
	private findRouteHandler(path: string): ((params: Record<string, string>) => void) | undefined {
		// Exact match
		if (this.routes.has(path)) {
			return this.routes.get(path);
		}

		// Pattern match
		for (const [routePath, handler] of this.routes) {
			if (this.matchRoute(routePath, path)) {
				return handler;
			}
		}

		return undefined;
	}

	/**
	 * Match route pattern
	 */
	private matchRoute(pattern: string, path: string): boolean {
		// Simple pattern matching
		// Convert /users/:id to regex
		const regexPattern = pattern.replace(/:([^/]+)/g, '([^/]+)');
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(path);
	}

	/**
	 * Extract parameters from path
	 */
	extractParams(pattern: string, path: string): Record<string, string> {
		const params: Record<string, string> = {};

		const patternParts = pattern.split('/');
		const pathParts = path.split('/');

		for (let i = 0; i < patternParts.length; i++) {
			const patternPart = patternParts[i];
			if (patternPart.startsWith(':')) {
				const paramName = patternPart.slice(1);
				params[paramName] = pathParts[i];
			}
		}

		return params;
	}

	/**
	 * Generate deep link
	 */
	generateDeepLink(scheme: string, path: string, params?: Record<string, string>): string {
		const url = new URL(`${scheme}://${path}`);

		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				url.searchParams.set(key, value);
			});
		}

		return url.toString();
	}

	/**
	 * Generate iOS Universal Links configuration
	 */
	generateIOSUniversalLinksConfig(appId: string, domain: string): string {
		return JSON.stringify(
			{
				applinks: {
					apps: [],
					details: [
						{
							appID: appId,
							paths: ['*'],
						},
					],
				},
			},
			null,
			2,
		);
	}

	/**
	 * Generate Android App Links configuration
	 */
	generateAndroidAppLinksConfig(packageName: string, sha256: string): string {
		return JSON.stringify(
			[
				{
					relation: ['delegate_permission/common.handle_all_urls'],
					target: {
						namespace: 'android_app',
						package_name: packageName,
						sha256_cert_fingerprints: [sha256],
					},
				},
			],
			null,
			2,
		);
	}

	/**
	 * Generate iOS code for deep links
	 */
	generateIOSCode(scheme: string): string {
		return `//
// iOS Deep Link Handling
//

import UIKit

class DeepLinkHandler {
    static let shared = DeepLinkHandler()

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey : Any] = [:]
    ) -> Bool {
        handleDeepLink(url)
        return true
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else {
            return false
        }

        handleDeepLink(url)
        return true
    }

    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }

        let scheme = url.scheme
        let host = url.host
        let path = url.path

        var params: [String: String] = [:]
        components.queryItems?.forEach { item in
            params[item.name] = item.value
        }

        // Route to appropriate screen
        NotificationCenter.default.post(
            name: .deepLinkReceived,
            object: nil,
            userInfo: [
                "url": url.absoluteString,
                "scheme": scheme ?? "",
                "host": host ?? "",
                "path": path,
                "params": params
            ]
        )
    }
}

extension Notification.Name {
    static let deepLinkReceived = Notification.Name("deepLinkReceived")
}

// Info.plist configuration
/*
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>${scheme}</string>
        </array>
    </dict>
</array>
*/
`;
	}

	/**
	 * Generate Android code for deep links
	 */
	generateAndroidCode(scheme: string, host: string): string {
		return `//
// Android Deep Link Handling
//

class DeepLinkHandler {
    fun handleIntent(intent: Intent) {
        val action = intent.action
        val data = intent.data

        if (action == Intent.ACTION_VIEW && data != null) {
            handleDeepLink(data)
        }
    }

    private fun handleDeepLink(uri: Uri) {
        val scheme = uri.scheme
        val host = uri.host
        val path = uri.path

        val params = mutableMapOf<String, String>()
        uri.queryParameterNames.forEach { name ->
            uri.getQueryParameter(name)?.let { value ->
                params[name] = value
            }
        }

        // Route to appropriate screen
        // Example: navigate to screen based on path
    }
}

// AndroidManifest.xml configuration
/*
<activity android:name=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="${scheme}"
            android:host="${host}" />
    </intent-filter>

    <!-- App Links -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="${host}" />
    </intent-filter>
</activity>
*/
`;
	}
}
