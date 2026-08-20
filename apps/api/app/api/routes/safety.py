from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.routes._responses import domain_error_response
from app.db.session import get_db_session
from app.schemas.safety import BlockedUserOut, ContentReportCreateRequest, ContentReportOut
from app.schemas.users import UserOut
from app.services.safety_service import (
    SafetyError,
    block_user,
    create_content_report,
    list_blocked_users,
    list_user_reports,
    unblock_user,
)

router = APIRouter()


@router.get('/blocks', response_model=list[BlockedUserOut])
async def get_blocked_users(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BlockedUserOut]:
    return await list_blocked_users(session, current_user.id)


@router.post('/blocks/{user_id}', response_model=BlockedUserOut)
async def create_user_block(
    user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BlockedUserOut:
    try:
        block = await block_user(session, current_user.id, user_id)
        for blocked_user in await list_blocked_users(session, current_user.id):
            if blocked_user.user_id == block.blocked_user_id:
                return blocked_user
        raise SafetyError('user_not_found', 'User not found.', status_code=404)
    except SafetyError as exc:
        return domain_error_response(exc, 400)


@router.delete('/blocks/{user_id}')
async def remove_user_block(
    user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    await unblock_user(session, current_user.id, user_id)
    return {'ok': True}


@router.get('/reports', response_model=list[ContentReportOut])
async def get_my_reports(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ContentReportOut]:
    return await list_user_reports(session, current_user.id)


@router.post('/reports', response_model=ContentReportOut)
async def create_report(
    request: ContentReportCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ContentReportOut:
    try:
        return await create_content_report(session, current_user.id, request)
    except SafetyError as exc:
        return domain_error_response(exc, 400)
