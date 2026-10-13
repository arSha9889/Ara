import Foundation

enum ChatKind: Hashable {
    case direct
    case channel
    case saved
}

enum MessageDirection: Hashable {
    case incoming
    case outgoing
}

enum Delivery: Hashable {
    case pending
    case delivered
    case read

    var symbol: String {
        switch self {
        case .pending: return "clock"
        case .delivered: return "checkmark"
        case .read: return "checkmark.circle.fill"
        }
    }
}

struct ChatMessage: Identifiable, Hashable {
    let id: UUID
    let direction: MessageDirection
    let text: String
    let timestamp: String
    let delivery: Delivery
    let isEdited: Bool

    init(id: UUID = UUID(), direction: MessageDirection, text: String, timestamp: String, delivery: Delivery = .delivered, isEdited: Bool = false) {
        self.id = id
        self.direction = direction
        self.text = text
        self.timestamp = timestamp
        self.delivery = delivery
        self.isEdited = isEdited
    }
}

struct Conversation: Identifiable, Hashable {
    let id: UUID
    let kind: ChatKind
    let name: String
    let symbol: String
    var preview: String
    var time: String
    let unreadCount: Int
    let isOfficial: Bool
    var messages: [ChatMessage]

    static let samples: [Conversation] = [
        Conversation(
            id: UUID(),
            kind: .direct,
            name: "Алина",
            symbol: "person.fill",
            preview: "Давай созвонимся после обеда",
            time: "12:42",
            unreadCount: 2,
            isOfficial: false,
            messages: [
                ChatMessage(direction: .incoming, text: "Привет! Как идёт работа над новым экраном?", timestamp: "12:38", delivery: .read),
                ChatMessage(direction: .outgoing, text: "Почти готово. Проверяю крупный шрифт и iPad.", timestamp: "12:40", delivery: .read),
                ChatMessage(direction: .incoming, text: "Давай созвонимся после обеда", timestamp: "12:42", delivery: .delivered)
            ]
        ),
        Conversation(
            id: UUID(),
            kind: .direct,
            name: "Марк",
            symbol: "person.fill",
            preview: "Файл получил, спасибо",
            time: "10:18",
            unreadCount: 0,
            isOfficial: false,
            messages: [
                ChatMessage(direction: .outgoing, text: "Отправил материалы в документе.", timestamp: "10:13", delivery: .read),
                ChatMessage(direction: .incoming, text: "Файл получил, спасибо", timestamp: "10:18", delivery: .read)
            ]
        ),
        Conversation(
            id: UUID(),
            kind: .saved,
            name: "Сохранённые сообщения",
            symbol: "bookmark.fill",
            preview: "Идея для следующего релиза",
            time: "Вт",
            unreadCount: 0,
            isOfficial: false,
            messages: [
                ChatMessage(direction: .outgoing, text: "Идея для следующего релиза", timestamp: "Вт", delivery: .delivered)
            ]
        )
    ]
}

struct Channel: Identifiable, Hashable {
    let id: UUID
    let title: String
    let slug: String
    let description: String
    let symbol: String
    let subscriberCount: String
    let isOfficial: Bool
    let author: String?
    let posts: [ChannelPost]
    let comments: [ChannelComment]

    static let samples: [Channel] = [
        Channel(
            id: UUID(),
            title: "Ara Updates",
            slug: "ara_updates",
            description: "Новости продукта, важные изменения и подсказки от команды AraChat.",
            symbol: "bird.fill",
            subscriberCount: "12,4 тыс.",
            isOfficial: true,
            author: nil,
            posts: [
                ChannelPost(text: "Мы начали работу над нативным приложением AraChat для iPhone и iPad. В первой версии сделаем акцент на понятных личных чатах, каналах и доступности.", timestamp: "сегодня, 11:20", commentCount: 18, isEdited: false),
                ChannelPost(text: "Новый раздел «Вы» объединит профиль, внешний вид, безопасность и устройства. Настройки появятся только там, где их действительно применяет сервер.", timestamp: "вчера, 18:04", commentCount: 6, isEdited: true)
            ],
            comments: [
                ChannelComment(author: "Наташа", symbol: "person.fill", text: "Очень жду версию для iPad!", timestamp: "11:24", reactionCount: 4),
                ChannelComment(author: "Игорь", symbol: "person.fill", text: "Спасибо, что сразу думаете о доступности.", timestamp: "11:30", reactionCount: 2)
            ]
        ),
        Channel(
            id: UUID(),
            title: "Дизайн без шума",
            slug: "quiet_design",
            description: "Наблюдения о спокойных интерфейсах и внимании к деталям.",
            symbol: "circle.hexagongrid.fill",
            subscriberCount: "3,1 тыс.",
            isOfficial: false,
            author: "@maria",
            posts: [
                ChannelPost(text: "Хороший интерфейс не требует объяснять, куда нажать. Он оставляет человеку пространство для главного действия.", timestamp: "Пн, 09:12", commentCount: 9, isEdited: false)
            ],
            comments: [
                ChannelComment(author: "Олег", symbol: "person.fill", text: "Согласен, особенно на маленьком экране.", timestamp: "09:16", reactionCount: 1)
            ]
        )
    ]
}

struct ChannelPost: Identifiable, Hashable {
    let id: UUID
    let text: String
    let timestamp: String
    let commentCount: Int
    let isEdited: Bool

    init(id: UUID = UUID(), text: String, timestamp: String, commentCount: Int, isEdited: Bool) {
        self.id = id
        self.text = text
        self.timestamp = timestamp
        self.commentCount = commentCount
        self.isEdited = isEdited
    }
}

struct ChannelComment: Identifiable, Hashable {
    let id: UUID
    let author: String
    let symbol: String
    let text: String
    let timestamp: String
    let reactionCount: Int

    init(id: UUID = UUID(), author: String, symbol: String, text: String, timestamp: String, reactionCount: Int) {
        self.id = id
        self.author = author
        self.symbol = symbol
        self.text = text
        self.timestamp = timestamp
        self.reactionCount = reactionCount
    }
}

struct SearchPerson: Identifiable, Hashable {
    let id: UUID
    let name: String
    let username: String
    let arachatID: String
    let bio: String
    let symbol: String
    let isOfficial: Bool

    var formattedAraChatID: String {
        arachatID.enumerated().reduce(into: "") { result, item in
            if item.offset > 0 && item.offset.isMultiple(of: 4) { result.append(" ") }
            result.append(item.element)
        }
    }

    static let samples: [SearchPerson] = [
        SearchPerson(id: UUID(), name: "Алина Воронова", username: "@alina", arachatID: "7318459201764328", bio: "Дизайнер цифровых продуктов. Люблю ясные интерфейсы и городские прогулки.", symbol: "person.fill", isOfficial: false),
        SearchPerson(id: UUID(), name: "AraChat", username: "@arachat", arachatID: "1000000000000001", bio: "Официальный аккаунт команды AraChat.", symbol: "bird.fill", isOfficial: true)
    ]
}
