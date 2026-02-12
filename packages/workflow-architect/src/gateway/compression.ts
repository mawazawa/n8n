import type { Request, Response, NextFunction } from 'express';
import { gzip, brotliCompress } from 'zlib';
import { promisify } from 'util';
import type { CompressionPolicyConfig } from './types.js';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * Response compression handler
 * Supports gzip and Brotli compression
 */
export class CompressionHandler {
	private config: CompressionPolicyConfig;

	constructor(config: CompressionPolicyConfig) {
		this.config = config;
	}

	/**
	 * Express middleware
	 */
	middleware() {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			// Check if client supports compression
			const acceptEncoding = req.headers['accept-encoding'] ?? '';

			const supportsBrotli = this.config.brotli && acceptEncoding.includes('br');
			const supportsGzip = this.config.gzip && acceptEncoding.includes('gzip');

			if (!supportsBrotli && !supportsGzip) {
				next();
				return;
			}

			// Intercept response
			const originalSend = res.send.bind(res);
			res.send = (async (body: unknown): Promise<Response> => {
				// Check if response should be compressed
				if (!this.shouldCompress(res, body)) {
					return originalSend(body);
				}

				try {
					let compressed: Buffer;
					let encoding: string;

					// Convert body to buffer
					const buffer = Buffer.isBuffer(body)
						? body
						: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));

					// Choose compression method (prefer Brotli)
					if (supportsBrotli) {
						compressed = await brotliAsync(buffer);
						encoding = 'br';
					} else if (supportsGzip) {
						compressed = await gzipAsync(buffer, { level: this.config.level });
						encoding = 'gzip';
					} else {
						return originalSend(body);
					}

					// Set headers
					res.setHeader('Content-Encoding', encoding);
					res.setHeader('Content-Length', compressed.length.toString());
					res.removeHeader('Content-Length'); // Let Express set it

					// Add Vary header
					const varyHeader = res.getHeader('Vary') as string | undefined;
					if (varyHeader) {
						if (!varyHeader.includes('Accept-Encoding')) {
							res.setHeader('Vary', `${varyHeader}, Accept-Encoding`);
						}
					} else {
						res.setHeader('Vary', 'Accept-Encoding');
					}

					return originalSend(compressed);
				} catch (error) {
					// Compression failed, send uncompressed
					return originalSend(body);
				}
			}) as Response['send'];

			next();
		};
	}

	/**
	 * Check if response should be compressed
	 */
	private shouldCompress(res: Response, body: unknown): boolean {
		// Check if already compressed
		if (res.getHeader('Content-Encoding')) {
			return false;
		}

		// Check Content-Type
		const contentType = res.getHeader('Content-Type') as string | undefined;
		if (contentType && !this.isMimeTypeCompressible(contentType)) {
			return false;
		}

		// Check size threshold
		const size = this.getBodySize(body);
		if (size < this.config.threshold) {
			return false;
		}

		return true;
	}

	/**
	 * Check if MIME type is compressible
	 */
	private isMimeTypeCompressible(contentType: string): boolean {
		// Extract base type (remove charset, etc.)
		const baseType = contentType.split(';')[0]?.trim();

		if (!baseType) {
			return false;
		}

		return this.config.mimeTypes.some((type) => {
			// Exact match
			if (type === baseType) {
				return true;
			}

			// Wildcard match (e.g., text/*)
			if (type.endsWith('/*')) {
				const prefix = type.slice(0, -2);
				return baseType.startsWith(prefix);
			}

			return false;
		});
	}

	/**
	 * Get body size
	 */
	private getBodySize(body: unknown): number {
		if (Buffer.isBuffer(body)) {
			return body.length;
		}

		if (typeof body === 'string') {
			return Buffer.byteLength(body);
		}

		// For objects, estimate size
		return Buffer.byteLength(JSON.stringify(body));
	}

	/**
	 * Update configuration
	 */
	configure(config: Partial<CompressionPolicyConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): CompressionPolicyConfig {
		return { ...this.config };
	}

	/**
	 * Add compressible MIME type
	 */
	addMimeType(mimeType: string): void {
		if (!this.config.mimeTypes.includes(mimeType)) {
			this.config.mimeTypes.push(mimeType);
		}
	}

	/**
	 * Remove compressible MIME type
	 */
	removeMimeType(mimeType: string): void {
		this.config.mimeTypes = this.config.mimeTypes.filter((type) => type !== mimeType);
	}

	/**
	 * Set compression level (0-9)
	 */
	setLevel(level: number): void {
		this.config.level = Math.max(-1, Math.min(9, level));
	}

	/**
	 * Set size threshold
	 */
	setThreshold(threshold: number): void {
		this.config.threshold = Math.max(0, threshold);
	}

	/**
	 * Enable/disable Brotli
	 */
	setBrotli(enabled: boolean): void {
		this.config.brotli = enabled;
	}

	/**
	 * Enable/disable Gzip
	 */
	setGzip(enabled: boolean): void {
		this.config.gzip = enabled;
	}
}
