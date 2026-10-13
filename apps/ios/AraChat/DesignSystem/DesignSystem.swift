import SwiftUI

enum AppPalette: String, CaseIterable, Identifiable {
    case comet
    case halo
    case liquid

    var id: String { rawValue }

    var title: String {
        switch self {
        case .comet: return "Comet"
        case .halo: return "Halo"
        case .liquid: return "Liquid Glass"
        }
    }

    var accent: Color {
        switch self {
        case .comet: return Color(red: 0.12, green: 0.38, blue: 0.93)
        case .halo: return Color(red: 0.55, green: 0.27, blue: 0.78)
        case .liquid: return Color(red: 0.02, green: 0.47, blue: 0.48)
        }
    }

    var softAccent: Color {
        switch self {
        case .comet: return Color(red: 0.87, green: 0.92, blue: 1.0)
        case .halo: return Color(red: 0.95, green: 0.89, blue: 1.0)
        case .liquid: return Color(red: 0.84, green: 0.96, blue: 0.95)
        }
    }

    var onboardingGradient: LinearGradient {
        switch self {
        case .comet:
            return LinearGradient(
                colors: [Color(red: 0.06, green: 0.13, blue: 0.37), Color(red: 0.12, green: 0.38, blue: 0.93)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .halo:
            return LinearGradient(
                colors: [Color(red: 0.24, green: 0.09, blue: 0.38), Color(red: 0.69, green: 0.34, blue: 0.86)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .liquid:
            return LinearGradient(
                colors: [Color(red: 0.01, green: 0.25, blue: 0.28), Color(red: 0.05, green: 0.62, blue: 0.61)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

struct AvatarView: View {
    let symbol: String
    let name: String
    let size: CGFloat

    private var color: Color {
        let colors: [Color] = [
            Color(red: 0.15, green: 0.38, blue: 0.84),
            Color(red: 0.57, green: 0.28, blue: 0.78),
            Color(red: 0.02, green: 0.49, blue: 0.51),
            Color(red: 0.82, green: 0.29, blue: 0.38)
        ]
        return colors[abs(name.hashValue) % colors.count]
    }

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(color))
            .accessibilityHidden(true)
    }
}

struct AraCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

extension View {
    func araCard() -> some View {
        background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct NavigationSurface: View {
    let reduceTransparency: Bool

    var body: some View {
        Group {
            if reduceTransparency {
                Color(.secondarySystemBackground)
            } else if #available(iOS 26.0, *) {
                Color.clear
                    .glassEffect()
            } else {
                Rectangle()
                    .fill(.ultraThinMaterial)
            }
        }
    }
}

struct FilledActionButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.white)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint.opacity(configuration.isPressed ? 0.78 : 1)))
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

struct OutlinedActionButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(tint)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint.opacity(configuration.isPressed ? 0.16 : 0.08)))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tint.opacity(0.25), lineWidth: 1))
    }
}

struct PrimaryOnDarkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.black.opacity(0.88))
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(configuration.isPressed ? 0.8 : 1)))
    }
}

struct ContentUnavailableView: View {
    let title: String
    let symbol: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.largeTitle)
                .foregroundColor(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
        .accessibilityElement(children: .combine)
    }
}
