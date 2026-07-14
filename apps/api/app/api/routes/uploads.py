from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.api.dependencies.auth import get_current_user
from app.schemas.uploads import UploadOut
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.storage_service import AVATAR_MAX_SIZE_BYTES, media_url_for, save_upload_file

router = APIRouter()


@router.post('', response_model=UploadOut)
async def upload_file(
    request: Request,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> UploadOut:
    try:
        stored = await save_upload_file(file, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return UploadOut(
        media_url=media_url_for(stored.public_path, str(request.base_url)),
        media_name=stored.original_name,
        media_mime_type=stored.mime_type,
        media_size_bytes=stored.size_bytes,
        suggested_message_type=stored.suggested_message_type,
    )


@router.post('/avatar', response_model=UploadOut)
async def upload_avatar(
    request: Request,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> UploadOut:
    if not (file.content_type or '').startswith('image/'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Avatar must be an image')
    try:
        stored = await save_upload_file(file, current_user.id, AVATAR_MAX_SIZE_BYTES)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return UploadOut(
        media_url=media_url_for(stored.public_path, str(request.base_url)),
        media_name=stored.original_name,
        media_mime_type=stored.mime_type,
        media_size_bytes=stored.size_bytes,
        suggested_message_type=stored.suggested_message_type,
    )
