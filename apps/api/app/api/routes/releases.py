from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.schemas.chats import AndroidReleaseOut, WindowsBetaReleaseOut
from app.schemas.users import UserOut

router = APIRouter()

WINDOWS_BETA_DOWNLOAD_PATH = '/api/releases/windows/beta/download'
WINDOWS_BETA_DOWNLOAD_HEADERS = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
}


@router.get('/android', response_model=AndroidReleaseOut)
async def get_android_release(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    channel: Annotated[Literal['direct', 'rustore'] | None, Query()] = None,
) -> AndroidReleaseOut:
    latest_version_code, latest_version_name = _release_version(channel)
    release_notes_ru = _release_notes(settings.android_release_notes_ru)
    release_notes_en = _release_notes(settings.android_release_notes_en)
    direct_download_url = settings.android_direct_download_url.strip() or None
    rustore_app_url = settings.android_rustore_app_url.strip() or None
    rustore_installer_package = settings.android_rustore_installer_package.strip() or None
    channel_has_update_url = (
        direct_download_url is not None
        if channel == 'direct'
        else rustore_app_url is not None
        if channel == 'rustore'
        else direct_download_url is not None or rustore_app_url is not None
    )
    release_is_configured = (
        latest_version_code is not None
        and bool(latest_version_name)
        and bool(release_notes_ru)
        and bool(release_notes_en)
        and channel_has_update_url
    )
    language = current_user.profile.language if current_user.profile else 'ru'
    release_notes = release_notes_en if language == 'en' else release_notes_ru

    return AndroidReleaseOut(
        latest_version_code=latest_version_code if release_is_configured else None,
        latest_version_name=latest_version_name if release_is_configured else None,
        release_notes=release_notes if release_is_configured else [],
        direct_download_url=(
            direct_download_url if release_is_configured and channel != 'rustore' else None
        ),
        rustore_app_url=(
            rustore_app_url if release_is_configured and channel != 'direct' else None
        ),
        rustore_installer_package=(
            rustore_installer_package
            if release_is_configured and channel != 'direct' and rustore_app_url is not None
            else None
        ),
    )


@router.get('/windows/beta', response_model=WindowsBetaReleaseOut)
async def get_windows_beta_release(response: Response) -> WindowsBetaReleaseOut:
    response.headers['Cache-Control'] = 'no-store'
    is_available = _windows_beta_is_available()
    return WindowsBetaReleaseOut(
        release_at=settings.windows_beta_release_at,
        is_available=is_available,
        download_url=WINDOWS_BETA_DOWNLOAD_PATH if is_available else None,
    )


@router.get('/windows/beta/download', include_in_schema=False)
async def download_windows_beta_installer() -> FileResponse:
    installer_path = _windows_beta_installer_path()
    if not _windows_beta_is_available() or installer_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Release not found')
    return FileResponse(
        installer_path,
        media_type='application/octet-stream',
        filename=installer_path.name,
        headers=WINDOWS_BETA_DOWNLOAD_HEADERS,
    )


def _release_notes(notes: list[str]) -> list[str]:
    return [note.strip() for note in notes if note.strip()]


def _release_version(channel: Literal['direct', 'rustore'] | None) -> tuple[int | None, str]:
    if channel == 'direct':
        return (
            settings.android_direct_latest_version_code,
            settings.android_direct_latest_version_name.strip(),
        )
    if channel == 'rustore':
        return (
            settings.android_rustore_latest_version_code,
            settings.android_rustore_latest_version_name.strip(),
        )
    return settings.android_latest_version_code, settings.android_latest_version_name.strip()


def _windows_beta_is_available(now: datetime | None = None) -> bool:
    release_at = settings.windows_beta_release_at
    installer_path = _windows_beta_installer_path()
    return bool(
        release_at
        and installer_path
        and release_at <= (now or datetime.now(timezone.utc))
        and installer_path.is_file()
    )


def _windows_beta_installer_path() -> Path | None:
    filename = settings.windows_beta_installer_filename
    if not filename:
        return None
    release_dir = Path(settings.windows_beta_release_dir).resolve()
    installer_path = (release_dir / filename).resolve()
    if installer_path.parent != release_dir:
        return None
    return installer_path
