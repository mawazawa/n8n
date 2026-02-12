/**
 * Webhook handler for Workflow Architect events
 * Verifies signatures and parses webhook payloads
 */

import { z } from 'zod';
import { createHmac } from 'crypto';

const WebhookEventSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(['workflow.created', 'workflow.updated', 'workflow.deleted', 'execution.started', 'execution.completed', 'execution.failed']),
	timestamp: z.string().datetime(),
	data: z.record(z.unknown()),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Webhook handler with signature verification
 * Integration: const handler = new WebhookHandler(secret);
 */
export class WebhookHandler {
	constructor(private secret: string) {}

	/**
	 * Verify webhook signature using HMAC-SHA256
	 */
	verify(payload: string, signature: string): boolean {
		const expectedSignature = this.computeSignature(payload);
		return this.secureCompare(signature, expectedSignature);
	}

	/**
	 * Parse and validate webhook payload
	 */
	parse(payload: string): WebhookEvent {
		const parsed = JSON.parse(payload);
		return WebhookEventSchema.parse(parsed);
	}

	/**
	 * Handle incoming webhook with verification
	 */
	handle(payload: string, signature: string): WebhookEvent {
		if (!this.verify(payload, signature)) {
			throw new Error('Invalid webhook signature');
		}
		return this.parse(payload);
	}

	private computeSignature(payload: string): string {
		const hmac = createHmac('sha256', this.secret);
		hmac.update(payload);
		return `sha256=${hmac.digest('hex')}`;
	}

	private secureCompare(a: string, b: string): boolean {
		if (a.length !== b.length) return false;
		let result = 0;
		for (let i = 0; i < a.length; i++) {
			result |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}
		return result === 0;
	}
}

/**
 * Retry guidance for webhook consumers
 */
export const WEBHOOK_RETRY_GUIDANCE = {
	maxRetries: 3,
	retryDelays: [1000, 5000, 15000],
	retryableStatusCodes: [408, 429, 500, 502, 503, 504],
	note: 'Webhooks will be retried up to 3 times with exponential backoff',
};
