from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant, Message
from app.models.storage import StoredObject
from app.models.support import SupportMessage, SupportTicket
from app.services.admin_service import AdminError, require_admin
from app.services.auth_service import AuthError
from app.services.safety_service import ensure_chat_interaction_allowed
from app.services.storage_service import E2EE_ATTACHMENT_FILENAME, E2EE_ATTACHMENT_MIME_TYPE, E2EE_ATTACHMENT_PURPOSE, private_media_url_for


class MediaAccessError(AuthError):
    pass


@dataclass(frozen=True)
class MediaDelivery:
    stored_object: StoredObject
    mime_type: str | None = None
    filename: str | None = None


async def get_private_media(session: AsyncSession, user_id: UUID, object_id: UUID) -> MediaDelivery:
    stored_object = await session.get(StoredObject, object_id)
    if not stored_object:
        raise MediaAccessError('Media not found')
    if stored_object.purpose in {'message', E2EE_ATTACHMENT_PURPOSE} and stored_object.status == 'attached_message':
        return await _message_media(session, user_id, stored_object)
    if stored_object.purpose == 'support' and stored_object.status == 'attached_support_message':
        return await _support_media(session, user_id, stored_object)
    raise MediaAccessError('Media not found')


async def get_public_avatar(session: AsyncSession, object_id: UUID) -> MediaDelivery:
    stored_object = await session.get(StoredObject, object_id)
    if (
        not stored_object
        or stored_object.purpose != 'avatar'
        or stored_object.status not in {'attached_avatar', 'attached_channel_avatar'}
    ):
        raise MediaAccessError('Avatar not found')
    return MediaDelivery(stored_object=stored_object)


async def media_url_for_message(session: AsyncSession, message: Message) -> str | None:
    if message.deleted_at:
        return None
    stored_object = await session.scalar(
        select(StoredObject.id).where(
            StoredObject.message_id == message.id,
            StoredObject.purpose.in_({'message', E2EE_ATTACHMENT_PURPOSE}),
            StoredObject.status == 'attached_message',
        ).limit(1)
    )
    return private_media_url_for(stored_object) if stored_object else message.media_url


async def media_url_for_support_message(session: AsyncSession, message: SupportMessage) -> str | None:
    stored_object = await session.scalar(
        select(StoredObject.id).where(
            StoredObject.support_message_id == message.id,
            StoredObject.purpose == 'support',
            StoredObject.status == 'attached_support_message',
        ).limit(1)
    )
    return private_media_url_for(stored_object) if stored_object else message.attachment_url


async def _message_media(session: AsyncSession, user_id: UUID, stored_object: StoredObject) -> MediaDelivery:
    if not stored_object.message_id:
        raise MediaAccessError('Media not found')
    message = await session.get(Message, stored_object.message_id)
    if not message or message.deleted_at:
        raise MediaAccessError('Media not found')
    chat = await session.get(Chat, message.chat_id)
    if not chat or chat.is_archived:
        raise MediaAccessError('Media not found')
    if chat.type != 'branch' or chat.is_private:
        participant = await session.get(ChatParticipant, {'chat_id': chat.id, 'user_id': user_id})
        if not participant:
            raise MediaAccessError('Media not found')
        try:
            await ensure_chat_interaction_allowed(session, user_id, chat)
        except AuthError as exc:
            raise MediaAccessError('Media not found') from exc
    return MediaDelivery(
        stored_object=stored_object,
        mime_type=E2EE_ATTACHMENT_MIME_TYPE if stored_object.purpose == E2EE_ATTACHMENT_PURPOSE else message.media_mime_type,
        filename=E2EE_ATTACHMENT_FILENAME if stored_object.purpose == E2EE_ATTACHMENT_PURPOSE else message.media_name,
    )


async def _support_media(session: AsyncSession, user_id: UUID, stored_object: StoredObject) -> MediaDelivery:
    if not stored_object.support_message_id:
        raise MediaAccessError('Media not found')
    message = await session.get(SupportMessage, stored_object.support_message_id)
    if not message:
        raise MediaAccessError('Media not found')
    ticket = await session.get(SupportTicket, message.ticket_id)
    if not ticket:
        raise MediaAccessError('Media not found')
    if ticket.requester_user_id != user_id or message.is_internal:
        try:
            await require_admin(session, user_id)
        except AdminError as exc:
            raise MediaAccessError('Media not found') from exc
    return MediaDelivery(
        stored_object=stored_object,
        mime_type=message.attachment_mime_type,
        filename=message.attachment_name,
    )
