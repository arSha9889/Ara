import mimetypes
from pathlib import Path
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.media_service import MediaAccessError, MediaDelivery, get_private_media, get_public_avatar
from app.services.storage_service import (
    StorageObjectNotFoundError,
    get_s3_storage_object,
    local_storage_path_for,
    stream_s3_body,
)


router = APIRouter()

_PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
}


@router.get('/avatars/{object_id}', include_in_schema=False)
async def get_avatar(
    object_id: UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    try:
        media = await get_public_avatar(session, object_id)
        return await _media_response(media)
    except (MediaAccessError, StorageObjectNotFoundError, AuthError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Avatar not found') from exc


@router.get('/{object_id}', include_in_schema=False)
async def get_media(
    object_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    try:
        media = await get_private_media(session, current_user.id, object_id)
        return await _media_response(media)
    except (MediaAccessError, StorageObjectNotFoundError, AuthError) as exc:
        # Return the same response for missing and unauthorized objects so UUIDs
        # cannot be used as an existence oracle.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Media not found') from exc


async def _media_response(media: MediaDelivery):
    mime_type = media.mime_type or mimetypes.guess_type(media.stored_object.storage_key)[0] or 'application/octet-stream'
    filename = _safe_filename(media.filename)
    if settings.storage_backend == 'local':
        path = local_storage_path_for(media.stored_object.storage_key)
        if not path.is_file():
            raise StorageObjectNotFoundError
        return FileResponse(
            path,
            media_type=mime_type,
            headers={
                **_PRIVATE_HEADERS,
                'Content-Disposition': _content_disposition(filename),
            },
        )

    response = await get_s3_storage_object(media.stored_object.storage_key)
    body = response.get('Body')
    if body is None or not hasattr(body, 'read'):
        raise StorageObjectNotFoundError
    return StreamingResponse(
        stream_s3_body(body),
        media_type=mime_type,
        headers={
            **_PRIVATE_HEADERS,
            'Content-Disposition': _content_disposition(filename),
        },
    )


def _safe_filename(value: str | None) -> str | None:
    if not value:
        return None
    filename = Path(value).name
    return ''.join(character for character in filename if character.isprintable() and character not in {'"', '\\'}) or None


def _content_disposition(filename: str | None) -> str:
    if not filename:
        return 'inline'
    return f"inline; filename*=utf-8''{quote(filename, safe='')}"
