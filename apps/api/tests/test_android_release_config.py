from uuid import uuid4

import pytest

from app.api.routes.releases import get_android_release
from app.core.config import Settings
from app.core.config import settings as runtime_settings
from app.schemas.users import UserOut


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
        profile=None,
    )
    monkeypatch.setattr(runtime_settings, 'android_latest_version_code', 42)
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
        profile=None,
    )
    monkeypatch.setattr(runtime_settings, 'android_latest_version_code', 42)
    monkeypatch.setattr(runtime_settings, 'android_direct_download_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_app_url', '')
    monkeypatch.setattr(runtime_settings, 'android_rustore_installer_package', 'ru.vk.store')

    release = await get_android_release(current_user)

    assert release.model_dump() == {
        'latest_version_code': None,
        'direct_download_url': None,
        'rustore_app_url': None,
        'rustore_installer_package': None,
    }
