/**
 * Mobile SDK Types
 * Mobile-specific types for iOS and Android SDKs
 */

import { z } from 'zod';

/**
 * Biometric authentication types
 */
export enum BiometricType {
	FACE_ID = 'FACE_ID',
	TOUCH_ID = 'TOUCH_ID',
	FINGERPRINT = 'FINGERPRINT',
	IRIS = 'IRIS',
	NONE = 'NONE',
}

/**
 * Mobile platform types
 */
export enum MobilePlatform {
	IOS = 'ios',
	ANDROID = 'android',
}

/**
 * Sync conflict resolution strategies
 */
export enum ConflictResolution {
	CLIENT_WINS = 'CLIENT_WINS',
	SERVER_WINS = 'SERVER_WINS',
	MANUAL = 'MANUAL',
	MERGE = 'MERGE',
}

/**
 * Mobile configuration schema
 */
export const MobileConfigSchema = z.object({
	baseUrl: z.string().url(),
	auth: z.object({
		clientId: z.string(),
		clientSecret: z.string().optional(),
		redirectUri: z.string().url(),
		scopes: z.array(z.string()).default([]),
	}),
	offline: z.object({
		enabled: z.boolean().default(true),
		maxQueueSize: z.number().int().positive().default(1000),
		retryAttempts: z.number().int().positive().default(3),
		retryDelay: z.number().int().positive().default(1000),
	}).default({}),
	sync: z.object({
		enabled: z.boolean().default(true),
		interval: z.number().int().positive().default(300000), // 5 minutes
		batchSize: z.number().int().positive().default(50),
		conflictResolution: z.nativeEnum(ConflictResolution).default(ConflictResolution.SERVER_WINS),
	}).default({}),
	push: z.object({
		enabled: z.boolean().default(true),
		fcmSenderId: z.string().optional(), // Android
		apnsKeyId: z.string().optional(), // iOS
		apnsTeamId: z.string().optional(), // iOS
	}).optional(),
	security: z.object({
		certificatePinning: z.boolean().default(true),
		biometricAuth: z.boolean().default(true),
		encryptStorage: z.boolean().default(true),
	}).default({}),
	analytics: z.object({
		enabled: z.boolean().default(true),
		anonymize: z.boolean().default(false),
	}).default({}),
});

export type MobileConfig = z.infer<typeof MobileConfigSchema>;

/**
 * Sync state
 */
export const SyncStateSchema = z.object({
	pending: z.array(z.string()),
	synced: z.array(z.string()),
	conflicts: z.array(z.object({
		id: z.string(),
		localData: z.record(z.unknown()),
		remoteData: z.record(z.unknown()),
		timestamp: z.number(),
	})),
	lastSync: z.number().nullable(),
	isSyncing: z.boolean(),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

/**
 * Offline action
 */
export const OfflineActionSchema = z.object({
	id: z.string(),
	type: z.enum(['CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
	resource: z.string(),
	data: z.record(z.unknown()),
	timestamp: z.number(),
	retryCount: z.number().int().default(0),
	status: z.enum(['PENDING', 'PROCESSING', 'FAILED', 'COMPLETED']),
	error: z.string().optional(),
});

export type OfflineAction = z.infer<typeof OfflineActionSchema>;

/**
 * Push notification
 */
export const PushNotificationSchema = z.object({
	id: z.string(),
	title: z.string(),
	body: z.string(),
	data: z.record(z.unknown()).optional(),
	badge: z.number().int().optional(),
	sound: z.string().optional(),
	category: z.string().optional(),
	deepLink: z.string().optional(),
	timestamp: z.number(),
});

export type PushNotification = z.infer<typeof PushNotificationSchema>;

/**
 * Device information
 */
export const DeviceInfoSchema = z.object({
	platform: z.nativeEnum(MobilePlatform),
	osVersion: z.string(),
	appVersion: z.string(),
	deviceId: z.string(),
	deviceModel: z.string(),
	deviceName: z.string().optional(),
	locale: z.string(),
	timezone: z.string(),
	screenWidth: z.number().int(),
	screenHeight: z.number().int(),
	biometricType: z.nativeEnum(BiometricType),
});

export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

/**
 * Network state
 */
export const NetworkStateSchema = z.object({
	isConnected: z.boolean(),
	connectionType: z.enum(['wifi', 'cellular', 'ethernet', 'none', 'unknown']),
	isExpensive: z.boolean(),
	timestamp: z.number(),
});

export type NetworkState = z.infer<typeof NetworkStateSchema>;

/**
 * Storage quota
 */
export const StorageQuotaSchema = z.object({
	used: z.number().int(),
	available: z.number().int(),
	total: z.number().int(),
	percentage: z.number(),
});

export type StorageQuota = z.infer<typeof StorageQuotaSchema>;

/**
 * Deep link data
 */
export const DeepLinkDataSchema = z.object({
	url: z.string(),
	scheme: z.string(),
	host: z.string().optional(),
	path: z.string().optional(),
	params: z.record(z.string()),
	timestamp: z.number(),
});

export type DeepLinkData = z.infer<typeof DeepLinkDataSchema>;

/**
 * Analytics event
 */
export const AnalyticsEventSchema = z.object({
	name: z.string(),
	properties: z.record(z.unknown()).optional(),
	timestamp: z.number(),
	userId: z.string().optional(),
	sessionId: z.string().optional(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/**
 * App lifecycle state
 */
export enum AppLifecycleState {
	ACTIVE = 'active',
	INACTIVE = 'inactive',
	BACKGROUND = 'background',
	TERMINATED = 'terminated',
}

/**
 * Background task
 */
export const BackgroundTaskSchema = z.object({
	id: z.string(),
	type: z.string(),
	data: z.record(z.unknown()).optional(),
	interval: z.number().int().positive().optional(),
	oneShot: z.boolean().default(false),
	requiresNetwork: z.boolean().default(false),
	requiresCharging: z.boolean().default(false),
});

export type BackgroundTask = z.infer<typeof BackgroundTaskSchema>;

/**
 * Keychain item (iOS) / EncryptedSharedPreferences (Android)
 */
export const SecureStorageItemSchema = z.object({
	key: z.string(),
	value: z.string(),
	service: z.string().optional(),
	accessGroup: z.string().optional(), // iOS only
});

export type SecureStorageItem = z.infer<typeof SecureStorageItemSchema>;

/**
 * OAuth2 token
 */
export const OAuth2TokenSchema = z.object({
	accessToken: z.string(),
	refreshToken: z.string().optional(),
	tokenType: z.string().default('Bearer'),
	expiresIn: z.number().int().positive(),
	expiresAt: z.number().int().positive(),
	scope: z.array(z.string()).optional(),
});

export type OAuth2Token = z.infer<typeof OAuth2TokenSchema>;

/**
 * Biometric auth result
 */
export const BiometricAuthResultSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	biometricType: z.nativeEnum(BiometricType),
	fallbackUsed: z.boolean().default(false),
});

export type BiometricAuthResult = z.infer<typeof BiometricAuthResultSchema>;

/**
 * SDK generation options
 */
export const SDKGenerationOptionsSchema = z.object({
	platform: z.nativeEnum(MobilePlatform),
	packageName: z.string(),
	apiVersion: z.string().default('1.0.0'),
	minSdkVersion: z.number().int().optional(), // Android
	targetSdkVersion: z.number().int().optional(), // Android
	deploymentTarget: z.string().optional(), // iOS (e.g., "14.0")
	includeExamples: z.boolean().default(true),
	includeTests: z.boolean().default(true),
	customTemplates: z.record(z.string()).optional(),
});

export type SDKGenerationOptions = z.infer<typeof SDKGenerationOptionsSchema>;

/**
 * Generated SDK file
 */
export const GeneratedSDKFileSchema = z.object({
	path: z.string(),
	content: z.string(),
	language: z.enum(['swift', 'kotlin', 'objective-c', 'java']),
	type: z.enum(['source', 'header', 'config', 'test', 'example']),
});

export type GeneratedSDKFile = z.infer<typeof GeneratedSDKFileSchema>;

/**
 * SDK generation result
 */
export const SDKGenerationResultSchema = z.object({
	platform: z.nativeEnum(MobilePlatform),
	files: z.array(GeneratedSDKFileSchema),
	packageName: z.string(),
	version: z.string(),
	documentation: z.string().optional(),
	installationInstructions: z.string(),
});

export type SDKGenerationResult = z.infer<typeof SDKGenerationResultSchema>;
