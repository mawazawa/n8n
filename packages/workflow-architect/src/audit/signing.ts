/**
 * Audit Event Signing
 * Cryptographic signing for tamper-proof audit logs with chain verification
 */

import { createHash, createSign, createVerify, generateKeyPairSync, KeyObject } from 'crypto';
import type { AuditEvent, SignedEvent, SignatureVerification, KeyPair } from './types.js';

/**
 * Generate a new key pair for signing
 */
export function generateKeyPair(algorithm: 'RSA-SHA256' | 'ECDSA-SHA256' = 'RSA-SHA256'): KeyPair {
  let keyPair: { publicKey: KeyObject; privateKey: KeyObject };

  if (algorithm === 'RSA-SHA256') {
    keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
  } else {
    keyPair = generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
  }

  return {
    id: `key_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privateKey: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    algorithm,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Compute hash of an audit event
 */
export function hashEvent(event: AuditEvent): string {
  // Create a canonical representation of the event
  const canonical = {
    id: event.id,
    timestamp: event.timestamp,
    eventType: event.eventType,
    severity: event.severity,
    actor: event.actor,
    resource: event.resource,
    action: event.action,
    description: event.description,
    changes: event.changes,
    context: event.context,
    success: event.success,
    error: event.error,
    duration: event.duration,
  };

  // Create deterministic JSON (sorted keys)
  const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());

  // Compute SHA-256 hash
  return createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Sign an audit event
 */
export function signEvent(
  event: AuditEvent,
  privateKey: string,
  publicKeyId: string,
  previousEventHash?: string,
): SignedEvent {
  const eventHash = hashEvent(event);

  // Create signature payload
  const signaturePayload = previousEventHash
    ? `${eventHash}:${previousEventHash}`
    : eventHash;

  // Sign with private key
  const sign = createSign('SHA256');
  sign.update(signaturePayload);
  sign.end();
  const signature = sign.sign(privateKey, 'hex');

  return {
    ...event,
    signature,
    previousEventHash: previousEventHash ?? '',
    publicKeyId,
  };
}

/**
 * Verify an event signature
 */
export function verifySignature(
  event: SignedEvent,
  publicKey: string,
): SignatureVerification {
  try {
    const eventHash = hashEvent(event);

    // Create signature payload
    const signaturePayload = event.previousEventHash
      ? `${eventHash}:${event.previousEventHash}`
      : eventHash;

    // Verify signature
    const verify = createVerify('SHA256');
    verify.update(signaturePayload);
    verify.end();

    const valid = verify.verify(publicKey, event.signature, 'hex');

    return {
      valid,
      event,
    };
  } catch (error) {
    return {
      valid: false,
      event,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verify a chain of events
 */
export function verifyChain(
  events: SignedEvent[],
  publicKey: string,
): {
  valid: boolean;
  errors: Array<{ eventId: string; error: string }>;
  verifiedCount: number;
} {
  const errors: Array<{ eventId: string; error: string }> = [];
  let verifiedCount = 0;

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];

    // Verify signature
    const verification = verifySignature(event, publicKey);
    if (!verification.valid) {
      errors.push({
        eventId: event.id,
        error: verification.error ?? 'Invalid signature',
      });
      continue;
    }

    // Verify chain link
    if (i > 0) {
      const previousEvent = sortedEvents[i - 1];
      const previousHash = hashEvent(previousEvent);

      if (event.previousEventHash !== previousHash) {
        errors.push({
          eventId: event.id,
          error: 'Chain broken: previous event hash mismatch',
        });
        continue;
      }
    }

    verifiedCount++;
  }

  return {
    valid: errors.length === 0,
    errors,
    verifiedCount,
  };
}

/**
 * Event signer class for managing signing operations
 */
export class EventSigner {
  private keyPair: KeyPair;
  private lastEventHash?: string;

  constructor(keyPair?: KeyPair) {
    this.keyPair = keyPair ?? generateKeyPair();
  }

  /**
   * Get the public key
   */
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  /**
   * Get the public key ID
   */
  getPublicKeyId(): string {
    return this.keyPair.id;
  }

  /**
   * Get the key pair (including private key)
   * WARNING: Keep private key secure!
   */
  getKeyPair(): KeyPair {
    return { ...this.keyPair };
  }

  /**
   * Sign an event and update chain
   */
  sign(event: AuditEvent): SignedEvent {
    const signed = signEvent(
      event,
      this.keyPair.privateKey,
      this.keyPair.id,
      this.lastEventHash,
    );

    // Update last event hash for chain
    this.lastEventHash = hashEvent(event);

    return signed;
  }

  /**
   * Sign multiple events as a chain
   */
  signBatch(events: AuditEvent[]): SignedEvent[] {
    const signed: SignedEvent[] = [];

    for (const event of events) {
      signed.push(this.sign(event));
    }

    return signed;
  }

  /**
   * Reset the chain (start fresh)
   */
  resetChain(): void {
    this.lastEventHash = undefined;
  }

  /**
   * Rotate to a new key pair
   */
  rotate(): KeyPair {
    const oldKeyPair = this.keyPair;
    this.keyPair = generateKeyPair(this.keyPair.algorithm);
    this.keyPair.rotatedAt = new Date().toISOString();

    return oldKeyPair;
  }

  /**
   * Export key pair to JSON (for storage)
   */
  export(): string {
    return JSON.stringify(this.keyPair, null, 2);
  }

  /**
   * Import key pair from JSON
   */
  static import(json: string): EventSigner {
    const keyPair = JSON.parse(json) as KeyPair;
    return new EventSigner(keyPair);
  }
}

/**
 * Event verifier class for managing verification operations
 */
export class EventVerifier {
  private publicKey: string;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  /**
   * Verify a single event
   */
  verify(event: SignedEvent): SignatureVerification {
    return verifySignature(event, this.publicKey);
  }

  /**
   * Verify multiple events
   */
  verifyBatch(events: SignedEvent[]): SignatureVerification[] {
    return events.map((event) => this.verify(event));
  }

  /**
   * Verify a chain of events
   */
  verifyChain(events: SignedEvent[]): {
    valid: boolean;
    errors: Array<{ eventId: string; error: string }>;
    verifiedCount: number;
  } {
    return verifyChain(events, this.publicKey);
  }

  /**
   * Find the first tampered event in a chain
   */
  findTamperedEvent(events: SignedEvent[]): SignedEvent | null {
    const chainVerification = this.verifyChain(events);

    if (chainVerification.valid) {
      return null;
    }

    // Find first event with error
    const firstError = chainVerification.errors[0];
    if (!firstError) {
      return null;
    }

    return events.find((e) => e.id === firstError.eventId) ?? null;
  }
}

/**
 * Key rotation manager
 */
export class KeyRotationManager {
  private currentKey: KeyPair;
  private previousKeys: KeyPair[] = [];

  constructor(currentKey?: KeyPair) {
    this.currentKey = currentKey ?? generateKeyPair();
  }

  /**
   * Rotate to a new key
   */
  rotate(): void {
    // Mark current key as rotated
    this.currentKey.rotatedAt = new Date().toISOString();

    // Add to previous keys
    this.previousKeys.push(this.currentKey);

    // Generate new key
    this.currentKey = generateKeyPair(this.currentKey.algorithm);
  }

  /**
   * Get current key pair
   */
  getCurrentKey(): KeyPair {
    return { ...this.currentKey };
  }

  /**
   * Get all keys (current + previous)
   */
  getAllKeys(): KeyPair[] {
    return [this.currentKey, ...this.previousKeys];
  }

  /**
   * Get a key by ID
   */
  getKeyById(id: string): KeyPair | undefined {
    if (this.currentKey.id === id) {
      return this.currentKey;
    }

    return this.previousKeys.find((k) => k.id === id);
  }

  /**
   * Verify an event using the correct key
   */
  verifyWithRotation(event: SignedEvent): SignatureVerification {
    const key = this.getKeyById(event.publicKeyId);

    if (!key) {
      return {
        valid: false,
        event,
        error: 'Public key not found',
      };
    }

    return verifySignature(event, key.publicKey);
  }

  /**
   * Clean up old keys (keep only N previous keys)
   */
  cleanup(keepCount = 3): void {
    if (this.previousKeys.length > keepCount) {
      this.previousKeys = this.previousKeys.slice(-keepCount);
    }
  }
}
