/**
 * iOS Secure Storage
 * Generate iOS Keychain and UserDefaults storage code
 */

import type { GeneratedSDKFile, SDKGenerationOptions } from '../types';

/**
 * Generate iOS storage components
 */
export function generateIOSStorage(options: SDKGenerationOptions): GeneratedSDKFile[] {
	const files: GeneratedSDKFile[] = [];

	files.push(generateStorageManagerFile(options));
	files.push(generateKeychainWrapperFile(options));
	files.push(generateCoreDataStackFile(options));

	return files;
}

/**
 * Generate storage manager file
 */
function generateStorageManagerFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  StorageManager.swift
//  ${options.packageName}
//

import Foundation

/// Storage manager for secure data persistence
final class StorageManager {

    // MARK: - Properties

    private let keychain: KeychainWrapper
    private let userDefaults: UserDefaults
    private let encryptionEnabled: Bool

    // MARK: - Initialization

    init(encryptionEnabled: Bool = true) {
        self.encryptionEnabled = encryptionEnabled
        self.keychain = KeychainWrapper()
        self.userDefaults = UserDefaults.standard
    }

    // MARK: - Secure Storage (Keychain)

    /// Save sensitive data to Keychain
    func save(_ data: Data, forKey key: String) throws {
        let finalData = encryptionEnabled ? try encrypt(data) : data
        try keychain.save(finalData, forKey: key)
    }

    /// Load sensitive data from Keychain
    func load(forKey key: String) throws -> Data? {
        guard let data = try keychain.load(forKey: key) else {
            return nil
        }
        return encryptionEnabled ? try decrypt(data) : data
    }

    /// Delete sensitive data from Keychain
    func delete(forKey key: String) throws {
        try keychain.delete(forKey: key)
    }

    /// Save string to Keychain
    func saveString(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw StorageError.encodingFailed
        }
        try save(data, forKey: key)
    }

    /// Load string from Keychain
    func loadString(forKey key: String) throws -> String? {
        guard let data = try load(forKey: key) else {
            return nil
        }
        guard let string = String(data: data, encoding: .utf8) else {
            throw StorageError.decodingFailed
        }
        return string
    }

    // MARK: - User Preferences (UserDefaults)

    /// Save preference
    func setPreference(_ value: Any, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    /// Get preference
    func getPreference(forKey key: String) -> Any? {
        userDefaults.object(forKey: key)
    }

    /// Remove preference
    func removePreference(forKey key: String) {
        userDefaults.removeObject(forKey: key)
    }

    // MARK: - Codable Support

    /// Save Codable object
    func save<T: Codable>(_ object: T, forKey key: String) throws {
        let data = try JSONEncoder().encode(object)
        try save(data, forKey: key)
    }

    /// Load Codable object
    func load<T: Codable>(forKey key: String) throws -> T? {
        guard let data = try load(forKey: key) else {
            return nil
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Encryption

    private func encrypt(_ data: Data) throws -> Data {
        // In production, use CryptoKit or CommonCrypto
        // For now, return data as-is
        return data
    }

    private func decrypt(_ data: Data) throws -> Data {
        // In production, use CryptoKit or CommonCrypto
        // For now, return data as-is
        return data
    }

    // MARK: - Clear All

    /// Clear all storage
    func clearAll() throws {
        try keychain.deleteAll()
        if let bundleId = Bundle.main.bundleIdentifier {
            userDefaults.removePersistentDomain(forName: bundleId)
        }
    }
}

// MARK: - Storage Error

enum StorageError: LocalizedError {
    case encodingFailed
    case decodingFailed
    case encryptionFailed
    case decryptionFailed

    var errorDescription: String? {
        switch self {
        case .encodingFailed:
            return "Failed to encode data"
        case .decodingFailed:
            return "Failed to decode data"
        case .encryptionFailed:
            return "Failed to encrypt data"
        case .decryptionFailed:
            return "Failed to decrypt data"
        }
    }
}
`;

	return {
		path: `Sources/${className}SDK/Storage/StorageManager.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate Keychain wrapper file
 */
function generateKeychainWrapperFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  KeychainWrapper.swift
//  ${options.packageName}
//

import Foundation
import Security

/// Keychain wrapper for secure storage
final class KeychainWrapper {

    // MARK: - Properties

    private let service: String
    private let accessGroup: String?

    // MARK: - Initialization

    init(service: String = Bundle.main.bundleIdentifier ?? "com.${options.packageName}",
         accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    // MARK: - Save

    func save(_ data: Data, forKey key: String) throws {
        // Delete existing item
        try? delete(forKey: key)

        // Build query
        var query = buildBaseQuery(forKey: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        // Save to Keychain
        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    // MARK: - Load

    func load(forKey key: String) throws -> Data? {
        // Build query
        var query = buildBaseQuery(forKey: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        // Load from Keychain
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status != errSecItemNotFound else {
            return nil
        }

        guard status == errSecSuccess else {
            throw KeychainError.loadFailed(status)
        }

        guard let data = result as? Data else {
            throw KeychainError.invalidData
        }

        return data
    }

    // MARK: - Delete

    func delete(forKey key: String) throws {
        let query = buildBaseQuery(forKey: key)
        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status)
        }
    }

    // MARK: - Delete All

    func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status)
        }
    }

    // MARK: - Private Methods

    private func buildBaseQuery(forKey key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        return query
    }
}

// MARK: - Keychain Error

enum KeychainError: LocalizedError {
    case saveFailed(OSStatus)
    case loadFailed(OSStatus)
    case deleteFailed(OSStatus)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .saveFailed(let status):
            return "Failed to save to Keychain: \\(status)"
        case .loadFailed(let status):
            return "Failed to load from Keychain: \\(status)"
        case .deleteFailed(let status):
            return "Failed to delete from Keychain: \\(status)"
        case .invalidData:
            return "Invalid data format"
        }
    }
}
`;

	return {
		path: `Sources/${className}SDK/Storage/KeychainWrapper.swift`,
		content,
		language: 'swift',
		type: 'source',
	};
}

/**
 * Generate Core Data stack file
 */
function generateCoreDataStackFile(options: SDKGenerationOptions): GeneratedSDKFile {
	const className = toPascalCase(options.packageName);

	const content = `//
//  CoreDataStack.swift
//  ${options.packageName}
//

import Foundation
import CoreData

/// Core Data stack for local database
final class CoreDataStack {

    // MARK: - Singleton

    static let shared = CoreDataStack()

    // MARK: - Properties

    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "${className}")
        container.loadPersistentStores { _, error in
            if let error = error as NSError? {
                fatalError("Unresolved error \\(error), \\(error.userInfo)")
            }
        }
        return container
    }()

    var context: NSManagedObjectContext {
        persistentContainer.viewContext
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Save

    func saveContext() {
        let context = persistentContainer.viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                let nserror = error as NSError
                fatalError("Unresolved error \\(nserror), \\(nserror.userInfo)")
            }
        }
    }

    // MARK: - Background Context

    func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        persistentContainer.performBackgroundTask(block)
    }
}
`;

	return {
		path: `Sources/${className}SDK/Storage/CoreDataStack.swift`,
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
