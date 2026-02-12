/**
 * Mobile SDK
 * Main exports for mobile SDK generation and runtime
 */

// Core
export { MobileCore } from './core';

// Types
export * from './types';

// iOS
export { generateSwiftSDK } from './ios/template';
export { generateIOSNetworking } from './ios/networking';
export { generateIOSAuth } from './ios/auth';
export { generateIOSStorage } from './ios/storage';

// Android
export { generateKotlinSDK } from './android/template';
export { generateAndroidNetworking } from './android/networking';
export { generateAndroidAuth } from './android/auth';
export { generateAndroidStorage } from './android/storage';

// Cross-platform features
export { PushManager } from './push';
export { OfflineManager } from './offline';
export { SyncManager } from './sync';
export { BiometricAuth } from './biometric';
export { DeepLinkHandler } from './deep-links';
export { MobileAnalytics } from './analytics';

// Testing
export { TestUtils, MockNetworkResponses, MockBiometricAuth, MockStorage } from './testing';

import type {
	MobileConfig,
	SDKGenerationOptions,
	SDKGenerationResult,
	GeneratedSDKFile,
	MobilePlatform,
} from './types';
import { MobileConfigSchema, SDKGenerationOptionsSchema } from './types';
import { generateSwiftSDK } from './ios/template';
import { generateIOSNetworking } from './ios/networking';
import { generateIOSAuth } from './ios/auth';
import { generateIOSStorage } from './ios/storage';
import { generateKotlinSDK } from './android/template';
import { generateAndroidNetworking } from './android/networking';
import { generateAndroidAuth } from './android/auth';
import { generateAndroidStorage } from './android/storage';

/**
 * Main Mobile SDK class
 */
export class MobileSDK {
	private config: MobileConfig;

	constructor(config: MobileConfig) {
		this.config = MobileConfigSchema.parse(config);
	}

	/**
	 * Generate iOS SDK
	 */
	generateIOSSDK(options: SDKGenerationOptions): SDKGenerationResult {
		const validated = SDKGenerationOptionsSchema.parse({
			...options,
			platform: 'ios' as MobilePlatform,
		});

		const files: GeneratedSDKFile[] = [];

		// Main SDK files
		files.push(...generateSwiftSDK(this.config, validated));

		// Networking
		files.push(...generateIOSNetworking(validated));

		// Auth
		files.push(...generateIOSAuth(validated));

		// Storage
		files.push(...generateIOSStorage(validated));

		return {
			platform: 'ios' as MobilePlatform,
			files,
			packageName: validated.packageName,
			version: validated.apiVersion,
			installationInstructions: this.generateIOSInstallationInstructions(validated),
		};
	}

	/**
	 * Generate Android SDK
	 */
	generateAndroidSDK(options: SDKGenerationOptions): SDKGenerationResult {
		const validated = SDKGenerationOptionsSchema.parse({
			...options,
			platform: 'android' as MobilePlatform,
		});

		const files: GeneratedSDKFile[] = [];

		// Main SDK files
		files.push(...generateKotlinSDK(this.config, validated));

		// Networking
		files.push(generateAndroidNetworking(validated));

		// Auth
		files.push(generateAndroidAuth(validated));

		// Storage
		files.push(generateAndroidStorage(validated));

		return {
			platform: 'android' as MobilePlatform,
			files,
			packageName: validated.packageName,
			version: validated.apiVersion,
			installationInstructions: this.generateAndroidInstallationInstructions(validated),
		};
	}

	/**
	 * Generate both iOS and Android SDKs
	 */
	generateAllSDKs(options: Omit<SDKGenerationOptions, 'platform'>): {
		ios: SDKGenerationResult;
		android: SDKGenerationResult;
	} {
		return {
			ios: this.generateIOSSDK({ ...options, platform: 'ios' as MobilePlatform }),
			android: this.generateAndroidSDK({ ...options, platform: 'android' as MobilePlatform }),
		};
	}

	/**
	 * Generate iOS installation instructions
	 */
	private generateIOSInstallationInstructions(options: SDKGenerationOptions): string {
		return `# iOS SDK Installation

## Requirements

- iOS ${options.deploymentTarget ?? '14.0'}+
- Swift 5.9+
- Xcode 15.0+

## Installation

### Swift Package Manager

1. In Xcode, select File > Add Packages...
2. Enter the repository URL: https://github.com/yourorg/${options.packageName}
3. Select version ${options.apiVersion}

### CocoaPods

Add to your Podfile:

\`\`\`ruby
pod '${options.packageName}', '~> ${options.apiVersion}'
\`\`\`

Then run:

\`\`\`bash
pod install
\`\`\`

## Quick Start

\`\`\`swift
import ${options.packageName}SDK

let config = ${toPascalCase(options.packageName)}Configuration(
    baseURL: URL(string: "${this.config.baseUrl}")!,
    clientId: "${this.config.auth.clientId}",
    redirectUri: URL(string: "${this.config.auth.redirectUri}")!
)

let sdk = ${toPascalCase(options.packageName)}SDK(configuration: config)

// Authenticate
sdk.authenticate()
    .sink(
        receiveCompletion: { _ in },
        receiveValue: { result in
            print("Authenticated!")
        }
    )
    .store(in: &cancellables)
\`\`\`

## Estimated Installation Time

< 5 minutes
`;
	}

	/**
	 * Generate Android installation instructions
	 */
	private generateAndroidInstallationInstructions(options: SDKGenerationOptions): string {
		return `# Android SDK Installation

## Requirements

- Android ${options.minSdkVersion ?? 24}+
- Kotlin 1.9+

## Installation

### Gradle

Add to your \`build.gradle\`:

\`\`\`gradle
dependencies {
    implementation '${options.packageName}:sdk:${options.apiVersion}'
}
\`\`\`

### Maven

\`\`\`xml
<dependency>
    <groupId>${options.packageName}</groupId>
    <artifactId>sdk</artifactId>
    <version>${options.apiVersion}</version>
</dependency>
\`\`\`

## Quick Start

\`\`\`kotlin
import ${options.packageName.replace(/-/g, '.')}.WorkflowArchitectSDK

val config = SDKConfiguration(
    baseUrl = "${this.config.baseUrl}",
    clientId = "${this.config.auth.clientId}",
    redirectUri = "${this.config.auth.redirectUri}"
)

val sdk = WorkflowArchitectSDK(context, config)

// Authenticate
lifecycleScope.launch {
    val result = sdk.authenticate()
    result.onSuccess {
        println("Authenticated!")
    }
}
\`\`\`

## Estimated Installation Time

< 5 minutes
`;
	}

	/**
	 * Get configuration
	 */
	getConfig(): MobileConfig {
		return this.config;
	}
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
	return str
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join('');
}

/**
 * Generate mobile SDK
 */
export function generateMobileSDK(
	config: MobileConfig,
	options: SDKGenerationOptions,
): SDKGenerationResult {
	const sdk = new MobileSDK(config);

	if (options.platform === 'ios') {
		return sdk.generateIOSSDK(options);
	} else if (options.platform === 'android') {
		return sdk.generateAndroidSDK(options);
	}

	throw new Error(`Unsupported platform: ${options.platform}`);
}

/**
 * Generate both iOS and Android SDKs
 */
export function generateAllMobileSDKs(
	config: MobileConfig,
	options: Omit<SDKGenerationOptions, 'platform'>,
): {
	ios: SDKGenerationResult;
	android: SDKGenerationResult;
} {
	const sdk = new MobileSDK(config);
	return sdk.generateAllSDKs(options);
}
