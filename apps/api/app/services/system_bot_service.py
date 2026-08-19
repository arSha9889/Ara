from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant, Notification, SystemAnnouncement
from app.schemas.chats import MessageCreateRequest, MessageOut
from app.services.admin_service import AdminError, record_admin_audit, require_admin
from app.services.branch_service import ensure_official_branch, list_admin_branches
from app.services.chat_service import create_message, delete_message, edit_message, list_messages, toggle_pin_message
from app.services.notification_service import create_announcement_notifications, deliver_announcement_notifications
from app.services.realtime_manager import realtime_manager


ANNOUNCEMENT_AUDIENCES = {'all', 'country', 'branch'}
ANNOUNCEMENT_EDITABLE_STATUSES = {'draft', 'scheduled'}


async def get_system_bot(session: AsyncSession, admin_user_id: UUID) -> dict:
    branch = await _get_official_branch(session, admin_user_id)
    branches = await list_admin_branches(session, admin_user_id)
    branch_data = next(item for item in branches if item['id'] == str(branch.id))
    messages = await list_messages(session, admin_user_id, branch.id)
    return {
        'branch': branch_data,
        'messages': messages,
        'announcements': await list_system_announcements(session, admin_user_id),
    }


async def list_system_announcements(session: AsyncSession, admin_user_id: UUID) -> list[dict]:
    await require_admin(session, admin_user_id)
    announcements = list((await session.execute(
        select(SystemAnnouncement).order_by(SystemAnnouncement.created_at.desc()).limit(100)
    )).scalars())
    if not announcements:
        return []
    read_counts = dict((await session.execute(
        select(Notification.announcement_id, func.count())
        .where(Notification.announcement_id.in_([item.id for item in announcements]), Notification.read_at.is_not(None))
        .group_by(Notification.announcement_id)
    )).all())
    return [_announcement_out(item, int(read_counts.get(item.id, 0))) for item in announcements]


async def create_system_announcement(
    session: AsyncSession,
    admin_user_id: UUID,
    *,
    text: str,
    audience_type: str,
    audience_country: str | None,
    audience_branch_id: UUID | None,
    scheduled_at: datetime | None,
) -> dict:
    await require_admin(session, admin_user_id)
    text = text.strip()
    audience_country = _normalize_country(audience_country)
    _validate_announcement(text, audience_type, audience_country, audience_branch_id, scheduled_at)
    if audience_type == 'branch':
        await _ensure_audience_branch(session, audience_branch_id)

    announcement = SystemAnnouncement(
        author_user_id=admin_user_id,
        text=text,
        audience_type=audience_type,
        audience_country=audience_country,
        audience_branch_id=audience_branch_id,
        status='scheduled' if scheduled_at else 'draft',
        scheduled_at=scheduled_at,
    )
    session.add(announcement)
    await session.flush()
    record_admin_audit(
        session,
        admin_user_id,
        'system_announcement.scheduled' if scheduled_at else 'system_announcement.drafted',
        'system_announcement',
        str(announcement.id),
        metadata={'audience_type': audience_type, 'scheduled_at': scheduled_at.isoformat() if scheduled_at else None},
    )
    await session.commit()
    await session.refresh(announcement)
    return _announcement_out(announcement, 0)


async def update_system_announcement(
    session: AsyncSession,
    admin_user_id: UUID,
    announcement_id: UUID,
    updates: dict,
) -> dict:
    await require_admin(session, admin_user_id)
    announcement = await _get_editable_announcement(session, announcement_id)
    text_value = updates.get('text', announcement.text)
    if text_value is None:
        raise AdminError('Announcement text cannot be empty')
    text = text_value.strip()
    audience_type = updates.get('audience_type', announcement.audience_type)
    audience_country = updates.get(
        'audience_country',
        announcement.audience_country if audience_type == 'country' else None,
    )
    audience_branch_id = updates.get(
        'audience_branch_id',
        announcement.audience_branch_id if audience_type == 'branch' else None,
    )
    scheduled_at = updates.get('scheduled_at', announcement.scheduled_at)
    audience_country = _normalize_country(audience_country)
    _validate_announcement(text, audience_type, audience_country, audience_branch_id, scheduled_at)
    if audience_type == 'branch':
        await _ensure_audience_branch(session, audience_branch_id)

    announcement.text = text
    announcement.audience_type = audience_type
    announcement.audience_country = audience_country
    announcement.audience_branch_id = audience_branch_id
    announcement.scheduled_at = scheduled_at
    announcement.status = 'scheduled' if scheduled_at else 'draft'
    record_admin_audit(session, admin_user_id, 'system_announcement.updated', 'system_announcement', str(announcement.id))
    await session.commit()
    await session.refresh(announcement)
    return _announcement_out(announcement, 0)


async def cancel_system_announcement(session: AsyncSession, admin_user_id: UUID, announcement_id: UUID) -> None:
    await require_admin(session, admin_user_id)
    announcement = await _get_editable_announcement(session, announcement_id)
    announcement.status = 'cancelled'
    announcement.cancelled_at = datetime.now(timezone.utc)
    record_admin_audit(session, admin_user_id, 'system_announcement.cancelled', 'system_announcement', str(announcement.id))
    await session.commit()


async def publish_system_announcement(
    session: AsyncSession,
    announcement_id: UUID,
    *,
    actor_user_id: UUID | None = None,
) -> dict:
    if actor_user_id:
        await require_admin(session, actor_user_id)
    branch = await ensure_official_branch(session)
    if not branch or not branch.is_official:
        raise AdminError('Ara Updates is unavailable until an administrator account is configured')
    announcement = (await session.execute(
        select(SystemAnnouncement)
        .where(SystemAnnouncement.id == announcement_id)
        .with_for_update()
    )).scalar_one_or_none()
    if not announcement:
        raise AdminError('Announcement not found')
    if announcement.status == 'cancelled':
        raise AdminError('Cancelled announcement cannot be published')
    if announcement.status == 'published':
        return await _announcement_out_with_reads(session, announcement)
    if announcement.status not in ANNOUNCEMENT_EDITABLE_STATUSES:
        raise AdminError('Announcement is already being published')

    message_out = await create_message(
        session,
        announcement.author_user_id,
        branch.id,
        MessageCreateRequest(text=announcement.text, type='text'),
        commit=False,
    )
    announcement.message_id = message_out.id
    delivery, notifications = await create_announcement_notifications(session, announcement, message_out)
    announcement.recipient_count = delivery['recipient_count']
    announcement.notification_count = delivery['notification_count']
    announcement.status = 'published'
    announcement.published_at = datetime.now(timezone.utc)
    record_admin_audit(
        session,
        announcement.author_user_id,
        'system_announcement.published',
        'system_announcement',
        str(announcement.id),
        metadata={'message_id': str(message_out.id), **delivery},
    )
    await session.commit()
    await _broadcast_system_bot_event(session, message_out.chat_id, 'message.created', message_out)
    push_provider_accepted = await deliver_announcement_notifications(session, notifications)
    if push_provider_accepted:
        announcement.push_provider_accepted_count += push_provider_accepted
        await session.commit()
    await session.refresh(announcement)
    return await _announcement_out_with_reads(session, announcement)


async def publish_due_system_announcements(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    published = 0
    while announcement_id := (await session.execute(
        select(SystemAnnouncement.id)
        .where(SystemAnnouncement.status == 'scheduled', SystemAnnouncement.scheduled_at <= now)
        .order_by(SystemAnnouncement.scheduled_at.asc().nullsfirst())
        .limit(1)
        .with_for_update(skip_locked=True)
    )).scalar_one_or_none():
        await publish_system_announcement(session, announcement_id)
        published += 1
    return published


async def publish_system_bot_message(
    session: AsyncSession,
    admin_user_id: UUID,
    request: MessageCreateRequest,
) -> MessageOut:
    branch = await _get_official_branch(session, admin_user_id)
    message = await create_message(session, admin_user_id, branch.id, request)
    record_admin_audit(session, admin_user_id, 'system_bot.message_published', 'branch', str(branch.id), {'message_id': str(message.id)})
    await session.commit()
    return message


async def edit_system_bot_message(
    session: AsyncSession,
    admin_user_id: UUID,
    message_id: UUID,
    text: str,
) -> MessageOut:
    branch = await _get_official_branch(session, admin_user_id)
    message = await edit_message(session, admin_user_id, branch.id, message_id, text)
    record_admin_audit(session, admin_user_id, 'system_bot.message_edited', 'branch', str(branch.id), {'message_id': str(message.id)})
    await session.commit()
    return message


async def delete_system_bot_message(
    session: AsyncSession,
    admin_user_id: UUID,
    message_id: UUID,
) -> MessageOut:
    branch = await _get_official_branch(session, admin_user_id)
    message = await delete_message(session, admin_user_id, branch.id, message_id)
    record_admin_audit(session, admin_user_id, 'system_bot.message_deleted', 'branch', str(branch.id), {'message_id': str(message.id)})
    await session.commit()
    return message


async def toggle_system_bot_message_pin(
    session: AsyncSession,
    admin_user_id: UUID,
    message_id: UUID,
) -> tuple[MessageOut, bool]:
    branch = await _get_official_branch(session, admin_user_id)
    chat = await toggle_pin_message(session, admin_user_id, branch.id, message_id)
    is_pinned = chat.pinned_message_id == message_id
    record_admin_audit(
        session,
        admin_user_id,
        'system_bot.message_pinned' if is_pinned else 'system_bot.message_unpinned',
        'branch',
        str(branch.id),
        {'message_id': str(message_id)},
    )
    await session.commit()
    messages = await list_messages(session, admin_user_id, branch.id)
    message = next(item for item in messages if item.id == message_id)
    return message, is_pinned


async def _get_official_branch(session: AsyncSession, admin_user_id: UUID) -> Chat:
    await require_admin(session, admin_user_id)
    branch = await ensure_official_branch(session)
    if not branch or not branch.is_official:
        raise AdminError('Ara Updates is unavailable until an administrator account is configured')
    return branch


async def _ensure_audience_branch(session: AsyncSession, branch_id: UUID | None) -> None:
    branch = await session.get(Chat, branch_id)
    if not branch or branch.type != 'branch' or branch.is_archived:
        raise AdminError('Public branch not found')


async def _get_editable_announcement(session: AsyncSession, announcement_id: UUID) -> SystemAnnouncement:
    announcement = (await session.execute(
        select(SystemAnnouncement)
        .where(SystemAnnouncement.id == announcement_id)
        .with_for_update()
    )).scalar_one_or_none()
    if not announcement:
        raise AdminError('Announcement not found')
    if announcement.status not in ANNOUNCEMENT_EDITABLE_STATUSES:
        raise AdminError('Published announcement cannot be changed')
    return announcement


def _validate_announcement(
    text: str,
    audience_type: str,
    audience_country: str | None,
    audience_branch_id: UUID | None,
    scheduled_at: datetime | None,
) -> None:
    if not text:
        raise AdminError('Announcement text cannot be empty')
    if audience_type not in ANNOUNCEMENT_AUDIENCES:
        raise AdminError('Unsupported announcement audience')
    if (audience_type == 'country' and not audience_country) or (audience_type != 'country' and audience_country):
        raise AdminError('Country audience requires a country code only')
    if (audience_type == 'branch' and not audience_branch_id) or (audience_type != 'branch' and audience_branch_id):
        raise AdminError('Branch audience requires a public branch only')
    if scheduled_at and scheduled_at.tzinfo is None:
        raise AdminError('Publication time must include a time zone')
    if scheduled_at and scheduled_at <= datetime.now(timezone.utc):
        raise AdminError('Publication time must be in the future')


def _normalize_country(value: str | None) -> str | None:
    return value.strip().upper() or None if value else None


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


def _announcement_out(announcement: SystemAnnouncement, read_count: int) -> dict:
    return {
        'id': str(announcement.id),
        'text': announcement.text,
        'audience_type': announcement.audience_type,
        'audience_country': announcement.audience_country,
        'audience_branch_id': str(announcement.audience_branch_id) if announcement.audience_branch_id else None,
        'status': announcement.status,
        'scheduled_at': announcement.scheduled_at,
        'published_at': announcement.published_at,
        'cancelled_at': announcement.cancelled_at,
        'recipient_count': announcement.recipient_count,
        'notification_count': announcement.notification_count,
        'push_provider_accepted_count': announcement.push_provider_accepted_count,
        'read_count': read_count,
        'message_id': str(announcement.message_id) if announcement.message_id else None,
        'created_at': announcement.created_at,
        'updated_at': announcement.updated_at,
    }


async def _announcement_out_with_reads(session: AsyncSession, announcement: SystemAnnouncement) -> dict:
    read_count = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.announcement_id == announcement.id,
            Notification.read_at.is_not(None),
        )
    )).scalar_one())
    return _announcement_out(announcement, read_count)
