import SwiftUI

struct RootView: View {
    @AppStorage("arachat.onboarding.completed") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if hasCompletedOnboarding {
                AppShell()
            } else {
                OnboardingView {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        hasCompletedOnboarding = true
                    }
                }
            }
        }
    }
}

private struct OnboardingView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let finish: () -> Void

    var body: some View {
        ZStack {
            store.palette.onboardingGradient
                .ignoresSafeArea()

            Circle()
                .fill(Color.white.opacity(0.12))
                .frame(width: 340, height: 340)
                .offset(x: 125, y: -270)
                .accessibilityHidden(true)

            VStack(spacing: 0) {
                Spacer()

                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.17))
                        .frame(width: 132, height: 132)
                    Image(systemName: "bird.fill")
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundColor(.white)
                        .accessibilityHidden(true)
                }
                .padding(.bottom, 32)

                Text("AraChat")
                    .font(.largeTitle.bold())
                    .foregroundColor(.white)

                Text("Спокойное место для важных разговоров")
                    .font(.title3)
                    .foregroundColor(.white.opacity(0.86))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    .padding(.horizontal, 40)

                Spacer()

                VStack(spacing: 12) {
                    Button(action: finish) {
                        Text("Продолжить")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(PrimaryOnDarkButtonStyle())
                    .accessibilityHint("Откроет главную страницу AraChat")

                    Text("Продолжая, вы принимаете Условия использования и Политику конфиденциальности")
                        .font(.footnote)
                        .foregroundColor(.white.opacity(0.72))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
        .accessibilityElement(children: .contain)
        .transaction { transaction in
            if reduceMotion {
                transaction.animation = nil
            }
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                welcomeCard

                VStack(alignment: .leading, spacing: 12) {
                    Text("Сегодня в AraChat")
                        .font(.title2.bold())
                        .padding(.horizontal, 20)

                    HStack(spacing: 12) {
                        MetricCard(title: "Новых", value: "3", symbol: "bubble.left.and.bubble.right.fill", tint: store.palette.accent)
                        MetricCard(title: "В сети", value: "8", symbol: "circle.fill", tint: Color.green)
                    }
                    .padding(.horizontal, 20)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Продолжить разговор")
                            .font(.title2.bold())
                        Spacer()
                        Button("Все чаты") {
                            store.selectedTab = .chats
                        }
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                    }
                    .padding(.horizontal, 20)

                    ForEach(store.conversations.filter { $0.kind == .direct }.prefix(3)) { conversation in
                        NavigationLink(destination: ConversationView(conversationID: conversation.id)) {
                            ConversationRow(conversation: conversation)
                        }
                        .buttonStyle(PlainButtonStyle())
                        .padding(.horizontal, 16)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Каналы")
                        .font(.title2.bold())
                        .padding(.horizontal, 20)

                    ForEach(store.channels.prefix(1)) { channel in
                        NavigationLink(destination: ChannelDetailView(channel: channel)) {
                            ChannelHighlightCard(channel: channel)
                        }
                        .buttonStyle(PlainButtonStyle())
                        .padding(.horizontal, 20)
                    }
                }
            }
            .padding(.vertical, 20)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Главная")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    store.selectedTab = .search
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("Начать новый разговор")
                .frame(minWidth: 44, minHeight: 44)
            }
        }
    }

    private var welcomeCard: some View {
        ZStack(alignment: .bottomLeading) {
            store.palette.onboardingGradient

            Circle()
                .fill(Color.white.opacity(0.12))
                .frame(width: 160, height: 160)
                .offset(x: 230, y: -75)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                Text("Добрый день, Артём")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                Text("У вас есть новые сообщения и один важный канал.")
                    .font(.body)
                    .foregroundColor(.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
        .frame(minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 20)
        .accessibilityElement(children: .combine)
    }
}

private struct MetricCard: View {
    let title: String
    let value: String
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: symbol)
                .foregroundColor(tint)
                .accessibilityHidden(true)
            Text(value)
                .font(.title.bold())
            Text(title)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 116, alignment: .leading)
        .padding(16)
        .araCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(title.lowercased())")
    }
}

private enum ChatScope: String, CaseIterable, Identifiable {
    case all = "Все"
    case direct = "Личные"
    case channels = "Каналы"

    var id: String { rawValue }
}

struct ChatsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @State private var scope: ChatScope = .all

    private var visibleConversations: [Conversation] {
        store.conversations.filter { conversation in
            let inScope: Bool
            switch scope {
            case .all: inScope = true
            case .direct: inScope = conversation.kind == .direct || conversation.kind == .saved
            case .channels: inScope = conversation.kind == .channel
            }
            return inScope && (query.isEmpty || conversation.name.localizedCaseInsensitiveContains(query) || conversation.preview.localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Фильтр чатов", selection: $scope) {
                    ForEach(ChatScope.allCases) { scope in
                        Text(scope.rawValue).tag(scope)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding(.vertical, 4)
                .accessibilityLabel("Фильтр чатов")
            }

            if scope != .direct {
                Section("Каналы") {
                    ForEach(store.channels) { channel in
                        NavigationLink(destination: ChannelDetailView(channel: channel)) {
                            ChannelRow(channel: channel)
                        }
                    }
                }
            }

            Section(scope == .channels ? "Все публичные каналы" : "Сообщения") {
                ForEach(visibleConversations.filter { $0.kind != .channel }) { conversation in
                    NavigationLink(destination: ConversationView(conversationID: conversation.id)) {
                        ConversationRow(conversation: conversation)
                    }
                }
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Чаты")
        .searchable(text: $query, prompt: "Поиск в чатах")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button("Новый чат") {
                        store.selectedTab = .search
                    }
                    Button("Новый канал") { }
                        .disabled(true)
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("Новое")
            }
        }
    }
}

private struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(symbol: conversation.symbol, name: conversation.name, size: 52)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(conversation.name)
                        .font(.headline)
                        .lineLimit(1)
                    if conversation.isOfficial {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.blue)
                            .accessibilityLabel("Официальный аккаунт")
                    }
                    Spacer(minLength: 8)
                    Text(conversation.time)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                HStack(spacing: 8) {
                    Text(conversation.preview)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if conversation.unreadCount > 0 {
                        Text("\(conversation.unreadCount)")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.accentColor))
                            .accessibilityLabel("\(conversation.unreadCount) непрочитанных")
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct ChannelRow: View {
    let channel: Channel

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(symbol: channel.symbol, name: channel.title, size: 48)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(channel.title)
                        .font(.headline)
                    if channel.isOfficial {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.blue)
                            .accessibilityLabel("Официальный канал")
                    }
                }
                Text("\(channel.subscriberCount) подписчиков")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundColor(.secondary.opacity(0.55))
                .accessibilityHidden(true)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

struct CallsView: View {
    @State private var showsDeviceNotice = false

    var body: some View {
        List {
            Section {
                Button {
                    showsDeviceNotice = true
                } label: {
                    Label("Начать аудиозвонок", systemImage: "phone.fill")
                        .frame(minHeight: 44)
                }
                Button {
                    showsDeviceNotice = true
                } label: {
                    Label("Начать видеозвонок", systemImage: "video.fill")
                        .frame(minHeight: 44)
                }
            } footer: {
                Text("Звонки будут доступны после проверки CallKit, APNs, камеры и аудиосессии на физических устройствах.")
            }

            Section("Недавние") {
                CallHistoryRow(name: "Алина", symbol: "person.crop.circle.fill", detail: "Исходящий аудиозвонок · 4 мин", time: "вчера")
                CallHistoryRow(name: "Марк", symbol: "person.crop.circle.fill", detail: "Нет ответа", time: "Пн")
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Звонки")
        .alert("Нужна проверка на устройстве", isPresented: $showsDeviceNotice) {
            Button("Понятно", role: .cancel) { }
        } message: {
            Text("Интерфейс готов, но вызов пока не запускается, чтобы не обещать неподтверждённую доставку и работу в фоне.")
        }
    }
}

private struct CallHistoryRow: View {
    let name: String
    let symbol: String
    let detail: String
    let time: String

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(symbol: symbol, name: name, size: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.headline)
                Label(detail, systemImage: detail == "Нет ответа" ? "phone.down.fill" : "phone.arrow.up.right.fill")
                    .font(.subheadline)
                    .foregroundColor(detail == "Нет ответа" ? .red : .secondary)
            }
            Spacer()
            Text(time)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

struct SearchView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""

    private var results: [SearchPerson] {
        SearchPerson.samples.filter {
            query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.username.localizedCaseInsensitiveContains(query) || $0.arachatID.contains(query.replacingOccurrences(of: " ", with: ""))
        }
    }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundColor(store.palette.accent)
                        .accessibilityHidden(true)
                    Text("Ищите людей только по @username или AraChat ID. Имя и номер телефона не участвуют в глобальном поиске.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section(query.isEmpty ? "Недавние" : "Результаты") {
                ForEach(results) { person in
                    NavigationLink(destination: PublicProfileView(person: person)) {
                        SearchResultRow(person: person)
                    }
                }
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Поиск")
        .searchable(text: $query, prompt: "@username или AraChat ID")
    }
}

private struct SearchResultRow: View {
    let person: SearchPerson

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(symbol: person.symbol, name: person.name, size: 48)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(person.name).font(.headline)
                    if person.isOfficial {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.blue)
                            .accessibilityLabel("Официальный аккаунт")
                    }
                }
                Text(person.username)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

private struct PublicProfileView: View {
    @EnvironmentObject private var store: AppStore
    let person: SearchPerson
    @State private var isAdded = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                AvatarView(symbol: person.symbol, name: person.name, size: 92)
                    .accessibilityHidden(true)
                VStack(spacing: 6) {
                    Text(person.name).font(.title2.bold())
                    Text(person.username).foregroundColor(.secondary)
                    Text(person.formattedAraChatID)
                        .font(.subheadline.monospacedDigit())
                        .foregroundColor(.secondary)
                }
                .accessibilityElement(children: .combine)

                AraCard {
                    Text(person.bio)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(spacing: 12) {
                    Button {
                        store.selectedTab = .chats
                    } label: {
                        Label("Написать", systemImage: "bubble.left.fill")
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(FilledActionButtonStyle(tint: store.palette.accent))

                    Button {
                        isAdded.toggle()
                    } label: {
                        Label(isAdded ? "В контактах" : "Добавить в контакты", systemImage: isAdded ? "checkmark" : "person.badge.plus")
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(OutlinedActionButtonStyle(tint: store.palette.accent))
                }
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Профиль")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ProfileView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List {
            Section {
                NavigationLink(destination: MyProfileView()) {
                    HStack(spacing: 14) {
                        AvatarView(symbol: "bird.fill", name: "Артём", size: 58)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Артём")
                                .font(.headline)
                            Text("@artem")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("Настройки") {
                NavigationLink(destination: AppearanceSettingsView()) {
                    Label("Внешний вид и чаты", systemImage: "paintpalette.fill")
                }
                NavigationLink(destination: NotificationsSettingsView()) {
                    Label("Уведомления и звуки", systemImage: "bell.badge.fill")
                }
                NavigationLink(destination: PrivacySettingsView()) {
                    Label("Конфиденциальность и безопасность", systemImage: "lock.shield.fill")
                }
                NavigationLink(destination: DevicesView()) {
                    Label("Устройства", systemImage: "laptopcomputer.and.iphone")
                }
                NavigationLink(destination: DataStorageView()) {
                    Label("Данные и хранилище", systemImage: "externaldrive.fill")
                }
            }

            Section("Поддержка") {
                NavigationLink(destination: SupportView()) {
                    Label("Помощь", systemImage: "questionmark.circle.fill")
                }
            }

            Section {
                Button(role: .destructive) { } label: {
                    Label("Удалить аккаунт", systemImage: "trash.fill")
                }
                .disabled(true)
            } footer: {
                Text("Необратимое удаление станет доступно только после серверной повторной аутентификации и проверки полной очистки данных.")
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Вы")
    }
}

private struct MyProfileView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                AvatarView(symbol: "bird.fill", name: "Артём", size: 96)
                    .accessibilityHidden(true)
                Text("Артём").font(.title2.bold())
                Text("@artem").foregroundColor(.secondary)
                AraCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("AraChat ID", systemImage: "number")
                            .font(.subheadline.weight(.semibold))
                        Text("1234 5678 9012 3456")
                            .font(.body.monospacedDigit())
                    }
                }
                AraCard {
                    Text("Люблю делать простые вещи понятными.")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Профиль")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AppearanceSettingsView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Form {
            Section {
                ForEach(AppPalette.allCases) { palette in
                    Button {
                        store.selectPalette(palette)
                    } label: {
                        HStack {
                            Circle()
                                .fill(palette.accent)
                                .frame(width: 26, height: 26)
                                .accessibilityHidden(true)
                            Text(palette.title)
                            Spacer()
                            if palette == store.palette {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.bold))
                                    .foregroundColor(store.palette.accent)
                                    .accessibilityLabel("Выбрано")
                            }
                        }
                        .frame(minHeight: 44)
                    }
                    .foregroundColor(.primary)
                    .accessibilityAddTraits(palette == store.palette ? .isSelected : [])
                }
            } header: {
                Text("Палитра")
            } footer: {
                Text("На iOS 15–25 палитра Liquid Glass использует системный Material только в навигации и контролах. Контент остаётся непрозрачным.")
            }

            Section("Чаты") {
                LabeledContentRow(title: "Размер текста", value: "Системный")
                LabeledContentRow(title: "Отправлять по Enter", value: "Включено")
            }
        }
        .navigationTitle("Внешний вид и чаты")
    }
}

private struct NotificationsSettingsView: View {
    var body: some View {
        Form {
            Section("Предпросмотр") {
                LabeledContentRow(title: "На экране блокировки", value: "Без текста")
                LabeledContentRow(title: "Личные чаты", value: "По умолчанию")
            }
            Section {
                LabeledContentRow(title: "Варианты", value: "1 ч · 8 ч · 2 дня · навсегда")
            } header: {
                Text("Без звука")
            } footer: {
                Text("Системный запрос уведомлений появится только после объяснения и явного действия «Включить».")
            }
        }
        .navigationTitle("Уведомления и звуки")
    }
}

private struct PrivacySettingsView: View {
    var body: some View {
        Form {
            Section {
                LabeledContentRow(title: "Номер телефона", value: "Никто")
                LabeledContentRow(title: "В сети", value: "Мои контакты")
                LabeledContentRow(title: "Последняя активность", value: "Мои контакты")
                LabeledContentRow(title: "Отчёты о прочтении", value: "Включены")
            } header: {
                Text("Видимость")
            } footer: {
                Text("Эти параметры появятся как интерактивные только после серверной модели аудиторий, исключений и взаимных read receipts.")
            }

            Section("Безопасность") {
                LabeledContentRow(title: "Заблокированные пользователи", value: "0")
            }
        }
        .navigationTitle("Конфиденциальность")
    }
}

private struct DevicesView: View {
    var body: some View {
        List {
            Section("Текущее устройство") {
                DeviceRow(name: "Этот iPhone", detail: "iOS · сейчас", symbol: "iphone")
            }
            Section {
                DeviceRow(name: "MacBook Air", detail: "macOS · вчера в 21:43", symbol: "laptopcomputer")
            } header: {
                Text("Другие устройства")
            } footer: {
                Text("Завершение сессии и выход со всех других устройств будут подключены после расширения server contract: понятные метаданные устройства, последняя активность и свежая повторная аутентификация.")
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Устройства")
    }
}

private struct DataStorageView: View {
    @State private var saveToPhotos = false

    var body: some View {
        Form {
            Section("Автозагрузка") {
                LabeledContentRow(title: "Wi‑Fi", value: "Фото и голосовые")
                LabeledContentRow(title: "Сотовая сеть", value: "Небольшие фото")
                LabeledContentRow(title: "Видео и файлы", value: "Вручную")
            }
            Section {
                Toggle("Сохранять в «Фото»", isOn: $saveToPhotos)
            } header: {
                Text("Медиа")
            } footer: {
                Text("По умолчанию медиа не сохраняются в системную медиатеку. Ручное сохранение доступно всегда.")
            }
            Section("Хранилище") {
                LabeledContentRow(title: "Кэш", value: "248 МБ")
                Button("Очистить кэш", role: .destructive) { }
            }
        }
        .navigationTitle("Данные и хранилище")
    }
}

private struct SupportView: View {
    var body: some View {
        List {
            Section {
                NavigationLink(destination: SupportTicketView()) {
                    Label("Новое обращение", systemImage: "square.and.pencil")
                }
                LabeledContentRow(title: "Мои обращения", value: "0")
            } footer: {
                Text("Не отправляйте пароль, PIN-код или код из письма. Заявка на статус автора канала создаётся здесь же с кратким описанием канала.")
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Помощь")
    }
}

private struct SupportTicketView: View {
    @State private var text = ""
    @State private var submitted = false

    var body: some View {
        Form {
            Section("Тема") {
                Picker("Категория", selection: .constant("Другое")) {
                    Text("Другое").tag("Другое")
                }
                .disabled(true)
                TextField("Коротко опишите вопрос", text: .constant(""))
                    .disabled(true)
            }
            Section("Сообщение") {
                TextEditor(text: $text)
                    .frame(minHeight: 160)
                    .accessibilityLabel("Текст обращения")
            }
            Section {
                Button("Отправить") {
                    submitted = true
                }
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } footer: {
                Text("Данные формы пока не отправляются: подключение к support API будет следующим шагом.")
            }
        }
        .navigationTitle("Новое обращение")
        .alert("Интерфейс готов", isPresented: $submitted) {
            Button("Понятно", role: .cancel) { }
        } message: {
            Text("Отправка станет доступна после подключения контракта поддержки.")
        }
    }
}

private struct DeviceRow: View {
    let name: String
    let detail: String
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .frame(width: 32, height: 32)
                .foregroundColor(.accentColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.headline)
                Text(detail).font(.subheadline).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct LabeledContentRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
                .foregroundColor(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ConversationView: View {
    @EnvironmentObject private var store: AppStore
    @State private var draft = ""
    let conversationID: UUID

    var body: some View {
        Group {
            if let conversation = store.conversation(id: conversationID) {
                VStack(spacing: 0) {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 10) {
                                Text("Сегодня")
                                    .font(.caption.weight(.semibold))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Capsule().fill(Color(.tertiarySystemFill)))
                                    .padding(.vertical, 8)

                                ForEach(conversation.messages) { message in
                                    MessageBubble(message: message)
                                        .id(message.id)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 16)
                        }
                        .background(Color(.systemGroupedBackground))
                        .onChange(of: conversation.messages.count) { _ in
                            guard let lastID = conversation.messages.last?.id else { return }
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(lastID, anchor: .bottom)
                            }
                        }
                    }

                    ComposerView(text: $draft) {
                        store.send(draft, to: conversationID)
                        draft = ""
                    }
                }
                .navigationTitle(conversation.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                        Button { } label: {
                            Image(systemName: "phone.fill")
                        }
                        .disabled(true)
                        .accessibilityLabel("Аудиозвонок пока недоступен")
                        Button { } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel("Действия чата")
                    }
                }
            } else {
                ContentUnavailableView(title: "Чат недоступен", symbol: "bubble.left.and.exclamationmark")
            }
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.direction == .outgoing { Spacer(minLength: 48) }
            VStack(alignment: message.direction == .outgoing ? .trailing : .leading, spacing: 4) {
                Text(message.text)
                    .font(.body)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 4) {
                    if message.isEdited {
                        Text("изменено")
                    }
                    Text(message.timestamp)
                    if message.direction == .outgoing {
                        Image(systemName: message.delivery.symbol)
                            .accessibilityHidden(true)
                    }
                }
                .font(.caption2)
                .foregroundColor(message.direction == .outgoing ? Color.white.opacity(0.78) : .secondary)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .foregroundColor(message.direction == .outgoing ? .white : .primary)
            .background(message.direction == .outgoing ? Color.accentColor : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(message.direction == .outgoing ? "Вы" : "Собеседник"). \(message.text). \(message.timestamp)")
            if message.direction == .incoming { Spacer(minLength: 48) }
        }
    }
}

private struct ComposerView: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Binding var text: String
    let send: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Button { } label: {
                Image(systemName: "paperclip")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Прикрепить файл")

            TextField("Сообщение", text: $text)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Color(.secondarySystemBackground))
                .clipShape(Capsule())
                .accessibilityLabel("Сообщение")

            Button(action: send) {
                Image(systemName: text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "mic.fill" : "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.accentColor))
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.72 : 1)
            .accessibilityLabel(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Голосовое сообщение" : "Отправить сообщение")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(NavigationSurface(reduceTransparency: reduceTransparency))
    }
}

private struct ChannelCatalogView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List(store.channels) { channel in
            NavigationLink(destination: ChannelDetailView(channel: channel)) {
                ChannelRow(channel: channel)
            }
        }
        .navigationTitle("Каналы")
    }
}

private struct ChannelDetailView: View {
    @EnvironmentObject private var store: AppStore
    let channel: Channel
    @State private var showsComments = false
    @State private var isSubscribed = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                channelHeader

                ForEach(channel.posts) { post in
                    ChannelPostCard(post: post) {
                        showsComments = true
                    }
                }
            }
            .padding(.vertical, 16)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle(channel.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsComments) {
            CommentsView(channel: channel)
        }
    }

    private var channelHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                AvatarView(symbol: channel.symbol, name: channel.title, size: 62)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(channel.title).font(.title3.bold())
                        if channel.isOfficial {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(.blue)
                                .accessibilityLabel("Официальный канал")
                        }
                    }
                    Text("@\(channel.slug) · \(channel.subscriberCount) подписчиков")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            Text(channel.description)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)

            if let author = channel.author {
                Label("Автор: \(author)", systemImage: "person.fill")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            if isSubscribed {
                Button {
                    isSubscribed.toggle()
                } label: {
                    Text("Вы подписаны")
                        .frame(maxWidth: .infinity, minHeight: 46)
                }
                .buttonStyle(OutlinedActionButtonStyle(tint: store.palette.accent))
                .accessibilityLabel("Отписаться от канала")
            } else {
                Button {
                    isSubscribed.toggle()
                } label: {
                    Text("Подписаться")
                        .frame(maxWidth: .infinity, minHeight: 46)
                }
                .buttonStyle(FilledActionButtonStyle(tint: store.palette.accent))
                .accessibilityLabel("Подписаться на канал")
            }
        }
        .padding(20)
        .araCard()
        .padding(.horizontal, 16)
    }
}

private struct ChannelPostCard: View {
    let post: ChannelPost
    let openComments: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(post.text)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Text(post.timestamp)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if post.isEdited {
                    Text("изменено")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Button(action: openComments) {
                    Label("\(post.commentCount)", systemImage: "bubble.right")
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 36)
                }
                .accessibilityLabel("Открыть комментарии. \(post.commentCount)")
            }
        }
        .padding(18)
        .araCard()
        .padding(.horizontal, 16)
    }
}

private struct CommentsView: View {
    let channel: Channel
    @State private var comment = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                List(channel.comments) { comment in
                    HStack(alignment: .top, spacing: 10) {
                        AvatarView(symbol: comment.symbol, name: comment.author, size: 36)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(comment.author).font(.subheadline.bold())
                                Spacer()
                                Text(comment.timestamp).font(.caption).foregroundColor(.secondary)
                            }
                            Text(comment.text).font(.body)
                            Label("\(comment.reactionCount)", systemImage: "heart")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .padding(.top, 2)
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                }
                ComposerView(text: $comment) {
                    comment = ""
                }
            }
            .navigationTitle("Комментарии")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}

private struct ChannelHighlightCard: View {
    let channel: Channel

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            AvatarView(symbol: channel.symbol, name: channel.title, size: 56)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(channel.title).font(.headline)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.secondary.opacity(0.55))
                        .accessibilityHidden(true)
                }
                Text(channel.description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                Text("\(channel.subscriberCount) подписчиков")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(16)
        .araCard()
        .accessibilityElement(children: .combine)
    }
}
