import SwiftUI

struct WorkspaceRootView: View {
    let user: User

    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var workspace: WorkspaceViewModel
    @StateObject private var realtime: WorkspaceRealtimeCoordinator
    @State private var category: ChatCategory = .direct
    @State private var searchQuery = ""
    @State private var isLoggingOut = false
    @State private var e2eeProtectionState: E2EEProtectionState = .inactive
    @State private var e2eeChatContext: E2EEChatContext?
    @State private var e2eeContextChatID: UUID?
    @State private var e2eeMessageDisplays: [UUID: E2EEMessageDisplay] = [:]
    private let e2eeKeyService: E2EEKeyService

    init(user: User) {
        self.user = user
        let workspace = WorkspaceViewModel(chatService: ChatService.live())
        _workspace = StateObject(wrappedValue: workspace)
        e2eeKeyService = E2EEKeyService.live()
        _realtime = StateObject(
            wrappedValue: WorkspaceRealtimeCoordinator(
                realtimeClient: RealtimeClient.live(),
                workspace: workspace,
                currentUserID: user.id
            )
        )
    }

    var body: some View {
        NavigationSplitView {
            chatSidebar
        } detail: {
            WorkspaceConversationView(
                chat: workspace.selectedChat,
                currentUserID: user.id,
                messages: selectedMessages,
                state: selectedMessageState,
                isPeerTyping: workspace.selectedChatID.map(realtime.typingChatIDs.contains) ?? false,
                e2eeProtectionState: e2eeProtectionState,
                e2eeMessageDisplays: e2eeMessageDisplays,
                retry: reloadSelectedMessages
            )
        }
        .navigationSplitViewStyle(.balanced)
        .task(id: sessionStore.accessToken) {
            guard let accessToken = sessionStore.accessToken else {
                await realtime.stop()
                return
            }
            await realtime.start(accessToken: accessToken)
            await workspace.loadChats(accessToken: accessToken)
            await realtime.updateSubscriptions(for: workspace.chats)
        }
        .task(id: workspace.selectedChatID) {
            await loadSelectedMessages()
        }
        .task(id: E2EEPreparationTaskID(chatID: workspace.selectedChatID, accessToken: sessionStore.accessToken)) {
            await prepareSelectedDirectChatEncryption()
        }
        .onChange(of: selectedMessages) { _ in
            Task {
                await decryptSelectedDirectChatMessages()
            }
        }
        .onChange(of: workspace.chats) { chats in
            Task {
                await realtime.updateSubscriptions(for: chats)
            }
        }
        .onDisappear {
            Task {
                await realtime.stop()
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button("workspace.refreshChats", systemImage: "arrow.clockwise") {
                    refreshChats()
                }
                .disabled(sessionStore.accessToken == nil || workspace.chatsState == .loading)
            }
            ToolbarItem(placement: .automatic) {
                Button("workspace.signOut", systemImage: "rectangle.portrait.and.arrow.right") {
                    signOut()
                }
                .disabled(isLoggingOut)
            }
        }
    }

    private var chatSidebar: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("workspace.chatsTitle")
                    .font(.title2.weight(.bold))
                Text(displayName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                WorkspaceRealtimeStatusView(state: realtime.connectionState)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("workspace.searchChats", text: $searchQuery)
                    .textFieldStyle(.plain)
                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("workspace.clearSearch"))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            Picker("workspace.chatCategory", selection: $category) {
                ForEach(ChatCategory.allCases) { item in
                    Text(item.title)
                        .tag(item)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            if let error = workspaceError(for: workspace.chatsState, defaultTitle: "workspace.chatsLoadError") {
                WorkspaceErrorNotice(
                    title: error.title,
                    message: error.message,
                    retry: refreshChats
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            List(selection: $workspace.selectedChatID) {
                if workspace.chats.isEmpty, workspace.chatsState == .loading {
                    Section {
                        HStack {
                            ProgressView()
                            Text("workspace.loadingChats")
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 28)
                    }
                } else if visibleChats.isEmpty, workspace.chatsState != .loading {
                    Section {
                        WorkspaceEmptyChatsView(isSearching: !normalizedSearchQuery.isEmpty)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 28)
                    }
                } else {
                    Section {
                        ForEach(visibleChats) { chat in
                            WorkspaceChatRow(chat: chat)
                                .tag(chat.id)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .overlay(alignment: .topTrailing) {
                if workspace.chatsState == .loading, !workspace.chats.isEmpty {
                    ProgressView()
                        .controlSize(.small)
                        .padding(12)
                }
            }
        }
    }

    private var displayName: String {
        user.profile?.displayName ?? user.nexusID
    }

    private var normalizedSearchQuery: String {
        searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var visibleChats: [Chat] {
        workspace.chats.filter { chat in
            guard ChatCategory(chat: chat) == category else { return false }

            guard !normalizedSearchQuery.isEmpty else { return true }
            let preview = chat.lastMessage?.encryptionState == "e2ee_web_v1" ? "" : chat.lastMessage?.payload ?? ""
            let searchableText = [
                chat.displayName,
                chat.peer?.username ?? "",
                chat.description ?? "",
                preview,
            ].joined(separator: " ")
            return searchableText.localizedCaseInsensitiveContains(normalizedSearchQuery)
        }
    }

    private var selectedMessages: [Message] {
        guard let chatID = workspace.selectedChatID else { return [] }
        return workspace.messages(for: chatID)
    }

    private var selectedMessageState: WorkspaceLoadState {
        guard let chatID = workspace.selectedChatID else { return .idle }
        return workspace.messageState(for: chatID)
    }

    private func refreshChats() {
        guard let accessToken = sessionStore.accessToken else { return }
        Task {
            await workspace.loadChats(accessToken: accessToken)
        }
    }

    private func reloadSelectedMessages() {
        Task {
            await loadSelectedMessages()
        }
    }

    private func loadSelectedMessages() async {
        guard let chatID = workspace.selectedChatID,
              let accessToken = sessionStore.accessToken
        else {
            return
        }

        await workspace.loadMessages(for: chatID, accessToken: accessToken)
    }

    private func prepareSelectedDirectChatEncryption() async {
        guard let chat = workspace.selectedChat,
              chat.type == "direct",
               let accessToken = sessionStore.accessToken
        else {
            e2eeProtectionState = .inactive
            e2eeChatContext = nil
            e2eeContextChatID = nil
            e2eeMessageDisplays = [:]
            return
        }

        e2eeProtectionState = .checking
        e2eeChatContext = nil
        e2eeContextChatID = nil
        e2eeMessageDisplays = [:]
        do {
            let context = try await e2eeKeyService.prepareDirectChat(
                chat,
                currentUserID: user.id,
                accessToken: accessToken
            )
            guard !Task.isCancelled, workspace.selectedChatID == chat.id else { return }
            e2eeChatContext = context
            e2eeContextChatID = chat.id
            e2eeProtectionState = context.readiness == .ready ? .ready : .waitingForProtectedDevice
            await decryptSelectedDirectChatMessages()
        } catch {
            guard !Task.isCancelled, workspace.selectedChatID == chat.id else { return }
            e2eeProtectionState = .unavailable
        }
    }

    private func decryptSelectedDirectChatMessages() async {
        guard let chat = workspace.selectedChat,
              chat.type == "direct",
              let context = e2eeChatContext,
              e2eeContextChatID == chat.id
        else {
            return
        }

        let encryptedMessages = workspace.messages(for: chat.id).filter {
            $0.encryptionState == "e2ee_web_v1" && $0.deletedAt == nil
        }
        var displays = Dictionary(
            uniqueKeysWithValues: encryptedMessages.map { ($0.id, E2EEMessageDisplay.unavailable) }
        )
        let crypto = E2EEMessageCrypto()

        for message in encryptedMessages where message.type == "text" {
            guard !Task.isCancelled, workspace.selectedChatID == chat.id else { return }
            do {
                let result = try crypto.decrypt(
                    payload: message.payload,
                    chatID: chat.id,
                    senderID: message.senderID,
                    currentUserID: user.id,
                    deviceID: context.deviceID,
                    identity: context.identity,
                    deviceKeys: context.deviceKeys
                )
                displays[message.id] = E2EEMessageDisplay(result: result)
            } catch {
                displays[message.id] = .unavailable
            }
        }

        guard !Task.isCancelled, workspace.selectedChatID == chat.id else { return }
        e2eeMessageDisplays = displays
    }

    private func signOut() {
        guard !isLoggingOut else { return }
        isLoggingOut = true
        Task {
            await sessionStore.logout()
            isLoggingOut = false
        }
    }
}

private struct E2EEPreparationTaskID: Hashable {
    let chatID: UUID?
    let accessToken: String?
}

private struct WorkspaceChatRow: View {
    let chat: Chat

    var body: some View {
        HStack(spacing: 10) {
            WorkspaceAvatar(name: chat.displayName)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(chat.displayName)
                        .fontWeight(chat.unreadCount > 0 ? .semibold : .regular)
                        .lineLimit(1)
                    if chat.peer?.isOnline == true {
                        Circle()
                            .fill(.green)
                            .frame(width: 7, height: 7)
                            .accessibilityLabel(Text("workspace.online"))
                    }
                }

                Text(preview)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            VStack(alignment: .trailing, spacing: 5) {
                if let date = chat.lastActivityDate {
                    Text(date, format: .dateTime.hour().minute())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if chat.unreadCount > 0 {
                    Text(chat.unreadCount, format: .number)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.tint, in: Capsule())
                        .accessibilityLabel(Text("workspace.unreadMessages"))
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        guard let message = chat.lastMessage else {
            return String(localized: "workspace.noMessagesPreview")
        }

        if message.encryptionState == "e2ee_web_v1" {
            return String(localized: "workspace.encryptedMessage")
        }
        if let mediaName = message.mediaName, !mediaName.isEmpty {
            return mediaName
        }
        return message.payload.isEmpty ? String(localized: "workspace.mediaMessage") : message.payload
    }
}

private struct WorkspaceConversationView: View {
    let chat: Chat?
    let currentUserID: UUID
    let messages: [Message]
    let state: WorkspaceLoadState
    let isPeerTyping: Bool
    let e2eeProtectionState: E2EEProtectionState
    let e2eeMessageDisplays: [UUID: E2EEMessageDisplay]
    let retry: () -> Void

    var body: some View {
        Group {
            if let chat {
                VStack(spacing: 0) {
                    WorkspaceConversationHeader(
                        chat: chat,
                        isPeerTyping: isPeerTyping,
                        e2eeProtectionState: e2eeProtectionState,
                        reload: retry
                    )
                    Divider()
                    messageContent(for: chat)
                    Divider()
                    WorkspaceComposerNotice(chat: chat)
                }
            } else {
                WorkspaceConversationPlaceholder(
                    image: "bubble.left.and.bubble.right",
                    title: "workspace.selectChatTitle",
                    detail: "workspace.selectChatDetail"
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func messageContent(for chat: Chat) -> some View {
        if let error = workspaceError(for: state, defaultTitle: "workspace.messagesLoadError") {
            VStack(spacing: 12) {
                WorkspaceErrorNotice(
                    title: error.title,
                    message: error.message,
                    retry: retry
                )
                if !messages.isEmpty {
                    messagesList(for: chat)
                }
            }
            .padding(16)
        } else if messages.isEmpty, state == .loading {
            VStack(spacing: 10) {
                ProgressView()
                Text("workspace.loadingMessages")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if messages.isEmpty {
            WorkspaceConversationPlaceholder(
                image: "text.bubble",
                title: "workspace.noMessagesTitle",
                detail: "workspace.noMessagesDetail"
            )
        } else {
            messagesList(for: chat)
        }
    }

    private func messagesList(for chat: Chat) -> some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(messages) { message in
                    WorkspaceMessageBubble(
                        message: message,
                        isCurrentUser: message.senderID == currentUserID,
                        e2eeDisplay: e2eeMessageDisplays[message.id]
                    )
                }
            }
            .padding(20)
        }
        .accessibilityLabel(Text("workspace.messageHistory"))
    }
}

private struct WorkspaceConversationHeader: View {
    let chat: Chat
    let isPeerTyping: Bool
    let e2eeProtectionState: E2EEProtectionState
    let reload: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            WorkspaceAvatar(name: chat.displayName, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(chat.displayName)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if chat.type == "direct", e2eeProtectionState != .inactive {
                    WorkspaceE2EEStatusView(state: e2eeProtectionState)
                }
            }
            Spacer()
            Button(action: reload) {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(Text("workspace.refreshMessages"))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var subtitle: LocalizedStringKey {
        if isPeerTyping {
            return "workspace.typing"
        }
        if chat.peer?.isOnline == true {
            return "workspace.online"
        }
        switch chat.type {
        case "group":
            return "workspace.group"
        case "branch":
            return "workspace.channel"
        default:
            return "workspace.directChat"
        }
    }
}

private struct WorkspaceE2EEStatusView: View {
    let state: E2EEProtectionState

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbolName)
                .accessibilityHidden(true)
            Text(title)
        }
        .font(.caption2)
        .foregroundStyle(color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(title))
    }

    private var title: LocalizedStringKey {
        switch state {
        case .checking:
            "workspace.encryptionChecking"
        case .ready:
            "workspace.encryptionReady"
        case .waitingForProtectedDevice:
            "workspace.encryptionWaiting"
        case .unavailable:
            "workspace.encryptionUnavailable"
        case .inactive:
            ""
        }
    }

    private var symbolName: String {
        switch state {
        case .ready:
            "lock.fill"
        case .checking:
            "lock"
        case .waitingForProtectedDevice, .unavailable, .inactive:
            "exclamationmark.shield"
        }
    }

    private var color: Color {
        switch state {
        case .ready:
            .green
        case .checking, .waitingForProtectedDevice:
            .orange
        case .unavailable, .inactive:
            .secondary
        }
    }
}

private struct WorkspaceE2EEMessageStatusView: View {
    let status: E2EEVerificationStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbolName)
                .accessibilityHidden(true)
            Text(title)
        }
        .font(.caption2)
        .foregroundStyle(color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(title))
    }

    private var title: LocalizedStringKey {
        switch status {
        case .verified:
            "workspace.messageEncryptionVerified"
        case .unverified:
            "workspace.messageEncryptionUnverified"
        case .keyChanged:
            "workspace.messageEncryptionKeyChanged"
        case .unavailable:
            "workspace.messageEncryptionUnavailable"
        }
    }

    private var symbolName: String {
        switch status {
        case .verified:
            "checkmark.shield.fill"
        case .unverified:
            "exclamationmark.shield"
        case .keyChanged:
            "key.fill"
        case .unavailable:
            "lock.slash"
        }
    }

    private var color: Color {
        switch status {
        case .verified:
            .green
        case .unverified, .keyChanged:
            .orange
        case .unavailable:
            .secondary
        }
    }
}

private struct WorkspaceRealtimeStatusView: View {
    let state: RealtimeConnectionState

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityLabel(Text(title))
    }

    private var title: LocalizedStringKey {
        switch state {
        case .connected:
            "workspace.realtimeConnected"
        case .connecting:
            "workspace.realtimeConnecting"
        case .disconnected:
            "workspace.realtimeDisconnected"
        case .rejected:
            "workspace.realtimeUnavailable"
        }
    }

    private var color: Color {
        switch state {
        case .connected:
            .green
        case .connecting:
            .orange
        case .disconnected, .rejected:
            .secondary
        }
    }
}

private struct WorkspaceMessageBubble: View {
    let message: Message
    let isCurrentUser: Bool
    let e2eeDisplay: E2EEMessageDisplay?

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isCurrentUser {
                Spacer(minLength: 48)
            }

            VStack(alignment: .leading, spacing: 5) {
                if !isCurrentUser, let author = message.author {
                    Text(author.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                Text(content)
                    .textSelection(.enabled)
                    .lineLimit(12)

                if message.encryptionState == "e2ee_web_v1", message.deletedAt == nil {
                    WorkspaceE2EEMessageStatusView(
                        status: e2eeDisplay?.verificationStatus ?? .unavailable
                    )
                }

                HStack(spacing: 4) {
                    if message.editedAt != nil {
                        Text("workspace.edited")
                    }
                    if let date = message.createdAtDate {
                        Text(date, format: .dateTime.hour().minute())
                    }
                }
                .font(.caption2)
                .foregroundStyle(isCurrentUser ? .white.opacity(0.8) : .secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(isCurrentUser ? Color.accentColor : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(isCurrentUser ? .white : .primary)

            if !isCurrentUser {
                Spacer(minLength: 48)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var content: String {
        if message.deletedAt != nil {
            return String(localized: "workspace.messageDeleted")
        }
        if message.encryptionState == "e2ee_web_v1" {
            return e2eeDisplay?.plaintext ?? String(localized: "workspace.encryptedMessage")
        }
        if let mediaName = message.mediaName, !mediaName.isEmpty {
            return mediaName
        }
        return message.payload.isEmpty ? String(localized: "workspace.mediaMessage") : message.payload
    }
}

private struct WorkspaceComposerNotice: View {
    let chat: Chat

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: chat.type == "direct" ? "lock" : "paperplane")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(chat.type == "direct" ? "workspace.directComposerUnavailable" : "workspace.composerUnavailable")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }
}

private struct WorkspaceEmptyChatsView: View {
    let isSearching: Bool

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: isSearching ? "magnifyingglass" : "bubble.left")
                .font(.title2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(isSearching ? "workspace.noSearchResultsTitle" : "workspace.noChatsTitle")
                .font(.headline)
            Text(isSearching ? "workspace.noSearchResultsDetail" : "workspace.noChatsDetail")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20)
    }
}

private struct WorkspaceConversationPlaceholder: View {
    let image: String
    let title: LocalizedStringKey
    let detail: LocalizedStringKey

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: image)
                .font(.system(size: 42, weight: .light))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(detail)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 340)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

private struct WorkspaceErrorNotice: View {
    let title: LocalizedStringKey
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            Button("workspace.retry", action: retry)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct WorkspaceError {
    let title: LocalizedStringKey
    let message: String
}

private func workspaceError(
    for state: WorkspaceLoadState,
    defaultTitle: LocalizedStringKey
) -> WorkspaceError? {
    switch state {
    case let .offline(message):
        WorkspaceError(title: "workspace.offline", message: message)
    case let .failed(message):
        WorkspaceError(title: defaultTitle, message: message)
    case .idle, .loading, .loaded:
        nil
    }
}

private struct WorkspaceAvatar: View {
    let name: String
    var size: CGFloat = 38

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color.accentColor.gradient, in: Circle())
            .accessibilityHidden(true)
    }

    private var initials: String {
        let parts = name.split(whereSeparator: \.isWhitespace)
        let value = parts.prefix(2).compactMap(\.first).map(String.init).joined()
        return value.isEmpty ? "?" : value.uppercased()
    }
}

private extension Chat {
    var lastActivityDate: Date? {
        Self.date(from: lastMessage?.createdAt ?? updatedAt)
    }

    static func date(from value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }
}

private extension Message {
    var createdAtDate: Date? {
        ISO8601DateFormatter().date(from: createdAt)
    }
}
