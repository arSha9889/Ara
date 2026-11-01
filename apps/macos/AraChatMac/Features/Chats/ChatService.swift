import Foundation

protocol ChatServicing: Sendable {
    func listChats(accessToken: String) async throws -> [Chat]
    func messages(for chatID: UUID, accessToken: String) async throws -> [Message]
    func send(_ draft: MessageCreateRequest, to chatID: UUID, accessToken: String) async throws -> Message
}

actor ChatService: ChatServicing {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    static func live() -> ChatService {
        ChatService(apiClient: APIClient(configuration: .mainBundle))
    }

    func listChats(accessToken: String) async throws -> [Chat] {
        try await apiClient.request(path: "/api/chats", accessToken: accessToken)
    }

    func messages(for chatID: UUID, accessToken: String) async throws -> [Message] {
        try await apiClient.request(
            path: "/api/chats/\(chatID.uuidString)/messages",
            accessToken: accessToken
        )
    }

    func send(_ draft: MessageCreateRequest, to chatID: UUID, accessToken: String) async throws -> Message {
        try await apiClient.request(
            path: "/api/chats/\(chatID.uuidString)/messages",
            method: .post,
            body: draft,
            accessToken: accessToken
        )
    }
}
