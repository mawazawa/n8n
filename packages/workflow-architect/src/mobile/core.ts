/**
 * Mobile Core
 * Core mobile functionality and platform detection
 */

import { EventEmitter } from 'events';
import {
	type MobileConfig,
	MobileConfigSchema,
	type DeviceInfo,
	DeviceInfoSchema,
	type NetworkState,
	NetworkStateSchema,
	type BackgroundTask,
	BackgroundTaskSchema,
	MobilePlatform,
	BiometricType,
	AppLifecycleState,
} from './types';

/**
 * Mobile core class
 */
export class MobileCore extends EventEmitter {
	private config: MobileConfig;
	private deviceInfo: DeviceInfo | null = null;
	private networkState: NetworkState | null = null;
	private lifecycleState: AppLifecycleState = AppLifecycleState.ACTIVE;
	private backgroundTasks: Map<string, BackgroundTask> = new Map();

	constructor(config: MobileConfig) {
		super();
		this.config = MobileConfigSchema.parse(config);
	}

	/**
	 * Detect current platform
	 */
	static detectPlatform(): MobilePlatform | null {
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
	 * Check if running in mobile environment
	 */
	static isMobile(): boolean {
		return this.detectPlatform() !== null;
	}

	/**
	 * Get device information
	 */
	async getDeviceInfo(): Promise<DeviceInfo> {
		if (this.deviceInfo) {
			return this.deviceInfo;
		}

		const platform = MobileCore.detectPlatform();
		if (!platform) {
			throw new Error('Not running in mobile environment');
		}

		// This would be replaced with actual native bridge calls
		const info: DeviceInfo = {
			platform,
			osVersion: this.getOSVersion(),
			appVersion: this.getAppVersion(),
			deviceId: await this.getDeviceId(),
			deviceModel: this.getDeviceModel(),
			deviceName: this.getDeviceName(),
			locale: navigator.language,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			screenWidth: window.screen.width,
			screenHeight: window.screen.height,
			biometricType: await this.detectBiometricType(),
		};

		this.deviceInfo = DeviceInfoSchema.parse(info);
		return this.deviceInfo;
	}

	/**
	 * Get OS version
	 */
	private getOSVersion(): string {
		const ua = navigator.userAgent;
		const platform = MobileCore.detectPlatform();

		if (platform === MobilePlatform.IOS) {
			const match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
			if (match) {
				return `${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`;
			}
		} else if (platform === MobilePlatform.ANDROID) {
			const match = ua.match(/Android (\d+\.?\d*\.?\d*)/);
			if (match) {
				return match[1];
			}
		}

		return 'unknown';
	}

	/**
	 * Get app version
	 */
	private getAppVersion(): string {
		// This would be injected at build time or from native bridge
		return process.env.APP_VERSION ?? '1.0.0';
	}

	/**
	 * Get device ID
	 */
	private async getDeviceId(): Promise<string> {
		// This would use native APIs to get a stable device identifier
		// For now, generate or retrieve from storage
		const stored = localStorage.getItem('deviceId');
		if (stored) {
			return stored;
		}

		const deviceId = crypto.randomUUID();
		localStorage.setItem('deviceId', deviceId);
		return deviceId;
	}

	/**
	 * Get device model
	 */
	private getDeviceModel(): string {
		const ua = navigator.userAgent;
		const platform = MobileCore.detectPlatform();

		if (platform === MobilePlatform.IOS) {
			const match = ua.match(/iPhone|iPad|iPod/);
			return match?.[0] ?? 'Unknown iOS Device';
		} else if (platform === MobilePlatform.ANDROID) {
			const match = ua.match(/\(([^)]+)\)/);
			if (match) {
				const parts = match[1].split(';');
				return parts[parts.length - 1].trim();
			}
		}

		return 'Unknown Device';
	}

	/**
	 * Get device name
	 */
	private getDeviceName(): string | undefined {
		// This would require native bridge access
		return undefined;
	}

	/**
	 * Detect biometric type
	 */
	private async detectBiometricType(): Promise<BiometricType> {
		// This would use native APIs
		// For now, return NONE
		return BiometricType.NONE;
	}

	/**
	 * Get current network state
	 */
	async getNetworkState(): Promise<NetworkState> {
		const state: NetworkState = {
			isConnected: navigator.onLine,
			connectionType: this.getConnectionType(),
			isExpensive: await this.isConnectionExpensive(),
			timestamp: Date.now(),
		};

		this.networkState = NetworkStateSchema.parse(state);
		this.emit('networkStateChanged', this.networkState);
		return this.networkState;
	}

	/**
	 * Get connection type
	 */
	private getConnectionType(): NetworkState['connectionType'] {
		if (!navigator.onLine) {
			return 'none';
		}

		// Try to use Network Information API
		const connection = (navigator as unknown as { connection?: { effectiveType?: string } })
			.connection;
		if (connection?.effectiveType) {
			if (connection.effectiveType === 'wifi') return 'wifi';
			if (connection.effectiveType.includes('4g') || connection.effectiveType.includes('3g')) {
				return 'cellular';
			}
		}

		return 'unknown';
	}

	/**
	 * Check if connection is expensive (cellular)
	 */
	private async isConnectionExpensive(): Promise<boolean> {
		const type = this.getConnectionType();
		return type === 'cellular';
	}

	/**
	 * Set lifecycle state
	 */
	setLifecycleState(state: AppLifecycleState): void {
		if (this.lifecycleState === state) {
			return;
		}

		const previousState = this.lifecycleState;
		this.lifecycleState = state;

		this.emit('lifecycleStateChanged', {
			current: state,
			previous: previousState,
			timestamp: Date.now(),
		});

		// Handle state transitions
		if (state === AppLifecycleState.BACKGROUND) {
			this.onEnterBackground();
		} else if (state === AppLifecycleState.ACTIVE && previousState === AppLifecycleState.BACKGROUND) {
			this.onEnterForeground();
		}
	}

	/**
	 * Get current lifecycle state
	 */
	getLifecycleState(): AppLifecycleState {
		return this.lifecycleState;
	}

	/**
	 * Handle app entering background
	 */
	private onEnterBackground(): void {
		// Save any pending state
		this.emit('enterBackground');
	}

	/**
	 * Handle app entering foreground
	 */
	private onEnterForeground(): void {
		// Refresh state, check for updates
		void this.getNetworkState();
		this.emit('enterForeground');
	}

	/**
	 * Schedule background task
	 */
	async scheduleBackgroundTask(task: BackgroundTask): Promise<string> {
		const validated = BackgroundTaskSchema.parse(task);
		this.backgroundTasks.set(validated.id, validated);

		// This would use native APIs:
		// iOS: BackgroundTasks framework
		// Android: WorkManager

		this.emit('backgroundTaskScheduled', validated);
		return validated.id;
	}

	/**
	 * Cancel background task
	 */
	async cancelBackgroundTask(taskId: string): Promise<void> {
		const task = this.backgroundTasks.get(taskId);
		if (!task) {
			throw new Error(`Background task not found: ${taskId}`);
		}

		this.backgroundTasks.delete(taskId);

		// Cancel in native system
		this.emit('backgroundTaskCancelled', taskId);
	}

	/**
	 * Get all background tasks
	 */
	getBackgroundTasks(): BackgroundTask[] {
		return Array.from(this.backgroundTasks.values());
	}

	/**
	 * Initialize platform-specific features
	 */
	async initialize(): Promise<void> {
		// Get device info
		await this.getDeviceInfo();

		// Get network state
		await this.getNetworkState();

		// Set up network listeners
		window.addEventListener('online', () => {
			void this.getNetworkState();
		});

		window.addEventListener('offline', () => {
			void this.getNetworkState();
		});

		// Set up visibility listeners
		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				this.setLifecycleState(AppLifecycleState.BACKGROUND);
			} else {
				this.setLifecycleState(AppLifecycleState.ACTIVE);
			}
		});

		this.emit('initialized', {
			platform: this.deviceInfo?.platform,
			timestamp: Date.now(),
		});
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		// Cancel all background tasks
		for (const taskId of this.backgroundTasks.keys()) {
			await this.cancelBackgroundTask(taskId);
		}

		this.removeAllListeners();
		this.emit('cleanup');
	}

	/**
	 * Get configuration
	 */
	getConfig(): MobileConfig {
		return this.config;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<MobileConfig>): void {
		this.config = MobileConfigSchema.parse({
			...this.config,
			...config,
		});

		this.emit('configUpdated', this.config);
	}
}
