from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.audit import AuditLog
from app.models.chats import BranchComment, Chat, ChatParticipant, Message, Notification
from app.models.safety import ContentReport, UserBlock
from app.models.users import User, UserProfile
from app.schemas.safety import (
    AdminContentReportOut,
    BlockedUserOut,
    ContentReportCreateRequest,
    ContentReportModerationRequest,
    ContentReportOut,
)
from app.services.admin_service import require_admin
from app.services.auth_service import AuthError
from app.services.call_signaling import call_signaling_manager
from app.services.realtime_manager import realtime_manager


class SafetyError(AuthError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class InteractionBlockedError(SafetyError):
    def __init__(self) -> None:
        super().__init__('interaction_blocked', 'This interaction is unavailable.', status_code=403)


async def is_user_interaction_blocked(session: AsyncSession, first_user_id: UUID, second_user_id: UUID) -> bool:
    if first_user_id == second_user_id:
        return False
    block_id = await session.scalar(
        select(UserBlock.id)
        .where(or_(
            and_(UserBlock.blocker_user_id == first_user_id, UserBlock.blocked_user_id == second_user_id),
            and_(UserBlock.blocker_user_id == second_user_id, UserBlock.blocked_user_id == first_user_id),
        ))
        .limit(1)
    )
    return block_id is not None


async def ensure_direct_interaction_allowed(session: AsyncSession, user_id: UUID, peer_user_id: UUID) -> None:
    if await is_user_interaction_blocked(session, user_id, peer_user_id):
        raise InteractionBlockedError()


async def ensure_chat_interaction_allowed(session: AsyncSession, user_id: UUID, chat: Chat) -> None:
    if chat.type != 'direct':
        return
    peer_user_id = await session.scalar(
        select(ChatParticipant.user_id).where(
            ChatParticipant.chat_id == chat.id,
            ChatParticipant.user_id != user_id,
        ).limit(1)
    )
    if not peer_user_id:
        raise AuthError('Chat not found')
    await ensure_direct_interaction_allowed(session, user_id, peer_user_id)


async def block_user(session: AsyncSession, blocker_user_id: UUID, blocked_user_id: UUID) -> UserBlock:
    if blocker_user_id == blocked_user_id:
        raise SafetyError('cannot_block_self', 'You cannot block yourself.')
    target = await session.get(User, blocked_user_id)
    if not target or target.deleted_at:
        raise SafetyError('user_not_found', 'User not found.', status_code=404)

    existing = await session.scalar(
        select(UserBlock).where(
            UserBlock.blocker_user_id == blocker_user_id,
            UserBlock.blocked_user_id == blocked_user_id,
        )
    )
    if existing:
        return existing

    try:
        shared_direct_chat_ids = await list_shared_direct_chat_ids(session, blocker_user_id, blocked_user_id)
        item = UserBlock(blocker_user_id=blocker_user_id, blocked_user_id=blocked_user_id)
        session.add(item)
        if shared_direct_chat_ids:
            await session.execute(
                delete(Notification).where(
                    Notification.chat_id.in_(shared_direct_chat_ids),
                    Notification.recipient_user_id.in_([blocker_user_id, blocked_user_id]),
                )
            )
        session.add(AuditLog(
            actor_user_id=blocker_user_id,
            actor_type='user',
            action='safety.user_blocked',
            target_type='user',
            target_id=str(blocked_user_id),
        ))
        await session.commit()
    except Exception:
        await session.rollback()
        existing = await session.scalar(
            select(UserBlock).where(
                UserBlock.blocker_user_id == blocker_user_id,
                UserBlock.blocked_user_id == blocked_user_id,
            )
        )
        if not existing:
            raise
        return existing
    await session.refresh(item)
    await realtime_manager.unsubscribe_users_from_chats(
        {blocker_user_id, blocked_user_id},
        shared_direct_chat_ids,
    )
    if call := await call_signaling_manager.end_call_between_users(blocker_user_id, blocked_user_id):
        for user_id in {blocker_user_id, blocked_user_id}:
            await realtime_manager.broadcast_to_user(user_id, {
                'event': 'call.end',
                'call_id': call.call_id,
                'chat_id': str(call.chat_id),
            })
    return item


async def unblock_user(session: AsyncSession, blocker_user_id: UUID, blocked_user_id: UUID) -> None:
    result = await session.execute(
        delete(UserBlock).where(
            UserBlock.blocker_user_id == blocker_user_id,
            UserBlock.blocked_user_id == blocked_user_id,
        )
    )
    if result.rowcount:
        session.add(AuditLog(
            actor_user_id=blocker_user_id,
            actor_type='user',
            action='safety.user_unblocked',
            target_type='user',
            target_id=str(blocked_user_id),
        ))
        await session.commit()


async def list_blocked_users(session: AsyncSession, blocker_user_id: UUID) -> list[BlockedUserOut]:
    blocks = list((await session.execute(
        select(UserBlock)
        .where(UserBlock.blocker_user_id == blocker_user_id)
        .order_by(UserBlock.created_at.desc())
    )).scalars())
    result = []
    for block in blocks:
        profile = await session.get(UserProfile, block.blocked_user_id)
        if not profile:
            continue
        result.append(BlockedUserOut(
            user_id=block.blocked_user_id,
            display_name=profile.display_name,
            username=profile.username,
            avatar_type=profile.avatar_type,
            avatar_ref=profile.avatar_ref,
            blocked_at=block.created_at,
        ))
    return result


async def list_shared_direct_chat_ids(session: AsyncSession, first_user_id: UUID, second_user_id: UUID) -> list[UUID]:
    first_participant = aliased(ChatParticipant)
    second_participant = aliased(ChatParticipant)
    result = await session.execute(
        select(Chat.id)
        .join(first_participant, first_participant.chat_id == Chat.id)
        .join(second_participant, second_participant.chat_id == Chat.id)
        .where(
            Chat.type == 'direct',
            first_participant.user_id == first_user_id,
            second_participant.user_id == second_user_id,
        )
    )
    return list(result.scalars())


async def create_content_report(
    session: AsyncSession,
    reporter_user_id: UUID,
    request: ContentReportCreateRequest,
) -> ContentReportOut:
    target_user_id = await _report_target_user_id(session, reporter_user_id, request.target_type, request.target_id)
    existing = await session.scalar(
        select(ContentReport).where(
            ContentReport.reporter_user_id == reporter_user_id,
            ContentReport.target_type == request.target_type,
            ContentReport.target_id == str(request.target_id),
        )
    )
    if existing:
        return _content_report_out(existing)

    report = ContentReport(
        reporter_user_id=reporter_user_id,
        target_user_id=target_user_id,
        target_type=request.target_type,
        target_id=str(request.target_id),
        reason=request.reason,
        description=request.description.strip() if request.description else None,
    )
    session.add(report)
    session.add(AuditLog(
        actor_user_id=reporter_user_id,
        actor_type='user',
        action='safety.report_created',
        target_type=request.target_type,
        target_id=str(request.target_id),
        metadata_json={'reason': request.reason},
    ))
    await session.commit()
    await session.refresh(report)
    return _content_report_out(report)


async def list_user_reports(session: AsyncSession, reporter_user_id: UUID) -> list[ContentReportOut]:
    reports = (await session.execute(
        select(ContentReport)
        .where(ContentReport.reporter_user_id == reporter_user_id)
        .order_by(ContentReport.updated_at.desc())
        .limit(100)
    )).scalars()
    return [_content_report_out(report) for report in reports]


async def list_admin_reports(session: AsyncSession, admin_user_id: UUID, report_status: str | None) -> list[AdminContentReportOut]:
    await require_admin(session, admin_user_id)
    statement = select(ContentReport).order_by(ContentReport.updated_at.desc()).limit(100)
    if report_status:
        statement = statement.where(ContentReport.status == report_status)
    reports = (await session.execute(statement)).scalars()
    return [_admin_content_report_out(report) for report in reports]


async def moderate_content_report(
    session: AsyncSession,
    admin_user_id: UUID,
    report_id: UUID,
    request: ContentReportModerationRequest,
) -> AdminContentReportOut:
    await require_admin(session, admin_user_id)
    report = await session.get(ContentReport, report_id)
    if not report:
        raise SafetyError('report_not_found', 'Report not found.', status_code=404)

    report.status = request.status
    report.moderator_note = request.moderator_note.strip() if request.moderator_note else None
    report.reviewed_by_user_id = admin_user_id
    report.reviewed_at = datetime.now(timezone.utc)
    session.add(AuditLog(
        actor_user_id=admin_user_id,
        actor_type='admin',
        action='safety.report_moderated',
        target_type='report',
        target_id=str(report.id),
        metadata_json={'status': request.status},
    ))
    await session.commit()
    await session.refresh(report)
    return _admin_content_report_out(report)


async def _report_target_user_id(
    session: AsyncSession,
    reporter_user_id: UUID,
    target_type: str,
    target_id: UUID,
) -> UUID:
    if target_type == 'user':
        target_user_id = target_id
    elif target_type == 'message':
        message = await session.get(Message, target_id)
        if not message:
            raise SafetyError('report_target_not_found', 'Report target not found.', status_code=404)
        chat = await session.get(Chat, message.chat_id)
        if not chat or (chat.type == 'direct' and not await session.get(
            ChatParticipant,
            {'chat_id': chat.id, 'user_id': reporter_user_id},
        )):
            raise SafetyError('report_target_not_found', 'Report target not found.', status_code=404)
        target_user_id = message.sender_id
    elif target_type == 'comment':
        comment = await session.get(BranchComment, target_id)
        if not comment:
            raise SafetyError('report_target_not_found', 'Report target not found.', status_code=404)
        branch = await session.get(Chat, comment.branch_id)
        if not branch or branch.type != 'branch' or branch.is_archived:
            raise SafetyError('report_target_not_found', 'Report target not found.', status_code=404)
        target_user_id = comment.author_id
    else:
        raise SafetyError('invalid_report_target', 'Unsupported report target.')

    target = await session.get(User, target_user_id)
    if not target or target.deleted_at:
        raise SafetyError('report_target_not_found', 'Report target not found.', status_code=404)
    if target_user_id == reporter_user_id:
        raise SafetyError('cannot_report_self', 'You cannot report yourself.')
    return target_user_id


def _content_report_out(report: ContentReport) -> ContentReportOut:
    return ContentReportOut(
        id=report.id,
        target_type=report.target_type,
        target_id=UUID(report.target_id),
        reason=report.reason,
        description=report.description,
        status=report.status,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


def _admin_content_report_out(report: ContentReport) -> AdminContentReportOut:
    return AdminContentReportOut(
        **_content_report_out(report).model_dump(),
        reporter_user_id=report.reporter_user_id,
        target_user_id=report.target_user_id,
        moderator_note=report.moderator_note,
        reviewed_by_user_id=report.reviewed_by_user_id,
        reviewed_at=report.reviewed_at,
    )
