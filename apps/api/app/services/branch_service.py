from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant
from app.models.users import User, UserProfile
from app.services.admin_service import AdminError, find_configured_admin, record_admin_audit, require_admin
from app.services.auth_service import AuthError


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
    result = await session.execute(select(Chat).where(Chat.type == 'branch', Chat.is_archived.is_(False)).order_by(Chat.is_official.desc(), Chat.updated_at.desc()))
    return list(result.scalars())


async def subscribe_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> Chat:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'branch' or chat.is_archived:
        raise AuthError('Public branch not found')
    if not await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id}):
        session.add(ChatParticipant(chat_id=chat_id, user_id=user_id, role='member'))
        await session.commit()
    return chat


async def unsubscribe_from_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> Chat:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'branch' or chat.is_archived:
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


async def can_post_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> bool:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.is_archived:
        return False
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    return bool(participant and participant.role in {'owner', 'admin'})


async def list_admin_branches(session: AsyncSession, user_id: UUID) -> list[dict]:
    await require_admin(session, user_id)
    branches = await session.execute(select(Chat).where(Chat.type == 'branch').order_by(Chat.is_archived.asc(), Chat.updated_at.desc()))
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
    if not branch or branch.type != 'branch':
        raise AdminError('Public branch not found')
    return branch
