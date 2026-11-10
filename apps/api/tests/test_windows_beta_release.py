from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException, Response

from app.api.routes.releases import download_windows_beta_installer, get_windows_beta_release
from app.core.config import settings


@pytest.mark.anyio
async def test_windows_beta_release_stays_hidden_until_the_scheduled_time(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    installer = tmp_path / 'AraChat_0.9.3_x64-setup.exe'
    installer.write_bytes(b'installer')
    monkeypatch.setattr(settings, 'windows_beta_release_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'windows_beta_installer_filename', installer.name)
    monkeypatch.setattr(settings, 'windows_beta_release_at', datetime.now(timezone.utc) + timedelta(hours=1))

    response = Response()
    release = await get_windows_beta_release(response)

    assert release.is_available is False
    assert release.download_url is None
    assert response.headers['Cache-Control'] == 'no-store'
    with pytest.raises(HTTPException) as exc_info:
        await download_windows_beta_installer()
    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_windows_beta_release_serves_only_the_configured_installer_after_start(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    installer = tmp_path / 'AraChat_0.9.3_x64-setup.exe'
    installer.write_bytes(b'installer')
    monkeypatch.setattr(settings, 'windows_beta_release_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'windows_beta_installer_filename', installer.name)
    monkeypatch.setattr(settings, 'windows_beta_release_at', datetime.now(timezone.utc) - timedelta(seconds=1))

    release = await get_windows_beta_release(Response())
    download = await download_windows_beta_installer()

    assert release.is_available is True
    assert release.download_url == '/api/releases/windows/beta/download'
    assert download.path == installer
    assert download.headers['cache-control'] == 'no-store'
    assert download.headers['content-disposition'].endswith(f'filename="{installer.name}"')
