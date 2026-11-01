import Foundation

enum RealtimeConnectionState: Equatable, Sendable {
    case disconnected
    case connecting
    case connected
    case rejected(String)
}

struct RealtimeEvent: Decodable, Sendable {
    let event: String
    let chatID: UUID?
    let userID: UUID?
    let reason: String?

    enum CodingKeys: String, CodingKey {
        case event
        case chatID = "chat_id"
        case userID = "user_id"
        case reason
    }
}

enum RealtimeUpdate: Sendable {
    case connectionState(RealtimeConnectionState)
    case event(RealtimeEvent)
}

struct RealtimeCommand: Encodable, Sendable {
    let event: String
    let token: String?
    let platform: String?
    let chatID: UUID?

    enum CodingKeys: String, CodingKey {
        case event
        case token
        case platform
        case chatID = "chat_id"
    }

    static func authenticate(token: String) -> RealtimeCommand {
        RealtimeCommand(event: "connection.authenticate", token: token, platform: "desktop", chatID: nil)
    }

    static func subscribe(chatID: UUID) -> RealtimeCommand {
        RealtimeCommand(event: "chat.subscribe", token: nil, platform: nil, chatID: chatID)
    }

    static func unsubscribe(chatID: UUID) -> RealtimeCommand {
        RealtimeCommand(event: "chat.unsubscribe", token: nil, platform: nil, chatID: chatID)
    }
}

protocol RealtimeClientProviding: Sendable {
    var updates: AsyncStream<RealtimeUpdate> { get }

    func connect(accessToken: String) async
    func disconnect() async
    func subscribe(to chatID: UUID) async
    func unsubscribe(from chatID: UUID) async
}

/// Realtime-транспорт AraChat. Он не интерпретирует payload событий, поэтому
/// feature-слои делают resync из REST после relevant update.
actor RealtimeClient: RealtimeClientProviding {
    nonisolated let updates: AsyncStream<RealtimeUpdate>

    private let configuration: APIConfiguration
    private let urlSession: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let continuation: AsyncStream<RealtimeUpdate>.Continuation
    private var socket: URLSessionWebSocketTask?
    private var accessToken: String?
    private var desiredSubscriptions = Set<UUID>()
    private var state: RealtimeConnectionState = .disconnected
    private var reconnectAttempt = 0
    private var reconnectTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var pongTimeoutTask: Task<Void, Never>?
    private var stopped = true

    init(configuration: APIConfiguration, urlSession: URLSession = .shared) {
        self.configuration = configuration
        self.urlSession = urlSession
        let stream = AsyncStream<RealtimeUpdate>.makeStream()
        updates = stream.stream
        continuation = stream.continuation
    }

    static func live() -> RealtimeClient {
        RealtimeClient(configuration: .mainBundle)
    }

    deinit {
        continuation.finish()
    }

    func connect(accessToken: String) async {
        guard !accessToken.isEmpty else { return }
        
        stopped = false
        if self.accessToken != nil {
            await disconnect()
            stopped = false
        }
        self.accessToken = accessToken
        reconnectAttempt = 0
        reconnectTask?.cancel()
        await openConnection()
    }

    func disconnect() {
        stopped = true
        accessToken = nil
        desiredSubscriptions.removeAll()
        reconnectTask?.cancel()
        reconnectTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        cancelHeartbeat()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        setState(.disconnected)
    }

    func subscribe(to chatID: UUID) async {
        desiredSubscriptions.insert(chatID)
        guard case .connected = state else { return }
        _ = await send(.subscribe(chatID: chatID))
    }

    func unsubscribe(from chatID: UUID) async {
        desiredSubscriptions.remove(chatID)
        guard case .connected = state else { return }
        _ = await send(.unsubscribe(chatID: chatID))
    }

    @discardableResult
    func send(_ command: RealtimeCommand) async -> Bool {
        guard let socket, !stopped else { return false }

        do {
            let data = try encoder.encode(command)
            try await socket.send(.data(data))
            return true
        } catch {
            await handleDisconnect(for: socket)
            return false
        }
    }

    private func openConnection() async {
        guard !stopped, let accessToken else { return }

        guard let webSocketURL = try? configuration.webSocketURL() else {
            stopped = true
            setState(.rejected("invalid_api_configuration"))
            return
        }

        cancelHeartbeat()
        receiveTask?.cancel()
        receiveTask = nil
        socket?.cancel(with: .goingAway, reason: nil)

        let nextSocket = urlSession.webSocketTask(with: webSocketURL)
        socket = nextSocket
        setState(.connecting)
        nextSocket.resume()

        guard await send(.authenticate(token: accessToken)) else { return }
        receiveTask = Task { [weak self, weak nextSocket] in
            guard let self, let nextSocket else { return }
            await self.receiveMessages(for: nextSocket)
        }
    }

    private func receiveMessages(for activeSocket: URLSessionWebSocketTask) async {
        while !stopped, socket === activeSocket {
            do {
                let message = try await activeSocket.receive()
                let data: Data
                switch message {
                case let .data(value):
                    data = value
                case let .string(value):
                    data = Data(value.utf8)
                @unknown default:
                    continue
                }

                let event = try decoder.decode(RealtimeEvent.self, from: data)
                await handle(event: event, activeSocket: activeSocket)
            } catch {
                await handleDisconnect(for: activeSocket)
                return
            }
        }
    }

    private func handle(event: RealtimeEvent, activeSocket: URLSessionWebSocketTask) async {
        switch event.event {
        case "connection.authenticated":
            reconnectAttempt = 0
            setState(.connected)
            startHeartbeat(for: activeSocket)
            for chatID in desiredSubscriptions {
                _ = await send(.subscribe(chatID: chatID))
            }
        case "connection.rejected":
            stopped = true
            cancelHeartbeat()
            activeSocket.cancel(with: .policyViolation, reason: nil)
            setState(.rejected(event.reason ?? "connection_rejected"))
        case "pong":
            pongTimeoutTask?.cancel()
            pongTimeoutTask = nil
        default:
            continuation.yield(.event(event))
        }
    }

    private func startHeartbeat(for activeSocket: URLSessionWebSocketTask) {
        cancelHeartbeat()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: .seconds(25))
                } catch {
                    return
                }
                await self?.sendPing(for: activeSocket)
            }
        }
    }

    private func sendPing(for activeSocket: URLSessionWebSocketTask) async {
        guard socket === activeSocket, !stopped else { return }
        guard await send(RealtimeCommand(event: "ping", token: nil, platform: nil, chatID: nil)) else { return }

        pongTimeoutTask?.cancel()
        pongTimeoutTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(10))
            } catch {
                return
            }
            await self?.handleDisconnect(for: activeSocket)
        }
    }

    private func handleDisconnect(for inactiveSocket: URLSessionWebSocketTask) async {
        guard socket === inactiveSocket, !stopped else { return }

        cancelHeartbeat()
        socket = nil
        receiveTask?.cancel()
        receiveTask = nil
        inactiveSocket.cancel(with: .goingAway, reason: nil)
        setState(.disconnected)
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard !stopped, reconnectTask == nil else { return }

        let delay = min(pow(2.0, Double(reconnectAttempt)), 15)
        reconnectAttempt += 1
        reconnectTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            await self?.reconnect()
        }
    }

    private func reconnect() async {
        reconnectTask = nil
        await openConnection()
    }

    private func cancelHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        pongTimeoutTask?.cancel()
        pongTimeoutTask = nil
    }

    private func setState(_ nextState: RealtimeConnectionState) {
        state = nextState
        continuation.yield(.connectionState(nextState))
    }
}
