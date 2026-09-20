from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.support import SupportMessage, SupportTicket, SupportTicketCounter
from app.models.users import UserProfile
from app.schemas.support import (
    AdminSupportMessageCreateRequest,
    SupportMessageCreateRequest,
    SupportMessageOut,
    SupportPersonOut,
    SupportTicketCreateRequest,
    SupportTicketDetailOut,
    SupportTicketOut,
)
from app.services.admin_service import AdminError, find_configured_admin, require_admin
from app.services.auth_service import AuthError
from app.services.media_service import media_url_for_support_message
from app.services.notification_service import create_support_notification
from app.services.localization import tr
from app.services.stored_object_service import attach_upload_to_support_message


TICKET_STATUSES = {'new', 'in_progress', 'waiting_user', 'resolved', 'closed'}


class SupportError(AuthError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


async def create_ticket(
    session: AsyncSession,
    requester_user_id: UUID,
    request: SupportTicketCreateRequest,
) -> SupportTicketDetailOut:
    ticket = SupportTicket(
        number=await _next_ticket_number(session),
        requester_user_id=requester_user_id,
        category=request.category,
        subject=request.subject.strip(),
        status='new',
    )
    session.add(ticket)
    await session.flush()
    await _create_message(
        session,
        ticket,
        requester_user_id,
        request.message,
        request.attachment_url,
        request.attachment_name,
        request.attachment_mime_type,
        request.attachment_size_bytes,
        is_internal=False,
    )
    session.add(AuditLog(
        actor_user_id=requester_user_id,
        actor_type='user',
        action='support.ticket_created',
        target_type='support_ticket',
        target_id=str(ticket.id),
        metadata_json={'number': ticket.number, 'category': ticket.category},
    ))
    await session.commit()
    await session.refresh(ticket)

    if admin := await find_configured_admin(session):
        profile = await session.get(UserProfile, admin.id)
        await create_support_notification(
            session,
            admin.id,
            ticket.id,
            tr(profile.language if profile else None, 'notification.support.new_ticket_title', number=ticket.number),
            tr(profile.language if profile else None, 'notification.support.new_ticket_body', subject=ticket.subject),
        )
    return await _ticket_detail_out(session, ticket, include_internal=False)


async def list_user_tickets(session: AsyncSession, requester_user_id: UUID) -> list[SupportTicketOut]:
    tickets = (await session.execute(
        select(SupportTicket)
        .where(SupportTicket.requester_user_id == requester_user_id)
        .order_by(SupportTicket.last_message_at.desc())
        .limit(100)
    )).scalars()
    return [await _ticket_out(session, ticket) for ticket in tickets]


async def get_user_ticket(session: AsyncSession, requester_user_id: UUID, ticket_id: UUID) -> SupportTicketDetailOut:
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket or ticket.requester_user_id != requester_user_id:
        raise SupportError('ticket_not_found', 'Support ticket not found.', status_code=404)
    return await _ticket_detail_out(session, ticket, include_internal=False)


async def add_user_message(
    session: AsyncSession,
    requester_user_id: UUID,
    ticket_id: UUID,
    request: SupportMessageCreateRequest,
) -> SupportTicketDetailOut:
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket or ticket.requester_user_id != requester_user_id:
        raise SupportError('ticket_not_found', 'Support ticket not found.', status_code=404)

    was_closed = ticket.status in {'resolved', 'closed'}
    previous_assignee_id = ticket.assigned_to_user_id
    if was_closed:
        ticket.status = 'new'
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.assigned_to_user_id = None

    await _create_message(
        session,
        ticket,
        requester_user_id,
        request.text,
        request.attachment_url,
        request.attachment_name,
        request.attachment_mime_type,
        request.attachment_size_bytes,
        is_internal=False,
    )
    session.add(AuditLog(
        actor_user_id=requester_user_id,
        actor_type='user',
        action='support.message_created',
        target_type='support_ticket',
        target_id=str(ticket.id),
        metadata_json={'number': ticket.number, 'reopened': was_closed},
    ))
    await session.commit()
    await session.refresh(ticket)

    recipient_id = previous_assignee_id or ticket.assigned_to_user_id
    if recipient_id is None and (admin := await find_configured_admin(session)):
        recipient_id = admin.id
    if recipient_id and recipient_id != requester_user_id:
        profile = await session.get(UserProfile, recipient_id)
        await create_support_notification(
            session,
            recipient_id,
            ticket.id,
            tr(profile.language if profile else None, 'notification.support.user_message_title', number=ticket.number),
            request.text.strip()[:240],
        )
    return await _ticket_detail_out(session, ticket, include_internal=False)


async def list_admin_tickets(session: AsyncSession, admin_user_id: UUID, ticket_status: str | None) -> list[SupportTicketOut]:
    await require_admin(session, admin_user_id)
    statement = select(SupportTicket).order_by(SupportTicket.last_message_at.desc()).limit(200)
    if ticket_status:
        if ticket_status not in TICKET_STATUSES:
            raise SupportError('invalid_ticket_status', 'Unsupported support ticket status.')
        statement = statement.where(SupportTicket.status == ticket_status)
    tickets = (await session.execute(statement)).scalars()
    return [await _ticket_out(session, ticket) for ticket in tickets]


async def get_admin_ticket(session: AsyncSession, admin_user_id: UUID, ticket_id: UUID) -> SupportTicketDetailOut:
    await require_admin(session, admin_user_id)
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket:
        raise SupportError('ticket_not_found', 'Support ticket not found.', status_code=404)
    return await _ticket_detail_out(session, ticket, include_internal=True)


async def add_admin_message(
    session: AsyncSession,
    admin_user_id: UUID,
    ticket_id: UUID,
    request: AdminSupportMessageCreateRequest,
) -> SupportTicketDetailOut:
    await require_admin(session, admin_user_id)
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket:
        raise SupportError('ticket_not_found', 'Support ticket not found.', status_code=404)

    if not request.is_internal:
        ticket.assigned_to_user_id = admin_user_id
        if ticket.status in {'new', 'waiting_user'}:
            ticket.status = 'in_progress'
        ticket.resolved_at = None
        ticket.closed_at = None

    await _create_message(
        session,
        ticket,
        admin_user_id,
        request.text,
        request.attachment_url,
        request.attachment_name,
        request.attachment_mime_type,
        request.attachment_size_bytes,
        is_internal=request.is_internal,
    )
    session.add(AuditLog(
        actor_user_id=admin_user_id,
        actor_type='admin',
        action='support.internal_note_created' if request.is_internal else 'support.reply_created',
        target_type='support_ticket',
        target_id=str(ticket.id),
        metadata_json={'number': ticket.number},
    ))
    await session.commit()
    await session.refresh(ticket)

    if not request.is_internal:
        profile = await session.get(UserProfile, ticket.requester_user_id)
        await create_support_notification(
            session,
            ticket.requester_user_id,
            ticket.id,
            tr(profile.language if profile else None, 'notification.support.team_message_title', number=ticket.number),
            request.text.strip()[:240],
        )
    return await _ticket_detail_out(session, ticket, include_internal=True)


async def update_ticket_status(
    session: AsyncSession,
    admin_user_id: UUID,
    ticket_id: UUID,
    next_status: str,
) -> SupportTicketDetailOut:
    await require_admin(session, admin_user_id)
    if next_status not in TICKET_STATUSES:
        raise SupportError('invalid_ticket_status', 'Unsupported support ticket status.')
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket:
        raise SupportError('ticket_not_found', 'Support ticket not found.', status_code=404)

    now = datetime.now(timezone.utc)
    ticket.status = next_status
    ticket.assigned_to_user_id = admin_user_id if next_status in {'in_progress', 'waiting_user', 'resolved'} else ticket.assigned_to_user_id
    ticket.resolved_at = now if next_status == 'resolved' else None
    ticket.closed_at = now if next_status == 'closed' else None
    session.add(AuditLog(
        actor_user_id=admin_user_id,
        actor_type='admin',
        action='support.status_updated',
        target_type='support_ticket',
        target_id=str(ticket.id),
        metadata_json={'number': ticket.number, 'status': next_status},
    ))
    await session.commit()
    await session.refresh(ticket)
    profile = await session.get(UserProfile, ticket.requester_user_id)
    await create_support_notification(
        session,
        ticket.requester_user_id,
        ticket.id,
        tr(profile.language if profile else None, 'notification.support.status_title', number=ticket.number),
        tr(profile.language if profile else None, f'notification.support.status_{next_status}', subject=ticket.subject),
    )
    return await _ticket_detail_out(session, ticket, include_internal=True)


async def _create_message(
    session: AsyncSession,
    ticket: SupportTicket,
    author_user_id: UUID,
    text: str,
    attachment_url: str | None,
    attachment_name: str | None,
    attachment_mime_type: str | None,
    attachment_size_bytes: int | None,
    *,
    is_internal: bool,
) -> SupportMessage:
    has_attachment_metadata = any((attachment_name, attachment_mime_type, attachment_size_bytes is not None))
    if bool(attachment_url) != has_attachment_metadata:
        raise SupportError('invalid_attachment', 'Support attachment metadata is incomplete.')
    message = SupportMessage(
        ticket_id=ticket.id,
        author_user_id=author_user_id,
        text=text.strip(),
        attachment_url=attachment_url,
        attachment_name=attachment_name,
        attachment_mime_type=attachment_mime_type,
        attachment_size_bytes=attachment_size_bytes,
        is_internal=is_internal,
    )
    session.add(message)
    await session.flush()
    try:
        await attach_upload_to_support_message(session, author_user_id, message.id, attachment_url)
    except ValueError as exc:
        raise SupportError('attachment_unavailable', str(exc)) from exc
    ticket.last_message_at = datetime.now(timezone.utc)
    return message


async def _next_ticket_number(session: AsyncSession) -> int:
    next_number = await session.scalar(
        update(SupportTicketCounter)
        .where(SupportTicketCounter.id == 1)
        .values(last_number=SupportTicketCounter.last_number + 1)
        .returning(SupportTicketCounter.last_number)
    )
    if next_number is None:
        try:
            async with session.begin_nested():
                session.add(SupportTicketCounter(id=1, last_number=0))
                await session.flush()
        except IntegrityError:
            # A concurrent request initialized the counter first; retry the atomic increment.
            pass
        next_number = await session.scalar(
            update(SupportTicketCounter)
            .where(SupportTicketCounter.id == 1)
            .values(last_number=SupportTicketCounter.last_number + 1)
            .returning(SupportTicketCounter.last_number)
        )
    if next_number is None:
        raise SupportError('ticket_counter_unavailable', 'Support ticket numbers are temporarily unavailable.', status_code=503)
    return int(next_number)


async def _ticket_out(session: AsyncSession, ticket: SupportTicket) -> SupportTicketOut:
    latest_message = await session.scalar(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket.id, SupportMessage.is_internal.is_(False))
        .order_by(SupportMessage.created_at.desc())
        .limit(1)
    )
    return SupportTicketOut(
        id=ticket.id,
        number=ticket.number,
        category=ticket.category,
        subject=ticket.subject,
        status=ticket.status,
        requester_user_id=ticket.requester_user_id,
        requester=await _person_out(session, ticket.requester_user_id),
        assigned_to_user_id=ticket.assigned_to_user_id,
        assigned_to=await _person_out(session, ticket.assigned_to_user_id),
        last_message_preview=latest_message.text[:240] if latest_message else None,
        last_message_at=ticket.last_message_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


async def _ticket_detail_out(session: AsyncSession, ticket: SupportTicket, *, include_internal: bool) -> SupportTicketDetailOut:
    ticket_out = await _ticket_out(session, ticket)
    statement = select(SupportMessage).where(SupportMessage.ticket_id == ticket.id).order_by(SupportMessage.created_at.asc())
    if not include_internal:
        statement = statement.where(SupportMessage.is_internal.is_(False))
    messages = (await session.execute(statement)).scalars()
    return SupportTicketDetailOut(
        **ticket_out.model_dump(),
        messages=[await _message_out(session, message) for message in messages],
    )


async def _message_out(session: AsyncSession, message: SupportMessage) -> SupportMessageOut:
    return SupportMessageOut(
        id=message.id,
        ticket_id=message.ticket_id,
        author_user_id=message.author_user_id,
        author=await _person_out(session, message.author_user_id),
        text=message.text,
        attachment_url=await media_url_for_support_message(session, message),
        attachment_name=message.attachment_name,
        attachment_mime_type=message.attachment_mime_type,
        attachment_size_bytes=message.attachment_size_bytes,
        is_internal=message.is_internal,
        created_at=message.created_at,
    )


async def _person_out(session: AsyncSession, user_id: UUID | None) -> SupportPersonOut | None:
    if not user_id:
        return None
    profile = await session.get(UserProfile, user_id)
    if not profile:
        return None
    return SupportPersonOut(
        id=user_id,
        display_name=profile.display_name,
        username=profile.username,
        avatar_type=profile.avatar_type,
        avatar_ref=profile.avatar_ref,
    )
