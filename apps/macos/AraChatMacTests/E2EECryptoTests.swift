import CryptoKit
import Foundation
import XCTest
@testable import AraChat

final class E2EECryptoTests: XCTestCase {
    private let chatID = UUID(uuidString: "cccccccc-cccc-cccc-cccc-cccccccccccc")!
    private let senderID = UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!
    private let recipientID = UUID(uuidString: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")!
    private let recipientDeviceID = "recipient-device-001"

    func testDecryptsEnvelopeCreatedByDesktopCrypto() throws {
        let keychain = KeychainStore(service: "ru.arachat.macos.tests.e2ee.\(UUID().uuidString)")
        let trustStore = E2EETrustStore(keychain: keychain)
        defer {
            try? keychain.removeValue(
                for: E2EETrustStore.account(
                    for: recipientID,
                    peerUserID: senderID,
                    deviceID: "sender-device-001"
                )
            )
        }

        let result = try E2EEMessageCrypto(trustStore: trustStore).decrypt(
            payload: desktopPayload,
            chatID: chatID,
            senderID: senderID,
            currentUserID: recipientID,
            deviceID: recipientDeviceID,
            identity: recipientIdentity,
            deviceKeys: [senderDeviceKey]
        )

        XCTAssertEqual(String(data: result.plaintext, encoding: .utf8), "Совместимость Swift и Desktop")
        XCTAssertEqual(result.verificationStatus, .verified)
    }

    func testRejectsTamperedDesktopSignature() throws {
        var envelope = try JSONSerialization.jsonObject(with: Data(desktopPayload.utf8)) as! [String: Any]
        let signature = envelope["signature"] as! String
        envelope["signature"] = "A" + signature.dropFirst()
        let payload = String(data: try JSONSerialization.data(withJSONObject: envelope), encoding: .utf8)!

        XCTAssertThrowsError(
            try E2EEMessageCrypto().decrypt(
                payload: payload,
                chatID: chatID,
                senderID: senderID,
                currentUserID: recipientID,
                deviceID: recipientDeviceID,
                identity: recipientIdentity,
                deviceKeys: [senderDeviceKey]
            )
        ) { error in
            XCTAssertEqual(error as? E2EEError, .signatureVerificationFailed)
        }
    }

    func testEncryptedTextRoundTripsAndEmitsRawEcdsaSignature() throws {
        let sender = E2EEIdentity.create(for: senderID)
        let recipient = E2EEIdentity.create(for: recipientID)
        let senderDeviceID = "sender-device-001"
        let recipientKey = E2EEDeviceKey(
            userID: recipientID,
            deviceID: recipientDeviceID,
            encryptionPublicKey: recipient.encryptionPublicKey,
            signingPublicKey: recipient.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
        let senderKey = E2EEDeviceKey(
            userID: senderID,
            deviceID: senderDeviceID,
            encryptionPublicKey: sender.encryptionPublicKey,
            signingPublicKey: sender.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
        let keychain = KeychainStore(service: "ru.arachat.macos.tests.e2ee.\(UUID().uuidString)")
        let trustStore = E2EETrustStore(keychain: keychain)
        let trustedKeyAccount = E2EETrustStore.account(
            for: recipientID,
            peerUserID: senderID,
            deviceID: senderDeviceID
        )
        defer { try? keychain.removeValue(for: trustedKeyAccount) }
        let crypto = E2EEMessageCrypto(trustStore: trustStore)

        let payload = try crypto.encryptText(
            "  Проверка native E2EE  ",
            chatID: chatID,
            senderID: senderID,
            deviceID: senderDeviceID,
            identity: sender,
            recipientKeys: [senderKey, recipientKey]
        )
        let envelope = try JSONSerialization.jsonObject(with: Data(payload.utf8)) as! [String: Any]
        let signature = Data(base64Encoded: envelope["signature"] as! String)
        XCTAssertEqual(signature?.count, 64)

        let result = try crypto.decrypt(
            payload: payload,
            chatID: chatID,
            senderID: senderID,
            currentUserID: recipientID,
            deviceID: recipientDeviceID,
            identity: recipient,
            deviceKeys: [senderKey, recipientKey]
        )

        XCTAssertEqual(String(data: result.plaintext, encoding: .utf8), "Проверка native E2EE")
        XCTAssertEqual(result.verificationStatus, .verified)
    }

    func testDesktopDecryptsNativeEnvelope() throws {
        guard let nodeExecutableURL = Self.desktopNodeExecutableURL else {
            throw XCTSkip("Node недоступен; внешняя проверка desktop E2EE пропущена.")
        }

        let sender = E2EEIdentity.create(for: senderID)
        let recipientEncryptionPrivateKey = P256.KeyAgreement.PrivateKey()
        let recipient = E2EEIdentity(
            userID: recipientID,
            encryptionPrivateKey: recipientEncryptionPrivateKey,
            signingPrivateKey: P256.Signing.PrivateKey()
        )
        let senderDeviceID = "sender-device-001"
        let senderKey = E2EEDeviceKey(
            userID: senderID,
            deviceID: senderDeviceID,
            encryptionPublicKey: sender.encryptionPublicKey,
            signingPublicKey: sender.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
        let recipientKey = E2EEDeviceKey(
            userID: recipientID,
            deviceID: recipientDeviceID,
            encryptionPublicKey: recipient.encryptionPublicKey,
            signingPublicKey: recipient.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
        let payload = try E2EEMessageCrypto().encryptText(
            "Проверка Swift → Desktop E2EE",
            chatID: chatID,
            senderID: senderID,
            deviceID: senderDeviceID,
            identity: sender,
            recipientKeys: [recipientKey, senderKey]
        )

        let decrypted = try decryptWithDesktopModule(
            nodeExecutableURL: nodeExecutableURL,
            payload: payload,
            recipientPrivateKey: recipientEncryptionPrivateKey.rawRepresentation,
            recipientPublicKey: recipient.encryptionPublicKey,
            senderDeviceID: senderDeviceID
        )

        XCTAssertEqual(decrypted.payload, "Проверка Swift → Desktop E2EE")
        XCTAssertEqual(decrypted.status, "verified")
    }

    func testTrustStoreMarksChangedPeerSigningKey() throws {
        let keychain = KeychainStore(service: "ru.arachat.macos.tests.e2ee.\(UUID().uuidString)")
        let trustStore = E2EETrustStore(keychain: keychain)
        let account = E2EETrustStore.account(
            for: recipientID,
            peerUserID: senderID,
            deviceID: "sender-device-001"
        )
        defer { try? keychain.removeValue(for: account) }

        try trustStore.trust(
            signingPublicKey: E2EEIdentity.create(for: senderID).signingPublicKey,
            for: recipientID,
            peerUserID: senderID,
            deviceID: "sender-device-001"
        )
        let result = try E2EEMessageCrypto(trustStore: trustStore).decrypt(
            payload: desktopPayload,
            chatID: chatID,
            senderID: senderID,
            currentUserID: recipientID,
            deviceID: recipientDeviceID,
            identity: recipientIdentity,
            deviceKeys: [senderDeviceKey]
        )

        XCTAssertEqual(result.verificationStatus, .keyChanged)
    }

    func testKeyRegistrationUsesBackendFieldNames() throws {
        let request = E2EEKeyRegistrationRequest(
            deviceID: "native-device-001",
            encryptionPublicKey: "encryption-key",
            signingPublicKey: "signing-key",
            algorithm: E2EEAlgorithm.identifier
        )
        let payload = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: String]

        XCTAssertEqual(
            payload,
            [
                "device_id": "native-device-001",
                "encryption_public_key": "encryption-key",
                "signing_public_key": "signing-key",
                "algorithm": E2EEAlgorithm.identifier,
            ]
        )
    }

    func testIdentityStoreRestoresTheSameKeyPairForAUser() throws {
        let keychain = KeychainStore(service: "ru.arachat.macos.tests.e2ee.\(UUID().uuidString)")
        let store = E2EEIdentityStore(keychain: keychain)
        defer { try? keychain.removeValue(for: E2EEIdentityStore.account(for: recipientID)) }

        let first = try store.identity(for: recipientID)
        let restored = try store.identity(for: recipientID)

        XCTAssertEqual(restored.encryptionPublicKey, first.encryptionPublicKey)
        XCTAssertEqual(restored.signingPublicKey, first.signingPublicKey)
    }

    func testReadinessRequiresKeysForBothParticipantsAndCurrentDevice() {
        let peerID = UUID()
        let identity = E2EEIdentity.create(for: recipientID)
        let chat = makeDirectChat(participantIDs: [recipientID, peerID])
        let currentDeviceID = "recipient-device-001"
        let currentDeviceKey = E2EEDeviceKey(
            userID: recipientID,
            deviceID: currentDeviceID,
            encryptionPublicKey: identity.encryptionPublicKey,
            signingPublicKey: identity.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
        let peerIdentity = E2EEIdentity.create(for: peerID)
        let peerDeviceKey = E2EEDeviceKey(
            userID: peerID,
            deviceID: "peer-device-001",
            encryptionPublicKey: peerIdentity.encryptionPublicKey,
            signingPublicKey: peerIdentity.signingPublicKey,
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )

        XCTAssertEqual(
            E2EEKeyService.readiness(
                chat: chat,
                currentUserID: recipientID,
                deviceID: currentDeviceID,
                identity: identity,
                deviceKeys: [currentDeviceKey, peerDeviceKey]
            ),
            .ready
        )
        XCTAssertEqual(
            E2EEKeyService.readiness(
                chat: chat,
                currentUserID: recipientID,
                deviceID: currentDeviceID,
                identity: identity,
                deviceKeys: [currentDeviceKey]
            ),
            .waitingForProtectedDevice
        )
    }

    func testMessageDisplayRevealsOnlyUsableVerifiedStates() {
        let plaintext = Data("Только для доверенной расшифровки".utf8)

        for status in [E2EEVerificationStatus.verified, .unverified, .keyChanged] {
            let display = E2EEMessageDisplay(
                result: E2EEDecryptionResult(plaintext: plaintext, verificationStatus: status)
            )
            XCTAssertEqual(display.plaintext, "Только для доверенной расшифровки")
            XCTAssertEqual(display.verificationStatus, status)
        }

        let unavailable = E2EEMessageDisplay(
            result: E2EEDecryptionResult(plaintext: plaintext, verificationStatus: .unavailable)
        )
        XCTAssertNil(unavailable.plaintext)
        XCTAssertEqual(unavailable.verificationStatus, .unavailable)

        let invalidText = E2EEMessageDisplay(
            result: E2EEDecryptionResult(plaintext: Data([0xFF]), verificationStatus: .verified)
        )
        XCTAssertNil(invalidText.plaintext)
        XCTAssertEqual(invalidText.verificationStatus, .unavailable)
    }

    private func makeDirectChat(participantIDs: [UUID]) -> Chat {
        Chat(
            id: chatID,
            type: "direct",
            createdAt: "2026-10-31T12:00:00Z",
            updatedAt: "2026-10-31T12:00:00Z",
            lastMessageID: nil,
            pinnedMessageID: nil,
            participantIDs: participantIDs,
            peer: nil,
            lastMessage: nil,
            pinnedMessage: nil,
            unreadCount: 0,
            title: nil,
            slug: nil,
            description: nil,
            avatarRef: nil,
            isOfficial: false,
            isPrivate: false,
            isSubscribed: true,
            subscriberCount: 0,
            canPost: true,
            currentRole: nil,
            notificationsEnabled: true,
            wallpaperID: "default"
        )
    }

    private var recipientIdentity: E2EEIdentity {
        E2EEIdentity(
            userID: recipientID,
            encryptionPrivateKey: try! P256.KeyAgreement.PrivateKey(
                rawRepresentation: Data(base64Encoded: "F07eDydBIEIIcKHwcxr5qICOehwMdAjn9WXCKtBAGw4=")!
            ),
            signingPrivateKey: P256.Signing.PrivateKey()
        )
    }

    private var senderDeviceKey: E2EEDeviceKey {
        E2EEDeviceKey(
            userID: senderID,
            deviceID: "sender-device-001",
            encryptionPublicKey: "BKRRm5ey3IxTMVTIqOgf00an86HINJF52fpCAyY8h1n3Cmql9PNcM0WiQ7mLd3EnuPY/qh2zC4HgLznW7FxzdbI=",
            signingPublicKey: "BHIgHj294/xAn9324FD3m/dDffz/1ysdmlHKiunHRQviFgimR35cX+TA6RAc+lyJIY0H/OxBJh1Aimi9T1yws/o=",
            algorithm: E2EEAlgorithm.identifier,
            updatedAt: "2026-10-31T12:00:00Z"
        )
    }

    private var desktopPayload: String {
        """
        {"version":1,"algorithm":"ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256","sender_device_id":"sender-device-001","sender_ephemeral_public_key":"BKRRm5ey3IxTMVTIqOgf00an86HINJF52fpCAyY8h1n3Cmql9PNcM0WiQ7mLd3EnuPY/qh2zC4HgLznW7FxzdbI=","sender_signing_public_key":"BHIgHj294/xAn9324FD3m/dDffz/1ysdmlHKiunHRQviFgimR35cX+TA6RAc+lyJIY0H/OxBJh1Aimi9T1yws/o=","recipients":{"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:recipient-device-001":{"ciphertext":"ek6zOXNQc4F4thVP7T0Knp/wZ2WjlAjmrUuZ60MgOQVEaHQ5LJ3UW7gc2ffRyKm1GpGcB76pEH01lc4=","iv":"5rJ2y3k2XGZwsddg","salt":"+ffjP68FAznES6t3TPArAsiyIDXnB9w/NzalfhOX34w="},"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:sender-device-001":{"ciphertext":"WPlxzj01q59XMbO/K6Yk7ZpCnSPL7MUbVoLVFv8j0Tn3ardM8UuCfMjsoE5zvZr8EK+9rDE4WmueejI=","iv":"NwOQXG6/lsmjSsOs","salt":"FyIxtO5z+gcUKm6qGCidK+xalSPp77eGD078wIX5/fU="}},"signature":"LXaflTfrvZ9A3DN2gHdpMnikd8jWs/W6Q31FG8N1mEQIHRAWL9da+zJEN8w5w4+jl/7+n/F9QTbCZQ1Qlx8VTA=="}
        """
    }

    private func decryptWithDesktopModule(
        nodeExecutableURL: URL,
        payload: String,
        recipientPrivateKey: Data,
        recipientPublicKey: String,
        senderDeviceID: String
    ) throws -> DesktopDecryptionResult {
        let appsDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let moduleURL = appsDirectory.appendingPathComponent("pc/src/shared/crypto/e2eeDesktop.js")
        XCTAssertTrue(FileManager.default.fileExists(atPath: moduleURL.path))

        let input: [String: String] = [
            "module_path": moduleURL.path,
            "payload": payload,
            "recipient_private_key": recipientPrivateKey.base64EncodedString(),
            "recipient_public_key": recipientPublicKey,
            "chat_id": chatID.uuidString.lowercased(),
            "sender_id": senderID.uuidString.lowercased(),
            "recipient_id": recipientID.uuidString.lowercased(),
            "recipient_device_id": recipientDeviceID,
            "sender_device_id": senderDeviceID,
        ]
        let process = Process()
        let standardInput = Pipe()
        let standardOutput = Pipe()
        let standardError = Pipe()
        process.executableURL = nodeExecutableURL
        process.arguments = ["--input-type=module", "--eval", Self.desktopDecryptionScript]
        process.standardInput = standardInput
        process.standardOutput = standardOutput
        process.standardError = standardError

        try process.run()
        try standardInput.fileHandleForWriting.write(contentsOf: JSONEncoder().encode(input))
        try standardInput.fileHandleForWriting.close()
        process.waitUntilExit()

        let output = standardOutput.fileHandleForReading.readDataToEndOfFile()
        let error = standardError.fileHandleForReading.readDataToEndOfFile()
        XCTAssertEqual(
            process.terminationStatus,
            0,
            "Desktop E2EE process failed: \(String(decoding: error, as: UTF8.self))"
        )
        return try JSONDecoder().decode(DesktopDecryptionResult.self, from: output)
    }

    private static let desktopDecryptionScript = """
    import { webcrypto } from 'node:crypto';
    import { pathToFileURL } from 'node:url';

    const input = JSON.parse(await new Response(process.stdin).text());
    const base64URL = (value) => Buffer.from(value).toString('base64url');
    const recipientPublicKey = Buffer.from(input.recipient_public_key, 'base64');
    const trustedSigningKeys = new Map();
    const indexedDB = {
      open: () => {
        const database = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction: (name) => {
            const transaction = {};
            const complete = () => queueMicrotask(() => transaction.oncomplete?.());
            const store = {
              get: (key) => {
                const request = { result: trustedSigningKeys.get(key) };
                queueMicrotask(() => {
                  request.onsuccess?.();
                  complete();
                });
                return request;
              },
              put: (value) => {
                const request = {};
                queueMicrotask(() => {
                  trustedSigningKeys.set(value.id, value);
                  request.onsuccess?.();
                  complete();
                });
                return request;
              },
            };
            transaction.objectStore = () => store;
            return transaction;
          },
        };
        const request = { result: database };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    };
    const recipientPrivateKey = await webcrypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        d: base64URL(Buffer.from(input.recipient_private_key, 'base64')),
        x: base64URL(recipientPublicKey.subarray(1, 33)),
        y: base64URL(recipientPublicKey.subarray(33, 65)),
        ext: true,
        key_ops: ['deriveKey', 'deriveBits'],
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits'],
    );
    globalThis.window = {
      isSecureContext: true,
      crypto: webcrypto,
      indexedDB,
      localStorage: {
        getItem: (key) => key === 'arachat-desktop-device-id' ? input.recipient_device_id : null,
        setItem: () => {},
      },
      btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
      atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    };
    const { decryptE2eeMessage } = await import(pathToFileURL(input.module_path).href);
    const envelope = JSON.parse(input.payload);
    const decrypted = await decryptE2eeMessage({
      message: { encryption_state: 'e2ee_web_v1', sender_id: input.sender_id, payload: input.payload },
      chatId: input.chat_id,
      currentUserId: input.recipient_id,
      identity: { encryptionPrivateKey: recipientPrivateKey },
      chatKeys: [{
        user_id: input.sender_id,
        device_id: input.sender_device_id,
        signing_public_key: envelope.sender_signing_public_key,
      }],
    });
    process.stdout.write(JSON.stringify({ payload: decrypted.payload, status: decrypted.e2ee_status }));
    """

    private struct DesktopDecryptionResult: Decodable {
        let payload: String
        let status: String
    }

    private static var desktopNodeExecutableURL: URL? {
        let candidatePaths = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]

        for path in candidatePaths where FileManager.default.isExecutableFile(atPath: path) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: path)
            process.arguments = ["--version"]
            process.standardOutput = Pipe()
            process.standardError = Pipe()
            do {
                try process.run()
                process.waitUntilExit()
                if process.terminationStatus == 0 {
                    return URL(fileURLWithPath: path)
                }
            } catch {
                continue
            }
        }

        return nil
    }
}
