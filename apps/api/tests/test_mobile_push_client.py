import json
from datetime import datetime, timezone
from io import BytesIO
from urllib.error import HTTPError
from uuid import uuid4

import pytest

from app.core.config import Settings, settings
from app.models.chats import MobilePushToken, Notification
from app.schemas.chats import NotificationOut, NotificationTargetOut
from app.services import mobile_push_client
from app.services.notification_service import _mobile_call_push_data, _mobile_push_data, _mobile_tokens_by_provider, _notification_out


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
    monkeypatch.setattr(settings, 'fcm_push_enabled', False)
    monkeypatch.setattr(settings, 'rustore_push_project_id', 'rustore-project')
    monkeypatch.setattr(settings, 'rustore_push_service_token', 'rustore-service-token')
    monkeypatch.setattr(settings, 'fcm_push_project_id', '')
    monkeypatch.setattr(settings, 'fcm_service_account_file', '')


def test_mobile_push_is_enabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv('NEXUS_MOBILE_PUSH_ENABLED', raising=False)

    assert Settings(_env_file=None).mobile_push_enabled
    assert not Settings(_env_file=None).fcm_push_enabled


@pytest.mark.anyio
async def test_mobile_push_sends_sender_and_message_text_to_rustore(monkeypatch: pytest.MonkeyPatch) -> None:
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
            'title': 'Ирина',
            'body': 'Встречаемся в семь?',
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
                'title': 'Ирина',
                'body': 'Встречаемся в семь?',
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
        {
            'kind': 'message',
            'notification_id': 'notification-1',
            'chat_id': 'chat-1',
            'title': 'Ирина',
            'body': 'Встречаемся в семь?',
        },
    )

    assert not result.delivered


@pytest.mark.anyio
async def test_mobile_push_excludes_fcm_tokens_while_suspended(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _configure_rustore(monkeypatch)
    service_account_file = tmp_path / 'fcm-service-account.json'
    service_account_file.write_text('{}')
    monkeypatch.setattr(settings, 'fcm_push_project_id', 'firebase-project')
    monkeypatch.setattr(settings, 'fcm_service_account_file', str(service_account_file))

    async def fake_fcm_access_token() -> str:
        pytest.fail('FCM credentials must not be requested while FCM is suspended')

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
        {
            'kind': 'message',
            'notification_id': 'notification-1',
            'chat_id': 'chat-1',
            'title': 'Ирина',
            'body': 'Встречаемся в семь?',
        },
    )

    assert result.delivered
    assert captured['payload']['tokens'] == {
        'rustore': ['rustore-token-123456789'],
    }
    assert 'fcm' not in captured['payload']['providers']


def test_mobile_push_token_grouping_excludes_stored_fcm_tokens_while_suspended(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'fcm_push_enabled', False)
    user_id = uuid4()
    tokens = [
        MobilePushToken(
            user_id=user_id,
            device_id='rustore-device',
            provider='rustore',
            package_name='arachat.messenger',
            token='rustore-token-123456789',
        ),
        MobilePushToken(
            user_id=user_id,
            device_id='legacy-fcm-device',
            provider='fcm',
            package_name='arachat.messenger',
            token='fcm-token-123456789',
        ),
    ]

    assert _mobile_tokens_by_provider(tokens) == {
        'rustore': ['rustore-token-123456789'],
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
        {
            'kind': 'message',
            'notification_id': 'notification-1',
            'chat_id': 'chat-1',
            'title': 'Ирина',
            'body': 'Встречаемся в семь?',
        },
    )

    assert not result.delivered
    assert result.invalid_token_prefixes == {'rustore': frozenset({'abcdef'})}


def test_mobile_push_data_includes_sanitized_sender_and_message_text_without_url() -> None:
    notification_id = uuid4()
    chat_id = uuid4()
    message_id = uuid4()
    notification = NotificationOut(
        id=uuid4(),
        notification_id=notification_id,
        kind='message',
        chat_id=chat_id,
        message_id=message_id,
        target=NotificationTargetOut(kind='message', chat_id=chat_id, message_id=message_id),
        title='  Private\n sender name  ',
        body=' Private\tmessage\ntext ',
        url=f'/app/chats/{chat_id}',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    assert _mobile_push_data(notification) == {
        'kind': 'message',
        'notification_id': str(notification_id),
        'chat_id': str(chat_id),
        'message_id': str(message_id),
        'title': 'Private sender name',
        'body': 'Private message text',
    }


def test_mobile_push_data_skips_non_message_notifications() -> None:
    notification = NotificationOut(
        id=uuid4(),
        notification_id=uuid4(),
        kind='system',
        chat_id=None,
        message_id=None,
        target=NotificationTargetOut(kind='system', section='settings'),
        title='AraChat',
        body='Test push',
        url='/app/settings',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    assert _mobile_push_data(notification) is None


def test_mobile_push_data_skips_messages_without_a_safe_preview() -> None:
    chat_id = uuid4()
    message_id = uuid4()
    notification = NotificationOut(
        id=uuid4(),
        notification_id=uuid4(),
        kind='message',
        chat_id=chat_id,
        message_id=message_id,
        target=NotificationTargetOut(kind='message', chat_id=chat_id, message_id=message_id),
        title='AraChat',
        body='New message',
        url='/app/chats/example',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    assert _mobile_push_data(notification, preview_available=False) is None


def test_notification_out_includes_a_platform_neutral_target() -> None:
    chat_id = uuid4()
    message_id = uuid4()
    notification = Notification(
        id=uuid4(),
        recipient_user_id=uuid4(),
        chat_id=chat_id,
        message_id=message_id,
        support_ticket_id=None,
        announcement_id=None,
        title='AraChat',
        body='New message',
        url=f'/app/chats/{chat_id}',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    result = _notification_out(notification)

    assert result.target.model_dump() == {
        'kind': 'message',
        'chat_id': chat_id,
        'message_id': message_id,
        'support_ticket_id': None,
        'section': None,
    }


@pytest.mark.parametrize(
    ('announcement_id', 'support_ticket_id', 'expected_kind'),
    [
        (uuid4(), None, 'announcement'),
        (None, uuid4(), 'support'),
    ],
)
def test_notification_out_uses_the_canonical_target_kind(
    announcement_id,
    support_ticket_id,
    expected_kind: str,
) -> None:
    chat_id = uuid4() if announcement_id else None
    message_id = uuid4() if announcement_id else None
    notification = Notification(
        id=uuid4(),
        recipient_user_id=uuid4(),
        chat_id=chat_id,
        message_id=message_id,
        support_ticket_id=support_ticket_id,
        announcement_id=announcement_id,
        title='AraChat',
        body='Notification',
        url='/app/example',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )

    result = _notification_out(notification)

    assert result.kind == expected_kind
    assert result.target.kind == expected_kind
    assert result.target.chat_id == chat_id
    assert result.target.message_id == message_id
    assert result.target.support_ticket_id == support_ticket_id


def test_mobile_call_push_data_contains_only_call_signalling_metadata() -> None:
    chat_id = uuid4()

    assert _mobile_call_push_data(
        chat_id=chat_id,
        call_id='call-123',
        call_type='video',
        caller_name='  Ирина\nПетрова  ',
        recipient_language='ru',
    ) == {
        'kind': 'call',
        'call_id': 'call-123',
        'call_type': 'video',
        'chat_id': str(chat_id),
        'title': 'Ирина Петрова',
        'body': 'Входящий видеозвонок',
    }
