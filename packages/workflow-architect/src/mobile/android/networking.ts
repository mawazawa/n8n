/**
 * Android Networking
 * Generate OkHttp/Retrofit networking code for Android
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate Android networking components
 */
export function generateAndroidNetworking(options: SDKGenerationOptions): GeneratedSDKFile {
	const packagePath = options.packageName.replace(/-/g, '.');

	const content = `package ${packagePath}.network

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.cert.CertificateException
import javax.net.ssl.*

/**
 * Network client for API requests
 */
class NetworkClient(
    private val baseUrl: String,
    private val context: Context,
    certificatePinning: Boolean = true
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .apply {
            if (certificatePinning) {
                certificatePinner(buildCertificatePinner())
            }
            addInterceptor(AuthInterceptor())
            addInterceptor(LoggingInterceptor())
        }
        .build()

    /**
     * Execute GET request
     */
    suspend fun <T> get(
        endpoint: String,
        deserializer: (String) -> T
    ): Result<T> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .get()
            .build()

        executeRequest(request, deserializer)
    }

    /**
     * Execute POST request
     */
    suspend fun <T> post(
        endpoint: String,
        body: Map<String, Any>,
        deserializer: (String) -> T
    ): Result<T> = withContext(Dispatchers.IO) {
        val jsonBody = json.encodeToString(
            kotlinx.serialization.serializer(),
            body
        ).toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .post(jsonBody)
            .build()

        executeRequest(request, deserializer)
    }

    /**
     * Execute workflow
     */
    suspend fun executeWorkflow(
        workflowId: String,
        input: Map<String, Any>
    ): Result<ExecutionResult> {
        return post(
            "/api/v1/workflows/$workflowId/execute",
            input
        ) { responseBody ->
            json.decodeFromString(responseBody)
        }
    }

    /**
     * Get workflows
     */
    suspend fun getWorkflows(): Result<List<Workflow>> {
        return get("/api/v1/workflows") { responseBody ->
            json.decodeFromString(responseBody)
        }
    }

    private fun <T> executeRequest(
        request: Request,
        deserializer: (String) -> T
    ): Result<T> {
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return Result.failure(
                        NetworkException.HttpError(response.code)
                    )
                }

                val body = response.body?.string()
                    ?: return Result.failure(NetworkException.NoData)

                val result = deserializer(body)
                Result.success(result)
            }
        } catch (e: IOException) {
            Result.failure(NetworkException.NetworkError(e))
        } catch (e: Exception) {
            Result.failure(NetworkException.Unknown(e))
        }
    }

    private fun buildCertificatePinner(): CertificatePinner {
        return CertificatePinner.Builder()
            // Add your certificate pins here
            // .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
    }
}

/**
 * Authentication interceptor
 */
class AuthInterceptor : Interceptor {
    var token: String? = null

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val authenticatedRequest = token?.let {
            request.newBuilder()
                .header("Authorization", "Bearer $it")
                .build()
        } ?: request

        return chain.proceed(authenticatedRequest)
    }
}

/**
 * Logging interceptor
 */
class LoggingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (BuildConfig.DEBUG) {
            println("🌐 Request: \${request.method} \${request.url}")
            println("✅ Response: \${response.code}")
        }

        return response
    }
}

/**
 * Network monitor
 */
class NetworkMonitor private constructor(context: Context) {
    private val connectivityManager = context.getSystemService(
        Context.CONNECTIVITY_SERVICE
    ) as ConnectivityManager

    private val _isConnected = MutableStateFlow(checkConnection())
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    init {
        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _isConnected.value = true
            }

            override fun onLost(network: Network) {
                _isConnected.value = false
            }
        }

        connectivityManager.registerDefaultNetworkCallback(networkCallback)
    }

    private fun checkConnection(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    companion object {
        @Volatile
        private var instance: NetworkMonitor? = null

        fun getInstance(context: Context): NetworkMonitor {
            return instance ?: synchronized(this) {
                instance ?: NetworkMonitor(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }
}

/**
 * Network exceptions
 */
sealed class NetworkException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class HttpError(val code: Int) : NetworkException("HTTP error: $code")
    class NetworkError(cause: Throwable) : NetworkException("Network error", cause)
    class NoData : NetworkException("No data received")
    class Unknown(cause: Throwable) : NetworkException("Unknown error", cause)
}
`;

	return {
		path: `src/main/java/${packagePath.replace(/\./g, '/')}/network/NetworkClient.kt`,
		content,
		language: 'kotlin',
		type: 'source',
	};
}
