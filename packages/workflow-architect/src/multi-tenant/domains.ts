import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Domain, DomainSchema } from './types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'node:crypto';

/**
 * Domain verification method
 */
export enum VerificationMethod {
	DNS_TXT = 'DNS_TXT',
	DNS_CNAME = 'DNS_CNAME',
	FILE = 'FILE',
}

/**
 * SSL certificate provider
 */
export enum SSLProvider {
	LETS_ENCRYPT = 'LETS_ENCRYPT',
	CUSTOM = 'CUSTOM',
	CLOUDFLARE = 'CLOUDFLARE',
}

/**
 * DomainManager handles custom domains
 */
export class DomainManager {
	private supabase: SupabaseClient;

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey);
	}

	/**
	 * Add a custom domain
	 */
	async addDomain(tenantId: string, domain: string): Promise<Domain> {
		// Validate domain format
		const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
		if (!domainRegex.test(domain.toLowerCase())) {
			throw new Error('Invalid domain format');
		}

		// Check if domain is already taken
		const { data: existing } = await this.supabase
			.from('tenant_domains')
			.select('id')
			.eq('domain', domain.toLowerCase())
			.single();

		if (existing) {
			throw new Error('Domain is already in use');
		}

		// Generate verification token
		const verificationToken = this.generateVerificationToken();

		// Create domain record
		const newDomain: Domain = {
			id: uuidv4(),
			tenantId,
			domain: domain.toLowerCase(),
			verified: false,
			verificationToken,
			sslEnabled: false,
			createdAt: new Date(),
		};

		// Validate domain object
		DomainSchema.parse(newDomain);

		// Insert into database
		const { error } = await this.supabase.from('tenant_domains').insert({
			id: newDomain.id,
			tenant_id: newDomain.tenantId,
			domain: newDomain.domain,
			verified: newDomain.verified,
			verification_token: newDomain.verificationToken,
			ssl_enabled: newDomain.sslEnabled,
			created_at: newDomain.createdAt.toISOString(),
		});

		if (error) {
			throw new Error(`Failed to add domain: ${error.message}`);
		}

		return newDomain;
	}

	/**
	 * Verify domain ownership
	 */
	async verifyDomain(domain: string, method?: VerificationMethod): Promise<boolean> {
		// Get domain record
		const { data: domainRecord, error } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('domain', domain.toLowerCase())
			.single();

		if (error || !domainRecord) {
			throw new Error('Domain not found');
		}

		// Verify based on method
		const verificationMethod = method ?? VerificationMethod.DNS_TXT;
		let isVerified = false;

		switch (verificationMethod) {
			case VerificationMethod.DNS_TXT:
				isVerified = await this.verifyDNSTXT(domain, domainRecord.verification_token);
				break;
			case VerificationMethod.DNS_CNAME:
				isVerified = await this.verifyDNSCNAME(domain);
				break;
			case VerificationMethod.FILE:
				isVerified = await this.verifyFile(domain, domainRecord.verification_token);
				break;
		}

		if (isVerified) {
			// Update domain as verified
			await this.supabase
				.from('tenant_domains')
				.update({
					verified: true,
					verified_at: new Date().toISOString(),
				})
				.eq('id', domainRecord.id);
		}

		return isVerified;
	}

	/**
	 * Remove a domain
	 */
	async removeDomain(domainId: string): Promise<void> {
		const { error } = await this.supabase
			.from('tenant_domains')
			.delete()
			.eq('id', domainId);

		if (error) {
			throw new Error(`Failed to remove domain: ${error.message}`);
		}
	}

	/**
	 * Get domains for a tenant
	 */
	async getDomains(tenantId: string): Promise<Domain[]> {
		const { data, error } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('tenant_id', tenantId);

		if (error) {
			throw new Error(`Failed to get domains: ${error.message}`);
		}

		return (data ?? []).map((row) => this.mapToDomain(row));
	}

	/**
	 * Get domain by name
	 */
	async getDomain(domain: string): Promise<Domain | null> {
		const { data, error } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('domain', domain.toLowerCase())
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return null;
			}
			throw new Error(`Failed to get domain: ${error.message}`);
		}

		if (!data) {
			return null;
		}

		return this.mapToDomain(data);
	}

	/**
	 * Setup SSL certificate
	 */
	async setupSSL(
		domainId: string,
		provider: SSLProvider,
		options?: {
			certificate?: string;
			privateKey?: string;
		},
	): Promise<void> {
		const { data: domainRecord } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('id', domainId)
			.single();

		if (!domainRecord) {
			throw new Error('Domain not found');
		}

		if (!domainRecord.verified) {
			throw new Error('Domain must be verified before setting up SSL');
		}

		let certificate: string | undefined;
		let privateKey: string | undefined;

		if (provider === SSLProvider.CUSTOM) {
			if (!options?.certificate || !options?.privateKey) {
				throw new Error('Certificate and private key required for custom SSL');
			}
			certificate = options.certificate;
			privateKey = options.privateKey;
		} else if (provider === SSLProvider.LETS_ENCRYPT) {
			// Request Let's Encrypt certificate
			const cert = await this.requestLetsEncryptCertificate(domainRecord.domain);
			certificate = cert.certificate;
			privateKey = cert.privateKey;
		}

		// Update domain with SSL info
		await this.supabase
			.from('tenant_domains')
			.update({
				ssl_enabled: true,
				ssl_certificate: certificate,
				ssl_private_key: privateKey,
			})
			.eq('id', domainId);
	}

	/**
	 * Renew SSL certificate
	 */
	async renewSSL(domainId: string): Promise<void> {
		const { data: domainRecord } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('id', domainId)
			.single();

		if (!domainRecord || !domainRecord.ssl_enabled) {
			throw new Error('Domain does not have SSL enabled');
		}

		// Request new certificate
		const cert = await this.requestLetsEncryptCertificate(domainRecord.domain);

		// Update domain with new certificate
		await this.supabase
			.from('tenant_domains')
			.update({
				ssl_certificate: cert.certificate,
				ssl_private_key: cert.privateKey,
			})
			.eq('id', domainId);
	}

	/**
	 * Get verification instructions
	 */
	getVerificationInstructions(
		domain: string,
		verificationToken: string,
		method: VerificationMethod,
	): {
		method: VerificationMethod;
		instructions: string;
		record?: { type: string; name: string; value: string };
	} {
		switch (method) {
			case VerificationMethod.DNS_TXT:
				return {
					method,
					instructions: `Add a TXT record to your DNS with the following details:`,
					record: {
						type: 'TXT',
						name: '_verification',
						value: verificationToken,
					},
				};

			case VerificationMethod.DNS_CNAME:
				return {
					method,
					instructions: `Add a CNAME record to your DNS with the following details:`,
					record: {
						type: 'CNAME',
						name: domain,
						value: 'verify.example.com',
					},
				};

			case VerificationMethod.FILE:
				return {
					method,
					instructions: `Upload a file to your domain with the following content:\n\nPath: /.well-known/tenant-verification.txt\nContent: ${verificationToken}`,
				};

			default:
				throw new Error('Unknown verification method');
		}
	}

	/**
	 * Verify DNS TXT record
	 */
	private async verifyDNSTXT(domain: string, expectedToken: string): Promise<boolean> {
		try {
			// This would use a DNS library to check TXT records
			// For now, simulate verification
			console.log(`Verifying DNS TXT record for ${domain}`);
			console.log(`Expected token: ${expectedToken}`);

			// In production, this would do:
			// const records = await dns.resolveTxt(`_verification.${domain}`);
			// return records.some(record => record[0] === expectedToken);

			return false; // Return false until actual DNS verification is implemented
		} catch (error) {
			console.error('DNS TXT verification failed:', error);
			return false;
		}
	}

	/**
	 * Verify DNS CNAME record
	 */
	private async verifyDNSCNAME(domain: string): Promise<boolean> {
		try {
			// This would use a DNS library to check CNAME records
			console.log(`Verifying DNS CNAME record for ${domain}`);

			// In production, this would do:
			// const records = await dns.resolveCname(domain);
			// return records.includes('verify.example.com');

			return false;
		} catch (error) {
			console.error('DNS CNAME verification failed:', error);
			return false;
		}
	}

	/**
	 * Verify file-based verification
	 */
	private async verifyFile(domain: string, expectedToken: string): Promise<boolean> {
		try {
			// This would fetch the verification file from the domain
			console.log(`Verifying file for ${domain}`);

			// In production, this would do:
			// const response = await fetch(`https://${domain}/.well-known/tenant-verification.txt`);
			// const content = await response.text();
			// return content.trim() === expectedToken;

			return false;
		} catch (error) {
			console.error('File verification failed:', error);
			return false;
		}
	}

	/**
	 * Request Let's Encrypt certificate
	 */
	private async requestLetsEncryptCertificate(
		domain: string,
	): Promise<{ certificate: string; privateKey: string }> {
		// This would integrate with ACME protocol to request a certificate
		console.log(`Requesting Let's Encrypt certificate for ${domain}`);

		// Placeholder implementation
		return {
			certificate: 'CERTIFICATE_PLACEHOLDER',
			privateKey: 'PRIVATE_KEY_PLACEHOLDER',
		};
	}

	/**
	 * Generate verification token
	 */
	private generateVerificationToken(): string {
		return crypto.randomBytes(32).toString('hex');
	}

	/**
	 * Map database row to Domain object
	 */
	private mapToDomain(row: Record<string, unknown>): Domain {
		return DomainSchema.parse({
			id: row.id,
			tenantId: row.tenant_id,
			domain: row.domain,
			verified: row.verified,
			verificationToken: row.verification_token,
			sslEnabled: row.ssl_enabled,
			sslCertificate: row.ssl_certificate,
			sslPrivateKey: row.ssl_private_key,
			createdAt: new Date(row.created_at as string),
			verifiedAt: row.verified_at ? new Date(row.verified_at as string) : undefined,
		});
	}

	/**
	 * Check SSL certificate expiry
	 */
	async checkCertificateExpiry(domainId: string): Promise<{
		domain: string;
		expiresAt: Date;
		daysUntilExpiry: number;
		needsRenewal: boolean;
	} | null> {
		// This would parse the SSL certificate and check expiry
		console.log(`Checking certificate expiry for domain ${domainId}`);

		return null;
	}

	/**
	 * Auto-renew expiring certificates
	 */
	async autoRenewCertificates(): Promise<void> {
		// Get all domains with SSL enabled
		const { data: domains } = await this.supabase
			.from('tenant_domains')
			.select('*')
			.eq('ssl_enabled', true);

		for (const domain of domains ?? []) {
			try {
				const expiry = await this.checkCertificateExpiry(domain.id);

				// Renew if expires in less than 30 days
				if (expiry && expiry.daysUntilExpiry < 30) {
					await this.renewSSL(domain.id);
					console.log(`Renewed SSL certificate for ${domain.domain}`);
				}
			} catch (error) {
				console.error(`Failed to renew certificate for ${domain.domain}:`, error);
			}
		}
	}
}
