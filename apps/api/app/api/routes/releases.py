from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.schemas.chats import AndroidReleaseOut
from app.schemas.users import UserOut

router = APIRouter()


@router.get('/android', response_model=AndroidReleaseOut)
async def get_android_release(
    current_user: Annotated[UserOut, Depends(get_current_user)],
) -> AndroidReleaseOut:
    del current_user
    latest_version_code = settings.android_latest_version_code
    direct_download_url = settings.android_direct_download_url.strip() or None
    rustore_app_url = settings.android_rustore_app_url.strip() or None
    rustore_installer_package = settings.android_rustore_installer_package.strip() or None
    release_is_configured = latest_version_code is not None and (
        direct_download_url is not None or rustore_app_url is not None
    )

    return AndroidReleaseOut(
        latest_version_code=latest_version_code if release_is_configured else None,
        direct_download_url=direct_download_url if release_is_configured else None,
        rustore_app_url=rustore_app_url if release_is_configured else None,
        rustore_installer_package=(
            rustore_installer_package
            if release_is_configured and rustore_app_url is not None
            else None
        ),
    )
