import SwiftUI

final class AppStore: ObservableObject {
    @Published var selectedTab: AppTab = .home
    @Published var palette: AppPalette
    @Published var conversations: [Conversation] = Conversation.samples
    @Published var channels: [Channel] = Channel.samples

    init() {
        let savedValue = UserDefaults.standard.string(forKey: "arachat.appearance.palette")
        palette = AppPalette(rawValue: savedValue ?? "") ?? .comet
    }

    func selectPalette(_ palette: AppPalette) {
        self.palette = palette
        UserDefaults.standard.set(palette.rawValue, forKey: "arachat.appearance.palette")
    }

    func conversation(id: UUID) -> Conversation? {
        conversations.first { $0.id == id }
    }

    func send(_ text: String, to conversationID: UUID) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = conversations.firstIndex(where: { $0.id == conversationID }) else {
            return
        }

        conversations[index].messages.append(
            ChatMessage(
                direction: .outgoing,
                text: trimmed,
                timestamp: "сейчас",
                delivery: .pending
            )
        )
        conversations[index].preview = trimmed
        conversations[index].time = "сейчас"
    }
}
