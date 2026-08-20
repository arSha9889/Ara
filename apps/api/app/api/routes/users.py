from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.users import ProfileUpdateRequest, PublicUserOut, UserOut, UsernameCheckRequest, UsernameCheckResponse, UsernameUpdateRequest
from app.api.routes._responses import domain_error_response
from app.services.auth_service import AuthError
from app.services.user_service import find_public_user, get_current_user_out, is_username_available, search_users, update_profile, update_username

router = APIRouter()


@router.get('/me')
async def get_profile(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    return await get_current_user_out(session, current_user.id)


@router.patch('/me/profile')
async def patch_profile(
    request: ProfileUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    try:
        return await update_profile(session, current_user.id, request)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('/search')
async def search(
    query: str,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[PublicUserOut]:
    return await search_users(session, query, current_user.id)


@router.get('/{nexus_id_or_username}')
async def get_user(
    nexus_id_or_username: str,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicUserOut:
    try:
        return await find_public_user(session, nexus_id_or_username, current_user.id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.post('/username/check')
async def check_username(
    request: UsernameCheckRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UsernameCheckResponse:
    try:
        available = await is_username_available(session, request.username)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UsernameCheckResponse(username=request.username, available=available)


@router.patch('/username')
async def patch_username(
    request: UsernameUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserOut:
    try:
        return await update_username(session, current_user.id, request.username)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
