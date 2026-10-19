import hashlib
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant, ChatPreference
from app.models.users import User, UserProfile
from app.services.admin_service import AdminError, find_configured_admin, record_admin_audit, require_admin
from app.services.auth_service import AuthError
from app.services.stored_object_service import attach_uploaded_channel_avatar


OFFICIAL_BRANCH_SLUG = 'ara-updates'


async def ensure_official_branch(session: AsyncSession) -> Chat | None:
    result = await session.execute(select(Chat).where(Chat.slug == OFFICIAL_BRANCH_SLUG))
    if branch := result.scalar_one_or_none():
        return branch
    owner = await find_configured_admin(session)
    if not owner:
        return None
    branch = Chat(
        type='branch',
        title='Ara Updates',
        slug=OFFICIAL_BRANCH_SLUG,
        description='Official AraChat product updates and announcements.',
        avatar_ref='📣',
        is_official=True,
    )
    session.add(branch)
    await session.flush()
    session.add(ChatParticipant(chat_id=branch.id, user_id=owner.id, role='owner'))
    await session.commit()
    return branch


async def list_public_branches(session: AsyncSession, user_id: UUID) -> list[Chat]:
    await ensure_official_branch(session)
    result = await session.execute(select(Chat).where(
        Chat.type == 'branch',
        Chat.is_private.is_(False),
        Chat.is_archived.is_(False),
    ).order_by(Chat.is_official.desc(), Chat.updated_at.desc()))
    return list(result.scalars())


async def subscribe_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> Chat:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'branch' or chat.is_private or chat.is_archived:
        raise AuthError('Public branch not found')
    if not await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id}):
        session.add(ChatParticipant(chat_id=chat_id, user_id=user_id, role='member'))
        await session.commit()
    return chat


async def unsubscribe_from_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> Chat:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'branch' or chat.is_private or chat.is_archived:
        raise AuthError('Public branch not found')
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if participant and participant.role == 'member':
        await session.delete(participant)
        await session.commit()
    return chat


async def create_public_branch(session: AsyncSession, user_id: UUID, title: str, slug: str, description: str, avatar_ref: str | None) -> Chat:
    await require_admin(session, user_id)
    if await session.scalar(select(Chat.id).where(Chat.slug == slug)):
        raise AuthError('This branch address is already in use')
    branch = Chat(type='branch', title=title.strip(), slug=slug, description=description.strip(), avatar_ref=avatar_ref, is_official=False)
    session.add(branch)
    await session.flush()
    session.add(ChatParticipant(chat_id=branch.id, user_id=user_id, role='owner'))
    record_admin_audit(session, user_id, 'branch.created', 'branch', str(branch.id), {'slug': branch.slug})
    await session.commit()
    return branch


async def create_private_branch(
    session: AsyncSession,
    user_id: UUID,
    title: str,
    description: str,
    avatar_ref: str | None,
) -> tuple[Chat, str]:
    invite_token = _new_invite_token()
    branch = Chat(
        type='branch',
        title=title.strip(),
        description=description.strip(),
        is_private=True,
        invite_token_hash=_invite_token_hash(invite_token),
    )
    session.add(branch)
    await session.flush()
    session.add(ChatParticipant(chat_id=branch.id, user_id=user_id, role='owner'))
    if avatar_ref:
        await attach_uploaded_channel_avatar(session, user_id, branch.id, avatar_ref)
        branch.avatar_ref = avatar_ref
    await session.commit()
    return branch, invite_token


async def update_private_branch(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
    *,
    title: str | None = None,
    description: str | None = None,
    avatar_ref: str | None = None,
    update_avatar: bool = False,
) -> Chat:
    branch, _ = await _require_private_manager(session, user_id, chat_id)
    if title is not None:
        branch.title = title.strip()
    if description is not None:
        branch.description = description.strip()
    if update_avatar:
        if not avatar_ref:
            raise AuthError('Channel avatar cannot be empty')
        try:
            await attach_uploaded_channel_avatar(session, user_id, branch.id, avatar_ref)
        except ValueError as exc:
            raise AuthError(str(exc)) from exc
        branch.avatar_ref = avatar_ref
    await session.commit()
    return branch


async def join_private_branch_by_invite(session: AsyncSession, user_id: UUID, invite_token: str) -> Chat:
    normalized_token = invite_token.strip()
    branch = await session.scalar(
        select(Chat).where(
            Chat.type == 'branch',
            Chat.is_private.is_(True),
            Chat.is_archived.is_(False),
            Chat.invite_token_hash == _invite_token_hash(normalized_token),
        ).limit(1)
    )
    if not branch:
        raise AuthError('Invite link is invalid or revoked')
    if not await session.get(ChatParticipant, {'chat_id': branch.id, 'user_id': user_id}):
        session.add(ChatParticipant(chat_id=branch.id, user_id=user_id, role='member'))
        await session.commit()
    return branch


async def leave_private_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> None:
    branch = await _private_branch(session, chat_id)
    participant = await session.get(ChatParticipant, {'chat_id': branch.id, 'user_id': user_id})
    if not participant:
        raise AuthError('Channel not found')
    if participant.role == 'owner':
        raise AuthError('Transfer channel ownership before leaving')
    await session.delete(participant)
    await session.commit()


async def generate_private_branch_invite(session: AsyncSession, user_id: UUID, chat_id: UUID) -> str:
    branch, _ = await _require_private_manager(session, user_id, chat_id)
    invite_token = _new_invite_token()
    branch.invite_token_hash = _invite_token_hash(invite_token)
    await session.commit()
    return invite_token


async def revoke_private_branch_invite(session: AsyncSession, user_id: UUID, chat_id: UUID) -> None:
    branch, _ = await _require_private_manager(session, user_id, chat_id)
    branch.invite_token_hash = None
    await session.commit()


async def private_branch_invite_is_active(session: AsyncSession, user_id: UUID, chat_id: UUID) -> bool:
    branch, _ = await _require_private_manager(session, user_id, chat_id)
    return bool(branch.invite_token_hash)


async def list_private_branch_members(session: AsyncSession, user_id: UUID, chat_id: UUID) -> list[dict]:
    await _require_private_manager(session, user_id, chat_id)
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


async def update_private_branch_member(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    member_user_id: UUID,
    role: str,
) -> None:
    _, actor = await _require_private_manager(session, actor_user_id, chat_id)
    member = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id})
    if not member:
        raise AuthError('Channel member not found')
    if role not in {'owner', 'admin', 'member'}:
        raise AuthError('Unsupported channel role')
    if member.user_id == actor_user_id and role != actor.role:
        raise AuthError('Use ownership transfer before changing your own role')

    if role == 'owner':
        if actor.role != 'owner':
            raise AuthError('Only the channel owner can transfer ownership')
        if member.role == 'owner':
            return
        await session.execute(
            update(ChatParticipant)
            .where(ChatParticipant.chat_id == chat_id, ChatParticipant.role == 'owner')
            .values(role='admin')
        )
        member.role = 'owner'
    else:
        if member.role == 'owner':
            raise AuthError('Transfer channel ownership before changing the owner role')
        if actor.role != 'owner':
            raise AuthError('Only the channel owner can change member roles')
        member.role = role
    await session.commit()


async def remove_private_branch_member(
    session: AsyncSession,
    actor_user_id: UUID,
    chat_id: UUID,
    member_user_id: UUID,
) -> None:
    _, actor = await _require_private_manager(session, actor_user_id, chat_id)
    member = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id})
    if not member:
        raise AuthError('Channel member not found')
    if member.user_id == actor_user_id:
        raise AuthError('Leave the channel instead of removing yourself')
    if member.role == 'owner':
        raise AuthError('Channel owner cannot be removed')
    if actor.role == 'admin' and member.role != 'member':
        raise AuthError('Administrators can remove members only')
    await session.delete(member)
    await session.commit()


async def update_branch_notifications(session: AsyncSession, user_id: UUID, chat_id: UUID, enabled: bool) -> Chat:
    branch = await session.get(Chat, chat_id)
    if not branch or branch.type != 'branch' or branch.is_archived:
        raise AuthError('Channel not found')
    if not await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id}):
        raise AuthError('Subscribe to this channel first')
    preference = await session.get(ChatPreference, {'chat_id': chat_id, 'user_id': user_id})
    if preference:
        preference.notifications_enabled = enabled
    else:
        session.add(ChatPreference(chat_id=chat_id, user_id=user_id, notifications_enabled=enabled))
    await session.commit()
    return branch


async def can_post_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> bool:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.is_archived:
        return False
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    return bool(participant and participant.role in {'owner', 'admin'})


async def list_admin_branches(session: AsyncSession, user_id: UUID) -> list[dict]:
    await require_admin(session, user_id)
    branches = await session.execute(select(Chat).where(
        Chat.type == 'branch',
        Chat.is_private.is_(False),
    ).order_by(Chat.is_archived.asc(), Chat.updated_at.desc()))
    items = []
    for branch in branches.scalars():
        subscriber_count = int((await session.execute(
            select(func.count()).select_from(ChatParticipant).where(
                ChatParticipant.chat_id == branch.id,
                ChatParticipant.role == 'member',
            )
        )).scalar_one())
        owner = await session.execute(
            select(User, UserProfile)
            .join(UserProfile, UserProfile.user_id == User.id)
            .join(ChatParticipant, ChatParticipant.user_id == User.id)
            .where(ChatParticipant.chat_id == branch.id, ChatParticipant.role == 'owner')
            .limit(1)
        )
        owner_row = owner.one_or_none()
        owner_user, owner_profile = owner_row if owner_row else (None, None)
        items.append({
            'id': str(branch.id),
            'title': branch.title or '',
            'slug': branch.slug or '',
            'description': branch.description or '',
            'avatar_ref': branch.avatar_ref,
            'is_official': branch.is_official,
            'is_archived': branch.is_archived,
            'created_at': branch.created_at,
            'updated_at': branch.updated_at,
            'subscriber_count': subscriber_count,
            'owner_id': str(owner_user.id) if owner_user else None,
            'owner_name': owner_profile.display_name if owner_profile else None,
            'owner_username': owner_profile.username if owner_profile else None,
        })
    return items


async def update_admin_branch(session: AsyncSession, user_id: UUID, chat_id: UUID, title: str, slug: str, description: str, avatar_ref: str | None) -> dict:
    await require_admin(session, user_id)
    branch = await _admin_branch(session, chat_id)
    existing = await session.scalar(select(Chat.id).where(Chat.slug == slug, Chat.id != chat_id))
    if existing:
        raise AdminError('This branch address is already in use')
    branch.title, branch.slug = title.strip(), slug
    branch.description, branch.avatar_ref = description.strip(), avatar_ref
    record_admin_audit(session, user_id, 'branch.updated', 'branch', str(chat_id), {'slug': slug})
    await session.commit()
    branches = await list_admin_branches(session, user_id)
    return next(item for item in branches if item['id'] == str(chat_id))


async def set_admin_branch_archived(session: AsyncSession, user_id: UUID, chat_id: UUID, archived: bool) -> None:
    await require_admin(session, user_id)
    branch = await _admin_branch(session, chat_id)
    if branch.is_official and archived:
        raise AdminError('Official branch cannot be archived')
    branch.is_archived = archived
    branch.archived_at = datetime.now(timezone.utc) if archived else None
    record_admin_audit(session, user_id, 'branch.archived' if archived else 'branch.restored', 'branch', str(chat_id))
    await session.commit()


async def set_admin_branch_member(session: AsyncSession, user_id: UUID, chat_id: UUID, member_user_id: UUID, role: str) -> None:
    await require_admin(session, user_id)
    await _admin_branch(session, chat_id)
    target = await session.get(User, member_user_id)
    if not target or target.deleted_at or target.status != 'active':
        raise AdminError('Active user not found')
    if role == 'owner':
        await session.execute(update(ChatParticipant).where(ChatParticipant.chat_id == chat_id, ChatParticipant.role == 'owner').values(role='admin'))
    member = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': member_user_id})
    if member:
        member.role = role
    else:
        session.add(ChatParticipant(chat_id=chat_id, user_id=member_user_id, role=role))
    record_admin_audit(session, user_id, f'branch.member_{role}', 'branch', str(chat_id), {'user_id': str(member_user_id)})
    await session.commit()


async def _admin_branch(session: AsyncSession, chat_id: UUID) -> Chat:
    branch = await session.get(Chat, chat_id)
    if not branch or branch.type != 'branch' or branch.is_private:
        raise AdminError('Public branch not found')
    return branch


async def _private_branch(session: AsyncSession, chat_id: UUID) -> Chat:
    branch = await session.get(Chat, chat_id)
    if not branch or branch.type != 'branch' or not branch.is_private or branch.is_archived:
        raise AuthError('Channel not found')
    return branch


async def _require_private_manager(session: AsyncSession, user_id: UUID, chat_id: UUID) -> tuple[Chat, ChatParticipant]:
    branch = await _private_branch(session, chat_id)
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if not participant or participant.role not in {'owner', 'admin'}:
        raise AuthError('Only channel administrators can manage this channel')
    return branch, participant


def _new_invite_token() -> str:
    return secrets.token_urlsafe(32)


def _invite_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def private_branch_invite_link(token: str) -> str:
    # The Desktop client accepts this stable link when pasted; registering a
    # system-wide deep-link handler is deliberately outside this first version.
    return f'arachat://channel-invite/{token}'
