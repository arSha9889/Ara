from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.admin import AdminOverviewOut, AdminUserStatusRequest
from app.schemas.users import UserOut
from app.services.admin_service import AdminError, admin_overview, change_user_status, require_admin


router = APIRouter()


@router.get('/overview', response_model=AdminOverviewOut)
async def get_overview(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminOverviewOut:
    try:
        return AdminOverviewOut.model_validate(await admin_overview(session, current_user.id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch('/users/{user_id}/status')
async def update_user_status(
    user_id: UUID,
    request: AdminUserStatusRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await require_admin(session, current_user.id)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    try:
        await change_user_status(session, current_user.id, user_id, request.status)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}
