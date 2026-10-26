import pytest
from pydantic import ValidationError

from app.schemas.chats import MobilePushTokenRegisterRequest


def _request(provider: str) -> MobilePushTokenRegisterRequest:
    return MobilePushTokenRegisterRequest(
        device_id='android-device-12345678',
        provider=provider,
        package_name='arachat.messenger',
        token='test-mobile-push-token-1234567890',
    )


@pytest.mark.parametrize('provider', ['rustore', 'fcm'])
def test_mobile_push_schema_accepts_rustore_and_legacy_fcm_providers(provider: str) -> None:
    assert _request(provider).provider == provider


def test_mobile_push_schema_rejects_legacy_universal_provider() -> None:
    with pytest.raises(ValidationError):
        _request('universal')
