from uuid import UUID, uuid4

import pytest

from app import main


class WebSocketStub:
    def __init__(self, message: object) -> None:
        self.message = message
        self.sent: list[dict] = []
        self.close_codes: list[int] = []

    async def receive_json(self) -> object:
        return self.message

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)

    async def close(self, code: int = 1000) -> None:
        self.close_codes.append(code)


class InvalidJsonWebSocketStub(WebSocketStub):
    async def receive_json(self) -> object:
        raise ValueError('Invalid JSON')


@pytest.mark.anyio
async def test_websocket_authenticates_only_with_the_first_authentication_message(monkeypatch: pytest.MonkeyPatch) -> None:
    user_id = uuid4()
    websocket = WebSocketStub({'event': 'connection.authenticate', 'token': 'access-token'})

    monkeypatch.setattr(main, 'decode_access_token', lambda token: user_id if token == 'access-token' else UUID(int=0))

    async def active_user(candidate: UUID) -> bool:
        return candidate == user_id

    monkeypatch.setattr(main, '_is_active_user', active_user)

    assert await main._authenticate_websocket(websocket) == user_id
    assert websocket.sent == [{'event': 'connection.authenticated', 'user_id': str(user_id)}]
    assert websocket.close_codes == []


@pytest.mark.anyio
async def test_websocket_rejects_events_before_authentication() -> None:
    websocket = WebSocketStub({'event': 'ping'})

    assert await main._authenticate_websocket(websocket) is None
    assert websocket.sent == [{'event': 'connection.rejected', 'reason': 'authentication_required'}]
    assert websocket.close_codes == [1008]


@pytest.mark.anyio
async def test_websocket_rejects_an_invalid_first_json_message() -> None:
    websocket = InvalidJsonWebSocketStub(None)

    assert await main._authenticate_websocket(websocket) is None
    assert websocket.sent == [{'event': 'connection.rejected', 'reason': 'invalid_authentication_message'}]
    assert websocket.close_codes == [1008]


@pytest.mark.anyio
async def test_websocket_rejects_missing_access_token() -> None:
    websocket = WebSocketStub({'event': 'connection.authenticate'})

    assert await main._authenticate_websocket(websocket) is None
    assert websocket.sent == [{'event': 'connection.rejected', 'reason': 'missing_token'}]
    assert websocket.close_codes == [1008]


@pytest.mark.anyio
async def test_websocket_rejects_invalid_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    websocket = WebSocketStub({'event': 'connection.authenticate', 'token': 'invalid-token'})

    def reject_token(_: str) -> UUID:
        raise ValueError('Invalid access token')

    monkeypatch.setattr(main, 'decode_access_token', reject_token)

    assert await main._authenticate_websocket(websocket) is None
    assert websocket.sent == [{'event': 'connection.rejected', 'reason': 'invalid_token'}]
    assert websocket.close_codes == [1008]
