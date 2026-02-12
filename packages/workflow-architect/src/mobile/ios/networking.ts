/**
 * iOS Networking
 * Generate URLSession-based networking code for iOS
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate iOS networking components
 */
export function generateIOSNetworking(options: SDKGenerationOptions): GeneratedSDKFile[] {
	const files: GeneratedSDKFile[] = [];

	files.push(generateNetworkClientFile(options));
	files.push(generateNetworkMonitorFile(options));
	files.push(generateCertificatePinningFile(options));
	files.push(generateInterceptorsFile(options));

	return files;
}

/**
 * Generate network client file
 */
function generateNetworkClientFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  NetworkClient.swift
//  ${options.packageName}
//

import Foundation
import Combine

/// Network client for API requests
final class NetworkClient {

    // MARK: - Properties

    private let baseURL: URL
    private let session: URLSession
    private let certificatePinner: CertificatePinner?
    private var requestInterceptors: [RequestInterceptor] = []
    private var responseInterceptors: [ResponseInterceptor] = []

    // MARK: - Initialization

    init(
        baseURL: URL,
        certificatePinning: Bool = true,
        timeoutInterval: TimeInterval = 30
    ) {
        self.baseURL = baseURL

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = timeoutInterval
        configuration.timeoutIntervalForResource = timeoutInterval * 2
        configuration.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json"
        ]

        // Set up certificate pinning
        self.certificatePinner = certificatePinning ? CertificatePinner(baseURL: baseURL) : nil

        let delegate = NetworkSessionDelegate(certificatePinner: certificatePinner)
        self.session = URLSession(
            configuration: configuration,
            delegate: delegate,
            delegateQueue: nil
        )
    }

    // MARK: - Request Methods

    /// Send API request
    func send<T: APIRequest>(_ request: T) -> AnyPublisher<T.Response, Error> {
        do {
            var urlRequest = try buildURLRequest(for: request)

            // Apply interceptors
            for interceptor in requestInterceptors {
                urlRequest = interceptor.intercept(urlRequest)
            }

            return session.dataTaskPublisher(for: urlRequest)
                .tryMap { [weak self] data, response -> Data in
                    guard let self = self else {
                        throw NetworkError.unknown
                    }

                    // Apply response interceptors
                    var processedData = data
                    for interceptor in self.responseInterceptors {
                        processedData = try interceptor.intercept(processedData, response: response)
                    }

                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw NetworkError.invalidResponse
                    }

                    guard (200...299).contains(httpResponse.statusCode) else {
                        throw NetworkError.httpError(httpResponse.statusCode)
                    }

                    return processedData
                }
                .decode(type: T.Response.self, decoder: JSONDecoder.apiDecoder)
                .receive(on: DispatchQueue.main)
                .eraseToAnyPublisher()
        } catch {
            return Fail(error: error)
                .eraseToAnyPublisher()
        }
    }

    /// Download file
    func download(from url: URL) -> AnyPublisher<URL, Error> {
        session.downloadTaskPublisher(for: url)
            .map { $0.location }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    /// Upload file
    func upload(_ data: Data, to request: URLRequest) -> AnyPublisher<Data, Error> {
        session.uploadTaskPublisher(for: request, from: data)
            .map { $0.data }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // MARK: - Interceptors

    func addRequestInterceptor(_ interceptor: RequestInterceptor) {
        requestInterceptors.append(interceptor)
    }

    func addResponseInterceptor(_ interceptor: ResponseInterceptor) {
        responseInterceptors.append(interceptor)
    }

    // MARK: - Private Methods

    private func buildURLRequest<T: APIRequest>(for request: T) throws -> URLRequest {
        guard let url = URL(string: request.path, relativeTo: baseURL) else {
            throw NetworkError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue

        for (key, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        if let body = request.body {
            urlRequest.httpBody = body
        }

        return urlRequest
    }
}

// MARK: - Network Error

enum NetworkError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(Int)
    case noData
    case decodingError(Error)
    case unknown

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \\(code)"
        case .noData:
            return "No data received"
        case .decodingError(let error):
            return "Failed to decode response: \\(error.localizedDescription)"
        case .unknown:
            return "Unknown error occurred"
        }
    }
}

// MARK: - Session Delegate

private class NetworkSessionDelegate: NSObject, URLSessionDelegate {
    private let certificatePinner: CertificatePinner?

    init(certificatePinner: CertificatePinner?) {
        self.certificatePinner = certificatePinner
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard let certificatePinner = certificatePinner else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        certificatePinner.validate(challenge: challenge, completionHandler: completionHandler)
    }
}

// MARK: - Publisher Extensions

extension URLSession {
    func downloadTaskPublisher(for url: URL) -> AnyPublisher<(location: URL, response: URLResponse), Error> {
        Future { promise in
            let task = self.downloadTask(with: url) { location, response, error in
                if let error = error {
                    promise(.failure(error))
                } else if let location = location, let response = response {
                    promise(.success((location, response)))
                } else {
                    promise(.failure(NetworkError.unknown))
                }
            }
            task.resume()
        }
        .eraseToAnyPublisher()
    }

    func uploadTaskPublisher(for request: URLRequest, from data: Data) -> AnyPublisher<(data: Data, response: URLResponse), Error> {
        Future { promise in
            let task = self.uploadTask(with: request, from: data) { data, response, error in
                if let error = error {
                    promise(.failure(error))
                } else if let data = data, let response = response {
                    promise(.success((data, response)))
                } else {
                    promise(.failure(NetworkError.noData))
                }
            }
            task.resume()
        }
        .eraseToAnyPublisher()
    }
}

// MARK: - JSON Decoder Extension

extension JSONDecoder {
    static var apiDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
`;

	return {
		path: `Sources/${className}SDK/Networking/NetworkClient.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate network monitor file
 */
function generateNetworkMonitorFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  NetworkMonitor.swift
//  ${options.packageName}
//

import Foundation
import Network
import Combine

/// Network connectivity monitor
final class NetworkMonitor {

    // MARK: - Singleton

    static let shared = NetworkMonitor()

    // MARK: - Properties

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.${options.packageName}.networkmonitor")

    @Published private(set) var isConnected = true
    @Published private(set) var connectionType: ConnectionType = .unknown
    @Published private(set) var isExpensive = false

    var isConnectedPublisher: AnyPublisher<Bool, Never> {
        $isConnected.eraseToAnyPublisher()
    }

    // MARK: - Initialization

    private init() {
        startMonitoring()
    }

    // MARK: - Monitoring

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            self?.updateStatus(for: path)
        }
        monitor.start(queue: queue)
    }

    private func updateStatus(for path: NWPath) {
        DispatchQueue.main.async {
            self.isConnected = path.status == .satisfied
            self.connectionType = self.determineConnectionType(from: path)
            self.isExpensive = path.isExpensive
        }
    }

    private func determineConnectionType(from path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .ethernet
        } else {
            return .unknown
        }
    }

    func stopMonitoring() {
        monitor.cancel()
    }
}

// MARK: - Connection Type

enum ConnectionType {
    case wifi
    case cellular
    case ethernet
    case unknown
}
`;

	return {
		path: `Sources/${className}SDK/Networking/NetworkMonitor.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate certificate pinning file
 */
function generateCertificatePinningFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  CertificatePinner.swift
//  ${options.packageName}
//

import Foundation
import Security

/// Certificate pinning for enhanced security
final class CertificatePinner {

    private let pinnedCertificates: [SecCertificate]
    private let baseURL: URL

    init(baseURL: URL) {
        self.baseURL = baseURL
        self.pinnedCertificates = Self.loadCertificates()
    }

    /// Validate server challenge
    func validate(
        challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Validate against pinned certificates
        if validateServerTrust(serverTrust) {
            let credential = URLCredential(trust: serverTrust)
            completionHandler(.useCredential, credential)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    private func validateServerTrust(_ serverTrust: SecTrust) -> Bool {
        guard !pinnedCertificates.isEmpty else {
            // No pinned certificates, use default validation
            return true
        }

        var secresult = SecTrustResultType.invalid
        let status = SecTrustEvaluate(serverTrust, &secresult)

        guard status == errSecSuccess else {
            return false
        }

        // Get server certificate chain
        let serverCertificateCount = SecTrustGetCertificateCount(serverTrust)

        for index in 0..<serverCertificateCount {
            guard let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, index) else {
                continue
            }

            let serverCertificateData = SecCertificateCopyData(serverCertificate) as Data

            // Compare with pinned certificates
            for pinnedCertificate in pinnedCertificates {
                let pinnedCertificateData = SecCertificateCopyData(pinnedCertificate) as Data

                if serverCertificateData == pinnedCertificateData {
                    return true
                }
            }
        }

        return false
    }

    private static func loadCertificates() -> [SecCertificate] {
        var certificates: [SecCertificate] = []

        // Load certificates from bundle
        let bundle = Bundle.main
        let certPaths = bundle.paths(forResourcesOfType: "cer", inDirectory: nil)

        for path in certPaths {
            guard let certData = try? Data(contentsOf: URL(fileURLWithPath: path)),
                  let certificate = SecCertificateCreateWithData(nil, certData as CFData) else {
                continue
            }

            certificates.append(certificate)
        }

        return certificates
    }
}
`;

	return {
		path: `Sources/${className}SDK/Networking/CertificatePinner.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate interceptors file
 */
function generateInterceptorsFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  Interceptors.swift
//  ${options.packageName}
//

import Foundation

/// Request interceptor protocol
protocol RequestInterceptor {
    func intercept(_ request: URLRequest) -> URLRequest
}

/// Response interceptor protocol
protocol ResponseInterceptor {
    func intercept(_ data: Data, response: URLResponse) throws -> Data
}

/// Auth token interceptor
final class AuthTokenInterceptor: RequestInterceptor {
    private let tokenProvider: () -> String?

    init(tokenProvider: @escaping () -> String?) {
        self.tokenProvider = tokenProvider
    }

    func intercept(_ request: URLRequest) -> URLRequest {
        var request = request
        if let token = tokenProvider() {
            request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }
}

/// Logging interceptor
final class LoggingInterceptor: RequestInterceptor, ResponseInterceptor {
    func intercept(_ request: URLRequest) -> URLRequest {
        #if DEBUG
        print("🌐 Request: \\(request.httpMethod ?? "GET") \\(request.url?.absoluteString ?? "")")
        if let headers = request.allHTTPHeaderFields {
            print("📋 Headers: \\(headers)")
        }
        if let body = request.httpBody,
           let bodyString = String(data: body, encoding: .utf8) {
            print("📦 Body: \\(bodyString)")
        }
        #endif
        return request
    }

    func intercept(_ data: Data, response: URLResponse) throws -> Data {
        #if DEBUG
        if let httpResponse = response as? HTTPURLResponse {
            print("✅ Response: \\(httpResponse.statusCode)")
        }
        if let responseString = String(data: data, encoding: .utf8) {
            print("📥 Response Data: \\(responseString)")
        }
        #endif
        return data
    }
}

/// Retry interceptor
final class RetryInterceptor {
    private let maxRetries: Int
    private let retryDelay: TimeInterval

    init(maxRetries: Int = 3, retryDelay: TimeInterval = 1.0) {
        self.maxRetries = maxRetries
        self.retryDelay = retryDelay
    }

    func shouldRetry(error: Error, attempt: Int) -> Bool {
        guard attempt < maxRetries else {
            return false
        }

        if let networkError = error as? NetworkError {
            switch networkError {
            case .httpError(let code):
                // Retry on server errors
                return code >= 500
            default:
                return false
            }
        }

        return false
    }
}
`;

	return {
		path: `Sources/${className}SDK/Networking/Interceptors.swift`,
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
