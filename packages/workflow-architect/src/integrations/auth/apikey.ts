import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Encryption configuration
 */
interface EncryptionConfig {
	algorithm: string;
	key: Buffer;
	ivLength: number;
}

/**
 * API Key Manager
 * Manages API key storage, retrieval, rotation, and encryption
 */
export class ApiKeyManager {
	private supabase: SupabaseClient;
	private encryptionConfig: EncryptionConfig;
	private cache: Map<string, { key: string; expiresAt: number }>;
	private cacheTimeout: number;

	constructor(
		supabaseUrl: string,
		supabaseKey: string,
		encryptionKey: string,
		cacheTimeout = 300000,
	) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
		this.cache = new Map();
		this.cacheTimeout = cacheTimeout;

		// Setup encryption configuration
		this.encryptionConfig = {
			algorithm: 'aes-256-cbc',
			key: this.deriveKey(encryptionKey),
			ivLength: 16,
		};
	}

	/**
	 * Derive encryption key from string
	 */
	private deriveKey(key: string): Buffer {
		return crypto.createHash('sha256').update(key).digest();
	}

	/**
	 * Encrypt data
	 */
	private encrypt(data: string): string {
		const iv = crypto.randomBytes(this.encryptionConfig.ivLength);
		const cipher = crypto.createCipheriv(
			this.encryptionConfig.algorithm,
			this.encryptionConfig.key,
			iv,
		);

		let encrypted = cipher.update(data, 'utf8', 'hex');
		encrypted += cipher.final('hex');

		// Return IV + encrypted data
		return iv.toString('hex') + ':' + encrypted;
	}

	/**
	 * Decrypt data
	 */
	private decrypt(encryptedData: string): string {
		const parts = encryptedData.split(':');
		if (parts.length !== 2) {
			throw new Error('Invalid encrypted data format');
		}

		const iv = Buffer.from(parts[0], 'hex');
		const encrypted = parts[1];

		const decipher = crypto.createDecipheriv(
			this.encryptionConfig.algorithm,
			this.encryptionConfig.key,
			iv,
		);

		let decrypted = decipher.update(encrypted, 'hex', 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	}

	/**
	 * Store API key for an integration
	 */
	async store(integrationId: string, apiKey: string, metadata?: Record<string, unknown>): Promise<void> {
		// Encrypt the API key
		const encryptedKey = this.encrypt(apiKey);

		const { error } = await this.supabase
			.from('integration_credentials')
			.upsert({
				integration_id: integrationId,
				credentials: {
					api_key: encryptedKey,
					metadata,
					stored_at: new Date().toISOString(),
				},
				updated_at: new Date().toISOString(),
			});

		if (error) {
			throw new Error(`Failed to store API key: ${error.message}`);
		}

		// Cache the decrypted key
		this.cacheKey(integrationId, apiKey);
	}

	/**
	 * Retrieve API key for an integration
	 */
	async retrieve(integrationId: string): Promise<string> {
		// Check cache first
		const cached = this.getCachedKey(integrationId);
		if (cached) {
			return cached;
		}

		// Fetch from database
		const { data, error } = await this.supabase
			.from('integration_credentials')
			.select('credentials')
			.eq('integration_id', integrationId)
			.single();

		if (error || !data) {
			throw new Error(`API key not found for integration: ${integrationId}`);
		}

		const creds = data.credentials as Record<string, unknown>;
		const encryptedKey = creds.api_key as string;

		// Decrypt the key
		const apiKey = this.decrypt(encryptedKey);

		// Cache the decrypted key
		this.cacheKey(integrationId, apiKey);

		return apiKey;
	}

	/**
	 * Rotate API key for an integration
	 */
	async rotate(integrationId: string, newApiKey: string): Promise<string> {
		// Store old key in rotation history
		const oldKey = await this.retrieve(integrationId);

		await this.supabase
			.from('integration_key_rotation_history')
			.insert({
				integration_id: integrationId,
				old_key_hash: this.hashKey(oldKey),
				rotated_at: new Date().toISOString(),
			});

		// Store new key
		await this.store(integrationId, newApiKey, {
			rotated: true,
			rotated_at: new Date().toISOString(),
		});

		// Invalidate cache
		this.invalidateCache(integrationId);

		return newApiKey;
	}

	/**
	 * Delete API key for an integration
	 */
	async delete(integrationId: string): Promise<void> {
		const { error } = await this.supabase
			.from('integration_credentials')
			.delete()
			.eq('integration_id', integrationId);

		if (error) {
			throw new Error(`Failed to delete API key: ${error.message}`);
		}

		// Invalidate cache
		this.invalidateCache(integrationId);
	}

	/**
	 * Check if API key exists for an integration
	 */
	async exists(integrationId: string): Promise<boolean> {
		const { data, error } = await this.supabase
			.from('integration_credentials')
			.select('integration_id')
			.eq('integration_id', integrationId)
			.single();

		return !error && !!data;
	}

	/**
	 * Get API key metadata
	 */
	async getMetadata(integrationId: string): Promise<Record<string, unknown> | null> {
		const { data, error } = await this.supabase
			.from('integration_credentials')
			.select('credentials')
			.eq('integration_id', integrationId)
			.single();

		if (error || !data) {
			return null;
		}

		const creds = data.credentials as Record<string, unknown>;
		return (creds.metadata as Record<string, unknown>) || null;
	}

	/**
	 * Update API key metadata
	 */
	async updateMetadata(integrationId: string, metadata: Record<string, unknown>): Promise<void> {
		const apiKey = await this.retrieve(integrationId);
		await this.store(integrationId, apiKey, metadata);
	}

	/**
	 * Generate a random API key
	 */
	generateKey(length = 32): string {
		return crypto.randomBytes(length).toString('base64url');
	}

	/**
	 * Hash API key for comparison (one-way)
	 */
	private hashKey(apiKey: string): string {
		return crypto.createHash('sha256').update(apiKey).digest('hex');
	}

	/**
	 * Verify API key matches stored hash
	 */
	async verify(integrationId: string, apiKey: string): Promise<boolean> {
		try {
			const storedKey = await this.retrieve(integrationId);
			return storedKey === apiKey;
		} catch {
			return false;
		}
	}

	/**
	 * Get rotation history for an integration
	 */
	async getRotationHistory(integrationId: string, limit = 10): Promise<Array<{
		rotatedAt: Date;
		oldKeyHash: string;
	}>> {
		const { data, error } = await this.supabase
			.from('integration_key_rotation_history')
			.select('old_key_hash, rotated_at')
			.eq('integration_id', integrationId)
			.order('rotated_at', { ascending: false })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to get rotation history: ${error.message}`);
		}

		return data.map((row) => ({
			rotatedAt: new Date(row.rotated_at),
			oldKeyHash: row.old_key_hash,
		}));
	}

	/**
	 * Cache API key in memory
	 */
	private cacheKey(integrationId: string, apiKey: string): void {
		this.cache.set(integrationId, {
			key: apiKey,
			expiresAt: Date.now() + this.cacheTimeout,
		});
	}

	/**
	 * Get cached API key
	 */
	private getCachedKey(integrationId: string): string | null {
		const cached = this.cache.get(integrationId);
		if (!cached) {
			return null;
		}

		// Check if expired
		if (cached.expiresAt < Date.now()) {
			this.cache.delete(integrationId);
			return null;
		}

		return cached.key;
	}

	/**
	 * Invalidate cache for integration
	 */
	private invalidateCache(integrationId: string): void {
		this.cache.delete(integrationId);
	}

	/**
	 * Clear all cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Batch store multiple API keys
	 */
	async batchStore(keys: Array<{ integrationId: string; apiKey: string; metadata?: Record<string, unknown> }>): Promise<void> {
		const promises = keys.map((item) => this.store(item.integrationId, item.apiKey, item.metadata));
		await Promise.all(promises);
	}

	/**
	 * Batch retrieve multiple API keys
	 */
	async batchRetrieve(integrationIds: string[]): Promise<Map<string, string>> {
		const results = new Map<string, string>();
		const promises = integrationIds.map(async (id) => {
			try {
				const key = await this.retrieve(id);
				results.set(id, key);
			} catch {
				// Skip if not found
			}
		});

		await Promise.all(promises);
		return results;
	}
}
