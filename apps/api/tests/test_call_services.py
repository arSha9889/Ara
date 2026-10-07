from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.services.call_signaling import CallSignalingError, CallSignalingManager, normalize_call_signal
from app.services.turn_credentials import create_turn_rest_credentials, get_turn_ice_configuration


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


def test_normalize_call_invite_preserves_video_type_and_defaults_to_audio() -> None:
    assert normalize_call_signal({
        'event': 'call.invite',
        'call_id': 'call-video-123',
        'call_type': 'video',
    }) == {
        'event': 'call.invite',
        'call_id': 'call-video-123',
        'call_type': 'video',
    }
    assert normalize_call_signal({
        'event': 'call.invite',
        'call_id': 'call-audio-123',
    })['call_type'] == 'audio'

    with pytest.raises(CallSignalingError, match='invalid_call_type'):
        normalize_call_signal({
            'event': 'call.invite',
            'call_id': 'call-unsupported-123',
            'call_type': 'screen',
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
async def test_call_signaling_allows_the_other_participant_to_renegotiate_an_active_call() -> None:
    manager = CallSignalingManager()
    chat_id = uuid4()
    caller_id = uuid4()
    callee_id = uuid4()

    await manager.start_call('call-123', chat_id, caller_id, callee_id)
    await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.accept')
    await manager.relay_call_signal('call-123', chat_id, caller_id, 'call.offer')
    await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.answer')

    assert await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.offer') == caller_id
    assert await manager.relay_call_signal('call-123', chat_id, caller_id, 'call.answer') == callee_id


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


@pytest.mark.anyio
async def test_call_signaling_keeps_a_pending_video_invite_for_an_offline_callee() -> None:
    manager = CallSignalingManager()
    chat_id = uuid4()
    caller_id = uuid4()
    callee_id = uuid4()

    await manager.start_call('call-123', chat_id, caller_id, callee_id, 'video')

    pending_call = await manager.get_pending_incoming_call(callee_id)
    assert pending_call is not None
    assert pending_call.call_id == 'call-123'
    assert pending_call.call_type == 'video'
    assert pending_call.caller_user_id == caller_id

    await manager.relay_call_signal('call-123', chat_id, callee_id, 'call.accept')
    assert await manager.get_pending_incoming_call(callee_id) is None


@pytest.mark.anyio
async def test_call_signaling_ends_call_when_one_participant_blocks_the_other() -> None:
    manager = CallSignalingManager()
    chat_id = uuid4()
    caller_id = uuid4()
    callee_id = uuid4()

    await manager.start_call('call-123', chat_id, caller_id, callee_id)
    ended = await manager.end_call_between_users(caller_id, callee_id)

    assert ended and ended.call_id == 'call-123'
    replacement = await manager.start_call('call-456', chat_id, caller_id, callee_id)
    assert replacement.call_id == 'call-456'


def test_turn_rest_credentials_are_deterministic_for_a_fixed_time() -> None:
    user_id = UUID('12345678-1234-5678-1234-567812345678')
    now = datetime(2026, 8, 19, 12, 0, tzinfo=timezone.utc)

    username, credential, expires_at = create_turn_rest_credentials(user_id, 'shared-secret', 3600, now)

    assert username == f'{int(expires_at.timestamp())}:{user_id}'
    assert credential == 'hpw2m8v8wnLIGOrGMGuLcsicBjE='
    assert expires_at == datetime(2026, 8, 19, 13, 0, tzinfo=timezone.utc)


def test_turn_ice_configuration_uses_temporary_credentials_for_both_transports(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import turn_credentials

    user_id = UUID('12345678-1234-5678-1234-567812345678')
    monkeypatch.setattr(turn_credentials.settings, 'turn_public_host', 'turn.example.ru')
    monkeypatch.setattr(turn_credentials.settings, 'turn_shared_secret', 'shared-secret')
    monkeypatch.setattr(turn_credentials.settings, 'turn_port', 3478)
    monkeypatch.setattr(turn_credentials.settings, 'turn_credential_ttl_seconds', 900)

    configuration = get_turn_ice_configuration(user_id)

    assert configuration['ice_transport_policy'] == 'relay'
    assert configuration['expires_at'] > datetime.now(timezone.utc)
    assert configuration['ice_servers'] == [{
        'urls': [
            'turn:turn.example.ru:3478?transport=udp',
            'turn:turn.example.ru:3478?transport=tcp',
        ],
        'username': configuration['ice_servers'][0]['username'],
        'credential': configuration['ice_servers'][0]['credential'],
    }]
    assert configuration['ice_servers'][0]['username'].endswith(f':{user_id}')
    assert configuration['ice_servers'][0]['credential']
