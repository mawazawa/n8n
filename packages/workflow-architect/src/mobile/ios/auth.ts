/**
 * iOS Authentication
 * Generate iOS authentication code with Keychain and biometric support
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate iOS authentication components
 */
export function generateIOSAuth(options: SDKGenerationOptions): GeneratedSDKFile[] {
	const files: GeneratedSDKFile[] = [];

	files.push(generateAuthManagerFile(options));
	files.push(generateBiometricAuthFile(options));
	files.push(generateOAuth2File(options));

	return files;
}

/**
 * Generate authentication manager file
 */
function generateAuthManagerFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  AuthenticationManager.swift
//  ${options.packageName}
//

import Foundation
import AuthenticationServices
import Combine

/// Authentication manager
final class AuthenticationManager: NSObject {

    // MARK: - Properties

    private let clientId: String
    private let redirectUri: URL
    private let storageManager: StorageManager
    private let biometricAuth: BiometricAuthenticator

    @Published private(set) var authState: AuthState = .unauthenticated
    private(set) var currentToken: OAuth2Token?

    var authStatePublisher: AnyPublisher<AuthState, Never> {
        $authState.eraseToAnyPublisher()
    }

    var isAuthenticated: Bool {
        authState == .authenticated
    }

    // MARK: - Initialization

    init(clientId: String, redirectUri: URL) {
        self.clientId = clientId
        self.redirectUri = redirectUri
        self.storageManager = StorageManager(encryptionEnabled: true)
        self.biometricAuth = BiometricAuthenticator()
        super.init()

        // Load saved token
        if let savedToken = loadToken() {
            self.currentToken = savedToken
            if !isTokenExpired(savedToken) {
                self.authState = .authenticated
            }
        }
    }

    // MARK: - Authentication

    /// Authenticate user with OAuth2
    func authenticate() -> AnyPublisher<AuthResult, Error> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.unknown))
                return
            }

            // Start OAuth2 flow
            self.startOAuth2Flow { result in
                switch result {
                case .success(let authResult):
                    self.currentToken = OAuth2Token(from: authResult)
                    self.saveToken(self.currentToken!)
                    self.authState = .authenticated
                    promise(.success(authResult))

                case .failure(let error):
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    /// Logout user
    func logout() -> AnyPublisher<Void, Never> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.success(()))
                return
            }

            // Clear token
            self.currentToken = nil
            self.deleteToken()
            self.authState = .unauthenticated
            promise(.success(()))
        }
        .eraseToAnyPublisher()
    }

    /// Refresh access token
    func refreshToken() -> AnyPublisher<AuthResult, Error> {
        guard let token = currentToken, let refreshToken = token.refreshToken else {
            return Fail(error: AuthError.noRefreshToken)
                .eraseToAnyPublisher()
        }

        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.unknown))
                return
            }

            // Refresh token via API
            self.performTokenRefresh(refreshToken) { result in
                switch result {
                case .success(let authResult):
                    self.currentToken = OAuth2Token(from: authResult)
                    self.saveToken(self.currentToken!)
                    promise(.success(authResult))

                case .failure(let error):
                    // Clear token on refresh failure
                    self.logout()
                    promise(.failure(error))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    /// Get current access token
    func getAccessToken() -> AnyPublisher<String, Error> {
        guard let token = currentToken else {
            return Fail(error: AuthError.notAuthenticated)
                .eraseToAnyPublisher()
        }

        // Check if token is expired
        if isTokenExpired(token) {
            // Refresh token
            return refreshToken()
                .map { $0.accessToken }
                .eraseToAnyPublisher()
        }

        return Just(token.accessToken)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }

    // MARK: - Biometric

    /// Authenticate with biometric
    func authenticateWithBiometric() -> AnyPublisher<Bool, Error> {
        biometricAuth.authenticate(reason: "Authenticate to access your account")
    }

    // MARK: - Private Methods

    private func startOAuth2Flow(completion: @escaping (Result<AuthResult, Error>) -> Void) {
        // Build authorization URL
        guard var components = URLComponents(string: "https://auth.example.com/authorize") else {
            completion(.failure(AuthError.invalidURL))
            return
        }

        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri.absoluteString),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid profile email"),
        ]

        guard let authURL = components.url else {
            completion(.failure(AuthError.invalidURL))
            return
        }

        // Start web authentication session
        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: redirectUri.scheme
        ) { callbackURL, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let callbackURL = callbackURL else {
                completion(.failure(AuthError.invalidCallback))
                return
            }

            // Extract authorization code
            guard let code = self.extractAuthCode(from: callbackURL) else {
                completion(.failure(AuthError.invalidCallback))
                return
            }

            // Exchange code for token
            self.exchangeCodeForToken(code, completion: completion)
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }

    private func extractAuthCode(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            return nil
        }
        return code
    }

    private func exchangeCodeForToken(_ code: String, completion: @escaping (Result<AuthResult, Error>) -> Void) {
        // This would make actual API call
        // For now, return mock result
        let result = AuthResult(
            accessToken: "mock_access_token",
            refreshToken: "mock_refresh_token",
            expiresIn: 3600
        )
        completion(.success(result))
    }

    private func performTokenRefresh(_ refreshToken: String, completion: @escaping (Result<AuthResult, Error>) -> Void) {
        // This would make actual API call
        completion(.failure(AuthError.refreshFailed))
    }

    private func isTokenExpired(_ token: OAuth2Token) -> Bool {
        Date(timeIntervalSince1970: TimeInterval(token.expiresAt)) < Date()
    }

    private func saveToken(_ token: OAuth2Token) {
        do {
            let data = try JSONEncoder().encode(token)
            try storageManager.save(data, forKey: "auth_token")
        } catch {
            print("Failed to save token: \\(error)")
        }
    }

    private func loadToken() -> OAuth2Token? {
        do {
            guard let data = try storageManager.load(forKey: "auth_token") else {
                return nil
            }
            return try JSONDecoder().decode(OAuth2Token.self, from: data)
        } catch {
            print("Failed to load token: \\(error)")
            return nil
        }
    }

    private func deleteToken() {
        try? storageManager.delete(forKey: "auth_token")
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthenticationManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return ASPresentationAnchor()
    }
}

// MARK: - OAuth2Token

struct OAuth2Token: Codable {
    let accessToken: String
    let refreshToken: String?
    let tokenType: String
    let expiresIn: Int
    let expiresAt: Int

    init(from authResult: AuthResult) {
        self.accessToken = authResult.accessToken
        self.refreshToken = authResult.refreshToken
        self.tokenType = "Bearer"
        self.expiresIn = authResult.expiresIn
        self.expiresAt = Int(Date().timeIntervalSince1970) + authResult.expiresIn
    }
}

// MARK: - Auth Error

enum AuthError: LocalizedError {
    case notAuthenticated
    case invalidURL
    case invalidCallback
    case noRefreshToken
    case refreshFailed
    case unknown

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "User is not authenticated"
        case .invalidURL:
            return "Invalid authentication URL"
        case .invalidCallback:
            return "Invalid callback URL"
        case .noRefreshToken:
            return "No refresh token available"
        case .refreshFailed:
            return "Failed to refresh token"
        case .unknown:
            return "Unknown authentication error"
        }
    }
}
`;

	return {
		path: `Sources/${className}SDK/Auth/AuthenticationManager.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate biometric auth file
 */
function generateBiometricAuthFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  BiometricAuthenticator.swift
//  ${options.packageName}
//

import Foundation
import LocalAuthentication
import Combine

/// Biometric authenticator
final class BiometricAuthenticator {

    // MARK: - Properties

    private let context = LAContext()

    // MARK: - Availability

    /// Check if biometric authentication is available
    var isAvailable: Bool {
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    /// Get biometric type
    var biometricType: BiometricType {
        guard isAvailable else {
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

    // MARK: - Authentication

    /// Authenticate with biometrics
    func authenticate(reason: String) -> AnyPublisher<Bool, Error> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(BiometricError.unknown))
                return
            }

            guard self.isAvailable else {
                promise(.failure(BiometricError.notAvailable))
                return
            }

            self.context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            ) { success, error in
                if success {
                    promise(.success(true))
                } else if let error = error {
                    promise(.failure(error))
                } else {
                    promise(.failure(BiometricError.failed))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    /// Authenticate with device passcode fallback
    func authenticateWithFallback(reason: String) -> AnyPublisher<Bool, Error> {
        Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(BiometricError.unknown))
                return
            }

            let context = LAContext()
            context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            ) { success, error in
                if success {
                    promise(.success(true))
                } else if let error = error {
                    promise(.failure(error))
                } else {
                    promise(.failure(BiometricError.failed))
                }
            }
        }
        .eraseToAnyPublisher()
    }
}

// MARK: - Biometric Type

enum BiometricType {
    case faceID
    case touchID
    case none
}

// MARK: - Biometric Error

enum BiometricError: LocalizedError {
    case notAvailable
    case failed
    case unknown

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Biometric authentication is not available"
        case .failed:
            return "Biometric authentication failed"
        case .unknown:
            return "Unknown biometric error"
        }
    }
}
`;

	return {
		path: `Sources/${className}SDK/Auth/BiometricAuthenticator.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate OAuth2 file
 */
function generateOAuth2File(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  OAuth2Handler.swift
//  ${options.packageName}
//

import Foundation

/// OAuth2 token handler
final class OAuth2Handler {

    // MARK: - Token Exchange

    static func exchangeCodeForToken(
        code: String,
        clientId: String,
        redirectUri: URL,
        tokenURL: URL
    ) async throws -> AuthResult {
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type": "authorization_code",
            "code": code,
            "client_id": clientId,
            "redirect_uri": redirectUri.absoluteString,
        ]

        request.httpBody = body
            .map { "\\($0.key)=\\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw AuthError.invalidCallback
        }

        return try JSONDecoder().decode(AuthResult.self, from: data)
    }

    // MARK: - Token Refresh

    static func refreshToken(
        refreshToken: String,
        clientId: String,
        tokenURL: URL
    ) async throws -> AuthResult {
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": clientId,
        ]

        request.httpBody = body
            .map { "\\($0.key)=\\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw AuthError.refreshFailed
        }

        return try JSONDecoder().decode(AuthResult.self, from: data)
    }
}
`;

	return {
		path: `Sources/${className}SDK/Auth/OAuth2Handler.swift`,
		content,
		language: 'swift',
		type: 'source',
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
