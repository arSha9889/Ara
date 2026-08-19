from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.services.call_signaling import CallSignalingError, CallSignalingManager, normalize_call_signal
from app.services.turn_credentials import create_turn_rest_credentials


def test_normalize_call_signal_keeps_only_supported_ice_fields() -> None:
    normalized = normalize_call_signal({
        'event': 'call.ice_candidate',
        'call_id': 'call-123',
        'candidate': {
            'candidate': 'candidate:1 1 udp 1 203.0.113.1 3478 typ relay',
            'sdpMid': '0',
            'sdpMLineIndex': 0,
            'usernameFragment': 'fragment',
            'unexpected': 'discarded',
        },
    })

    assert normalized == {
        'event': 'call.ice_candidate',
        'call_id': 'call-123',
        'candidate': {
            'candidate': 'candidate:1 1 udp 1 203.0.113.1 3478 typ relay',
            'sdpMid': '0',
            'sdpMLineIndex': 0,
            'usernameFragment': 'fragment',
        },
    }


def test_normalize_call_signal_rejects_invalid_sdp() -> None:
    with pytest.raises(CallSignalingError, match='invalid_session_description'):
        normalize_call_signal({
            'event': 'call.offer',
            'call_id': 'call-123',
            'description': {'type': 'answer', 'sdp': 'not-an-offer'},
        })


@pytest.mark.anyio
async def test_call_signaling_allows_only_the_direct_call_participants() -> None:
    manager = CallSignalingManager()
    chat_id = uuid4()
    caller_id = uuid4()
    callee_id = uuid4()

    await manager.start_call('call-123', chat_id, caller_id, callee_id)
    assert await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.accept') == caller_id
    assert await manager.relay_call_signal('call-123', chat_id, caller_id, 'call.offer') == callee_id
    assert await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.answer') == caller_id
    assert await manager.relay_call_signal('call-123', chat_id, caller_id, 'call.ice_candidate') == callee_id

    with pytest.raises(CallSignalingError, match='call_not_available'):
        await manager.relay_call_signal('call-123', chat_id, uuid4(), 'call.end')


@pytest.mark.anyio
async def test_call_signaling_releases_users_after_call_ends() -> None:
    manager = CallSignalingManager()
    chat_id = uuid4()
    caller_id = uuid4()
    callee_id = uuid4()

    await manager.start_call('call-123', chat_id, caller_id, callee_id)
    assert await manager.relay_call_signal('call-123', chat_id, caller_id, 'call.cancel') == callee_id

    replacement = await manager.start_call('call-456', chat_id, caller_id, callee_id)
    assert replacement.call_id == 'call-456'


def test_turn_rest_credentials_are_deterministic_for_a_fixed_time() -> None:
    user_id = UUID('12345678-1234-5678-1234-567812345678')
    now = datetime(2026, 8, 19, 12, 0, tzinfo=timezone.utc)

    username, credential, expires_at = create_turn_rest_credentials(user_id, 'shared-secret', 3600, now)

    assert username == f'{int(expires_at.timestamp())}:{user_id}'
    assert credential == 'hpw2m8v8wnLIGOrGMGuLcsicBjE='
    assert expires_at == datetime(2026, 8, 19, 13, 0, tzinfo=timezone.utc)
