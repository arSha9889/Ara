import XCTest
@testable import AraChat

@MainActor
final class WorkspaceRealtimeCoordinatorTests: XCTestCase {
    func testStartSubscribesOnlyToEligibleChatsAndStopDisconnects() async throws {
        let direct = makeChat(type: "direct")
        let group = makeChat(type: "group")
        let subscribedBranch = makeChat(type: "branch", isSubscribed: true)
        let unsubscribedBranch = makeChat(type: "branch", isSubscribed: false)
        let workspace = WorkspaceViewModel(
            chatService: ChatServiceStub(chats: [direct, group, subscribedBranch, unsubscribedBranch])
        )
        let realtime = RealtimeClientStub()
        let coordinator = WorkspaceRealtimeCoordinator(
            realtimeClient: realtime,
            workspace: workspace,
            currentUserID: UUID()
        )

        await workspace.loadChats(accessToken: "access-token")
        await coordinator.start(accessToken: "access-token")
        await coordinator.updateSubscriptions(for: workspace.chats)

        let state = await realtime.state()
        XCTAssertEqual(state.connectedTokens, ["access-token"])
        XCTAssertEqual(state.subscribedChatIDs, Set([direct.id, group.id, subscribedBranch.id]))
        XCTAssertFalse(state.subscribedChatIDs.contains(unsubscribedBranch.id))

        await coordinator.stop()
        let stoppedState = await realtime.state()
        XCTAssertEqual(stoppedState.disconnectCount, 1)
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
}

private actor ChatServiceStub: ChatServicing {
    let chats: [Chat]

    init(chats: [Chat]) {
        self.chats = chats
    }

    func listChats(accessToken _: String) async throws -> [Chat] {
        chats
    }

    func messages(for _: UUID, accessToken _: String) async throws -> [Message] {
        []
    }

    func send(_: MessageCreateRequest, to _: UUID, accessToken _: String) async throws -> Message {
        throw StubError.unsupportedOperation
    }
}

private actor RealtimeClientStub: RealtimeClientProviding {
    struct State: Sendable {
        let connectedTokens: [String]
        let subscribedChatIDs: Set<UUID>
        let disconnectCount: Int
    }

    nonisolated let updates: AsyncStream<RealtimeUpdate>
    private let continuation: AsyncStream<RealtimeUpdate>.Continuation
    private var connectedTokens = [String]()
    private var subscribedChatIDs = Set<UUID>()
    private var disconnectCount = 0

    init() {
        let stream = AsyncStream<RealtimeUpdate>.makeStream()
        updates = stream.stream
        continuation = stream.continuation
    }

    func connect(accessToken: String) async {
        connectedTokens.append(accessToken)
    }

    func disconnect() async {
        disconnectCount += 1
    }

    func subscribe(to chatID: UUID) async {
        subscribedChatIDs.insert(chatID)
    }

    func unsubscribe(from chatID: UUID) async {
        subscribedChatIDs.remove(chatID)
    }

    func state() -> State {
        State(
            connectedTokens: connectedTokens,
            subscribedChatIDs: subscribedChatIDs,
            disconnectCount: disconnectCount
        )
    }
}

private enum StubError: Error {
    case unsupportedOperation
}
