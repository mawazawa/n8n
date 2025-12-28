/**
 * Mobile SDK Testing Utilities
 * Mock implementations and test helpers
 */

import type {
	MobileConfig,
	OAuth2Token,
	PushNotification,
	NetworkState,
	OfflineAction,
	SyncState,
} from './types';

/**
 * Test utilities for mobile SDK
 */
export class TestUtils {
	/**
	 * Create mock mobile config
	 */
	static createMockConfig(overrides?: Partial<MobileConfig>): MobileConfig {
		return {
			baseUrl: 'https://api.test.example.com',
			auth: {
				clientId: 'test-client-id',
				clientSecret: 'test-client-secret',
				redirectUri: 'test://callback',
				scopes: ['openid', 'profile'],
			},
			offline: {
				enabled: true,
				maxQueueSize: 100,
				retryAttempts: 3,
				retryDelay: 1000,
			},
			sync: {
				enabled: true,
				interval: 60000,
				batchSize: 10,
				conflictResolution: 'SERVER_WINS' as const,
			},
			push: {
				enabled: true,
				fcmSenderId: 'test-fcm-sender',
				apnsKeyId: 'test-apns-key',
				apnsTeamId: 'test-apns-team',
			},
			security: {
				certificatePinning: false, // Disabled for testing
				biometricAuth: true,
				encryptStorage: true,
			},
			analytics: {
				enabled: false, // Disabled for testing
				anonymize: true,
			},
			...overrides,
		};
	}

	/**
	 * Create mock OAuth2 token
	 */
	static createMockToken(overrides?: Partial<OAuth2Token>): OAuth2Token {
		return {
			accessToken: 'mock_access_token',
			refreshToken: 'mock_refresh_token',
			tokenType: 'Bearer',
			expiresIn: 3600,
			expiresAt: Date.now() + 3600 * 1000,
			scope: ['openid', 'profile'],
			...overrides,
		};
	}

	/**
	 * Create mock push notification
	 */
	static createMockNotification(overrides?: Partial<PushNotification>): PushNotification {
		return {
			id: crypto.randomUUID(),
			title: 'Test Notification',
			body: 'This is a test notification',
			data: { test: 'data' },
			badge: 1,
			sound: 'default',
			timestamp: Date.now(),
			...overrides,
		};
	}

	/**
	 * Create mock network state
	 */
	static createMockNetworkState(overrides?: Partial<NetworkState>): NetworkState {
		return {
			isConnected: true,
			connectionType: 'wifi',
			isExpensive: false,
			timestamp: Date.now(),
			...overrides,
		};
	}

	/**
	 * Create mock offline action
	 */
	static createMockOfflineAction(overrides?: Partial<OfflineAction>): OfflineAction {
		return {
			id: crypto.randomUUID(),
			type: 'EXECUTE',
			resource: 'workflows/test-workflow',
			data: { test: 'data' },
			timestamp: Date.now(),
			retryCount: 0,
			status: 'PENDING',
			...overrides,
		};
	}

	/**
	 * Create mock sync state
	 */
	static createMockSyncState(overrides?: Partial<SyncState>): SyncState {
		return {
			pending: [],
			synced: [],
			conflicts: [],
			lastSync: null,
			isSyncing: false,
			...overrides,
		};
	}

	/**
	 * Wait for specified time
	 */
	static async wait(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Wait for condition
	 */
	static async waitFor(
		condition: () => boolean,
		timeout = 5000,
		interval = 100,
	): Promise<void> {
		const startTime = Date.now();

		while (!condition()) {
			if (Date.now() - startTime > timeout) {
				throw new Error('Timeout waiting for condition');
			}
			await this.wait(interval);
		}
	}

	/**
	 * Generate iOS test code
	 */
	static generateIOSTestCode(): string {
		return `//
// iOS SDK Tests
//

import XCTest
@testable import WorkflowArchitectSDK

class SDKTests: XCTestCase {
    var sdk: WorkflowArchitectSDK!

    override func setUp() {
        super.setUp()

        let config = SDKConfiguration(
            baseURL: URL(string: "https://api.test.example.com")!,
            clientId: "test-client",
            redirectUri: URL(string: "test://callback")!
        )

        sdk = WorkflowArchitectSDK(configuration: config)
    }

    override func tearDown() {
        sdk = nil
        super.tearDown()
    }

    func testInitialization() {
        XCTAssertNotNil(sdk)
        XCTAssertFalse(sdk.isAuthenticated)
    }

    func testConfiguration() {
        let config = sdk.configuration
        XCTAssertEqual(config.baseURL.absoluteString, "https://api.test.example.com")
        XCTAssertEqual(config.clientId, "test-client")
    }

    func testOfflineQueue() async throws {
        // Test offline action queueing
        let expectation = XCTestExpectation(description: "Action queued")

        let result = try await sdk.executeWorkflow(
            "test-workflow",
            input: ["key": "value"]
        )

        XCTAssertEqual(result.status, "queued")
        expectation.fulfill()

        await fulfillment(of: [expectation], timeout: 5.0)
    }

    func testNetworkMonitor() {
        let monitor = NetworkMonitor.shared
        XCTAssertNotNil(monitor.isConnected)
    }
}

// Mock network responses
class MockNetworkClient: NetworkClient {
    var mockResponse: Data?
    var mockError: Error?

    override func send<T: APIRequest>(_ request: T) -> AnyPublisher<T.Response, Error> {
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }

        if let data = mockResponse {
            return Just(data)
                .decode(type: T.Response.self, decoder: JSONDecoder())
                .eraseToAnyPublisher()
        }

        return Fail(error: NetworkError.noData).eraseToAnyPublisher()
    }
}
`;
	}

	/**
	 * Generate Android test code
	 */
	static generateAndroidTestCode(): string {
		return `//
// Android SDK Tests
//

import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import kotlinx.coroutines.test.runTest

class SDKTest {
    private lateinit var sdk: WorkflowArchitectSDK

    @Before
    fun setup() {
        val config = SDKConfiguration(
            baseUrl = "https://api.test.example.com",
            clientId = "test-client",
            redirectUri = "test://callback"
        )

        sdk = WorkflowArchitectSDK(
            context = ApplicationProvider.getApplicationContext(),
            configuration = config
        )
    }

    @Test
    fun testInitialization() {
        assertNotNull(sdk)
        assertFalse(sdk.isAuthenticated)
    }

    @Test
    fun testConfiguration() {
        val config = sdk.configuration
        assertEquals("https://api.test.example.com", config.baseUrl)
        assertEquals("test-client", config.clientId)
    }

    @Test
    fun testOfflineQueue() = runTest {
        // Test offline action queueing
        val result = sdk.executeWorkflow(
            "test-workflow",
            mapOf("key" to "value")
        )

        assertTrue(result.isSuccess)
        assertEquals("queued", result.getOrNull()?.status)
    }

    @Test
    fun testNetworkMonitor() {
        val monitor = NetworkMonitor.getInstance(
            ApplicationProvider.getApplicationContext()
        )
        assertNotNull(monitor.isConnected.value)
    }
}

// Mock network client
class MockNetworkClient(
    baseUrl: String,
    context: Context
) : NetworkClient(baseUrl, context, certificatePinning = false) {
    var mockResponse: Any? = null
    var mockError: Exception? = null

    override suspend fun <T> get(
        endpoint: String,
        deserializer: (String) -> T
    ): Result<T> {
        return mockError?.let {
            Result.failure(it)
        } ?: mockResponse?.let {
            Result.success(deserializer(it.toString()))
        } ?: Result.failure(Exception("No mock response"))
    }
}

// Mock storage
class MockStorageManager : StorageManager(
    context = ApplicationProvider.getApplicationContext(),
    encryptionEnabled = false
) {
    private val storage = mutableMapOf<String, String>()

    override fun saveSecure(key: String, value: String) {
        storage[key] = value
    }

    override fun loadSecure(key: String): String? {
        return storage[key]
    }

    override fun delete(key: String) {
        storage.remove(key)
    }
}
`;
	}
}

/**
 * Mock network responses
 */
export class MockNetworkResponses {
	static workflows = [
		{
			id: 'workflow-1',
			name: 'Test Workflow 1',
			description: 'First test workflow',
			active: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		},
		{
			id: 'workflow-2',
			name: 'Test Workflow 2',
			description: 'Second test workflow',
			active: false,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		},
	];

	static executionResult = {
		id: 'execution-1',
		status: 'success',
		output: {
			result: 'test result',
		},
	};

	static authResult = {
		accessToken: 'mock_access_token',
		refreshToken: 'mock_refresh_token',
		expiresIn: 3600,
	};
}

/**
 * Mock biometric authentication
 */
export class MockBiometricAuth {
	private shouldSucceed = true;

	setShouldSucceed(succeed: boolean): void {
		this.shouldSucceed = succeed;
	}

	async authenticate(): Promise<boolean> {
		await TestUtils.wait(100);
		return this.shouldSucceed;
	}

	isAvailable(): boolean {
		return true;
	}
}

/**
 * Mock storage
 */
export class MockStorage {
	private storage = new Map<string, string>();

	set(key: string, value: string): void {
		this.storage.set(key, value);
	}

	get(key: string): string | null {
		return this.storage.get(key) ?? null;
	}

	delete(key: string): void {
		this.storage.delete(key);
	}

	clear(): void {
		this.storage.clear();
	}

	size(): number {
		return this.storage.size;
	}
}
