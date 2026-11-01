import SwiftUI

@main
@MainActor
struct AraChatMacApp: App {
    @StateObject private var preferences = PreferencesStore()
    @StateObject private var sessionStore = SessionStore.live()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(preferences)
                .environmentObject(sessionStore)
                .task {
                    await sessionStore.restore()
                }
        }
        .defaultSize(width: 1_100, height: 760)
        .windowResizability(.contentMinSize)
    }
}
