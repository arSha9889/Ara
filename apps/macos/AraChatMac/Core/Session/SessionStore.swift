import Foundation

@MainActor
final class SessionStore: ObservableObject {
    enum State: Equatable {
        case restoring
        case signedOut
        case authenticated(User)
    }

    @Published private(set) var state: State = .restoring
    @Published private(set) var accessToken: String?

    private static let refreshTokenAccount = "refresh-token"
    private let apiClient: APIClient
    private let keychain: KeychainStore
    private let deviceIdentity: DeviceIdentityStore
    private var refreshTask: Task<Void, Never>?

    init(apiClient: APIClient, keychain: KeychainStore = KeychainStore()) {
        self.apiClient = apiClient
        self.keychain = keychain
        deviceIdentity = DeviceIdentityStore(keychain: keychain)
    }

    static func live() -> SessionStore {
        SessionStore(apiClient: APIClient(configuration: .mainBundle))
    }

    func restore() async {
        guard let refreshToken = try? keychain.string(for: Self.refreshTokenAccount) else {
            accessToken = nil
            state = .signedOut
            return
        }

        do {
            let response: TokenPairResponse = try await apiClient.request(
                path: "/api/auth/refresh",
                method: .post,
                body: RefreshRequest(refreshToken: refreshToken)
            )
            try apply(response)
        } catch {
            clearSession()
        }
    }

    func login(identifier: String, password: String) async throws {
        let deviceID = try deviceIdentity.deviceID()
        let response: TokenPairResponse = try await apiClient.request(
            path: "/api/auth/login",
            method: .post,
            body: LoginRequest(identifier: identifier, password: password, deviceID: deviceID)
        )
        try apply(response)
    }

    func startEmailVerification(email: String, language: AppLanguage) async throws -> EmailVerificationStartResponse {
        let deviceID = try deviceIdentity.deviceID()
        return try await apiClient.request(
            path: "/api/auth/email-verification/start",
            method: .post,
            body: EmailVerificationStartRequest(email: email, deviceID: deviceID, language: language.rawValue)
        )
    }

    func confirmEmailVerification(id: UUID, code: String) async throws {
        struct IgnoredEmailVerificationResponse: Decodable, Sendable {}

        let _: IgnoredEmailVerificationResponse = try await apiClient.request(
            path: "/api/auth/email-verification/confirm",
            method: .post,
            body: EmailVerificationConfirmRequest(verificationID: id, code: code)
        )
    }

    func completeRegistration(
        verificationID: UUID,
        username: String,
        password: String,
        displayName: String,
        country: String,
        language: AppLanguage,
        acceptedTerms: Bool,
        acceptedPrivacyPolicy: Bool
    ) async throws {
        let deviceID = try deviceIdentity.deviceID()
        let response: TokenPairResponse = try await apiClient.request(
            path: "/api/auth/register/complete",
            method: .post,
            body: RegistrationRequest(
                emailVerificationID: verificationID,
                username: username,
                password: password,
                deviceID: deviceID,
                language: language.rawValue,
                registrationCountry: country,
                designTheme: "halo",
                displayName: displayName,
                avatarType: "built_in",
                avatarRef: "animal-01",
                acceptedTerms: acceptedTerms,
                acceptedPrivacyPolicy: acceptedPrivacyPolicy
            )
        )
        try apply(response)
    }

    func logout() async {
        if let refreshToken = try? keychain.string(for: Self.refreshTokenAccount) {
            let _: APIStatusResponse? = try? await apiClient.request(
                path: "/api/auth/logout",
                method: .post,
                body: LogoutRequest(refreshToken: refreshToken)
            )
        }

        clearSession()
    }

    private func apply(_ response: TokenPairResponse) throws {
        try keychain.set(response.refreshToken, for: Self.refreshTokenAccount)
        accessToken = response.accessToken
        state = .authenticated(response.user)
        scheduleRefresh(for: response.accessToken)
    }

    private func clearSession() {
        refreshTask?.cancel()
        refreshTask = nil
        try? keychain.removeValue(for: Self.refreshTokenAccount)
        accessToken = nil
        state = .signedOut
    }

    private func scheduleRefresh(for accessToken: String) {
        refreshTask?.cancel()

        guard let expiration = Self.accessTokenExpiration(accessToken) else {
            return
        }

        let interval = max(0, expiration.timeIntervalSinceNow - 60)
        refreshTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            } catch {
                return
            }

            guard !Task.isCancelled else { return }
            await self?.refreshSession()
        }
    }

    private func refreshSession() async {
        guard let refreshToken = try? keychain.string(for: Self.refreshTokenAccount) else {
            clearSession()
            return
        }

        do {
            let response: TokenPairResponse = try await apiClient.request(
                path: "/api/auth/refresh",
                method: .post,
                body: RefreshRequest(refreshToken: refreshToken)
            )
            try apply(response)
        } catch {
            clearSession()
        }
    }

    private static func accessTokenExpiration(_ token: String) -> Date? {
        struct Claims: Decodable {
            let exp: TimeInterval
        }

        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }

        let encodedPayload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let paddingLength = (4 - encodedPayload.count % 4) % 4
        guard let data = Data(base64Encoded: encodedPayload + String(repeating: "=", count: paddingLength)),
              let claims = try? JSONDecoder().decode(Claims.self, from: data)
        else {
            return nil
        }

        return Date(timeIntervalSince1970: claims.exp)
    }
}
