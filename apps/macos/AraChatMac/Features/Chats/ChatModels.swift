import Foundation

struct ChatPeer: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let displayName: String
    let username: String
    let avatarType: String
    let avatarRef: String
    let isOnline: Bool
    let lastSeenAt: String?
    let activePlatforms: [String]
    let isOfficial: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case username
        case avatarType = "avatar_type"
        case avatarRef = "avatar_ref"
        case isOnline = "is_online"
        case lastSeenAt = "last_seen_at"
        case activePlatforms = "active_platforms"
        case isOfficial = "is_official"
    }
}

struct ChatPreviewMessage: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let senderID: UUID
    let type: String
    let payload: String
    let mediaName: String?
    let encryptionState: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case senderID = "sender_id"
        case type
        case payload
        case mediaName = "media_name"
        case encryptionState = "encryption_state"
        case createdAt = "created_at"
    }
}

struct Chat: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let type: String
    let createdAt: String
    let updatedAt: String
    let lastMessageID: UUID?
    let pinnedMessageID: UUID?
    let participantIDs: [UUID]
    let peer: ChatPeer?
    let lastMessage: ChatPreviewMessage?
    let pinnedMessage: ChatPreviewMessage?
    let unreadCount: Int
    let title: String?
    let slug: String?
    let description: String?
    let avatarRef: String?
    let isOfficial: Bool
    let isPrivate: Bool
    let isSubscribed: Bool
    let subscriberCount: Int
    let canPost: Bool
    let currentRole: String?
    let notificationsEnabled: Bool
    let wallpaperID: String

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case lastMessageID = "last_message_id"
        case pinnedMessageID = "pinned_message_id"
        case participantIDs = "participant_ids"
        case peer
        case lastMessage = "last_message"
        case pinnedMessage = "pinned_message"
        case unreadCount = "unread_count"
        case title
        case slug
        case description
        case avatarRef = "avatar_ref"
        case isOfficial = "is_official"
        case isPrivate = "is_private"
        case isSubscribed = "is_subscribed"
        case subscriberCount = "subscriber_count"
        case canPost = "can_post"
        case currentRole = "current_role"
        case notificationsEnabled = "notifications_enabled"
        case wallpaperID = "wallpaper_id"
    }

    var displayName: String {
        peer?.displayName ?? title ?? String(localized: "workspace.unknownChat")
    }
}

struct MessageAuthor: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let displayName: String
    let username: String
    let avatarType: String
    let avatarRef: String
    let isOfficial: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case username
        case avatarType = "avatar_type"
        case avatarRef = "avatar_ref"
        case isOfficial = "is_official"
    }
}

struct Message: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let chatID: UUID
    let senderID: UUID
    let author: MessageAuthor?
    let type: String
    let payload: String
    let mediaURL: String?
    let mediaName: String?
    let mediaMIMEType: String?
    let mediaSizeBytes: Int?
    let durationSeconds: Int?
    let encryptionState: String
    let deliveryStatus: String
    let commentCount: Int
    let commentsEnabled: Bool
    let createdAt: String
    let editedAt: String?
    let deletedAt: String?
    let isPinned: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case chatID = "chat_id"
        case senderID = "sender_id"
        case author
        case type
        case payload
        case mediaURL = "media_url"
        case mediaName = "media_name"
        case mediaMIMEType = "media_mime_type"
        case mediaSizeBytes = "media_size_bytes"
        case durationSeconds = "duration_seconds"
        case encryptionState = "encryption_state"
        case deliveryStatus = "delivery_status"
        case commentCount = "comment_count"
        case commentsEnabled = "comments_enabled"
        case createdAt = "created_at"
        case editedAt = "edited_at"
        case deletedAt = "deleted_at"
        case isPinned = "is_pinned"
    }
}

struct MessageCreateRequest: Encodable, Sendable {
    let text: String
    let type: String
    let replyToMessageID: UUID?
    let mediaURL: String?
    let mediaName: String?
    let mediaMIMEType: String?
    let mediaSizeBytes: Int?
    let durationSeconds: Int?
    let encryptionState: String

    init(
        text: String,
        type: String = "text",
        replyToMessageID: UUID? = nil,
        mediaURL: String? = nil,
        mediaName: String? = nil,
        mediaMIMEType: String? = nil,
        mediaSizeBytes: Int? = nil,
        durationSeconds: Int? = nil,
        encryptionState: String = "plain_web_core"
    ) {
        self.text = text
        self.type = type
        self.replyToMessageID = replyToMessageID
        self.mediaURL = mediaURL
        self.mediaName = mediaName
        self.mediaMIMEType = mediaMIMEType
        self.mediaSizeBytes = mediaSizeBytes
        self.durationSeconds = durationSeconds
        self.encryptionState = encryptionState
    }

    enum CodingKeys: String, CodingKey {
        case text
        case type
        case replyToMessageID = "reply_to_message_id"
        case mediaURL = "media_url"
        case mediaName = "media_name"
        case mediaMIMEType = "media_mime_type"
        case mediaSizeBytes = "media_size_bytes"
        case durationSeconds = "duration_seconds"
        case encryptionState = "encryption_state"
    }
}
