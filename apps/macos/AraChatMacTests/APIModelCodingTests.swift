import XCTest
@testable import AraChat

final class APIModelCodingTests: XCTestCase {
    func testLoginRequestUsesSnakeCaseKeys() throws {
        let request = LoginRequest(
            identifier: "person@example.com",
            password: "secret",
            deviceID: "new-device-id"
        )
        let encoder = JSONEncoder()

        let payload = try JSONSerialization.jsonObject(with: encoder.encode(request)) as? [String: String]

        XCTAssertEqual(
            payload,
            [
                "identifier": "person@example.com",
                "password": "secret",
                "device_id": "new-device-id",
            ]
        )
    }

    func testTokenPairDecodesBackendPayload() throws {
        let data = Data("""
        {
          "access_token": "access-token",
          "refresh_token": "refresh-token",
          "user": {
            "id": "D9B8CEB8-7A78-4BC3-9FAE-F161C7E263DC",
            "nexus_id": "1234567890123456",
            "telegram_id": null,
            "status": "active",
            "is_official": false,
            "legal_documents_current": true,
            "vpn_enabled": false,
            "profile": {
              "display_name": "Пользователь",
              "username": "user123",
              "avatar_type": "built_in",
              "avatar_ref": "animal-01",
              "optional_phone": null,
              "email": "person@example.com",
              "email_verified": true,
              "registration_country": "RU",
              "phone_public": false,
              "language": "ru",
              "design_theme": "halo",
              "current_mode": "normal"
            }
          }
        }
        """.utf8)
        let decoder = JSONDecoder()

        let response = try decoder.decode(TokenPairResponse.self, from: data)

        XCTAssertEqual(response.accessToken, "access-token")
        XCTAssertEqual(response.refreshToken, "refresh-token")
        XCTAssertEqual(response.user.profile?.username, "user123")
    }

    func testWebSocketURLPreservesHostAndUsesWebSocketScheme() throws {
        let productionConfiguration = APIConfiguration(baseURLString: "https://aramsg.ru")
        let developmentConfiguration = APIConfiguration(baseURLString: "http://localhost:8000/")

        XCTAssertEqual(try productionConfiguration.webSocketURL().absoluteString, "wss://aramsg.ru/ws")
        XCTAssertEqual(try developmentConfiguration.webSocketURL().absoluteString, "ws://localhost:8000/ws")
    }

    func testWebSocketAuthenticationIdentifiesDesktopPlatform() throws {
        let payload = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(RealtimeCommand.authenticate(token: "access-token"))
        ) as? [String: String]

        XCTAssertEqual(
            payload,
            [
                "event": "connection.authenticate",
                "token": "access-token",
                "platform": "desktop",
            ]
        )
    }

    func testChatDecodesBackendPayload() throws {
        let data = Data("""
        {
          "id": "D9B8CEB8-7A78-4BC3-9FAE-F161C7E263DC",
          "type": "direct",
          "created_at": "2026-10-31T12:00:00Z",
          "updated_at": "2026-10-31T12:00:00Z",
          "last_message_id": null,
          "pinned_message_id": null,
          "participant_ids": ["D9B8CEB8-7A78-4BC3-9FAE-F161C7E263DC"],
          "peer": null,
          "last_message": null,
          "pinned_message": null,
          "unread_count": 0,
          "title": null,
          "slug": null,
          "description": null,
          "avatar_ref": null,
          "is_official": false,
          "is_private": false,
          "is_subscribed": true,
          "subscriber_count": 0,
          "can_post": false,
          "current_role": null,
          "notifications_enabled": true,
          "wallpaper_id": "default"
        }
        """.utf8)

        let chat = try JSONDecoder().decode(Chat.self, from: data)

        XCTAssertEqual(chat.type, "direct")
        XCTAssertEqual(chat.unreadCount, 0)
        XCTAssertEqual(chat.wallpaperID, "default")
    }
}
