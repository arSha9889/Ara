import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

enum APIError: LocalizedError, Sendable {
    case misconfigured
    case network(String)
    case invalidResponse
    case server(status: Int, detail: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .misconfigured:
            return String(localized: "error.apiConfiguration")
        case .network:
            return String(localized: "error.network")
        case .invalidResponse, .decoding:
            return String(localized: "error.unexpectedResponse")
        case let .server(_, detail):
            return detail
        }
    }
}

private struct ServerFailure: Decodable {
    let detail: String?
}

actor APIClient {
    private let configuration: APIConfiguration
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(configuration: APIConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session

        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    func request<Response: Decodable & Sendable>(
        path: String,
        method: HTTPMethod = .get,
        accessToken: String? = nil
    ) async throws -> Response {
        try await execute(path: path, method: method, body: nil, accessToken: accessToken)
    }

    func request<Response: Decodable & Sendable, Body: Encodable & Sendable>(
        path: String,
        method: HTTPMethod,
        body: Body,
        accessToken: String? = nil
    ) async throws -> Response {
        let data: Data
        do {
            data = try encoder.encode(body)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }

        return try await execute(path: path, method: method, body: data, accessToken: accessToken)
    }

    private func execute<Response: Decodable & Sendable>(
        path: String,
        method: HTTPMethod,
        body: Data?,
        accessToken: String?
    ) async throws -> Response {
        var request = URLRequest(url: try configuration.url(for: path))
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = body

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            let detail = (try? decoder.decode(ServerFailure.self, from: data))?.detail
                ?? String(localized: "error.serverResponse")
            throw APIError.server(status: httpResponse.statusCode, detail: detail)
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}
