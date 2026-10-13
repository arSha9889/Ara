import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import BranchComment, Chat, ChatParticipant, ChatPreference, Message, MessageReaction, MessageReceipt, Notification
from app.models.users import User, UserProfile
from app.schemas.chats import ChatOut, ChatPeerOut, ChatPreviewMessageOut, MessageAuthorOut, MessageCreateRequest, MessageOut, MessageReactionOut, MessageReplyOut
from app.services.branch_service import can_post_to_branch, ensure_official_branch
from app.services.auth_service import AuthError
from app.services.call_signaling import CallSession
from app.services.e2ee_service import validate_e2ee_message_envelope
from app.services.media_service import media_url_for_message
from app.services.phone_verification_service import PhoneVerificationError, normalize_phone
from app.services.realtime_manager import realtime_manager
from app.services.safety_service import ensure_chat_interaction_allowed, ensure_direct_interaction_allowed, is_user_interaction_blocked
from app.services.stored_object_service import attach_upload_to_message, schedule_message_upload_deletion

MESSAGE_TYPES = {'text', 'photo', 'video', 'video_note', 'voice', 'emoji', 'sticker', 'file'}
STICKER_IDS = frozenset({
    'ara-alt', 'ara-solidity', 'ara-school-holiday', 'ara-aksakal-approves',
    'ara-sigma', 'ara-our-elephant', 'ara-civilization', 'ara-sakhavud',
    'ara-salam-relatives', 'ara-rahmet', 'ara-tea',
})
CHAT_WALLPAPER_IDS = {'default', 'grid', 'waves', 'aurora', 'paper', 'night'}
REACTION_EMOJIS = {
    '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '😍', '🥰',
    '😁', '😆', '🤣', '😊', '😎', '🤩', '😘', '😋', '😜', '🤪',
    '😇', '🙂', '🙃', '😉', '🤗', '🤭', '🤔', '🫡', '🤝', '💪',
    '🙌', '👌', '✌️', '🤞', '🤟', '🤘', '👀', '💯', '✨', '⭐',
    '🌟', '💫', '⚡', '☄️', '💥', '🎉', '🎊', '🏆', '🥇', '💎',
    '🚀', '🌈', '☀️', '🌙', '🫶', '💖', '💙', '💜', '🧡', '💚',
    '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💘', '😱',
    '😳', '🥺', '😭', '😤', '😡', '🤯', '😴', '🤤', '🤠', '🥳',
    '😈', '👻', '🤖', '👽', '🙈', '🙉', '🙊', '🐱', '🐶', '🦊',
    '🐼', '🦄', '🍀', '🌹', '🍕', '🍓', '🍿', '☕', '🎵', '🎮',
}


async def list_chats(session: AsyncSession, user_id: UUID) -> list[ChatOut]:
    await ensure_official_branch(session)
    result = await session.execute(
        select(Chat)
        .join(ChatParticipant, ChatParticipant.chat_id == Chat.id)
        .where(
            ChatParticipant.user_id == user_id,
            ChatParticipant.role != 'pending',
            ChatParticipant.hidden_at.is_(None),
            (Chat.type != 'branch') | Chat.is_archived.is_(False),
        )
        .order_by(Chat.updated_at.desc())
    )
    visible_chats = []
    for chat in result.scalars():
        try:
            await ensure_chat_interaction_allowed(session, user_id, chat)
        except AuthError:
            continue
        visible_chats.append(await _chat_out(session, chat, user_id))
    return visible_chats


async def create_or_get_direct_chat(session: AsyncSession, user_id: UUID, country: str, phone: str) -> ChatOut:
    other_user = await _find_user_by_phone(session, country, phone)
    return await create_or_get_direct_chat_for_user(session, user_id, other_user.id)


async def create_or_get_direct_chat_for_user(session: AsyncSession, user_id: UUID, other_user_id: UUID) -> ChatOut:
    other_user = await session.get(User, other_user_id)
    if not other_user or other_user.deleted_at:
        raise AuthError('User not found')
    if other_user.id == user_id:
        raise AuthError('Cannot create direct chat with yourself')
    await ensure_direct_interaction_allowed(session, user_id, other_user.id)

    existing = await session.execute(
        select(ChatParticipant.chat_id)
        .where(ChatParticipant.user_id.in_([user_id, other_user.id]))
        .group_by(ChatParticipant.chat_id)
        .having(func.count(ChatParticipant.user_id) == 2)
    )
    for chat_id in existing.scalars():
        chat = await session.get(Chat, chat_id)
        if chat and chat.type == 'direct':
            participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
            if participant and (participant.role == 'pending' or participant.hidden_at):
                participant.role = 'member'
                participant.hidden_at = None
                await session.commit()
            return await _chat_out(session, chat, user_id)

    chat = Chat(type='direct')
    session.add(chat)
    await session.flush()
    session.add_all([
        ChatParticipant(chat_id=chat.id, user_id=user_id, role='member'),
        ChatParticipant(chat_id=chat.id, user_id=other_user.id, role='pending'),
    ])
    await session.commit()
    return await _chat_out(session, chat, user_id)


async def create_or_get_saved_chat(session: AsyncSession, user_id: UUID) -> ChatOut:
    existing = await session.execute(
        select(Chat)
        .join(ChatParticipant, ChatParticipant.chat_id == Chat.id)
        .where(Chat.type == 'saved', ChatParticipant.user_id == user_id)
        .order_by(Chat.created_at.asc())
        .limit(1)
    )
    chat = existing.scalar_one_or_none()
    if chat:
        return await _chat_out(session, chat, user_id)

    chat = Chat(type='saved')
    session.add(chat)
    await session.flush()
    session.add(ChatParticipant(chat_id=chat.id, user_id=user_id, role='owner'))
    await session.commit()
    return await _chat_out(session, chat, user_id)


async def get_chat(session: AsyncSession, user_id: UUID, chat_id: UUID) -> ChatOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_view(session, user_id, chat)
    return await _chat_out(session, chat, user_id)


async def hide_chat(session: AsyncSession, user_id: UUID, chat_id: UUID) -> None:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'direct':
        raise AuthError('Only direct chats can be hidden')
    await _ensure_can_view(session, user_id, chat)
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    participant.hidden_at = datetime.now(timezone.utc)
    await session.commit()


async def restore_chat(session: AsyncSession, user_id: UUID, chat_id: UUID) -> ChatOut:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'direct':
        raise AuthError('Only direct chats can be restored')
    await _ensure_can_view(session, user_id, chat)
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    participant.hidden_at = None
    await session.commit()
    return await _chat_out(session, chat, user_id)


async def update_chat_wallpaper(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
    wallpaper_id: str,
) -> ChatOut:
    if wallpaper_id not in CHAT_WALLPAPER_IDS:
        raise AuthError('Unsupported chat wallpaper')
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_view(session, user_id, chat)
    preference = await session.get(ChatPreference, {'chat_id': chat_id, 'user_id': user_id})
    if preference:
        preference.wallpaper_id = wallpaper_id
    else:
        session.add(ChatPreference(chat_id=chat_id, user_id=user_id, wallpaper_id=wallpaper_id))
    await session.commit()
    return await _chat_out(session, chat, user_id)


async def list_messages(session: AsyncSession, user_id: UUID, chat_id: UUID) -> list[MessageOut]:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_view(session, user_id, chat)
    result = await session.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(100)
    )
    messages = list(result.scalars())
    messages.reverse()
    return [await _message_out(session, message, user_id) for message in messages]


async def get_message(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID) -> MessageOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_view(session, user_id, chat)
    message = await session.get(Message, message_id)
    if not message or message.chat_id != chat_id:
        raise AuthError('Message not found')
    return await _message_out(session, message, user_id)


async def create_message(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
    request: MessageCreateRequest,
    *,
    commit: bool = True,
) -> MessageOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_post(session, user_id, chat)
    if request.encryption_state == 'e2ee_web_v1' and chat.type != 'direct':
        raise AuthError('End-to-end encryption is available only in direct chats')
    _validate_message_request(request)
    if request.encryption_state == 'e2ee_web_v1':
        await validate_e2ee_message_envelope(session, chat_id, user_id, request.text.strip())
    reply_to_message = None
    if request.reply_to_message_id:
        reply_to_message = await session.get(Message, request.reply_to_message_id)
        if not reply_to_message or reply_to_message.chat_id != chat_id:
            raise AuthError('Reply message not found')
        if reply_to_message.deleted_at:
            raise AuthError('Cannot reply to a deleted message')
    message = Message(
        chat_id=chat_id,
        sender_id=user_id,
        reply_to_message_id=reply_to_message.id if reply_to_message else None,
        type=request.type,
        payload=request.text.strip(),
        media_url=request.media_url,
        media_name=request.media_name,
        media_mime_type=request.media_mime_type,
        media_size_bytes=request.media_size_bytes,
        duration_seconds=request.duration_seconds,
        encryption_state=request.encryption_state,
    )
    session.add(message)
    await session.flush()
    await attach_upload_to_message(session, user_id, message.id, request.media_url)
    await _create_delivery_receipts(session, message)
    chat.last_message_id = message.id
    await _activate_direct_chat_participants(session, chat_id)
    await _restore_hidden_chat_recipients(session, chat_id, user_id)
    if commit:
        await session.commit()
    else:
        await session.flush()
    return await _message_out(session, message, user_id)


async def create_call_history_message(
    session: AsyncSession,
    call: CallSession,
    outcome: str,
) -> MessageOut | None:
    if outcome not in {'cancelled', 'rejected'}:
        raise ValueError('Unsupported call history outcome')

    chat = await session.get(Chat, call.chat_id)
    if not chat or chat.type != 'direct':
        return None

    participant_ids = set((await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == call.chat_id)
    )).scalars())
    if participant_ids != {call.caller_user_id, call.callee_user_id}:
        return None
    if await is_user_interaction_blocked(session, call.caller_user_id, call.callee_user_id):
        return None

    message = Message(
        chat_id=call.chat_id,
        sender_id=call.caller_user_id,
        type='call',
        payload=json.dumps({
            'version': 1,
            'call_id': call.call_id,
            'call_type': call.call_type,
            'outcome': outcome,
        }, separators=(',', ':')),
    )
    session.add(message)
    await session.flush()
    await _create_delivery_receipts(session, message)
    chat.last_message_id = message.id
    await _activate_direct_chat_participants(session, call.chat_id)
    await _restore_hidden_chat_recipients(session, call.chat_id, call.caller_user_id)
    await session.commit()
    return await _message_out(session, message, call.caller_user_id)


async def edit_message(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID, text: str) -> MessageOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_post(session, user_id, chat)
    message = await session.get(Message, message_id)
    if not message or message.chat_id != chat_id:
        raise AuthError('Message not found')
    if message.sender_id != user_id:
        raise AuthError('Only the sender can edit this message')
    if message.deleted_at:
        raise AuthError('Deleted message cannot be edited')
    if message.type not in {'text', 'emoji'}:
        raise AuthError('Only text messages can be edited')
    if message.encryption_state == 'e2ee_web_v1':
        raise AuthError('Encrypted messages cannot be edited')
    next_text = text.strip()
    if not next_text:
        raise AuthError('Text message cannot be empty')
    if message.type == 'emoji' and next_text not in REACTION_EMOJIS:
        raise AuthError('Unsupported emoji message')
    message.payload = next_text
    message.edited_at = datetime.now(timezone.utc)
    await session.commit()
    return await _message_out(session, message, user_id)


async def delete_message(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID) -> MessageOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_post(session, user_id, chat)
    message = await session.get(Message, message_id)
    if not message or message.chat_id != chat_id:
        raise AuthError('Message not found')
    if message.sender_id != user_id:
        raise AuthError('Only the sender can delete this message')
    message.deleted_at = datetime.now(timezone.utc)
    message.payload = ''
    await schedule_message_upload_deletion(session, message.id)
    chat = await session.get(Chat, chat_id)
    if chat and chat.pinned_message_id == message_id:
        chat.pinned_message_id = None
    await session.commit()
    return await _message_out(session, message, user_id)


async def toggle_pin_message(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID) -> ChatOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_post(session, user_id, chat)
    message = await session.get(Message, message_id)
    if not message or message.chat_id != chat_id or message.deleted_at:
        raise AuthError('Message not found')
    chat.pinned_message_id = None if chat.pinned_message_id == message_id else message_id
    await session.commit()
    await session.refresh(chat)
    return await _chat_out(session, chat, user_id)


async def toggle_reaction(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID, emoji: str) -> MessageOut:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    if chat.type == 'branch':
        raise AuthError('Reactions are unavailable in public branches')
    await _ensure_can_view(session, user_id, chat)
    message = await session.get(Message, message_id)
    if not message or message.chat_id != chat_id:
        raise AuthError('Message not found')
    if message.deleted_at:
        raise AuthError('Deleted message cannot be reacted to')
    if emoji not in REACTION_EMOJIS:
        raise AuthError('Unsupported reaction')

    result = await session.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user_id,
            MessageReaction.emoji == emoji,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await session.delete(existing)
    else:
        session.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
    await session.commit()
    return await _message_out(session, message, user_id)


async def mark_message_read(session: AsyncSession, user_id: UUID, chat_id: UUID, message_id: UUID) -> MessageOut:
    messages = await mark_messages_read(session, user_id, chat_id, [message_id])
    if not messages:
        message = await session.get(Message, message_id)
        if not message or message.chat_id != chat_id:
            raise AuthError('Message not found')
        return await _message_out(session, message, user_id)
    return messages[0]


async def mark_messages_read(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
    message_ids: list[UUID],
) -> list[MessageOut]:
    chat = await session.get(Chat, chat_id)
    if not chat:
        raise AuthError('Chat not found')
    await _ensure_can_view(session, user_id, chat)
    result = await session.execute(
        select(Message).where(
            Message.chat_id == chat_id,
            Message.id.in_(message_ids),
            Message.sender_id != user_id,
        )
    )
    messages_by_id = {message.id: message for message in result.scalars()}
    messages = [messages_by_id[message_id] for message_id in message_ids if message_id in messages_by_id]
    if not messages:
        return []

    receipts_result = await session.execute(
        select(MessageReceipt).where(
            MessageReceipt.user_id == user_id,
            MessageReceipt.message_id.in_(messages_by_id),
        )
    )
    receipts_by_message_id = {receipt.message_id: receipt for receipt in receipts_result.scalars()}
    now = datetime.now(timezone.utc)
    newly_read_messages = []
    for message in messages:
        receipt = receipts_by_message_id.get(message.id)
        if receipt and receipt.status == 'read':
            continue
        newly_read_messages.append(message)
        if receipt:
            receipt.status = 'read'
            receipt.read_at = now
            if not receipt.delivered_at:
                receipt.delivered_at = now
            continue
        session.add(MessageReceipt(message_id=message.id, user_id=user_id, status='read', delivered_at=now, read_at=now))

    await session.execute(
        update(Notification)
        .where(
            Notification.recipient_user_id == user_id,
            Notification.message_id.in_(messages_by_id),
            Notification.read_at.is_(None),
        )
        .values(read_at=now)
    )

    if not newly_read_messages:
        await session.commit()
        return []

    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if participant:
        participant.last_read_message_id = newly_read_messages[-1].id

    await session.commit()
    return [await _message_out(session, message, user_id) for message in newly_read_messages]


async def _find_user_by_phone(session: AsyncSession, country: str, phone: str) -> User:
    try:
        normalized_phone = normalize_phone(phone, country)
    except PhoneVerificationError as exc:
        raise AuthError(str(exc)) from exc
    statement = (
        select(User)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(
            UserProfile.optional_phone == normalized_phone,
            UserProfile.phone_public.is_(True),
            User.deleted_at.is_(None),
        )
    )
    result = await session.execute(statement)
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError('User not found')
    return user


async def _ensure_participant(session: AsyncSession, user_id: UUID, chat_id: UUID) -> None:
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if not participant:
        raise AuthError('Chat not found')


async def _ensure_can_view(session: AsyncSession, user_id: UUID, chat: Chat) -> None:
    if chat.type == 'branch':
        if chat.is_archived:
            raise AuthError('Public branch not found')
        return
    await _ensure_participant(session, user_id, chat.id)
    await ensure_chat_interaction_allowed(session, user_id, chat)


async def _ensure_can_post(session: AsyncSession, user_id: UUID, chat: Chat) -> None:
    if chat.type == 'branch':
        if not await can_post_to_branch(session, user_id, chat.id):
            raise AuthError('Only branch administrators can post')
        return
    await _ensure_participant(session, user_id, chat.id)
    await ensure_chat_interaction_allowed(session, user_id, chat)


async def _activate_direct_chat_participants(session: AsyncSession, chat_id: UUID) -> None:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'direct':
        return
    await session.execute(
        update(ChatParticipant)
        .where(ChatParticipant.chat_id == chat_id, ChatParticipant.role == 'pending')
        .values(role='member')
    )


async def _restore_hidden_chat_recipients(session: AsyncSession, chat_id: UUID, sender_id: UUID) -> None:
    await session.execute(
        update(ChatParticipant)
        .where(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id != sender_id,
            ChatParticipant.hidden_at.is_not(None),
        )
        .values(hidden_at=None)
    )


def _validate_message_request(request: MessageCreateRequest) -> None:
    if request.type not in MESSAGE_TYPES:
        raise AuthError('Unsupported message type')
    if request.encryption_state == 'plain_web_core' and len(request.text) > 4000:
        raise AuthError('Text message is too long')
    if request.type == 'text' and not request.text.strip():
        raise AuthError('Text message cannot be empty')
    if request.type == 'emoji' and request.text.strip() not in REACTION_EMOJIS:
        raise AuthError('Unsupported emoji message')
    if request.type == 'sticker':
        if request.text.strip() not in STICKER_IDS:
            raise AuthError('Unsupported sticker')
        if request.media_url or request.media_name or request.media_mime_type or request.media_size_bytes or request.duration_seconds:
            raise AuthError('Sticker messages cannot contain media')
    if request.encryption_state == 'e2ee_web_v1':
        if request.type != 'text' or not request.text.strip():
            raise AuthError('End-to-end encryption is available only for text messages')
        if request.media_url or request.media_name or request.media_mime_type or request.media_size_bytes or request.duration_seconds:
            raise AuthError('Encrypted messages cannot contain media')
    if request.type in {'photo', 'video', 'video_note', 'voice', 'file'} and not request.media_url:
        raise AuthError('Media message requires media_url')
    if request.type in {'voice', 'video_note'} and not request.duration_seconds:
        raise AuthError('Timed media message requires duration_seconds')


async def _create_delivery_receipts(session: AsyncSession, message: Message) -> None:
    result = await session.execute(select(ChatParticipant.user_id).where(ChatParticipant.chat_id == message.chat_id))
    now = datetime.now(timezone.utc)
    for participant_id in result.scalars():
        status = 'read' if participant_id == message.sender_id else 'delivered'
        session.add(
            MessageReceipt(
                message_id=message.id,
                user_id=participant_id,
                status=status,
                delivered_at=now,
                read_at=now if status == 'read' else None,
            )
        )


async def _chat_out(session: AsyncSession, chat: Chat, current_user_id: UUID | None = None) -> ChatOut:
    await session.refresh(chat)
    result = await session.execute(select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat.id))
    participant_ids = list(result.scalars())
    wallpaper_id = 'default'
    if current_user_id:
        preference = await session.get(ChatPreference, {'chat_id': chat.id, 'user_id': current_user_id})
        if preference:
            wallpaper_id = preference.wallpaper_id
    return ChatOut(
        id=chat.id,
        type=chat.type,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_id=chat.last_message_id,
        pinned_message_id=chat.pinned_message_id,
        participant_ids=[] if chat.type == 'branch' else participant_ids,
        peer=await _chat_peer_out(session, participant_ids, current_user_id),
        last_message=await _chat_preview_message_out(session, chat.last_message_id),
        pinned_message=await _chat_preview_message_out(session, chat.pinned_message_id),
        unread_count=await _unread_count(session, chat.id, current_user_id),
        title=chat.title,
        slug=chat.slug,
        description=chat.description,
        avatar_ref=chat.avatar_ref,
        is_official=chat.is_official,
        is_subscribed=bool(current_user_id and await session.get(ChatParticipant, {'chat_id': chat.id, 'user_id': current_user_id})),
        subscriber_count=await _subscriber_count(session, chat.id) if chat.type == 'branch' else 0,
        can_post=bool(current_user_id and await can_post_to_branch(session, current_user_id, chat.id)) if chat.type == 'branch' else True,
        wallpaper_id=wallpaper_id,
    )


async def _chat_peer_out(session: AsyncSession, participant_ids: list[UUID], current_user_id: UUID | None) -> ChatPeerOut | None:
    peer_id = next((participant_id for participant_id in participant_ids if participant_id != current_user_id), None)
    if peer_id is None:
        return None
    profile = await session.get(UserProfile, peer_id)
    user = await session.get(User, peer_id)
    if not profile or not user:
        return None
    return ChatPeerOut(
        id=peer_id,
        display_name=profile.display_name,
        username=profile.username,
        avatar_type=profile.avatar_type,
        avatar_ref=profile.avatar_ref,
        is_online=realtime_manager.is_user_online(peer_id),
        last_seen_at=user.last_seen_at,
        active_platforms=realtime_manager.active_platforms(peer_id),
        is_official=_is_official_profile(profile),
    )


async def _unread_count(session: AsyncSession, chat_id: UUID, current_user_id: UUID | None) -> int:
    if current_user_id is None:
        return 0
    result = await session.execute(
        select(func.count(MessageReceipt.id))
        .join(Message, Message.id == MessageReceipt.message_id)
        .where(
            Message.chat_id == chat_id,
            Message.sender_id != current_user_id,
            MessageReceipt.user_id == current_user_id,
            MessageReceipt.read_at.is_(None),
        )
    )
    return int(result.scalar_one() or 0)


async def _chat_preview_message_out(session: AsyncSession, message_id: UUID | None) -> ChatPreviewMessageOut | None:
    if not message_id:
        return None
    message = await session.get(Message, message_id)
    if not message:
        return None
    return ChatPreviewMessageOut(
        id=message.id,
        sender_id=message.sender_id,
        type=message.type,
        payload='' if message.encryption_state == 'e2ee_web_v1' else message.payload,
        media_name=message.media_name,
        encryption_state=message.encryption_state,
        created_at=message.created_at,
    )


async def _message_out(session: AsyncSession, message: Message, current_user_id: UUID) -> MessageOut:
    chat = await session.get(Chat, message.chat_id)
    return MessageOut(
        id=message.id,
        chat_id=message.chat_id,
        sender_id=message.sender_id,
        author=await _message_author_out(session, message.sender_id),
        type=message.type,
        payload=message.payload,
        media_url=await media_url_for_message(session, message),
        media_name=message.media_name,
        media_mime_type=message.media_mime_type,
        media_size_bytes=message.media_size_bytes,
        duration_seconds=message.duration_seconds,
        encryption_state=message.encryption_state,
        delivery_status=await _delivery_status(session, message, current_user_id),
        reply_to=await _message_reply_out(session, message.reply_to_message_id),
        reactions=await _reaction_summary(session, message.id, current_user_id),
        comment_count=await _comment_count(session, message.id) if chat and chat.type == 'branch' else 0,
        created_at=message.created_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        is_pinned=await _is_pinned(session, message),
    )


async def _message_author_out(session: AsyncSession, user_id: UUID) -> MessageAuthorOut | None:
    profile = await session.get(UserProfile, user_id)
    if not profile:
        return None
    return MessageAuthorOut(
        id=user_id,
        display_name=profile.display_name,
        username=profile.username,
        avatar_type=profile.avatar_type,
        avatar_ref=profile.avatar_ref,
        is_official=_is_official_profile(profile),
    )


async def _message_reply_out(session: AsyncSession, message_id: UUID | None) -> MessageReplyOut | None:
    if not message_id:
        return None
    message = await session.get(Message, message_id)
    if not message:
        return None
    return MessageReplyOut(
        id=message.id,
        sender_id=message.sender_id,
        type=message.type,
        payload=message.payload,
        media_name=message.media_name,
        encryption_state=message.encryption_state,
        deleted_at=message.deleted_at,
    )


async def _is_pinned(session: AsyncSession, message: Message) -> bool:
    chat = await session.get(Chat, message.chat_id)
    return bool(chat and chat.pinned_message_id == message.id)


async def _delivery_status(session: AsyncSession, message: Message, current_user_id: UUID) -> str:
    if message.sender_id != current_user_id:
        return 'received'
    result = await session.execute(
        select(MessageReceipt.status).where(
            MessageReceipt.message_id == message.id,
            MessageReceipt.user_id != message.sender_id,
        )
    )
    statuses = list(result.scalars())
    if any(status == 'read' for status in statuses if status):
        return 'read'
    if any(status == 'delivered' for status in statuses if status):
        return 'delivered'
    return 'sent'


async def _reaction_summary(session: AsyncSession, message_id: UUID, current_user_id: UUID) -> list[MessageReactionOut]:
    result = await session.execute(select(MessageReaction).where(MessageReaction.message_id == message_id))
    summary: dict[str, dict[str, object]] = {}
    for reaction in result.scalars():
        item = summary.setdefault(reaction.emoji, {'count': 0, 'reacted_by_me': False})
        item['count'] = int(item['count']) + 1
        if reaction.user_id == current_user_id:
            item['reacted_by_me'] = True
    return [
        MessageReactionOut(emoji=emoji, count=int(item['count']), reacted_by_me=bool(item['reacted_by_me']))
        for emoji, item in summary.items()
    ]


async def _subscriber_count(session: AsyncSession, chat_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(ChatParticipant).where(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.role == 'member',
        )
    )
    return int(result.scalar_one())


async def _comment_count(session: AsyncSession, post_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(BranchComment).where(
            BranchComment.post_id == post_id,
            BranchComment.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


def _is_official_profile(profile: UserProfile) -> bool:
    from app.services.admin_service import is_configured_admin_profile

    return is_configured_admin_profile(profile)
