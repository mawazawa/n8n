/**
 * Webhook Security
 * Signature generation and verification for webhook payloads
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SignatureType } from './types.js';

export class WebhookSecurity {
  /**
   * Sign a payload with the given secret and signature type
   */
  sign(payload: Record<string, unknown>, secret: string, signatureType: SignatureType): string {
    const payloadString = JSON.stringify(payload);

    switch (signatureType) {
      case 'hmac-sha256':
        return this.signHmac(payloadString, secret, 'sha256');

      case 'hmac-sha1':
        return this.signHmac(payloadString, secret, 'sha1');

      case 'jwt':
        return this.signJwt(payload, secret);

      case 'basic':
        return this.signBasic(secret);

      case 'none':
        return '';

      default:
        throw new Error(`Unsupported signature type: ${signatureType}`);
    }
  }

  /**
   * Verify a signature against a payload
   */
  verify(
    payload: Record<string, unknown>,
    signature: string,
    secret: string,
    signatureType: SignatureType,
  ): boolean {
    if (signatureType === 'none') {
      return true;
    }

    try {
      const expectedSignature = this.sign(payload, secret, signatureType);
      return this.timingSafeCompare(signature, expectedSignature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get signature header name for a given signature type
   */
  getSignatureHeaderName(signatureType: SignatureType): string {
    switch (signatureType) {
      case 'hmac-sha256':
      case 'hmac-sha1':
        return 'X-Webhook-Signature';

      case 'jwt':
        return 'Authorization';

      case 'basic':
        return 'Authorization';

      case 'none':
        return '';

      default:
        throw new Error(`Unsupported signature type: ${signatureType}`);
    }
  }

  /**
   * Get the full signature value including any required prefix
   */
  getSignatureValue(signature: string, signatureType: SignatureType): string {
    switch (signatureType) {
      case 'hmac-sha256':
        return `sha256=${signature}`;

      case 'hmac-sha1':
        return `sha1=${signature}`;

      case 'jwt':
        return `Bearer ${signature}`;

      case 'basic':
        return `Basic ${signature}`;

      case 'none':
        return '';

      default:
        return signature;
    }
  }

  /**
   * Sign with HMAC
   */
  private signHmac(payload: string, secret: string, algorithm: 'sha256' | 'sha1'): string {
    const hmac = createHmac(algorithm, secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Sign with JWT (simple implementation)
   */
  private signJwt(payload: Record<string, unknown>, secret: string): string {
    // Simple JWT implementation - in production, use a proper JWT library
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      iat: now,
      exp: now + 300, // 5 minutes
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(jwtPayload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url');

    return `${signatureInput}.${signature}`;
  }

  /**
   * Sign with Basic Auth
   */
  private signBasic(secret: string): string {
    // For Basic auth, we use the secret as the password with 'webhook' as username
    const credentials = `webhook:${secret}`;
    return Buffer.from(credentials).toString('base64');
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    try {
      const bufferA = Buffer.from(a);
      const bufferB = Buffer.from(b);
      return timingSafeEqual(bufferA, bufferB);
    } catch {
      return false;
    }
  }

  /**
   * Extract signature from header value
   */
  extractSignature(headerValue: string, signatureType: SignatureType): string {
    switch (signatureType) {
      case 'hmac-sha256':
        return headerValue.replace(/^sha256=/, '');

      case 'hmac-sha1':
        return headerValue.replace(/^sha1=/, '');

      case 'jwt':
        return headerValue.replace(/^Bearer /, '');

      case 'basic':
        return headerValue.replace(/^Basic /, '');

      case 'none':
        return '';

      default:
        return headerValue;
    }
  }

  /**
   * Validate signature format
   */
  validateSignatureFormat(signature: string, signatureType: SignatureType): boolean {
    switch (signatureType) {
      case 'hmac-sha256':
        // SHA256 produces 64 hex characters
        return /^[a-f0-9]{64}$/i.test(signature);

      case 'hmac-sha1':
        // SHA1 produces 40 hex characters
        return /^[a-f0-9]{40}$/i.test(signature);

      case 'jwt':
        // JWT has three parts separated by dots
        return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(signature);

      case 'basic':
        // Basic auth is base64 encoded
        return /^[A-Za-z0-9+/]+=*$/.test(signature);

      case 'none':
        return true;

      default:
        return false;
    }
  }
}

/**
 * Create a webhook security instance
 */
export function createWebhookSecurity(): WebhookSecurity {
  return new WebhookSecurity();
}
