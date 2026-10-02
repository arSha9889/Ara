from uuid import uuid4

import pytest

from app.api.routes.releases import get_android_release
from app.core.config import Settings
from app.core.config import settings as runtime_settings
from app.schemas.users import UserOut, UserProfileOut


def release_profile(language: str) -> UserProfileOut:
    return UserProfileOut(
        display_name='Ara',
        username='ara',
        avatar_type='initials',
        avatar_ref='',
        optional_phone=None,
        email=None,
        registration_country=None,
        phone_public=False,
        language=language,
        design_theme='dark',
        current_mode='default',
    )


def configure_complete_release(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runtime_settings, 'android_latest_version_code', 42)
    monkeypatch.setattr(runtime_settings, 'android_latest_version_name', '1.4.0')
    monkeypatch.setattr(runtime_settings, 'android_release_notes_ru', ['Ответы на сообщения'])
    monkeypatch.setattr(runtime_settings, 'android_release_notes_en', ['Message replies'])


def test_android_release_urls_must_be_safe_https_urls() -> None:
    settings = Settings(
        android_direct_download_url='https://downloads.example.test/android',
        android_rustore_app_url='https://store.example.test/arachat',
    )

    assert settings.android_direct_download_url == 'https://downloads.example.test/android'
    assert settings.android_rustore_app_url == 'https://store.example.test/arachat'
    assert Settings(android_rustore_installer_package='com.example.store').android_rustore_installer_package == 'com.example.store'

    with pytest.raises(ValueError, match='android_direct_download_url'):
        Settings(android_direct_download_url='http://downloads.example.test/android')
    with pytest.raises(ValueError, match='android_rustore_app_url'):
        Settings(android_rustore_app_url='https://token@store.example.test/arachat')
    with pytest.raises(ValueError, match='android_rustore_app_url'):
        Settings(android_rustore_app_url='https://store.example.test/arachat?source=app')
    with pytest.raises(ValueError, match='android_rustore_installer_package'):
        Settings(android_rustore_installer_package='not a package')
    with pytest.raises(ValueError, match='android_rustore_installer_package'):
        Settings(android_rustore_installer_package='com.магазин')


@pytest.mark.anyio
async def test_android_release_metadata_supports_independent_channels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = UserOut(
        id=uuid4(),
        nexus_id='1234567890123456',
        telegram_id=None,
        status='active',
        profile=release_profile('ru'),
    )
    configure_complete_release(monkeypatch)
    monkeypatch.setattr(
        runtime_settings,
        'android_direct_download_url',
        'https://downloads.example.test/android',
    )
    monkeypatch.setattr(runtime_settings, 'android_rustore_app_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_installer_package', 'ru.vk.store')

    direct_only = await get_android_release(current_user)

    assert direct_only.model_dump() == {
        'latest_version_code': 42,
        'latest_version_name': '1.4.0',
        'release_notes': ['Ответы на сообщения'],
        'direct_download_url': 'https://downloads.example.test/android',
        'rustore_app_url': None,
        'rustore_installer_package': None,
    }

    monkeypatch.setattr(runtime_settings, 'android_direct_download_url', '')
    monkeypatch.setattr(
        runtime_settings,
        'android_rustore_app_url',
        'https://store.example.test/arachat',
    )

    rustore_only = await get_android_release(current_user)

    assert rustore_only.model_dump() == {
        'latest_version_code': 42,
        'latest_version_name': '1.4.0',
        'release_notes': ['Ответы на сообщения'],
        'direct_download_url': None,
        'rustore_app_url': 'https://store.example.test/arachat',
        'rustore_installer_package': 'ru.vk.store',
    }


@pytest.mark.anyio
async def test_android_release_metadata_hides_incomplete_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = UserOut(
        id=uuid4(),
        nexus_id='1234567890123456',
        telegram_id=None,
        status='active',
        profile=release_profile('en'),
    )
    configure_complete_release(monkeypatch)
    monkeypatch.setattr(runtime_settings, 'android_direct_download_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_app_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_installer_package', 'ru.vk.store')

    release = await get_android_release(current_user)

    assert release.model_dump() == {
        'latest_version_code': None,
        'latest_version_name': None,
        'release_notes': [],
        'direct_download_url': None,
        'rustore_app_url': None,
        'rustore_installer_package': None,
    }


@pytest.mark.anyio
async def test_android_release_metadata_uses_profile_language_and_hides_missing_notes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = UserOut(
        id=uuid4(),
        nexus_id='1234567890123456',
        telegram_id=None,
        status='active',
        profile=release_profile('en'),
    )
    configure_complete_release(monkeypatch)
    monkeypatch.setattr(
        runtime_settings,
        'android_direct_download_url',
        'https://downloads.example.test/android',
    )
    monkeypatch.setattr(runtime_settings, 'android_rustore_app_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_installer_package', '')

    release = await get_android_release(current_user)

    assert release.latest_version_name == '1.4.0'
    assert release.release_notes == ['Message replies']

    monkeypatch.setattr(runtime_settings, 'android_release_notes_en', [])

    incomplete_release = await get_android_release(current_user)

    assert incomplete_release.model_dump() == {
        'latest_version_code': None,
        'latest_version_name': None,
        'release_notes': [],
        'direct_download_url': None,
        'rustore_app_url': None,
        'rustore_installer_package': None,
    }
