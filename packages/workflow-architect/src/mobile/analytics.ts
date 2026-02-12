/**
 * Mobile Analytics
 * Screen tracking, events, and crash reporting
 */

import { EventEmitter } from 'events';
import {
	type AnalyticsEvent,
	AnalyticsEventSchema,
	type MobileConfig,
	type DeviceInfo,
} from './types';

/**
 * Mobile analytics manager
 */
export class MobileAnalytics extends EventEmitter {
	private config: MobileConfig;
	private deviceInfo: DeviceInfo | null = null;
	private sessionId: string;
	private userId: string | null = null;
	private events: AnalyticsEvent[] = [];
	private batchSize = 20;
	private flushInterval = 30000; // 30 seconds
	private flushTimer: NodeJS.Timeout | null = null;

	constructor(config: MobileConfig, deviceInfo?: DeviceInfo) {
		super();
		this.config = config;
		this.deviceInfo = deviceInfo ?? null;
		this.sessionId = this.generateSessionId();

		if (config.analytics.enabled) {
			this.startFlushTimer();
		}
	}

	/**
	 * Generate session ID
	 */
	private generateSessionId(): string {
		return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * Set user ID
	 */
	setUserId(userId: string): void {
		this.userId = userId;
		this.emit('userIdSet', userId);
	}

	/**
	 * Set device info
	 */
	setDeviceInfo(deviceInfo: DeviceInfo): void {
		this.deviceInfo = deviceInfo;
	}

	/**
	 * Track screen view
	 */
	trackScreen(screenName: string, properties?: Record<string, unknown>): void {
		this.trackEvent('screen_view', {
			screen_name: screenName,
			...properties,
		});
	}

	/**
	 * Track event
	 */
	trackEvent(eventName: string, properties?: Record<string, unknown>): void {
		if (!this.config.analytics.enabled) {
			return;
		}

		const event: AnalyticsEvent = {
			name: eventName,
			properties: this.sanitizeProperties(properties),
			timestamp: Date.now(),
			userId: this.userId ?? undefined,
			sessionId: this.sessionId,
		};

		const validated = AnalyticsEventSchema.parse(event);
		this.events.push(validated);

		this.emit('eventTracked', validated);

		// Flush if batch size reached
		if (this.events.length >= this.batchSize) {
			void this.flush();
		}
	}

	/**
	 * Sanitize properties
	 */
	private sanitizeProperties(
		properties?: Record<string, unknown>,
	): Record<string, unknown> | undefined {
		if (!properties) {
			return undefined;
		}

		if (this.config.analytics.anonymize) {
			// Remove PII
			const sanitized = { ...properties };
			const piiFields = ['email', 'phone', 'address', 'name'];

			piiFields.forEach((field) => {
				if (field in sanitized) {
					delete sanitized[field];
				}
			});

			return sanitized;
		}

		return properties;
	}

	/**
	 * Track user property
	 */
	setUserProperty(name: string, value: unknown): void {
		if (!this.config.analytics.enabled) {
			return;
		}

		this.trackEvent('user_property_set', {
			property_name: name,
			property_value: value,
		});
	}

	/**
	 * Track timing
	 */
	trackTiming(category: string, name: string, duration: number): void {
		this.trackEvent('timing', {
			category,
			name,
			duration,
		});
	}

	/**
	 * Track error
	 */
	trackError(error: Error, fatal = false): void {
		this.trackEvent('error', {
			error_name: error.name,
			error_message: error.message,
			error_stack: error.stack,
			fatal,
		});
	}

	/**
	 * Flush events to server
	 */
	async flush(): Promise<void> {
		if (this.events.length === 0) {
			return;
		}

		const eventsToSend = [...this.events];
		this.events = [];

		try {
			await this.sendEvents(eventsToSend);
			this.emit('eventsFlushed', eventsToSend.length);
		} catch (error) {
			// Re-add events to queue
			this.events.unshift(...eventsToSend);
			this.emit('flushFailed', error);
		}
	}

	/**
	 * Send events to server
	 */
	private async sendEvents(events: AnalyticsEvent[]): Promise<void> {
		// This would send to analytics backend
		// For now, just log
		if (typeof console !== 'undefined') {
			console.log('Analytics events:', events);
		}
	}

	/**
	 * Start flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setInterval(() => {
			void this.flush();
		}, this.flushInterval);
	}

	/**
	 * Stop flush timer
	 */
	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}

	/**
	 * Get pending events count
	 */
	getPendingEventsCount(): number {
		return this.events.length;
	}

	/**
	 * Clear all events
	 */
	clearEvents(): void {
		this.events = [];
		this.emit('eventsCleared');
	}

	/**
	 * Cleanup
	 */
	cleanup(): void {
		void this.flush();
		this.stopFlushTimer();
	}

	/**
	 * Generate iOS analytics code
	 */
	generateIOSCode(): string {
		return `//
// iOS Analytics Integration
//

import Foundation

class AnalyticsManager {
    static let shared = AnalyticsManager()

    private var sessionId: String = UUID().uuidString
    private var userId: String?
    private var events: [AnalyticsEvent] = []

    func trackScreen(_ screenName: String, properties: [String: Any]? = nil) {
        trackEvent("screen_view", properties: [
            "screen_name": screenName,
        ].merging(properties ?? [:]) { _, new in new })
    }

    func trackEvent(_ eventName: String, properties: [String: Any]? = nil) {
        let event = AnalyticsEvent(
            name: eventName,
            properties: properties,
            timestamp: Date().timeIntervalSince1970,
            userId: userId,
            sessionId: sessionId
        )

        events.append(event)

        if events.count >= 20 {
            flush()
        }
    }

    func setUserId(_ userId: String) {
        self.userId = userId
    }

    func flush() {
        guard !events.isEmpty else { return }

        let eventsToSend = events
        events.removeAll()

        // Send to backend
        sendEvents(eventsToSend)
    }

    private func sendEvents(_ events: [AnalyticsEvent]) {
        // Implementation
    }
}

struct AnalyticsEvent: Codable {
    let name: String
    let properties: [String: Any]?
    let timestamp: TimeInterval
    let userId: String?
    let sessionId: String
}
`;
	}

	/**
	 * Generate Android analytics code
	 */
	generateAndroidCode(): string {
		return `//
// Android Analytics Integration
//

class AnalyticsManager(private val context: Context) {
    private val sessionId = UUID.randomUUID().toString()
    private var userId: String? = null
    private val events = mutableListOf<AnalyticsEvent>()

    fun trackScreen(screenName: String, properties: Map<String, Any>? = null) {
        trackEvent("screen_view", mapOf(
            "screen_name" to screenName
        ) + (properties ?: emptyMap()))
    }

    fun trackEvent(eventName: String, properties: Map<String, Any>? = null) {
        val event = AnalyticsEvent(
            name = eventName,
            properties = properties,
            timestamp = System.currentTimeMillis(),
            userId = userId,
            sessionId = sessionId
        )

        events.add(event)

        if (events.size >= 20) {
            flush()
        }
    }

    fun setUserId(userId: String) {
        this.userId = userId
    }

    fun flush() {
        if (events.isEmpty()) return

        val eventsToSend = events.toList()
        events.clear()

        // Send to backend
        sendEvents(eventsToSend)
    }

    private fun sendEvents(events: List<AnalyticsEvent>) {
        // Implementation
    }
}

@Serializable
data class AnalyticsEvent(
    val name: String,
    val properties: Map<String, Any>? = null,
    val timestamp: Long,
    val userId: String? = null,
    val sessionId: String
)
`;
	}
}
