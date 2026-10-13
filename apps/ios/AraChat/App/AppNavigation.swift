import SwiftUI

enum AppTab: Int, CaseIterable, Identifiable {
    case home
    case chats
    case calls
    case search
    case profile

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .home: return "Главная"
        case .chats: return "Чаты"
        case .calls: return "Звонки"
        case .search: return "Поиск"
        case .profile: return "Вы"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "house.fill"
        case .chats: return "bubble.left.and.bubble.right.fill"
        case .calls: return "phone.fill"
        case .search: return "magnifyingglass"
        case .profile: return "person.crop.circle.fill"
        }
    }
}

struct AppShell: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                RegularAppShell()
            } else {
                CompactAppShell()
            }
        }
        .tint(store.palette.accent)
    }
}

private struct CompactAppShell: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        TabView(selection: $store.selectedTab) {
            NavigationView {
                HomeView()
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.symbol) }
            .tag(AppTab.home)

            NavigationView {
                ChatsView()
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .tabItem { Label(AppTab.chats.title, systemImage: AppTab.chats.symbol) }
            .tag(AppTab.chats)

            NavigationView {
                CallsView()
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .tabItem { Label(AppTab.calls.title, systemImage: AppTab.calls.symbol) }
            .tag(AppTab.calls)

            NavigationView {
                SearchView()
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .tabItem { Label(AppTab.search.title, systemImage: AppTab.search.symbol) }
            .tag(AppTab.search)

            NavigationView {
                ProfileView()
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .tabItem { Label(AppTab.profile.title, systemImage: AppTab.profile.symbol) }
            .tag(AppTab.profile)
        }
    }
}

private struct RegularAppShell: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        NavigationView {
            SidebarView()
            TabDestination(tab: store.selectedTab)
        }
        .navigationViewStyle(DoubleColumnNavigationViewStyle())
    }
}

private struct SidebarView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List {
            Section("AraChat") {
                ForEach(AppTab.allCases) { tab in
                    Button {
                        store.selectedTab = tab
                    } label: {
                        Label(tab.title, systemImage: tab.symbol)
                            .foregroundColor(store.selectedTab == tab ? store.palette.accent : .primary)
                    }
                    .accessibilityLabel(tab.title)
                    .accessibilityAddTraits(store.selectedTab == tab ? .isSelected : [])
                }
            }

            Section("Быстрый доступ") {
                Button {
                    store.selectedTab = .chats
                } label: {
                    Label("Сохранённые сообщения", systemImage: "bookmark.fill")
                }
                Button {
                    store.selectedTab = .profile
                } label: {
                    Label("Настройки", systemImage: "gearshape.fill")
                }
            }
        }
        .listStyle(SidebarListStyle())
        .navigationTitle("AraChat")
    }
}

private struct TabDestination: View {
    let tab: AppTab

    var body: some View {
        switch tab {
        case .home: HomeView()
        case .chats: ChatsView()
        case .calls: CallsView()
        case .search: SearchView()
        case .profile: ProfileView()
        }
    }
}
