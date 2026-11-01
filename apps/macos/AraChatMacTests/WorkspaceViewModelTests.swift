import XCTest
@testable import AraChat

@MainActor
final class WorkspaceViewModelTests: XCTestCase {
    func testLoadChatsKeepsOnlySupportedWorkspaceTypes() async {
        let direct = makeChat(type: "direct")
        let group = makeChat(type: "group")
        let unsupported = makeChat(type: "saved")
        let viewModel = WorkspaceViewModel(chatService: ChatServiceStub(chats: [direct, group, unsupported]))

        await viewModel.loadChats(accessToken: "access-token")

        XCTAssertEqual(viewModel.chats.map(\.id), [direct.id, group.id])
        XCTAssertEqual(viewModel.chatsState, .loaded)
    }

    func testLoadMessagesOrdersHistoryChronologically() async {
        let chat = makeChat(type: "direct")
        let laterMessage = makeMessage(chatID: chat.id, createdAt: "2026-10-31T12:01:00Z")
        let earlierMessage = makeMessage(chatID: chat.id, createdAt: "2026-10-31T12:00:00Z")
        let viewModel = WorkspaceViewModel(
            chatService: ChatServiceStub(chats: [chat], messages: [chat.id: [laterMessage, earlierMessage]])
        )

        await viewModel.loadMessages(for: chat.id, accessToken: "access-token")

        XCTAssertEqual(viewModel.messages(for: chat.id).map(\.id), [earlierMessage.id, laterMessage.id])
        XCTAssertEqual(viewModel.messageState(for: chat.id), .loaded)
    }

    func testNetworkErrorUsesOfflineState() async {
        let viewModel = WorkspaceViewModel(chatService: OfflineChatServiceStub())

        await viewModel.loadChats(accessToken: "access-token")

        guard case .offline = viewModel.chatsState else {
            return XCTFail("Network failures must be exposed as the offline state.")
        }
    }

    func testRealtimeSubscriptionFilterKeepsSubscribedBranchesOnly() async {
        let direct = makeChat(type: "direct")
        let group = makeChat(type: "group")
        let subscribedBranch = makeChat(type: "branch", isSubscribed: true)
        let unsubscribedBranch = makeChat(type: "branch", isSubscribed: false)
        let viewModel = WorkspaceViewModel(
            chatService: ChatServiceStub(chats: [direct, group, subscribedBranch, unsubscribedBranch])
        )

        await viewModel.loadChats(accessToken: "access-token")

        let eligibleChatIDs = viewModel.chats.filter(\.isRealtimeSubscriptionEligible).map(\.id)
        XCTAssertEqual(Set(eligibleChatIDs), [direct.id, group.id, subscribedBranch.id])
    }

    func testRealtimeEventsChooseAppropriateResyncScope() {
        XCTAssertEqual(
            WorkspaceRealtimeCoordinator.resyncScope(for: "message.read"),
            .chatsAndAffectedMessages
        )
        XCTAssertEqual(
            WorkspaceRealtimeCoordinator.resyncScope(for: "presence.status"),
            .chats
        )
        XCTAssertEqual(
            WorkspaceRealtimeCoordinator.resyncScope(for: "typing.started"),
            .none
        )
    }

    private func makeChat(type: String, isSubscribed: Bool = true) -> Chat {
        Chat(
            id: UUID(),
            type: type,
            createdAt: "2026-10-31T12:00:00Z",
            updatedAt: "2026-10-31T12:00:00Z",
            lastMessageID: nil,
            pinnedMessageID: nil,
            participantIDs: [],
            peer: nil,
            lastMessage: nil,
            pinnedMessage: nil,
            unreadCount: 0,
            title: "Test chat",
            slug: nil,
            description: nil,
            avatarRef: nil,
            isOfficial: false,
            isPrivate: false,
            isSubscribed: isSubscribed,
            subscriberCount: 0,
            canPost: false,
            currentRole: nil,
            notificationsEnabled: true,
            wallpaperID: "default"
        )
    }

    private func makeMessage(chatID: UUID, createdAt: String) -> Message {
        Message(
            id: UUID(),
            chatID: chatID,
            senderID: UUID(),
            author: nil,
            type: "text",
            payload: "Message",
            mediaURL: nil,
            mediaName: nil,
            mediaMIMEType: nil,
            mediaSizeBytes: nil,
            durationSeconds: nil,
            encryptionState: "plain_web_core",
            deliveryStatus: "sent",
            commentCount: 0,
            commentsEnabled: true,
            createdAt: createdAt,
            editedAt: nil,
            deletedAt: nil,
            isPinned: false
        )
    }
}

private actor ChatServiceStub: ChatServicing {
    let chats: [Chat]
    let messagesByChatID: [UUID: [Message]]

    init(chats: [Chat], messages: [UUID: [Message]] = [:]) {
        self.chats = chats
        messagesByChatID = messages
    }

    func listChats(accessToken _: String) async throws -> [Chat] {
        chats
    }

    func messages(for chatID: UUID, accessToken _: String) async throws -> [Message] {
        messagesByChatID[chatID] ?? []
    }

    func send(_: MessageCreateRequest, to _: UUID, accessToken _: String) async throws -> Message {
        throw StubError.unsupportedOperation
    }
}

private enum StubError: Error {
    case unsupportedOperation
}

private actor OfflineChatServiceStub: ChatServicing {
    func listChats(accessToken _: String) async throws -> [Chat] {
        throw APIError.network("No connection")
    }

    func messages(for _: UUID, accessToken _: String) async throws -> [Message] {
        throw APIError.network("No connection")
    }

    func send(_: MessageCreateRequest, to _: UUID, accessToken _: String) async throws -> Message {
        throw APIError.network("No connection")
    }
}
