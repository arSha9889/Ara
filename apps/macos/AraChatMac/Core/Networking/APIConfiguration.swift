import Foundation

struct APIConfiguration: Sendable {
    let baseURL: URL?

    init(baseURL: URL?) {
        self.baseURL = baseURL
    }

    init(baseURLString: String?) {
        let trimmedValue = baseURLString?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalizedValue = trimmedValue.hasSuffix("/") ? String(trimmedValue.dropLast()) : trimmedValue
        self.baseURL = URL(string: normalizedValue)
    }

    static let mainBundle = APIConfiguration(
        baseURLString: Bundle.main.object(forInfoDictionaryKey: "AraChatAPIBaseURL") as? String
    )

    func url(for path: String) throws -> URL {
        guard let baseURL else {
            throw APIError.misconfigured
        }

        return baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }

    func webSocketURL() throws -> URL {
        guard var components = URLComponents(url: try url(for: "/ws"), resolvingAgainstBaseURL: false) else {
            throw APIError.misconfigured
        }

        switch components.scheme {
        case "http":
            components.scheme = "ws"
        case "https":
            components.scheme = "wss"
        default:
            throw APIError.misconfigured
        }

        guard let webSocketURL = components.url else {
            throw APIError.misconfigured
        }
        return webSocketURL
    }
}
