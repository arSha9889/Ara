from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.admin import (
    AdminAuditLogListOut,
    AdminBranchListOut,
    AdminBranchMemberRequest,
    AdminBranchOut,
    AdminBranchUpdateRequest,
    AdminOverviewOut,
    AdminSecurityMetricsOut,
    AdminUserListOut,
    AdminUserOut,
    AdminUserStatusRequest,
)
from app.schemas.users import UserOut
from app.services.admin_service import (
    AdminError,
    admin_overview,
    admin_security_metrics,
    change_user_status,
    get_admin_user,
    list_admin_audit_logs,
    list_admin_users,
    require_admin,
)
from app.services.branch_service import list_admin_branches, set_admin_branch_archived, set_admin_branch_member, update_admin_branch


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


@router.get('/security/metrics', response_model=AdminSecurityMetricsOut)
async def get_security_metrics(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminSecurityMetricsOut:
    try:
        return AdminSecurityMetricsOut.model_validate(await admin_security_metrics(session, current_user.id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get('/audit-logs', response_model=AdminAuditLogListOut)
async def get_audit_logs(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=50, ge=1, le=100),
) -> AdminAuditLogListOut:
    try:
        return AdminAuditLogListOut.model_validate(await list_admin_audit_logs(session, current_user.id, limit))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get('/branches', response_model=AdminBranchListOut)
async def get_branches(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminBranchListOut:
    try:
        return AdminBranchListOut.model_validate({'branches': await list_admin_branches(session, current_user.id)})
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch('/branches/{chat_id}', response_model=AdminBranchOut)
async def patch_branch(
    chat_id: UUID,
    request: AdminBranchUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminBranchOut:
    try:
        return AdminBranchOut.model_validate(await update_admin_branch(session, current_user.id, chat_id, request.title, request.slug, request.description, request.avatar_ref))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/branches/{chat_id}/archive')
async def archive_branch(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await set_admin_branch_archived(session, current_user.id, chat_id, True)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.post('/branches/{chat_id}/restore')
async def restore_branch(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await set_admin_branch_archived(session, current_user.id, chat_id, False)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.put('/branches/{chat_id}/members')
async def put_branch_member(
    chat_id: UUID,
    request: AdminBranchMemberRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await set_admin_branch_member(session, current_user.id, chat_id, request.user_id, request.role)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.get('/users', response_model=AdminUserListOut)
async def get_users(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    query: str = Query(default='', max_length=128),
    user_status: str = Query(default='all', pattern=r'^(all|active|blocked|deleted)$'),
    country: str | None = Query(default=None, max_length=8),
    sort: str = Query(default='newest', pattern=r'^(newest|oldest|name)$'),
    limit: int = Query(default=50, ge=1, le=100),
) -> AdminUserListOut:
    try:
        return AdminUserListOut.model_validate(await list_admin_users(
            session,
            current_user.id,
            query=query,
            user_status=user_status,
            country=country,
            sort=sort,
            limit=limit,
        ))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get('/users/{user_id}', response_model=AdminUserOut)
async def get_user(
    user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserOut:
    try:
        return AdminUserOut.model_validate(await get_admin_user(session, current_user.id, user_id))
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
