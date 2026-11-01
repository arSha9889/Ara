import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case russian = "ru"
    case english = "en"
    case kazakh = "kk"

    var id: String { rawValue }
}

enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var colorScheme: ColorScheme? {
        switch self {
        case .system:
            nil
        case .light:
            .light
        case .dark:
            .dark
        }
    }
}

enum ColorPalette: String, CaseIterable, Identifiable {
    case green
    case cyan
    case yellow
    case orange

    var id: String { rawValue }
}

enum InterfaceDensity: String, CaseIterable {
    case comfortable
    case compact
}

@MainActor
final class PreferencesStore: ObservableObject {
    @Published var language: AppLanguage { didSet { save() } }
    @Published var theme: AppTheme { didSet { save() } }
    @Published var colorPalette: ColorPalette { didSet { save() } }
    @Published var soundEnabled: Bool { didSet { save() } }
    @Published var hasSeenWelcome: Bool { didSet { save() } }
    @Published var density: InterfaceDensity { didSet { save() } }
    @Published var desktopNotifications: Bool { didSet { save() } }
    @Published var messagePreview: Bool { didSet { save() } }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        language = AppLanguage(rawValue: defaults.string(forKey: "preferences.language") ?? "") ?? .russian
        theme = AppTheme(rawValue: defaults.string(forKey: "preferences.theme") ?? "") ?? .system
        colorPalette = ColorPalette(rawValue: defaults.string(forKey: "preferences.colorPalette") ?? "") ?? .green
        soundEnabled = defaults.object(forKey: "preferences.soundEnabled") as? Bool ?? false
        hasSeenWelcome = defaults.object(forKey: "preferences.hasSeenWelcome") as? Bool ?? false
        density = InterfaceDensity(rawValue: defaults.string(forKey: "preferences.density") ?? "") ?? .comfortable
        desktopNotifications = defaults.object(forKey: "preferences.desktopNotifications") as? Bool ?? true
        messagePreview = defaults.object(forKey: "preferences.messagePreview") as? Bool ?? true
    }

    private func save() {
        defaults.set(language.rawValue, forKey: "preferences.language")
        defaults.set(theme.rawValue, forKey: "preferences.theme")
        defaults.set(colorPalette.rawValue, forKey: "preferences.colorPalette")
        defaults.set(soundEnabled, forKey: "preferences.soundEnabled")
        defaults.set(hasSeenWelcome, forKey: "preferences.hasSeenWelcome")
        defaults.set(density.rawValue, forKey: "preferences.density")
        defaults.set(desktopNotifications, forKey: "preferences.desktopNotifications")
        defaults.set(messagePreview, forKey: "preferences.messagePreview")
    }
}
