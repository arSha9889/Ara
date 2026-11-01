import SwiftUI

enum WorkspaceRealtimeResyncScope: Equatable {
    case none
    case chats
    case chatsAndAffectedMessages
}

@MainActor
final class WorkspaceRealtimeCoordinator: ObservableObject {
    @Published private(set) var connectionState: RealtimeConnectionState = .disconnected
    @Published private(set) var typingChatIDs = Set<UUID>()

    private let realtimeClient: any RealtimeClientProviding
    private let workspace: WorkspaceViewModel
    private let currentUserID: UUID
    private var activeAccessToken: String?
    private var updateTask: Task<Void, Never>?
    private var resyncTask: Task<Void, Never>?
    private var typingResetTasks = [UUID: Task<Void, Never>]()
    private var subscribedChatIDs = Set<UUID>()

    init(
        realtimeClient: any RealtimeClientProviding,
        workspace: WorkspaceViewModel,
        currentUserID: UUID
    ) {
        self.realtimeClient = realtimeClient
        self.workspace = workspace
        self.currentUserID = currentUserID
    }

    deinit {
        updateTask?.cancel()
        resyncTask?.cancel()
        typingResetTasks.values.forEach { $0.cancel() }
    }

    func start(accessToken: String) async {
        guard !accessToken.isEmpty else {
            await stop()
            return
        }
        guard activeAccessToken != accessToken else { return }

        if activeAccessToken != nil {
            await stop()
        }
        activeAccessToken = accessToken
        observeUpdates()
        await realtimeClient.connect(accessToken: accessToken)
    }

    func stop() async {
        activeAccessToken = nil
        updateTask?.cancel()
        updateTask = nil
        resyncTask?.cancel()
        resyncTask = nil
        typingResetTasks.values.forEach { $0.cancel() }
        typingResetTasks.removeAll()
        typingChatIDs.removeAll()
        subscribedChatIDs.removeAll()
        connectionState = .disconnected
        await realtimeClient.disconnect()
    }

    func updateSubscriptions(for chats: [Chat]) async {
        let desiredChatIDs = Set(chats.filter(\.isRealtimeSubscriptionEligible).map(\.id))
        let removedChatIDs = subscribedChatIDs.subtracting(desiredChatIDs)
        let addedChatIDs = desiredChatIDs.subtracting(subscribedChatIDs)

        for chatID in removedChatIDs {
            await realtimeClient.unsubscribe(from: chatID)
        }
        for chatID in addedChatIDs {
            await realtimeClient.subscribe(to: chatID)
        }
        subscribedChatIDs = desiredChatIDs
    }

    static func resyncScope(for event: String) -> WorkspaceRealtimeResyncScope {
        switch event {
        case "presence.status":
            .chats
        case "message.created", "message.updated", "message.deleted", "message.read", "message.reactions_updated", "message.reaction_updated", "message.pin_updated":
            .chatsAndAffectedMessages
        case "branch_comment.created", "branch_comment.updated", "branch_comment.deleted":
            .chatsAndAffectedMessages
        case _ where event.hasPrefix("group.") || event.hasPrefix("branch."):
            .chatsAndAffectedMessages
        default:
            .none
        }
    }

    private func observeUpdates() {
        let updates = realtimeClient.updates
        updateTask = Task { [weak self] in
            for await update in updates {
                guard !Task.isCancelled else { return }
                await self?.handle(update)
            }
        }
    }

    private func handle(_ update: RealtimeUpdate) async {
        switch update {
        case let .connectionState(state):
            connectionState = state
            guard state == .connected else { return }
            await updateSubscriptions(for: workspace.chats)
            scheduleResync(scope: .chats, affectedChatID: nil)
        case let .event(event):
            if event.event == "typing.started" {
                setTyping(true, for: event)
                return
            }
            if event.event == "typing.stopped" {
                setTyping(false, for: event)
                return
            }

            scheduleResync(scope: Self.resyncScope(for: event.event), affectedChatID: event.chatID)
        }
    }

    private func setTyping(_ isTyping: Bool, for event: RealtimeEvent) {
        guard let chatID = event.chatID, event.userID != currentUserID else { return }

        typingResetTasks[chatID]?.cancel()
        typingResetTasks[chatID] = nil

        if isTyping {
            typingChatIDs.insert(chatID)
            typingResetTasks[chatID] = Task { [weak self] in
                do {
                    try await Task.sleep(for: .seconds(5))
                } catch {
                    return
                }
                guard !Task.isCancelled else { return }
                await self?.clearTyping(for: chatID)
            }
        } else {
            typingChatIDs.remove(chatID)
        }
    }

    private func clearTyping(for chatID: UUID) {
        typingResetTasks[chatID] = nil
        typingChatIDs.remove(chatID)
    }

    private func scheduleResync(scope: WorkspaceRealtimeResyncScope, affectedChatID: UUID?) {
        guard scope != .none, activeAccessToken != nil else { return }

        resyncTask?.cancel()
        resyncTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(250))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            await self?.resync(scope: scope, affectedChatID: affectedChatID)
        }
    }

    private func resync(scope: WorkspaceRealtimeResyncScope, affectedChatID: UUID?) async {
        guard let accessToken = activeAccessToken else { return }

        await workspace.loadChats(accessToken: accessToken)
        await updateSubscriptions(for: workspace.chats)

        guard scope == .chatsAndAffectedMessages,
              let affectedChatID,
              workspace.selectedChatID == affectedChatID
        else {
            return
        }
        await workspace.loadMessages(for: affectedChatID, accessToken: accessToken)
    }
}

extension Chat {
    var isRealtimeSubscriptionEligible: Bool {
        type == "direct" || type == "group" || (type == "branch" && isSubscribed)
    }
}
