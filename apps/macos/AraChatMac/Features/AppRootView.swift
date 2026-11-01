import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var preferences: PreferencesStore
    @EnvironmentObject private var sessionStore: SessionStore

    var body: some View {
        Group {
            switch sessionStore.state {
            case .restoring:
                ProgressView("app.loading")
                    .controlSize(.large)
            case .signedOut:
                AuthenticationRootView()
            case let .authenticated(user):
                WorkspaceRootView(user: user)
            }
        }
        .frame(minWidth: 960, minHeight: 680)
        .preferredColorScheme(preferences.theme.colorScheme)
        .environment(\.locale, Locale(identifier: preferences.language.rawValue))
    }
}
