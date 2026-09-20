from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.uploads import UploadOut
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.storage_service import AVATAR_MAX_SIZE_BYTES, delete_storage_object, save_upload_file
from app.services.stored_object_service import register_pending_upload

router = APIRouter()


@router.post('', response_model=UploadOut)
async def upload_file(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UploadOut:
    try:
        stored = await save_upload_file(file, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stored_object = await _register_upload_or_raise(session, current_user.id, stored, 'message')
    return UploadOut(
        media_url=stored_object.public_url,
        media_name=stored.original_name,
        media_mime_type=stored.mime_type,
        media_size_bytes=stored.size_bytes,
        suggested_message_type=stored.suggested_message_type,
    )


@router.post('/avatar', response_model=UploadOut)
async def upload_avatar(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UploadOut:
    if not (file.content_type or '').startswith('image/'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Avatar must be an image')
    try:
        stored = await save_upload_file(file, current_user.id, AVATAR_MAX_SIZE_BYTES)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stored_object = await _register_upload_or_raise(session, current_user.id, stored, 'avatar')
    return UploadOut(
        media_url=stored_object.public_url,
        media_name=stored.original_name,
        media_mime_type=stored.mime_type,
        media_size_bytes=stored.size_bytes,
        suggested_message_type=stored.suggested_message_type,
    )


@router.post('/support', response_model=UploadOut)
async def upload_support_file(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UploadOut:
    try:
        stored = await save_upload_file(file, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stored_object = await _register_upload_or_raise(session, current_user.id, stored, 'support')
    return UploadOut(
        media_url=stored_object.public_url,
        media_name=stored.original_name,
        media_mime_type=stored.mime_type,
        media_size_bytes=stored.size_bytes,
        suggested_message_type=stored.suggested_message_type,
    )


async def _register_upload_or_raise(session, user_id, stored, purpose: str):
    try:
        stored_object = await register_pending_upload(session, user_id, stored, purpose)
        await session.commit()
        return stored_object
    except SQLAlchemyError as exc:
        await session.rollback()
        try:
            await delete_storage_object(stored.storage_key)
        except AuthError:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='File metadata could not be saved',
        ) from exc
