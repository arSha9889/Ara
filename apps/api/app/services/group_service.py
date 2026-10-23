import hashlib
import secrets
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant, Message
from app.models.storage import StoredObject
from app.models.users import User, UserProfile
from app.services.auth_service import AuthError
from app.services.chat_service import create_group_system_message
from app.services.storage_service import delete_storage_object
from app.services.stored_object_service import attach_uploaded_channel_avatar


GROUP_MEMBER_ROLES = frozenset({'owner', 'admin', 'member'})


async def create_group(
    session: AsyncSession,
    owner_user_id: UUID,
    title: str,
    description: str,
    avatar_ref: str | None,
    member_user_ids: list[UUID],
) -> tuple[Chat, Message]:
    member_ids = set(member_user_ids)
    member_ids.discard(owner_user_id)
    for member_user_id in member_ids:
        await _require_active_user(session, member_user_id)

    group = Chat(
        type='group',
        title=title.strip(),
        description=description.strip(),
        avatar_ref=None,
        is_private=True,
    )
    session.add(group)
    await session.flush()
    session.add(ChatParticipant(chat_id=group.id, user_id=owner_user_id, role='owner'))
    session.add_all(
        ChatParticipant(chat_id=group.id, user_id=member_user_id, role='member')
        for member_user_id in member_ids
    )
    if avatar_ref:
        try:
            await attach_uploaded_channel_avatar(session, owner_user_id, group.id, avatar_ref)
        except ValueError as exc:
            raise AuthError(str(exc)) from exc
        group.avatar_ref = avatar_ref
    message = await create_group_system_message(
        session,
        group.id,
        owner_user_id,
        'group_created',
        {'member_count': len(member_ids) + 1},
        commit=False,
    )
    await session.commit()
    return group, message


async def update_group(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    *,
    title: str | None = None,
    description: str | None = None,
    avatar_ref: str | None = None,
    update_avatar: bool = False,
) -> Chat:
    group, actor = await _require_group_member(session, actor_user_id, chat_id)
    if actor.role != 'owner':
        raise AuthError('Only the group owner can edit this group')
    if title is not None:
        group.title = title.strip()
    if description is not None:
        group.description = description.strip()
    if update_avatar:
        if not avatar_ref:
            raise AuthError('Group avatar cannot be empty')
        try:
            await attach_uploaded_channel_avatar(session, actor_user_id, group.id, avatar_ref)
        except ValueError as exc:
            raise AuthError(str(exc)) from exc
        group.avatar_ref = avatar_ref
    await session.commit()
    return group


async def add_group_member(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    member_user_id: UUID,
) -> tuple[Chat, Message, dict[str, str]]:
    group, _ = await _require_group_manager(session, actor_user_id, chat_id)
    await _require_active_user(session, member_user_id)
    if await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id}):
        raise AuthError('User is already a group member')
    session.add(ChatParticipant(chat_id=chat_id, user_id=member_user_id, role='member'))
    member = await _system_user(session, member_user_id)
    message = await create_group_system_message(
        session,
        chat_id,
        actor_user_id,
        'member_added',
        {'member': member},
        commit=False,
    )
    await session.commit()
    return group, message, member


async def join_group_by_invite(
    session: AsyncSession,
    user_id: UUID,
    invite_token: str,
) -> tuple[Chat, Message | None, bool]:
    normalized_token = invite_token.strip()
    group = await session.scalar(
        select(Chat).where(
            Chat.type == 'group',
            Chat.is_private.is_(True),
            Chat.invite_token_hash == _invite_token_hash(normalized_token),
        ).limit(1)
    )
    if not group:
        raise AuthError('Invite link is invalid or revoked')
    if await session.get(ChatParticipant, {'chat_id': group.id, 'user_id': user_id}):
        return group, None, False

    await _require_active_user(session, user_id)
    session.add(ChatParticipant(chat_id=group.id, user_id=user_id, role='member'))
    message = await create_group_system_message(
        session,
        group.id,
        user_id,
        'member_joined',
        {'member': await _system_user(session, user_id)},
        commit=False,
    )
    await session.commit()
    return group, message, True


async def leave_group(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
) -> tuple[Message, set[UUID]]:
    _, participant = await _require_group_member(session, user_id, chat_id)
    if participant.role == 'owner':
        raise AuthError('Transfer group ownership before leaving')
    member = await _system_user(session, user_id)
    await session.delete(participant)
    message = await create_group_system_message(
        session,
        chat_id,
        user_id,
        'member_left',
        {'member': member},
        commit=False,
    )
    remaining_user_ids = await _group_member_ids(session, chat_id)
    await session.commit()
    return message, remaining_user_ids


async def remove_group_member(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    member_user_id: UUID,
) -> tuple[Message, set[UUID], dict[str, str]]:
    _, actor = await _require_group_manager(session, actor_user_id, chat_id)
    member = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id})
    if not member:
        raise AuthError('Group member not found')
    if member.user_id == actor_user_id:
        raise AuthError('Leave the group instead of removing yourself')
    if member.role == 'owner':
        raise AuthError('Group owner cannot be removed')
    member_data = await _system_user(session, member_user_id)
    await session.delete(member)
    message = await create_group_system_message(
        session,
        chat_id,
        actor_user_id,
        'member_removed',
        {'member': member_data},
        commit=False,
    )
    remaining_user_ids = await _group_member_ids(session, chat_id)
    await session.commit()
    return message, remaining_user_ids, member_data


async def update_group_member_role(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    member_user_id: UUID,
    role: str,
) -> tuple[Message | None, set[UUID], dict[str, str] | None]:
    _, actor = await _require_group_member(session, actor_user_id, chat_id)
    if actor.role != 'owner':
        raise AuthError('Only the group owner can change member roles')
    if role not in {'admin', 'member'}:
        raise AuthError('Unsupported group role')
    member = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id})
    if not member:
        raise AuthError('Group member not found')
    if member.role == 'owner':
        raise AuthError('Use ownership transfer to change the owner role')
    if member.role == role:
        return None, await _group_member_ids(session, chat_id), None

    member.role = role
    member_data = await _system_user(session, member_user_id)
    message = await create_group_system_message(
        session,
        chat_id,
        actor_user_id,
        'member_role_changed',
        {'member': member_data, 'role': role},
        commit=False,
    )
    member_ids = await _group_member_ids(session, chat_id)
    await session.commit()
    return message, member_ids, member_data


async def transfer_group_ownership(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    next_owner_user_id: UUID,
) -> tuple[Message, set[UUID], dict[str, str]]:
    _, actor = await _require_group_member(session, actor_user_id, chat_id)
    if actor.role != 'owner':
        raise AuthError('Only the group owner can transfer ownership')
    if next_owner_user_id == actor_user_id:
        raise AuthError('Select another group member as the owner')
    next_owner = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': next_owner_user_id})
    if not next_owner:
        raise AuthError('Group member not found')
    actor.role = 'admin'
    next_owner.role = 'owner'
    next_owner_data = await _system_user(session, next_owner_user_id)
    message = await create_group_system_message(
        session,
        chat_id,
        actor_user_id,
        'ownership_transferred',
        {'owner': next_owner_data},
        commit=False,
    )
    member_ids = await _group_member_ids(session, chat_id)
    await session.commit()
    return message, member_ids, next_owner_data


async def delete_group(session: AsyncSession, actor_user_id: UUID, chat_id: UUID) -> set[UUID]:
    group, actor = await _require_group_member(session, actor_user_id, chat_id)
    if actor.role != 'owner':
        raise AuthError('Only the group owner can delete this group')

    member_ids = await _group_member_ids(session, chat_id)
    stored_objects = list((await session.execute(
        select(StoredObject)
        .outerjoin(Message, Message.id == StoredObject.message_id)
        .where(or_(StoredObject.chat_id == chat_id, Message.chat_id == chat_id))
        .with_for_update()
    )).scalars())
    for stored_object in stored_objects:
        await delete_storage_object(stored_object.storage_key)

    await session.delete(group)
    await session.commit()
    return member_ids


async def generate_group_invite(session: AsyncSession, actor_user_id: UUID, chat_id: UUID) -> str:
    group, _ = await _require_group_manager(session, actor_user_id, chat_id)
    invite_token = _new_invite_token()
    group.invite_token_hash = _invite_token_hash(invite_token)
    await session.commit()
    return invite_token


async def revoke_group_invite(session: AsyncSession, actor_user_id: UUID, chat_id: UUID) -> None:
    group, _ = await _require_group_manager(session, actor_user_id, chat_id)
    group.invite_token_hash = None
    await session.commit()


async def group_invite_is_active(session: AsyncSession, actor_user_id: UUID, chat_id: UUID) -> bool:
    group, _ = await _require_group_manager(session, actor_user_id, chat_id)
    return bool(group.invite_token_hash)


async def list_group_members(session: AsyncSession, user_id: UUID, chat_id: UUID) -> list[dict[str, object]]:
    await _require_group_member(session, user_id, chat_id)
    result = await session.execute(
        select(ChatParticipant, UserProfile)
        .join(UserProfile, UserProfile.user_id == ChatParticipant.user_id)
        .where(ChatParticipant.chat_id == chat_id)
        .order_by(
            ChatParticipant.role.asc(),
            ChatParticipant.joined_at.asc(),
        )
    )
    return [
        {
            'user_id': participant.user_id,
            'display_name': profile.display_name,
            'username': profile.username,
            'avatar_type': profile.avatar_type,
            'avatar_ref': profile.avatar_ref,
            'role': participant.role,
            'joined_at': participant.joined_at,
        }
        for participant, profile in result.all()
    ]


async def _require_group_member(session: AsyncSession, user_id: UUID, chat_id: UUID) -> tuple[Chat, ChatParticipant]:
    group = await session.get(Chat, chat_id)
    if not group or group.type != 'group' or not group.is_private:
        raise AuthError('Group not found')
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if not participant or participant.role not in GROUP_MEMBER_ROLES:
        raise AuthError('Group not found')
    return group, participant


async def _require_group_manager(session: AsyncSession, user_id: UUID, chat_id: UUID) -> tuple[Chat, ChatParticipant]:
    group, participant = await _require_group_member(session, user_id, chat_id)
    if participant.role not in {'owner', 'admin'}:
        raise AuthError('Only group administrators can manage this group')
    return group, participant


async def _require_active_user(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    if not user or user.deleted_at or user.status != 'active':
        raise AuthError('Active user not found')
    return user


async def _group_member_ids(session: AsyncSession, chat_id: UUID) -> set[UUID]:
    return set((await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars())


async def _system_user(session: AsyncSession, user_id: UUID) -> dict[str, str]:
    profile = await session.get(UserProfile, user_id)
    return {
        'user_id': str(user_id),
        'display_name': profile.display_name if profile else '',
    }


def _new_invite_token() -> str:
    return secrets.token_urlsafe(32)


def _invite_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def group_invite_link(token: str) -> str:
    return f'arachat://group-invite/{token}'
