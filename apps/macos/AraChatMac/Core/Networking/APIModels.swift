import Foundation

struct UserProfile: Codable, Equatable, Sendable {
    let displayName: String
    let username: String
    let avatarType: String
    let avatarRef: String
    let optionalPhone: String?
    let email: String?
    let emailVerified: Bool
    let registrationCountry: String?
    let phonePublic: Bool
    let language: String
    let designTheme: String
    let currentMode: String

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case username
        case avatarType = "avatar_type"
        case avatarRef = "avatar_ref"
        case optionalPhone = "optional_phone"
        case email
        case emailVerified = "email_verified"
        case registrationCountry = "registration_country"
        case phonePublic = "phone_public"
        case language
        case designTheme = "design_theme"
        case currentMode = "current_mode"
    }
}

struct User: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let nexusID: String
    let telegramID: String?
    let status: String
    let isOfficial: Bool
    let legalDocumentsCurrent: Bool
    let vpnEnabled: Bool
    let profile: UserProfile?

    enum CodingKeys: String, CodingKey {
        case id
        case nexusID = "nexus_id"
        case telegramID = "telegram_id"
        case status
        case isOfficial = "is_official"
        case legalDocumentsCurrent = "legal_documents_current"
        case vpnEnabled = "vpn_enabled"
        case profile
    }
}

struct TokenPairResponse: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: User

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case user
    }
}

struct APIStatusResponse: Decodable, Sendable {
    let status: String
}

struct LoginRequest: Encodable, Sendable {
    let identifier: String
    let password: String
    let deviceID: String

    enum CodingKeys: String, CodingKey {
        case identifier
        case password
        case deviceID = "device_id"
    }
}

struct RefreshRequest: Encodable, Sendable {
    let refreshToken: String

    enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
    }
}

struct LogoutRequest: Encodable, Sendable {
    let refreshToken: String

    enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
    }
}

struct EmailVerificationStartRequest: Encodable, Sendable {
    let email: String
    let deviceID: String
    let language: String

    enum CodingKeys: String, CodingKey {
        case email
        case deviceID = "device_id"
        case language
    }
}

struct EmailVerificationStartResponse: Decodable, Sendable {
    let verificationID: UUID
    let expiresInSeconds: Int

    enum CodingKeys: String, CodingKey {
        case verificationID = "verification_id"
        case expiresInSeconds = "expires_in_seconds"
    }
}

struct EmailVerificationConfirmRequest: Encodable, Sendable {
    let verificationID: UUID
    let code: String

    enum CodingKeys: String, CodingKey {
        case verificationID = "verification_id"
        case code
    }
}

struct RegistrationRequest: Encodable, Sendable {
    let emailVerificationID: UUID
    let username: String
    let password: String
    let deviceID: String
    let language: String
    let registrationCountry: String
    let designTheme: String
    let displayName: String
    let avatarType: String
    let avatarRef: String
    let acceptedTerms: Bool
    let acceptedPrivacyPolicy: Bool

    enum CodingKeys: String, CodingKey {
        case emailVerificationID = "email_verification_id"
        case username
        case password
        case deviceID = "device_id"
        case language
        case registrationCountry = "registration_country"
        case designTheme = "design_theme"
        case displayName = "display_name"
        case avatarType = "avatar_type"
        case avatarRef = "avatar_ref"
        case acceptedTerms = "accepted_terms"
        case acceptedPrivacyPolicy = "accepted_privacy_policy"
    }
}
