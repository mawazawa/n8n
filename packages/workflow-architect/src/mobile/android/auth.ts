/**
 * Android Authentication
 * Generate Android authentication code with BiometricPrompt and Custom Tabs
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate Android authentication components
 */
export function generateAndroidAuth(options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}.auth

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Authentication manager
 */
class AuthenticationManager(
    private val context: Context,
    private val clientId: String,
    private val redirectUri: String
) {
    private val storageManager = StorageManager(context, encryptionEnabled = true)
    private val biometricAuth = BiometricAuthenticator(context)

    private val _authState = MutableStateFlow<AuthState>(AuthState.Unauthenticated)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private var currentToken: OAuth2Token? = null

    init {
        // Load saved token
        currentToken = loadToken()
        if (currentToken != null && !isTokenExpired(currentToken!!)) {
            _authState.value = AuthState.Authenticated
        }
    }

    /**
     * Authenticate user with OAuth2
     */
    suspend fun authenticate(): Result<AuthResult> {
        return try {
            val authResult = startOAuth2Flow()
            currentToken = OAuth2Token.from(authResult)
            saveToken(currentToken!!)
            _authState.value = AuthState.Authenticated
            Result.success(authResult)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Logout user
     */
    suspend fun logout() {
        currentToken = null
        deleteToken()
        _authState.value = AuthState.Unauthenticated
    }

    /**
     * Refresh access token
     */
    suspend fun refreshToken(): Result<AuthResult> {
        val token = currentToken ?: return Result.failure(
            AuthException.NoRefreshToken
        )

        val refreshToken = token.refreshToken ?: return Result.failure(
            AuthException.NoRefreshToken
        )

        return try {
            val authResult = performTokenRefresh(refreshToken)
            currentToken = OAuth2Token.from(authResult)
            saveToken(currentToken!!)
            Result.success(authResult)
        } catch (e: Exception) {
            logout()
            Result.failure(e)
        }
    }

    /**
     * Get current access token
     */
    suspend fun getAccessToken(): Result<String> {
        val token = currentToken ?: return Result.failure(
            AuthException.NotAuthenticated
        )

        return if (isTokenExpired(token)) {
            refreshToken().map { it.accessToken }
        } else {
            Result.success(token.accessToken)
        }
    }

    /**
     * Authenticate with biometric
     */
    suspend fun authenticateWithBiometric(activity: FragmentActivity): Result<Boolean> {
        return biometricAuth.authenticate(
            activity,
            "Authenticate to access your account"
        )
    }

    private suspend fun startOAuth2Flow(): AuthResult {
        // Build authorization URL
        val authUrl = Uri.parse("https://auth.example.com/authorize").buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("scope", "openid profile email")
            .build()

        // Launch Custom Tabs
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()

        customTabsIntent.launchUrl(context, authUrl)

        // Wait for callback (this would be handled by deep link)
        // For now, return mock result
        return AuthResult(
            accessToken = "mock_access_token",
            refreshToken = "mock_refresh_token",
            expiresIn = 3600
        )
    }

    private suspend fun performTokenRefresh(refreshToken: String): AuthResult {
        // Make API call to refresh token
        throw AuthException.RefreshFailed
    }

    private fun isTokenExpired(token: OAuth2Token): Boolean {
        return token.expiresAt < System.currentTimeMillis()
    }

    private fun saveToken(token: OAuth2Token) {
        storageManager.saveSecure("auth_token", token)
    }

    private fun loadToken(): OAuth2Token? {
        return storageManager.loadSecure("auth_token")
    }

    private fun deleteToken() {
        storageManager.delete("auth_token")
    }
}

/**
 * OAuth2 token
 */
@kotlinx.serialization.Serializable
data class OAuth2Token(
    val accessToken: String,
    val refreshToken: String?,
    val tokenType: String,
    val expiresIn: Int,
    val expiresAt: Long
) {
    companion object {
        fun from(authResult: AuthResult): OAuth2Token {
            return OAuth2Token(
                accessToken = authResult.accessToken,
                refreshToken = authResult.refreshToken,
                tokenType = "Bearer",
                expiresIn = authResult.expiresIn,
                expiresAt = System.currentTimeMillis() + (authResult.expiresIn * 1000)
            )
        }
    }
}

/**
 * Biometric authenticator
 */
class BiometricAuthenticator(private val context: Context) {
    private val biometricManager = BiometricManager.from(context)

    /**
     * Check if biometric authentication is available
     */
    fun isAvailable(): Boolean {
        return when (biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )) {
            BiometricManager.BIOMETRIC_SUCCESS -> true
            else -> false
        }
    }

    /**
     * Get biometric type
     */
    fun getBiometricType(): BiometricType {
        return if (isAvailable()) {
            BiometricType.FINGERPRINT
        } else {
            BiometricType.NONE
        }
    }

    /**
     * Authenticate with biometrics
     */
    suspend fun authenticate(
        activity: FragmentActivity,
        reason: String
    ): Result<Boolean> = suspendCancellableCoroutine { continuation ->
        val executor = ContextCompat.getMainExecutor(context)

        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    continuation.resume(Result.success(true))
                }

                override fun onAuthenticationFailed() {
                    continuation.resume(
                        Result.failure(BiometricException.Failed)
                    )
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence
                ) {
                    continuation.resume(
                        Result.failure(BiometricException.Error(errString.toString()))
                    )
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(reason)
            .setNegativeButtonText("Cancel")
            .build()

        biometricPrompt.authenticate(promptInfo)
    }
}

/**
 * Biometric type
 */
enum class BiometricType {
    FINGERPRINT,
    FACE,
    IRIS,
    NONE
}

/**
 * Auth exceptions
 */
sealed class AuthException(message: String) : Exception(message) {
    object NotAuthenticated : AuthException("User is not authenticated")
    object NoRefreshToken : AuthException("No refresh token available")
    object RefreshFailed : AuthException("Failed to refresh token")
}

/**
 * Biometric exceptions
 */
sealed class BiometricException(message: String) : Exception(message) {
    object NotAvailable : BiometricException("Biometric authentication is not available")
    object Failed : BiometricException("Biometric authentication failed")
    class Error(message: String) : BiometricException(message)
}
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/auth/AuthenticationManager.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}
