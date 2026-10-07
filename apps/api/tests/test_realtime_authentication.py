from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app import main
from app.domain.tokens import AccessTokenClaims
from app.models.chats import Chat
from app.models.users import User
from app.services.call_signaling import CallSignalingManager
from app.services.realtime_manager import RealtimeManager
from app.services.realtime_revocation_service import RealtimeRevocationService, SESSION_REVOKED_CLOSE_CODE


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
    session_id = uuid4()
    claims = AccessTokenClaims(user_id, session_id, datetime.now(timezone.utc))
    websocket = WebSocketStub({'event': 'connection.authenticate', 'token': 'access-token'})

    monkeypatch.setattr(main, 'decode_access_token', lambda token: claims if token == 'access-token' else None)

    async def active_session(candidate: AccessTokenClaims) -> bool:
        return candidate == claims

    monkeypatch.setattr(main, '_is_active_access_token_session', active_session)

    assert await main._authenticate_websocket(websocket) == claims
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

    def reject_token(_: str) -> AccessTokenClaims:
        raise ValueError('Invalid access token')

    monkeypatch.setattr(main, 'decode_access_token', reject_token)

    assert await main._authenticate_websocket(websocket) is None
    assert websocket.sent == [{'event': 'connection.rejected', 'reason': 'invalid_token'}]
    assert websocket.close_codes == [1008]


class ScalarResultStub:
    def __init__(self, values: list[UUID]) -> None:
        self.values = values

    def scalars(self) -> 'ScalarResultStub':
        return self

    def __iter__(self):
        return iter(self.values)


class PresenceSessionStub:
    def __init__(self, chat: Chat, peer: User, participant_ids: list[UUID]) -> None:
        self.chat = chat
        self.peer = peer
        self.participant_ids = participant_ids

    async def __aenter__(self) -> 'PresenceSessionStub':
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def get(self, model: type[object], identifier: UUID) -> object | None:
        if model is Chat:
            return self.chat
        if model is User and identifier == self.peer.id:
            return self.peer
        return None

    async def execute(self, statement: object) -> ScalarResultStub:
        return ScalarResultStub(self.participant_ids)


class BroadcastWebSocketStub:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)


class RevocableWebSocketStub(BroadcastWebSocketStub):
    def __init__(self) -> None:
        super().__init__()
        self.close_codes: list[int] = []

    async def close(self, code: int = 1000) -> None:
        self.close_codes.append(code)


@pytest.mark.anyio
async def test_direct_peer_presence_snapshot_uses_online_state_and_persisted_last_seen(monkeypatch: pytest.MonkeyPatch) -> None:
    user_id = uuid4()
    peer_id = uuid4()
    chat_id = uuid4()
    last_seen_at = datetime(2026, 9, 12, 8, 0, tzinfo=timezone.utc)
    chat = Chat(id=chat_id, type='direct')
    peer = User(id=peer_id, nexus_id='peer', last_seen_at=last_seen_at)

    monkeypatch.setattr(
        main,
        'AsyncSessionLocal',
        lambda: PresenceSessionStub(chat, peer, [user_id, peer_id]),
    )

    async def interaction_not_blocked(*_: object) -> bool:
        return False

    monkeypatch.setattr(main, 'is_user_interaction_blocked', interaction_not_blocked)
    monkeypatch.setattr(main.realtime_manager, 'is_user_online', lambda candidate: candidate == peer_id)

    assert await main._direct_peer_presence(user_id, chat_id) == {
        'event': 'presence.status',
        'chat_id': str(chat_id),
        'user_id': str(peer_id),
        'is_online': True,
        'last_seen_at': None,
    }

    monkeypatch.setattr(main.realtime_manager, 'is_user_online', lambda _: False)

    assert await main._direct_peer_presence(user_id, chat_id) == {
        'event': 'presence.status',
        'chat_id': str(chat_id),
        'user_id': str(peer_id),
        'is_online': False,
        'last_seen_at': last_seen_at.isoformat(),
    }


@pytest.mark.anyio
async def test_chat_broadcast_can_exclude_all_connections_for_the_sender() -> None:
    manager = RealtimeManager()
    chat_id = uuid4()
    sender_id = uuid4()
    recipient_id = uuid4()
    sender_socket = BroadcastWebSocketStub()
    sender_second_socket = BroadcastWebSocketStub()
    recipient_socket = BroadcastWebSocketStub()

    await manager.connect_user(sender_socket, sender_id, uuid4())
    await manager.connect_user(sender_second_socket, sender_id, uuid4())
    await manager.connect_user(recipient_socket, recipient_id, uuid4())
    await manager.subscribe(sender_socket, chat_id)
    await manager.subscribe(sender_second_socket, chat_id)
    await manager.subscribe(recipient_socket, chat_id)

    payload = {'event': 'typing.started', 'chat_id': str(chat_id), 'user_id': str(sender_id)}
    await manager.broadcast_to_chat(chat_id, payload, exclude_user_id=sender_id)

    assert sender_socket.sent == []
    assert sender_second_socket.sent == []
    assert recipient_socket.sent == [payload]


@pytest.mark.anyio
async def test_offline_call_invite_is_queued_and_sent_as_a_mobile_push(monkeypatch: pytest.MonkeyPatch) -> None:
    caller_id = uuid4()
    callee_id = uuid4()
    chat_id = uuid4()
    websocket = WebSocketStub({})
    manager = CallSignalingManager()
    pushes: list[dict[str, object]] = []
    broadcasts: list[dict[str, object]] = []

    async def direct_call_peer(user_id: UUID, candidate_chat_id: UUID) -> UUID | None:
        return callee_id if user_id == caller_id and candidate_chat_id == chat_id else None

    async def send_push(**payload: object) -> None:
        pushes.append(payload)

    async def broadcast_to_user(user_id: UUID, payload: dict) -> None:
        broadcasts.append({'user_id': user_id, 'payload': payload})

    monkeypatch.setattr(main, '_get_direct_call_peer', direct_call_peer)
    monkeypatch.setattr(main, '_send_call_invite_push', send_push)
    monkeypatch.setattr(main, 'call_signaling_manager', manager)
    monkeypatch.setattr(main.realtime_manager, 'broadcast_to_user', broadcast_to_user)
    monkeypatch.setattr(main.realtime_manager, 'is_user_online', lambda _: False)

    await main._handle_call_signal(websocket, {
        'event': 'call.invite',
        'call_id': 'call-123',
        'call_type': 'video',
        'chat_id': str(chat_id),
    }, caller_id)

    assert websocket.sent == []
    assert broadcasts == [{
        'user_id': callee_id,
        'payload': {
            'event': 'call.invite',
            'call_id': 'call-123',
            'call_type': 'video',
            'chat_id': str(chat_id),
            'user_id': str(caller_id),
        },
    }]
    assert pushes == [{
        'recipient_user_id': callee_id,
        'caller_user_id': caller_id,
        'chat_id': chat_id,
        'call_id': 'call-123',
        'call_type': 'video',
    }]
    assert (await manager.get_pending_incoming_call(callee_id)).call_id == 'call-123'


@pytest.mark.anyio
async def test_pending_video_call_invite_is_resent_when_callee_connects(monkeypatch: pytest.MonkeyPatch) -> None:
    caller_id = uuid4()
    callee_id = uuid4()
    chat_id = uuid4()
    websocket = WebSocketStub({})
    manager = CallSignalingManager()
    await manager.start_call('call-123', chat_id, caller_id, callee_id, 'video')
    monkeypatch.setattr(main, 'call_signaling_manager', manager)

    await main._send_pending_call_invite(websocket, callee_id)

    assert websocket.sent == [{
        'event': 'call.invite',
        'call_id': 'call-123',
        'call_type': 'video',
        'chat_id': str(chat_id),
        'user_id': str(caller_id),
    }]


@pytest.mark.anyio
async def test_session_revocation_closes_only_connections_for_that_session() -> None:
    manager = RealtimeManager()
    user_id = uuid4()
    revoked_session_id = uuid4()
    active_session_id = uuid4()
    revoked_socket = RevocableWebSocketStub()
    active_socket = RevocableWebSocketStub()

    await manager.connect_user(revoked_socket, user_id, revoked_session_id)
    await manager.connect_user(active_socket, user_id, active_session_id)

    await manager.disconnect_session(revoked_session_id, code=SESSION_REVOKED_CLOSE_CODE)

    assert revoked_socket.close_codes == [SESSION_REVOKED_CLOSE_CODE]
    assert active_socket.close_codes == []


@pytest.mark.anyio
async def test_remote_session_revocation_closes_the_local_session_connection() -> None:
    manager = RealtimeManager()
    local_session_id = uuid4()
    socket = RevocableWebSocketStub()
    await manager.connect_user(socket, uuid4(), local_session_id)
    service = RealtimeRevocationService(manager, redis=None, instance_id='instance-a')

    await service._handle_message(
        f'{{"source":"instance-b","scope":"session","id":"{local_session_id}"}}',
    )

    assert socket.close_codes == [SESSION_REVOKED_CLOSE_CODE]
