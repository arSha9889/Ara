import XCTest
@testable import AraChat

final class AppStoreTests: XCTestCase {
    func testSendTrimsMessageAndUpdatesConversationPreview() throws {
        let store = AppStore()
        let conversation = try XCTUnwrap(store.conversations.first)
        let messageCount = conversation.messages.count

        store.send("  Проверка  ", to: conversation.id)

        let updated = try XCTUnwrap(store.conversation(id: conversation.id))
        XCTAssertEqual(updated.messages.count, messageCount + 1)
        XCTAssertEqual(updated.messages.last?.text, "Проверка")
        XCTAssertEqual(updated.messages.last?.delivery, .pending)
        XCTAssertEqual(updated.preview, "Проверка")
        XCTAssertEqual(updated.time, "сейчас")
    }

    func testSendIgnoresWhitespaceOnlyMessage() throws {
        let store = AppStore()
        let conversation = try XCTUnwrap(store.conversations.first)

        store.send(" \n  ", to: conversation.id)

        let updated = try XCTUnwrap(store.conversation(id: conversation.id))
        XCTAssertEqual(updated.messages.count, conversation.messages.count)
        XCTAssertEqual(updated.preview, conversation.preview)
    }

    func testAraChatIDIsGroupedInBlocksOfFourDigits() {
        XCTAssertEqual(SearchPerson.samples[0].formattedAraChatID, "7318 4592 0176 4328")
    }
}
