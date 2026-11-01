import SwiftUI

enum WorkspaceLoadState: Equatable {
    case idle
    case loading
    case loaded
    case offline(String)
    case failed(String)
}

enum ChatCategory: String, CaseIterable, Identifiable {
    case direct
    case groups
    case channels

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .direct:
            "workspace.categoryDirect"
        case .groups:
            "workspace.categoryGroups"
        case .channels:
            "workspace.categoryChannels"
        }
    }

    init?(chat: Chat) {
        switch chat.type {
        case "direct":
            self = .direct
        case "group":
            self = .groups
        case "branch":
            self = .channels
        default:
            return nil
        }
    }
}

@MainActor
final class WorkspaceViewModel: ObservableObject {
    @Published private(set) var chats: [Chat] = []
    @Published private(set) var chatsState: WorkspaceLoadState = .idle
    @Published var selectedChatID: UUID?
    @Published private(set) var messageStates: [UUID: WorkspaceLoadState] = [:]

    private let chatService: any ChatServicing
    private var messagesByChatID: [UUID: [Message]] = [:]
    private var chatsRequestID = 0
    private var messageRequestIDs: [UUID: Int] = [:]

    init(chatService: any ChatServicing) {
        self.chatService = chatService
    }

    var selectedChat: Chat? {
        chats.first(where: { $0.id == selectedChatID })
    }

    func messages(for chatID: UUID) -> [Message] {
        messagesByChatID[chatID] ?? []
    }

    func messageState(for chatID: UUID) -> WorkspaceLoadState {
        messageStates[chatID] ?? .idle
    }

    func loadChats(accessToken: String) async {
        chatsRequestID += 1
        let requestID = chatsRequestID
        chatsState = .loading

        do {
            let result = try await chatService.listChats(accessToken: accessToken)
            guard !Task.isCancelled, requestID == chatsRequestID else { return }

            chats = result.filter { ChatCategory(chat: $0) != nil }
            if let selectedChatID, !chats.contains(where: { $0.id == selectedChatID }) {
                self.selectedChatID = nil
            }
            chatsState = .loaded
        } catch {
            guard !Task.isCancelled, requestID == chatsRequestID else { return }
            chatsState = Self.errorState(for: error)
        }
    }

    func loadMessages(for chatID: UUID, accessToken: String) async {
        let requestID = (messageRequestIDs[chatID] ?? 0) + 1
        messageRequestIDs[chatID] = requestID
        messageStates[chatID] = .loading

        do {
            let result = try await chatService.messages(for: chatID, accessToken: accessToken)
            guard !Task.isCancelled, messageRequestIDs[chatID] == requestID else { return }

            messagesByChatID[chatID] = result.sorted { $0.createdAt < $1.createdAt }
            messageStates[chatID] = .loaded
        } catch {
            guard !Task.isCancelled, messageRequestIDs[chatID] == requestID else { return }
            messageStates[chatID] = Self.errorState(for: error)
        }
    }

    private static func errorState(for error: Error) -> WorkspaceLoadState {
        if let apiError = error as? APIError, case .network = apiError {
            return .offline(error.localizedDescription)
        }
        return .failed(error.localizedDescription)
    }
}
