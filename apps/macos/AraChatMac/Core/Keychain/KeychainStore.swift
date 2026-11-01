import Foundation
import Security

enum KeychainError: LocalizedError {
    case unexpectedStatus(OSStatus)
    case invalidStoredValue

    var errorDescription: String? {
        switch self {
        case let .unexpectedStatus(status):
            return "Keychain status: \(status)"
        case .invalidStoredValue:
            return "Keychain stored an invalid value."
        }
    }
}

struct KeychainStore {
    private let service: String

    init(service: String = "ru.arachat.macos") {
        self.service = service
    }

    func string(for account: String) throws -> String? {
        var query = baseQuery(for: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            throw KeychainError.invalidStoredValue
        }
        return value
    }

    func set(_ value: String, for account: String) throws {
        let data = Data(value.utf8)
        let query = baseQuery(for: account)
        let attributes = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        if updateStatus == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.unexpectedStatus(addStatus)
            }
            return
        }

        guard updateStatus == errSecSuccess else {
            throw KeychainError.unexpectedStatus(updateStatus)
        }
    }

    func removeValue(for account: String) throws {
        let status = SecItemDelete(baseQuery(for: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private func baseQuery(for account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

struct DeviceIdentityStore {
    private static let deviceIDAccount = "device-id"
    private let keychain: KeychainStore

    init(keychain: KeychainStore) {
        self.keychain = keychain
    }

    func deviceID() throws -> String {
        if let existingValue = try keychain.string(for: Self.deviceIDAccount) {
            return existingValue
        }

        let newValue = UUID().uuidString.lowercased()
        try keychain.set(newValue, for: Self.deviceIDAccount)
        return newValue
    }
}
