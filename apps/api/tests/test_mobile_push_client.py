import json
from datetime import datetime, timezone
from io import BytesIO
from urllib.error import HTTPError
from uuid import uuid4

import pytest

from app.core.config import Settings, settings
from app.schemas.chats import NotificationOut
from app.services import mobile_push_client
from app.services.notification_service import _mobile_push_data


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def _configure_rustore(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'mobile_push_enabled', True)
    monkeypatch.setattr(settings, 'rustore_push_project_id', 'rustore-project')
    monkeypatch.setattr(settings, 'rustore_push_service_token', 'rustore-service-token')
    monkeypatch.setattr(settings, 'fcm_push_project_id', '')
    monkeypatch.setattr(settings, 'fcm_service_account_file', '')


def test_mobile_push_is_enabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv('NEXUS_MOBILE_PUSH_ENABLED', raising=False)

    assert Settings(_env_file=None).mobile_push_enabled


@pytest.mark.anyio
async def test_mobile_push_sends_only_neutral_data_to_rustore(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_rustore(monkeypatch)
    captured = {}

    def fake_urlopen(request, timeout: int):
        captured['url'] = request.full_url
        captured['payload'] = json.loads(request.data)
        captured['timeout'] = timeout
        return FakeResponse(b'{"status":"OK"}')

    monkeypatch.setattr(mobile_push_client, 'urlopen', fake_urlopen)

    result = await mobile_push_client.send_mobile_push(
        {'rustore': ['rustore-token-123456789']},
        {
            'kind': 'message',
            'notification_id': 'notification-1',
            'chat_id': 'chat-1',
            'message_id': 'message-1',
        },
    )

    assert result.delivered
    assert captured['url'] == mobile_push_client.UNIVERSAL_PUSH_URL
    assert captured['timeout'] == settings.mobile_push_timeout_seconds
    assert captured['payload'] == {
        'providers': {
            'rustore': {
                'project_id': 'rustore-project',
                'auth_token': 'rustore-service-token',
            },
        },
        'tokens': {'rustore': ['rustore-token-123456789']},
        'message': {
            'data': {
                'kind': 'message',
                'notification_id': 'notification-1',
                'chat_id': 'chat-1',
                'message_id': 'message-1',
            },
        },
    }
    assert 'notification' not in captured['payload']['message']


@pytest.mark.anyio
async def test_mobile_push_is_not_sent_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_rustore(monkeypatch)
    monkeypatch.setattr(settings, 'mobile_push_enabled', False)
    monkeypatch.setattr(mobile_push_client, 'urlopen', lambda *_args, **_kwargs: pytest.fail('must not send'))

    result = await mobile_push_client.send_mobile_push(
        {'rustore': ['rustore-token-123456789']},
        {'kind': 'system', 'notification_id': 'notification-1'},
    )

    assert not result.delivered


@pytest.mark.anyio
async def test_mobile_push_groups_rustore_and_fcm_tokens(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _configure_rustore(monkeypatch)
    service_account_file = tmp_path / 'fcm-service-account.json'
    service_account_file.write_text('{}')
    monkeypatch.setattr(settings, 'fcm_push_project_id', 'firebase-project')
    monkeypatch.setattr(settings, 'fcm_service_account_file', str(service_account_file))

    async def fake_fcm_access_token() -> str:
        return 'fcm-oauth-token'

    monkeypatch.setattr(mobile_push_client, '_get_fcm_access_token', fake_fcm_access_token)
    captured = {}

    def fake_urlopen(request, timeout: int):
        captured['payload'] = json.loads(request.data)
        return FakeResponse(b'{"status":"OK"}')

    monkeypatch.setattr(mobile_push_client, 'urlopen', fake_urlopen)

    result = await mobile_push_client.send_mobile_push(
        {
            'rustore': ['rustore-token-123456789'],
            'fcm': ['fcm-token-123456789'],
        },
        {'kind': 'system', 'notification_id': 'notification-1'},
    )

    assert result.delivered
    assert captured['payload']['tokens'] == {
        'rustore': ['rustore-token-123456789'],
        'fcm': ['fcm-token-123456789'],
    }
    assert captured['payload']['providers']['fcm'] == {
        'project_id': 'firebase-project',
        'auth_token': 'fcm-oauth-token',
    }


@pytest.mark.anyio
async def test_mobile_push_returns_only_confirmed_invalid_token_prefixes(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_rustore(monkeypatch)

    def fake_urlopen(request, timeout: int):
        raise HTTPError(
            request.full_url,
            400,
            'Bad Request',
            None,
            BytesIO(b'{"errors":["rustore: invalid tokens: abcdef"]}'),
        )

    monkeypatch.setattr(mobile_push_client, 'urlopen', fake_urlopen)

    result = await mobile_push_client.send_mobile_push(
        {'rustore': ['abcdef-token-123456789', 'other-token-123456789']},
        {'kind': 'system', 'notification_id': 'notification-1'},
    )

    assert not result.delivered
    assert result.invalid_token_prefixes == {'rustore': frozenset({'abcdef'})}


def test_mobile_push_data_excludes_notification_text_and_url() -> None:
    notification_id = uuid4()
    chat_id = uuid4()
    message_id = uuid4()
    notification = NotificationOut(
        id=uuid4(),
        notification_id=notification_id,
        kind='message',
        chat_id=chat_id,
        message_id=message_id,
        title='Private sender name',
        body='Private message text must not leave the server',
        url=f'/app/chats/{chat_id}',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    assert _mobile_push_data(notification) == {
        'kind': 'message',
        'notification_id': str(notification_id),
        'chat_id': str(chat_id),
        'message_id': str(message_id),
    }
