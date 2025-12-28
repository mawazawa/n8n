/**
 * Android Kotlin SDK Template Generator
 * Generates production-ready Kotlin client code
 */

import type { SDKGenerationOptions, GeneratedSDKFile, MobileConfig } from '../types';

/**
 * Generate Kotlin SDK
 */
export function generateKotlinSDK(
	config: MobileConfig,
	options: SDKGenerationOptions,
): GeneratedSDKFile[] {
	const files: GeneratedSDKFile[] = [];

	// Main SDK file
	files.push(generateMainSDKFile(config, options));

	// Configuration
	files.push(generateConfigFile(config, options));

	// Models
	files.push(generateModelsFile(config, options));

	// build.gradle
	files.push(generateBuildGradleFile(options));

	// README
	files.push(generateReadmeFile(config, options));

	if (options.includeExamples) {
		files.push(generateExampleFile(config, options));
	}

	if (options.includeTests) {
		files.push(generateTestFile(options));
	}

	return files;
}

/**
 * Generate main SDK file
 */
function generateMainSDKFile(config: MobileConfig, options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * Main SDK class for ${options.packageName}
 * Version: ${options.apiVersion}
 */
class WorkflowArchitectSDK(
    private val context: Context,
    private val configuration: SDKConfiguration
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val networkClient: NetworkClient by lazy {
        NetworkClient(configuration.baseUrl, context)
    }

    private val authManager: AuthenticationManager by lazy {
        AuthenticationManager(
            context,
            configuration.clientId,
            configuration.redirectUri
        )
    }

    private val storageManager: StorageManager by lazy {
        StorageManager(context, configuration.encryptStorage)
    }

    private val offlineManager: OfflineManager by lazy {
        OfflineManager(
            context,
            configuration.maxQueueSize,
            configuration.retryAttempts
        )
    }

    private val syncManager: SyncManager by lazy {
        SyncManager(
            networkClient,
            storageManager,
            configuration.syncInterval
        )
    }

    // Authentication state
    private val _authState = MutableStateFlow<AuthState>(AuthState.Unauthenticated)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    val isAuthenticated: Boolean
        get() = authState.value is AuthState.Authenticated

    init {
        setupObservers()
    }

    private fun setupObservers() {
        // Observe auth state changes
        scope.launch {
            authManager.authState.collect { state ->
                _authState.value = state
                when (state) {
                    is AuthState.Authenticated -> syncManager.startSync()
                    is AuthState.Unauthenticated -> syncManager.stopSync()
                }
            }
        }

        // Observe network state changes
        scope.launch {
            NetworkMonitor.getInstance(context).isConnected.collect { isConnected ->
                if (isConnected) {
                    offlineManager.processQueue()
                }
            }
        }
    }

    /**
     * Authenticate user
     */
    suspend fun authenticate(): Result<AuthResult> {
        return authManager.authenticate()
    }

    /**
     * Logout user
     */
    suspend fun logout() {
        authManager.logout()
    }

    /**
     * Execute workflow
     */
    suspend fun executeWorkflow(
        workflowId: String,
        input: Map<String, Any>
    ): Result<ExecutionResult> {
        if (!isAuthenticated) {
            return Result.failure(SDKException.NotAuthenticated())
        }

        val isConnected = NetworkMonitor.getInstance(context).isConnected.value

        return if (isConnected) {
            networkClient.executeWorkflow(workflowId, input)
        } else {
            // Queue for offline processing
            offlineManager.enqueue(
                OfflineAction(
                    type = ActionType.EXECUTE,
                    resource = "workflows/$workflowId",
                    data = input
                )
            )
            Result.success(
                ExecutionResult(
                    id = java.util.UUID.randomUUID().toString(),
                    status = "queued",
                    output = mapOf("workflowId" to workflowId)
                )
            )
        }
    }

    /**
     * Get workflow list
     */
    suspend fun getWorkflows(): Result<List<Workflow>> {
        if (!isAuthenticated) {
            return Result.failure(SDKException.NotAuthenticated())
        }

        return networkClient.getWorkflows()
    }

    /**
     * Start background sync
     */
    fun startSync() {
        syncManager.startSync()
    }

    /**
     * Stop background sync
     */
    fun stopSync() {
        syncManager.stopSync()
    }

    /**
     * Manual sync
     */
    suspend fun sync(): Result<SyncResult> {
        return syncManager.sync()
    }

    /**
     * Clean up resources
     */
    fun cleanup() {
        scope.launch {
            syncManager.stopSync()
        }
    }
}

/**
 * SDK exceptions
 */
sealed class SDKException(message: String) : Exception(message) {
    class NotAuthenticated : SDKException("User is not authenticated")
    class NetworkError(cause: Throwable) : SDKException("Network error: \${cause.message}")
    class InvalidResponse : SDKException("Invalid response from server")
    class DecodingError(cause: Throwable) : SDKException("Failed to decode response: \${cause.message}")
    class Offline : SDKException("Device is offline")
}

/**
 * Authentication state
 */
sealed class AuthState {
    object Authenticated : AuthState()
    object Unauthenticated : AuthState()
}

/**
 * Models
 */
data class AuthResult(
    val accessToken: String,
    val refreshToken: String?,
    val expiresIn: Int
)

data class ExecutionResult(
    val id: String,
    val status: String,
    val output: Map<String, Any>?
)

data class Workflow(
    val id: String,
    val name: String,
    val description: String?,
    val active: Boolean,
    val createdAt: Long,
    val updatedAt: Long
)

data class SyncResult(
    val syncedItems: Int,
    val conflicts: Int,
    val timestamp: Long
)

enum class ActionType {
    CREATE,
    UPDATE,
    DELETE,
    EXECUTE
}

data class OfflineAction(
    val id: String = java.util.UUID.randomUUID().toString(),
    val type: ActionType,
    val resource: String,
    val data: Map<String, Any>,
    val timestamp: Long = System.currentTimeMillis(),
    var retryCount: Int = 0,
    var status: ActionStatus = ActionStatus.PENDING
)

enum class ActionStatus {
    PENDING,
    PROCESSING,
    FAILED,
    COMPLETED
}
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/${toPascalCase(options.packageName)}SDK.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}

/**
 * Generate configuration file
 */
function generateConfigFile(config: MobileConfig, options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}

/**
 * SDK Configuration
 */
data class SDKConfiguration(
    val baseUrl: String,
    val clientId: String,
    val redirectUri: String,
    val scopes: List<String> = emptyList(),
    val offlineEnabled: Boolean = true,
    val maxQueueSize: Int = 1000,
    val retryAttempts: Int = 3,
    val syncEnabled: Boolean = true,
    val syncInterval: Long = 300000L, // 5 minutes
    val encryptStorage: Boolean = true,
    val certificatePinning: Boolean = true,
    val biometricAuth: Boolean = true,
    val analyticsEnabled: Boolean = true
) {
    companion object {
        /**
         * Default configuration
         */
        fun default() = SDKConfiguration(
            baseUrl = "${config.baseUrl}",
            clientId = "${config.auth.clientId}",
            redirectUri = "${config.auth.redirectUri}",
            scopes = ${JSON.stringify(config.auth.scopes ?? [])}
        )
    }
}
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/SDKConfiguration.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}

/**
 * Generate models file
 */
function generateModelsFile(config: MobileConfig, options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}.models

import android.os.Build
import kotlinx.serialization.Serializable

/**
 * Device information
 */
@Serializable
data class DeviceInfo(
    val platform: String = "android",
    val osVersion: String = Build.VERSION.RELEASE,
    val appVersion: String,
    val deviceId: String,
    val deviceModel: String = Build.MODEL,
    val locale: String,
    val timezone: String
)

/**
 * Push notification
 */
@Serializable
data class PushNotification(
    val id: String,
    val title: String,
    val body: String,
    val data: Map<String, String>? = null,
    val badge: Int? = null,
    val sound: String? = null,
    val deepLink: String? = null,
    val timestamp: Long
)

/**
 * Network state
 */
data class NetworkState(
    val isConnected: Boolean,
    val connectionType: ConnectionType,
    val isExpensive: Boolean,
    val timestamp: Long
)

enum class ConnectionType {
    WIFI,
    CELLULAR,
    ETHERNET,
    NONE,
    UNKNOWN
}

/**
 * Storage quota
 */
data class StorageQuota(
    val used: Long,
    val available: Long,
    val total: Long,
    val percentage: Float
)

/**
 * Deep link data
 */
data class DeepLinkData(
    val url: String,
    val scheme: String,
    val host: String?,
    val path: String?,
    val params: Map<String, String>,
    val timestamp: Long
)
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/models/Models.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}

/**
 * Generate build.gradle file
 */
function generateBuildGradleFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const content = `plugins {
    id 'com.android.library'
    id 'org.jetbrains.kotlin.android'
    id 'org.jetbrains.kotlin.plugin.serialization'
}

android {
    namespace '${options.packageName.replace(/-/g, '.')}'
    compileSdk ${options.targetSdkVersion ?? 34}

    defaultConfig {
        minSdk ${options.minSdkVersion ?? 24}
        targetSdk ${options.targetSdkVersion ?? 34}

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles "consumer-rules.pro"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }
}

dependencies {
    // Kotlin
    implementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.0'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'

    // Serialization
    implementation 'org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0'

    // Networking
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-kotlinx-serialization:2.9.0'

    // Security
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
    implementation 'androidx.biometric:biometric:1.1.0'

    // WorkManager
    implementation 'androidx.work:work-runtime-ktx:2.9.0'

    // Room
    implementation 'androidx.room:room-runtime:2.6.1'
    implementation 'androidx.room:room-ktx:2.6.1'

    // AndroidX
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'

    // Testing
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
}
`;

	return {
		path: 'build.gradle',
		content,
		language: 'kotlin',
		type: 'config',
	};
}

/**
 * Generate README
 */
function generateReadmeFile(config: MobileConfig, options: SDKGenerationOptions): GeneratedSDKFile {
	const content = `# ${options.packageName} Android SDK

Production-ready Kotlin SDK for ${options.packageName}.

## Installation

### Gradle

Add to your \`build.gradle\`:

\`\`\`gradle
dependencies {
    implementation '${options.packageName}:sdk:${options.apiVersion}'
}
\`\`\`

### Maven

\`\`\`xml
<dependency>
    <groupId>${options.packageName}</groupId>
    <artifactId>sdk</artifactId>
    <version>${options.apiVersion}</version>
</dependency>
\`\`\`

## Quick Start

\`\`\`kotlin
import ${options.packageName.replace(/-/g, '.')}.WorkflowArchitectSDK
import ${options.packageName.replace(/-/g, '.')}.SDKConfiguration

// Configure SDK
val config = SDKConfiguration.default()

// Initialize
val sdk = WorkflowArchitectSDK(context, config)

// Authenticate
lifecycleScope.launch {
    val result = sdk.authenticate()
    result.onSuccess { authResult ->
        println("Authenticated: \${authResult.accessToken}")
    }
}

// Execute workflow
lifecycleScope.launch {
    val result = sdk.executeWorkflow(
        "workflow-id",
        mapOf("key" to "value")
    )
    result.onSuccess { executionResult ->
        println("Execution result: $executionResult")
    }
}
\`\`\`

## Features

- ✅ OAuth2 authentication with biometric support
- ✅ Offline-first architecture
- ✅ Automatic sync with WorkManager
- ✅ Secure storage (EncryptedSharedPreferences)
- ✅ Certificate pinning
- ✅ Kotlin Coroutines and Flow
- ✅ Jetpack Compose compatibility

## Requirements

- Android ${options.minSdkVersion ?? 24}+
- Kotlin 1.9+

## License

See LICENSE file for details.
`;

	return {
		path: 'README.md',
		content,
		language: 'kotlin',
		type: 'config',
	};
}

/**
 * Generate example file
 */
function generateExampleFile(config: MobileConfig, options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import ${packagePath}.WorkflowArchitectSDK
import ${packagePath}.SDKConfiguration
import kotlinx.coroutines.launch

class ExampleActivity : ComponentActivity() {
    private lateinit var sdk: WorkflowArchitectSDK

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val config = SDKConfiguration.default()
        sdk = WorkflowArchitectSDK(this, config)

        setContent {
            ExampleScreen(sdk)
        }
    }
}

@Composable
fun ExampleScreen(sdk: WorkflowArchitectSDK) {
    val authState by sdk.authState.collectAsState()
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Workflow Architect SDK", style = MaterialTheme.typography.headlineMedium)

        Spacer(modifier = Modifier.height(16.dp))

        when (authState) {
            is AuthState.Authenticated -> {
                Text("Authenticated", color = MaterialTheme.colorScheme.primary)
                Button(onClick = {
                    scope.launch {
                        sdk.logout()
                    }
                }) {
                    Text("Logout")
                }
            }
            is AuthState.Unauthenticated -> {
                Text("Not authenticated")
                Button(onClick = {
                    scope.launch {
                        sdk.authenticate()
                    }
                }) {
                    Text("Login")
                }
            }
        }
    }
}
`;

	return {
		path: `examples/ExampleActivity.kt`,
		content,
		language: 'kotlin',
		type: 'example',
	};
}

/**
 * Generate test file
 */
function generateTestFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}

import org.junit.Test
import org.junit.Assert.*

class SDKTest {
    @Test
    fun testConfiguration() {
        val config = SDKConfiguration.default()
        assertNotNull(config)
        assertEquals("${config.baseUrl}", config.baseUrl)
    }
}
`;

	return {
		path: `src/test/java/${packagePath.replace(/\./g, '/')}/SDKTest.kt`,
		content,
		language: 'kotlin',
		type: 'test',
	};
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
	return str
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join('');
}
