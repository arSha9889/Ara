import CryptoKit
import Foundation
import Security

enum E2EEAlgorithm {
    static let identifier = "ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256"
    static let envelopeVersion = 2
    static let envelopePlaintextMaximumBytes = 16_368
}

enum E2EEError: Error, Equatable {
    case unsupportedChat
    case invalidIdentity
    case invalidEnvelope
    case invalidKeyMaterial
    case invalidMessage
    case missingRecipientKey
    case messageTooLarge
    case signatureVerificationFailed
    case decryptionFailed
    case secureRandomFailed
}

struct E2EEDeviceKey: Codable, Equatable, Identifiable, Sendable {
    let userID: UUID
    let deviceID: String
    let encryptionPublicKey: String
    let signingPublicKey: String
    let algorithm: String
    let envelopeVersion: Int? = 1
    let updatedAt: String

    var id: String {
        "\(userID.uuidString.lowercased()):\(deviceID)"
    }

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case deviceID = "device_id"
        case encryptionPublicKey = "encryption_public_key"
        case signingPublicKey = "signing_public_key"
        case algorithm
        case envelopeVersion = "envelope_version"
        case updatedAt = "updated_at"
    }
}

struct E2EEKeyRegistrationRequest: Encodable, Sendable {
    let deviceID: String
    let encryptionPublicKey: String
    let signingPublicKey: String
    let algorithm: String
    let envelopeVersion: Int = E2EEAlgorithm.envelopeVersion

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case encryptionPublicKey = "encryption_public_key"
        case signingPublicKey = "signing_public_key"
        case algorithm
        case envelopeVersion = "envelope_version"
    }
}

enum E2EEReadiness: Equatable, Sendable {
    case ready
    case waitingForProtectedDevice
}

enum E2EEProtectionState: Equatable, Sendable {
    case inactive
    case checking
    case ready
    case waitingForProtectedDevice
    case unavailable
}

struct E2EEIdentity: Sendable {
    let userID: UUID
    fileprivate let encryptionPrivateKey: P256.KeyAgreement.PrivateKey
    fileprivate let signingPrivateKey: P256.Signing.PrivateKey

    var encryptionPublicKey: String {
        encryptionPrivateKey.publicKey.x963Representation.base64EncodedString()
    }

    var signingPublicKey: String {
        signingPrivateKey.publicKey.x963Representation.base64EncodedString()
    }

    init(
        userID: UUID,
        encryptionPrivateKey: P256.KeyAgreement.PrivateKey,
        signingPrivateKey: P256.Signing.PrivateKey
    ) {
        self.userID = userID
        self.encryptionPrivateKey = encryptionPrivateKey
        self.signingPrivateKey = signingPrivateKey
    }

    static func create(for userID: UUID) -> E2EEIdentity {
        E2EEIdentity(
            userID: userID,
            encryptionPrivateKey: P256.KeyAgreement.PrivateKey(),
            signingPrivateKey: P256.Signing.PrivateKey()
        )
    }
}

struct E2EEChatContext: Sendable {
    let identity: E2EEIdentity
    let deviceID: String
    let deviceKeys: [E2EEDeviceKey]
    let readiness: E2EEReadiness
}

struct E2EEIdentityStore {
    private struct StoredIdentity: Codable {
        let userID: UUID
        let encryptionPrivateKey: String
        let signingPrivateKey: String
    }

    private let keychain: KeychainStore

    init(keychain: KeychainStore = KeychainStore()) {
        self.keychain = keychain
    }

    func identity(for userID: UUID) throws -> E2EEIdentity {
        if let encodedIdentity = try keychain.string(for: Self.account(for: userID)) {
            let storedIdentity: StoredIdentity
            do {
                storedIdentity = try JSONDecoder().decode(StoredIdentity.self, from: Data(encodedIdentity.utf8))
            } catch {
                throw E2EEError.invalidIdentity
            }

            guard storedIdentity.userID == userID,
                  let encryptionPrivateKeyData = Data(base64Encoded: storedIdentity.encryptionPrivateKey),
                  let signingPrivateKeyData = Data(base64Encoded: storedIdentity.signingPrivateKey)
            else {
                throw E2EEError.invalidIdentity
            }

            do {
                return E2EEIdentity(
                    userID: userID,
                    encryptionPrivateKey: try P256.KeyAgreement.PrivateKey(rawRepresentation: encryptionPrivateKeyData),
                    signingPrivateKey: try P256.Signing.PrivateKey(rawRepresentation: signingPrivateKeyData)
                )
            } catch {
                throw E2EEError.invalidIdentity
            }
        }

        let identity = E2EEIdentity.create(for: userID)
        let storedIdentity = StoredIdentity(
            userID: userID,
            encryptionPrivateKey: identity.encryptionPrivateKey.rawRepresentation.base64EncodedString(),
            signingPrivateKey: identity.signingPrivateKey.rawRepresentation.base64EncodedString()
        )
        let data = try JSONEncoder().encode(storedIdentity)
        guard let encodedIdentity = String(data: data, encoding: .utf8) else {
            throw E2EEError.invalidIdentity
        }
        try keychain.set(encodedIdentity, for: Self.account(for: userID))
        return identity
    }

    static func account(for userID: UUID) -> String {
        "e2ee.identity.\(userID.uuidString.lowercased())"
    }
}

struct E2EETrustStore {
    private let keychain: KeychainStore

    init(keychain: KeychainStore = KeychainStore()) {
        self.keychain = keychain
    }

    func signingPublicKey(for currentUserID: UUID, peerUserID: UUID, deviceID: String) throws -> String? {
        try keychain.string(for: Self.account(for: currentUserID, peerUserID: peerUserID, deviceID: deviceID))
    }

    func trust(
        signingPublicKey: String,
        for currentUserID: UUID,
        peerUserID: UUID,
        deviceID: String
    ) throws {
        guard E2EEMessageCrypto.validBase64Data(signingPublicKey, expectedByteCount: 65) != nil else {
            throw E2EEError.invalidKeyMaterial
        }
        try keychain.set(
            signingPublicKey,
            for: Self.account(for: currentUserID, peerUserID: peerUserID, deviceID: deviceID)
        )
    }

    static func account(for currentUserID: UUID, peerUserID: UUID, deviceID: String) -> String {
        [
            "e2ee.trusted-signing-key",
            currentUserID.uuidString.lowercased(),
            peerUserID.uuidString.lowercased(),
            deviceID,
        ].joined(separator: ".")
    }
}

actor E2EEKeyService {
    private let apiClient: APIClient
    private let identityStore: E2EEIdentityStore
    private let deviceIdentityStore: DeviceIdentityStore

    init(apiClient: APIClient, keychain: KeychainStore = KeychainStore()) {
        self.apiClient = apiClient
        identityStore = E2EEIdentityStore(keychain: keychain)
        deviceIdentityStore = DeviceIdentityStore(keychain: keychain)
    }

    static func live() -> E2EEKeyService {
        E2EEKeyService(apiClient: APIClient(configuration: .mainBundle))
    }

    func prepareDirectChat(
        _ chat: Chat,
        currentUserID: UUID,
        accessToken: String
    ) async throws -> E2EEChatContext {
        guard chat.type == "direct" else {
            throw E2EEError.unsupportedChat
        }

        let identity = try identityStore.identity(for: currentUserID)
        let deviceID = try deviceIdentityStore.deviceID()
        let _: E2EEDeviceKey = try await apiClient.request(
            path: "/api/security/e2ee/web-key",
            method: .put,
            body: E2EEKeyRegistrationRequest(
                deviceID: deviceID,
                encryptionPublicKey: identity.encryptionPublicKey,
                signingPublicKey: identity.signingPublicKey,
                algorithm: E2EEAlgorithm.identifier
            ),
            accessToken: accessToken
        )
        let deviceKeys: [E2EEDeviceKey] = try await apiClient.request(
            path: "/api/chats/\(chat.id.uuidString)/e2ee-keys",
            accessToken: accessToken
        )
        let readiness = Self.readiness(
            chat: chat,
            currentUserID: currentUserID,
            deviceID: deviceID,
            identity: identity,
            deviceKeys: deviceKeys
        )

        return E2EEChatContext(
            identity: identity,
            deviceID: deviceID,
            deviceKeys: deviceKeys,
            readiness: readiness
        )
    }

    nonisolated static func readiness(
        chat: Chat,
        currentUserID: UUID,
        deviceID: String,
        identity: E2EEIdentity,
        deviceKeys: [E2EEDeviceKey]
    ) -> E2EEReadiness {
        let participantIDs = Set(chat.participantIDs)
        let keyParticipantIDs = Set(deviceKeys.map(\.userID))
        let hasCurrentDeviceKey = deviceKeys.contains {
            $0.userID == currentUserID
                && $0.deviceID == deviceID
                && $0.encryptionPublicKey == identity.encryptionPublicKey
                && $0.signingPublicKey == identity.signingPublicKey
                && $0.algorithm == E2EEAlgorithm.identifier
        }

        guard participantIDs.count == 2,
              participantIDs == keyParticipantIDs,
              hasCurrentDeviceKey
        else {
            return .waitingForProtectedDevice
        }

        return .ready
    }
}

enum E2EEVerificationStatus: Equatable, Sendable {
    case verified
    case unverified
    case keyChanged
    case unavailable
}

struct E2EEDecryptionResult: Sendable {
    let plaintext: Data
    let verificationStatus: E2EEVerificationStatus
}

struct E2EEMessageDisplay: Equatable, Sendable {
    let plaintext: String?
    let verificationStatus: E2EEVerificationStatus

    init(result: E2EEDecryptionResult) {
        switch result.verificationStatus {
        case .verified, .unverified, .keyChanged:
            plaintext = String(data: result.plaintext, encoding: .utf8)
            verificationStatus = plaintext == nil ? .unavailable : result.verificationStatus
        case .unavailable:
            plaintext = nil
            verificationStatus = .unavailable
        }
    }

    static let unavailable = E2EEMessageDisplay(plaintext: nil, verificationStatus: .unavailable)

    private init(plaintext: String?, verificationStatus: E2EEVerificationStatus) {
        self.plaintext = plaintext
        self.verificationStatus = verificationStatus
    }
}

struct E2EEMessageCrypto {
    private let trustStore: E2EETrustStore

    init(trustStore: E2EETrustStore = E2EETrustStore()) {
        self.trustStore = trustStore
    }

    func decrypt(
        payload: String,
        chatID: UUID,
        senderID: UUID,
        currentUserID: UUID,
        deviceID: String,
        identity: E2EEIdentity,
        deviceKeys: [E2EEDeviceKey]
    ) throws -> E2EEDecryptionResult {
        let envelope = try Self.parseEnvelope(payload)
        let canonicalData = Data(Self.canonicalData(for: envelope).utf8)
        guard let signingPublicKeyData = Self.validBase64Data(
            envelope.senderSigningPublicKey,
            expectedByteCount: 65
        ), let signatureData = Self.validBase64Data(envelope.signature, expectedByteCount: 64)
        else {
            throw E2EEError.invalidEnvelope
        }

        do {
            let signingPublicKey = try P256.Signing.PublicKey(x963Representation: signingPublicKeyData)
            let signature = try P256.Signing.ECDSASignature(rawRepresentation: signatureData)
            guard signingPublicKey.isValidSignature(signature, for: canonicalData) else {
                throw E2EEError.signatureVerificationFailed
            }
        } catch let error as E2EEError {
            throw error
        } catch {
            throw E2EEError.invalidEnvelope
        }

        let recipientID = Self.recipientID(userID: currentUserID, deviceID: deviceID)
        guard let recipient = envelope.recipients[recipientID],
              let ephemeralPublicKeyData = Self.validBase64Data(
                  envelope.senderEphemeralPublicKey,
                  expectedByteCount: 65
              ), let salt = Self.validBase64Data(recipient.salt, expectedByteCount: 32),
              let initializationVector = Self.validBase64Data(recipient.initializationVector, expectedByteCount: 12),
              let encryptedPayload = Self.validBase64Data(recipient.ciphertext)
        else {
            throw E2EEError.missingRecipientKey
        }

        guard encryptedPayload.count >= 17 else {
            throw E2EEError.invalidEnvelope
        }

        let senderIDString = Self.lowercaseUUID(senderID)
        let additionalData = Self.additionalData(
            chatID: chatID,
            senderID: senderIDString,
            recipientID: recipientID
        )

        let plaintext: Data
        do {
            let ephemeralPublicKey = try P256.KeyAgreement.PublicKey(x963Representation: ephemeralPublicKeyData)
            let messageKey = try Self.messageKey(
                privateKey: identity.encryptionPrivateKey,
                publicKey: ephemeralPublicKey,
                salt: salt,
                chatID: chatID,
                senderID: senderIDString,
                recipientID: recipientID
            )
            let nonce = try AES.GCM.Nonce(data: initializationVector)
            let sealedBox = try AES.GCM.SealedBox(
                nonce: nonce,
                ciphertext: Data(encryptedPayload.dropLast(16)),
                tag: Data(encryptedPayload.suffix(16))
            )
            plaintext = try AES.GCM.open(sealedBox, using: messageKey, authenticating: additionalData)
        } catch {
            throw E2EEError.decryptionFailed
        }

        return E2EEDecryptionResult(
            plaintext: plaintext,
            verificationStatus: try verificationStatus(
                senderID: senderID,
                envelope: envelope,
                currentUserID: currentUserID,
                deviceKeys: deviceKeys
            )
        )
    }

    func encryptText(
        _ text: String,
        chatID: UUID,
        senderID: UUID,
        deviceID: String,
        identity: E2EEIdentity,
        recipientKeys: [E2EEDeviceKey]
    ) throws -> String {
        let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedText.isEmpty else {
            throw E2EEError.invalidMessage
        }

        let plaintext = Data(normalizedText.utf8)
        guard plaintext.count <= E2EEAlgorithm.envelopePlaintextMaximumBytes else {
            throw E2EEError.messageTooLarge
        }

        let senderIDString = Self.lowercaseUUID(senderID)
        let keysByRecipientID = Dictionary(uniqueKeysWithValues: recipientKeys.map {
            (Self.recipientID(userID: $0.userID, deviceID: $0.deviceID), $0)
        })
        let envelopeVersion = recipientKeys.allSatisfy {
            ($0.envelopeVersion ?? 1) >= E2EEAlgorithm.envelopeVersion
        } ? E2EEAlgorithm.envelopeVersion : 1
        let participantIDs = Set(recipientKeys.map(\.userID))
        let currentRecipientID = Self.recipientID(userID: senderID, deviceID: deviceID)
        guard participantIDs.count == 2,
              participantIDs.contains(senderID),
              keysByRecipientID[currentRecipientID] != nil
        else {
            throw E2EEError.missingRecipientKey
        }

        let ephemeralPrivateKey = P256.KeyAgreement.PrivateKey()
        var recipients = [String: E2EERecipientEnvelope]()

        for (recipientID, recipientKey) in keysByRecipientID {
            guard recipientKey.algorithm == E2EEAlgorithm.identifier,
                  let recipientPublicKeyData = Self.validBase64Data(
                      recipientKey.encryptionPublicKey,
                      expectedByteCount: 65
                  )
            else {
                throw E2EEError.invalidKeyMaterial
            }

            let salt = try Self.secureRandomData(count: 32)
            let initializationVector = try Self.secureRandomData(count: 12)
            let additionalData = Self.additionalData(
                chatID: chatID,
                senderID: senderIDString,
                recipientID: recipientID
            )

            do {
                let recipientPublicKey = try P256.KeyAgreement.PublicKey(x963Representation: recipientPublicKeyData)
                let messageKey = try Self.messageKey(
                    privateKey: ephemeralPrivateKey,
                    publicKey: recipientPublicKey,
                    salt: salt,
                    chatID: chatID,
                    senderID: senderIDString,
                    recipientID: recipientID
                )
                let nonce = try AES.GCM.Nonce(data: initializationVector)
                let sealedBox = try AES.GCM.seal(plaintext, using: messageKey, nonce: nonce, authenticating: additionalData)
                recipients[recipientID] = E2EERecipientEnvelope(
                    ciphertext: (sealedBox.ciphertext + sealedBox.tag).base64EncodedString(),
                    initializationVector: initializationVector.base64EncodedString(),
                    salt: salt.base64EncodedString(),
                    recipientEncryptionPublicKey: envelopeVersion >= 2 ? recipientKey.encryptionPublicKey : nil
                )
            } catch {
                throw E2EEError.invalidKeyMaterial
            }
        }

        let unsignedEnvelope = E2EEEnvelope(
            version: envelopeVersion,
            algorithm: E2EEAlgorithm.identifier,
            senderDeviceID: deviceID,
            senderEphemeralPublicKey: ephemeralPrivateKey.publicKey.x963Representation.base64EncodedString(),
            senderSigningPublicKey: identity.signingPublicKey,
            recipients: recipients,
            signature: ""
        )
        let canonicalData = Data(Self.canonicalData(for: unsignedEnvelope).utf8)
        let signature = try identity.signingPrivateKey.signature(for: canonicalData).rawRepresentation.base64EncodedString()
        let envelope = E2EEEnvelope(
            version: unsignedEnvelope.version,
            algorithm: unsignedEnvelope.algorithm,
            senderDeviceID: unsignedEnvelope.senderDeviceID,
            senderEphemeralPublicKey: unsignedEnvelope.senderEphemeralPublicKey,
            senderSigningPublicKey: unsignedEnvelope.senderSigningPublicKey,
            recipients: unsignedEnvelope.recipients,
            signature: signature
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let encodedEnvelope = try encoder.encode(envelope)
        guard let payload = String(data: encodedEnvelope, encoding: .utf8) else {
            throw E2EEError.invalidEnvelope
        }
        return payload
    }

    static func validBase64Data(_ value: String, expectedByteCount: Int? = nil) -> Data? {
        guard !value.isEmpty,
              let data = Data(base64Encoded: value),
              expectedByteCount.map({ data.count == $0 }) ?? true
        else {
            return nil
        }
        return data
    }

    private func verificationStatus(
        senderID: UUID,
        envelope: E2EEEnvelope,
        currentUserID: UUID,
        deviceKeys: [E2EEDeviceKey]
    ) throws -> E2EEVerificationStatus {
        let senderKey = deviceKeys.first {
            $0.userID == senderID && $0.deviceID == envelope.senderDeviceID
        }
        var status: E2EEVerificationStatus = senderKey?.signingPublicKey == envelope.senderSigningPublicKey
            ? .verified
            : .unverified

        guard senderID != currentUserID else {
            return status
        }

        do {
            let trustedKey = try trustStore.signingPublicKey(
                for: currentUserID,
                peerUserID: senderID,
                deviceID: envelope.senderDeviceID
            )
            if let trustedKey, trustedKey != envelope.senderSigningPublicKey {
                status = .keyChanged
            } else if trustedKey == nil {
                try trustStore.trust(
                    signingPublicKey: envelope.senderSigningPublicKey,
                    for: currentUserID,
                    peerUserID: senderID,
                    deviceID: envelope.senderDeviceID
                )
            }
        } catch {
            if status == .verified {
                status = .unverified
            }
        }

        return status
    }

    private static func parseEnvelope(_ payload: String) throws -> E2EEEnvelope {
        guard payload.utf8.count <= 524_288,
              let data = payload.data(using: .utf8)
        else {
            throw E2EEError.invalidEnvelope
        }

        let envelope: E2EEEnvelope
        do {
            envelope = try JSONDecoder().decode(E2EEEnvelope.self, from: data)
        } catch {
            throw E2EEError.invalidEnvelope
        }

        guard [1, E2EEAlgorithm.envelopeVersion].contains(envelope.version),
              envelope.algorithm == E2EEAlgorithm.identifier,
              !envelope.senderDeviceID.isEmpty,
              !envelope.senderEphemeralPublicKey.isEmpty,
              !envelope.senderSigningPublicKey.isEmpty,
              !envelope.signature.isEmpty,
              !envelope.recipients.isEmpty
        else {
            throw E2EEError.invalidEnvelope
        }
        if envelope.version >= 2, envelope.recipients.values.contains(where: { $0.recipientEncryptionPublicKey?.isEmpty != false }) {
            throw E2EEError.invalidEnvelope
        }

        return envelope
    }

    private static func messageKey(
        privateKey: P256.KeyAgreement.PrivateKey,
        publicKey: P256.KeyAgreement.PublicKey,
        salt: Data,
        chatID: UUID,
        senderID: String,
        recipientID: String
    ) throws -> SymmetricKey {
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: publicKey)
        return sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: salt,
            sharedInfo: Data(additionalData(chatID: chatID, senderID: senderID, recipientID: recipientID)),
            outputByteCount: 32
        )
    }

    private static func additionalData(chatID: UUID, senderID: String, recipientID: String) -> Data {
        Data("AraChat E2EE Web v1|\(lowercaseUUID(chatID))|\(senderID)|\(recipientID)".utf8)
    }

    private static func canonicalData(for envelope: E2EEEnvelope) -> String {
        let recipients = envelope.recipients
            .sorted { $0.key.compare($1.key, options: .literal) == .orderedAscending }
            .map { recipientID, recipient in
                let recipientPublicKey = recipient.recipientEncryptionPublicKey ?? String()
                let recipientKey = envelope.version >= 2
                    ? ",\"recipient_encryption_public_key\":\(jsonString(recipientPublicKey))"
                    : ""
                return "\(jsonString(recipientID)):{\"ciphertext\":\(jsonString(recipient.ciphertext)),\"iv\":\(jsonString(recipient.initializationVector)),\"salt\":\(jsonString(recipient.salt))\(recipientKey)}"
            }
            .joined(separator: ",")

        return "{\"version\":\(envelope.version),\"algorithm\":\(jsonString(envelope.algorithm)),\"sender_device_id\":\(jsonString(envelope.senderDeviceID)),\"sender_ephemeral_public_key\":\(jsonString(envelope.senderEphemeralPublicKey)),\"sender_signing_public_key\":\(jsonString(envelope.senderSigningPublicKey)),\"recipients\":{\(recipients)}}"
    }

    private static func jsonString(_ value: String) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = try? encoder.encode(value)
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
    }

    private static func recipientID(userID: UUID, deviceID: String) -> String {
        "\(lowercaseUUID(userID)):\(deviceID)"
    }

    private static func lowercaseUUID(_ value: UUID) -> String {
        value.uuidString.lowercased()
    }

    private static func secureRandomData(count: Int) throws -> Data {
        var data = Data(count: count)
        let status = data.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw E2EEError.secureRandomFailed
        }
        return data
    }
}

private struct E2EEEnvelope: Codable {
    let version: Int
    let algorithm: String
    let senderDeviceID: String
    let senderEphemeralPublicKey: String
    let senderSigningPublicKey: String
    let recipients: [String: E2EERecipientEnvelope]
    let signature: String

    enum CodingKeys: String, CodingKey {
        case version
        case algorithm
        case senderDeviceID = "sender_device_id"
        case senderEphemeralPublicKey = "sender_ephemeral_public_key"
        case senderSigningPublicKey = "sender_signing_public_key"
        case recipients
        case signature
    }
}

private struct E2EERecipientEnvelope: Codable {
    let ciphertext: String
    let initializationVector: String
    let salt: String
    let recipientEncryptionPublicKey: String?

    enum CodingKeys: String, CodingKey {
        case ciphertext
        case initializationVector = "iv"
        case salt
        case recipientEncryptionPublicKey = "recipient_encryption_public_key"
    }
}
