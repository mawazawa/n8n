/**
 * Biometric Authentication
 * Cross-platform biometric authentication abstraction
 */

import { EventEmitter } from 'events';
import {
	type BiometricAuthResult,
	BiometricAuthResultSchema,
	BiometricType,
	MobilePlatform,
} from './types';

/**
 * Biometric authentication manager
 */
export class BiometricAuth extends EventEmitter {
	private platform: MobilePlatform | null;

	constructor() {
		super();
		this.platform = this.detectPlatform();
	}

	/**
	 * Detect platform
	 */
	private detectPlatform(): MobilePlatform | null {
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
	 * Check if biometric authentication is available
	 */
	async isAvailable(): Promise<boolean> {
		if (!this.platform) {
			return false;
		}

		// This would call native APIs
		// For now, return based on platform
		return true;
	}

	/**
	 * Get available biometric type
	 */
	async getBiometricType(): Promise<BiometricType> {
		if (!this.platform) {
			return BiometricType.NONE;
		}

		if (this.platform === MobilePlatform.IOS) {
			// Check for Face ID or Touch ID
			// This would call native API
			return BiometricType.FACE_ID;
		} else if (this.platform === MobilePlatform.ANDROID) {
			// Check for fingerprint or face recognition
			// This would call native API
			return BiometricType.FINGERPRINT;
		}

		return BiometricType.NONE;
	}

	/**
	 * Authenticate with biometrics
	 */
	async authenticate(reason: string): Promise<BiometricAuthResult> {
		const available = await this.isAvailable();
		if (!available) {
			const result: BiometricAuthResult = {
				success: false,
				error: 'Biometric authentication is not available',
				biometricType: BiometricType.NONE,
				fallbackUsed: false,
			};
			return BiometricAuthResultSchema.parse(result);
		}

		const biometricType = await this.getBiometricType();

		try {
			// This would call native biometric API
			const success = await this.performBiometricAuth(reason);

			const result: BiometricAuthResult = {
				success,
				biometricType,
				fallbackUsed: false,
			};

			const validated = BiometricAuthResultSchema.parse(result);
			this.emit('authenticationCompleted', validated);

			return validated;
		} catch (error) {
			const result: BiometricAuthResult = {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				biometricType,
				fallbackUsed: false,
			};

			const validated = BiometricAuthResultSchema.parse(result);
			this.emit('authenticationFailed', validated);

			return validated;
		}
	}

	/**
	 * Authenticate with fallback to PIN/password
	 */
	async authenticateWithFallback(reason: string): Promise<BiometricAuthResult> {
		try {
			// Try biometric first
			const result = await this.authenticate(reason);
			if (result.success) {
				return result;
			}

			// Fall back to PIN/password
			const fallbackSuccess = await this.performFallbackAuth(reason);

			const fallbackResult: BiometricAuthResult = {
				success: fallbackSuccess,
				biometricType: await this.getBiometricType(),
				fallbackUsed: true,
			};

			const validated = BiometricAuthResultSchema.parse(fallbackResult);
			this.emit('fallbackAuthenticationCompleted', validated);

			return validated;
		} catch (error) {
			const result: BiometricAuthResult = {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				biometricType: await this.getBiometricType(),
				fallbackUsed: true,
			};

			return BiometricAuthResultSchema.parse(result);
		}
	}

	/**
	 * Perform biometric authentication (native)
	 */
	private async performBiometricAuth(reason: string): Promise<boolean> {
		// This would call native biometric API
		// For now, simulate success
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve(true);
			}, 500);
		});
	}

	/**
	 * Perform fallback authentication (PIN/password)
	 */
	private async performFallbackAuth(reason: string): Promise<boolean> {
		// This would show PIN/password dialog
		// For now, simulate success
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve(true);
			}, 500);
		});
	}

	/**
	 * Generate iOS biometric code
	 */
	generateIOSCode(): string {
		return `//
// iOS Biometric Authentication
//

import LocalAuthentication

class BiometricAuthenticator {
    func authenticate(reason: String) async throws -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            throw BiometricError.notAvailable
        }

        return try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: reason
        )
    }

    func getBiometricType() -> BiometricType {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            return .none
        }

        switch context.biometryType {
        case .faceID:
            return .faceID
        case .touchID:
            return .touchID
        @unknown default:
            return .none
        }
    }
}
`;
	}

	/**
	 * Generate Android biometric code
	 */
	generateAndroidCode(): string {
		return `//
// Android Biometric Authentication
//

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat

class BiometricAuthenticator(private val context: Context) {
    suspend fun authenticate(
        activity: FragmentActivity,
        reason: String
    ): Boolean = suspendCancellableCoroutine { continuation ->
        val executor = ContextCompat.getMainExecutor(context)

        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    continuation.resume(true)
                }

                override fun onAuthenticationFailed() {
                    continuation.resume(false)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    continuation.resumeWithException(Exception(errString.toString()))
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(reason)
            .setNegativeButtonText("Cancel")
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    fun isAvailable(): Boolean {
        val biometricManager = BiometricManager.from(context)
        return biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }
}
`;
	}
}
