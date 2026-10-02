from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.admin import (
    AdminAuditLogListOut,
    AdminAnnouncementCreateRequest,
    AdminAnnouncementOut,
    AdminAnnouncementUpdateRequest,
    AdminBranchListOut,
    AdminBranchMemberRequest,
    AdminBranchOut,
    AdminBranchUpdateRequest,
    AdminMaintenanceOut,
    AdminOverviewOut,
    AdminContentReportListOut,
    AdminRetentionRunOut,
    AdminSecurityMetricsOut,
    AdminSystemBotOut,
    AdminUserListOut,
    AdminUserOut,
    AdminUserRestrictionCreateRequest,
    AdminUserStatusRequest,
    AdminUserVpnUpdateRequest,
)
from app.schemas.chats import MessageCreateRequest, MessageOut, MessageUpdateRequest
from app.schemas.safety import AdminContentReportOut, ContentReportModerationRequest
from app.schemas.users import UserOut
from app.services.admin_service import (
    AdminError,
    admin_overview,
    admin_security_metrics,
    change_user_status,
    create_user_restriction,
    get_admin_user,
    lift_user_restriction,
    list_admin_audit_logs,
    list_admin_users,
    require_admin,
    set_user_vpn_enabled,
)
from app.services.auth_service import AuthError
from app.services.branch_service import list_admin_branches, set_admin_branch_archived, set_admin_branch_member, update_admin_branch
from app.models.chats import ChatParticipant
from app.services.notification_service import create_message_notifications
from app.services.realtime_manager import realtime_manager
from app.services.realtime_revocation_service import realtime_revocation_service
from app.services.retention_service import RetentionError, preview_retention, read_host_storage_status, run_retention
from app.services.safety_service import SafetyError, list_admin_reports, moderate_content_report
from app.services.system_bot_service import (
    cancel_system_announcement,
    create_system_announcement,
    delete_system_bot_message,
    edit_system_bot_message,
    get_system_bot,
    publish_system_announcement,
    publish_system_bot_message,
    toggle_system_bot_message_pin,
    update_system_announcement,
)


router = APIRouter()


@router.get('/reports', response_model=AdminContentReportListOut)
async def get_content_reports(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    report_status: str | None = Query(default=None, pattern=r'^(open|under_review|resolved|dismissed)$'),
) -> AdminContentReportListOut:
    try:
        return AdminContentReportListOut(reports=await list_admin_reports(session, current_user.id, report_status))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch('/reports/{report_id}', response_model=AdminContentReportOut)
async def patch_content_report(
    report_id: UUID,
    request: ContentReportModerationRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminContentReportOut:
    try:
        return await moderate_content_report(session, current_user.id, report_id, request)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except SafetyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


async def _broadcast_system_bot_event(session: AsyncSession, chat_id: UUID, event: str, message: MessageOut) -> None:
    participant_ids = (await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars()
    for participant_id in participant_ids:
        await realtime_manager.broadcast_to_user(participant_id, {
            'event': event,
            'chat_id': str(chat_id),
            'message': message.model_dump(mode='json'),
        })


@router.get('/system-bot', response_model=AdminSystemBotOut)
async def get_system_bot_route(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminSystemBotOut:
    try:
        return AdminSystemBotOut.model_validate(await get_system_bot(session, current_user.id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post('/announcements', response_model=AdminAnnouncementOut)
async def create_announcement_route(
    request: AdminAnnouncementCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminAnnouncementOut:
    try:
        return AdminAnnouncementOut.model_validate(await create_system_announcement(
            session,
            current_user.id,
            text=request.text,
            audience_type=request.audience_type,
            audience_country=request.audience_country,
            audience_branch_id=request.audience_branch_id,
            scheduled_at=request.scheduled_at,
        ))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch('/announcements/{announcement_id}', response_model=AdminAnnouncementOut)
async def update_announcement_route(
    announcement_id: UUID,
    request: AdminAnnouncementUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminAnnouncementOut:
    try:
        updates = {field: getattr(request, field) for field in request.model_fields_set}
        return AdminAnnouncementOut.model_validate(await update_system_announcement(session, current_user.id, announcement_id, updates))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/announcements/{announcement_id}/publish', response_model=AdminAnnouncementOut)
async def publish_announcement_route(
    announcement_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminAnnouncementOut:
    try:
        return AdminAnnouncementOut.model_validate(await publish_system_announcement(
            session,
            announcement_id,
            actor_user_id=current_user.id,
        ))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/announcements/{announcement_id}/cancel')
async def cancel_announcement_route(
    announcement_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        await cancel_system_announcement(session, current_user.id, announcement_id)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'status': 'ok'}


@router.post('/system-bot/messages', response_model=MessageOut)
async def publish_system_bot_message_route(
    request: MessageCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await publish_system_bot_message(session, current_user.id, request)
    except (AdminError, AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await create_message_notifications(session, message)
    await _broadcast_system_bot_event(session, message.chat_id, 'message.created', message)
    return message


@router.patch('/system-bot/messages/{message_id}', response_model=MessageOut)
async def edit_system_bot_message_route(
    message_id: UUID,
    request: MessageUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await edit_system_bot_message(session, current_user.id, message_id, request.text)
    except (AdminError, AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await _broadcast_system_bot_event(session, message.chat_id, 'message.updated', message)
    return message


@router.delete('/system-bot/messages/{message_id}', response_model=MessageOut)
async def delete_system_bot_message_route(
    message_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await delete_system_bot_message(session, current_user.id, message_id)
    except (AdminError, AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await _broadcast_system_bot_event(session, message.chat_id, 'message.deleted', message)
    return message


@router.post('/system-bot/messages/{message_id}/pin', response_model=MessageOut)
async def toggle_system_bot_message_pin_route(
    message_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message, _ = await toggle_system_bot_message_pin(session, current_user.id, message_id)
    except (AdminError, AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await _broadcast_system_bot_event(session, message.chat_id, 'message.updated', message)
    return message


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


@router.get('/maintenance', response_model=AdminMaintenanceOut)
async def get_maintenance(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminMaintenanceOut:
    try:
        await require_admin(session, current_user.id)
        return AdminMaintenanceOut.model_validate({
            'host': read_host_storage_status(),
            'retention': await preview_retention(session),
        })
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post('/maintenance/retention', response_model=AdminRetentionRunOut)
async def run_maintenance_retention(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminRetentionRunOut:
    try:
        await require_admin(session, current_user.id)
        return AdminRetentionRunOut.model_validate(await run_retention(session, current_user.id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except RetentionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


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


@router.patch('/users/{user_id}/vpn')
async def update_user_vpn_status(
    user_id: UUID,
    request: AdminUserVpnUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    try:
        await require_admin(session, current_user.id)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    try:
        vpn_enabled = await set_user_vpn_enabled(session, current_user.id, user_id, request.vpn_enabled)
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {'vpn_enabled': vpn_enabled}


@router.post('/users/{user_id}/restrictions', response_model=AdminUserOut)
async def create_user_restriction_route(
    user_id: UUID,
    request: AdminUserRestrictionCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserOut:
    try:
        await create_user_restriction(
            session,
            current_user.id,
            user_id,
            request.reason,
            request.note,
            request.ends_at,
        )
        await realtime_revocation_service.disconnect_user(user_id)
        return AdminUserOut.model_validate(await get_admin_user(session, current_user.id, user_id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/users/{user_id}/restrictions/lift', response_model=AdminUserOut)
async def lift_user_restriction_route(
    user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserOut:
    try:
        await lift_user_restriction(session, current_user.id, user_id)
        return AdminUserOut.model_validate(await get_admin_user(session, current_user.id, user_id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
    if request.status in {'blocked', 'deleted'}:
        await realtime_revocation_service.disconnect_user(user_id)
    return {'status': 'ok'}
