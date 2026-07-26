from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant
from app.services.admin_service import find_configured_admin, require_admin
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
    result = await session.execute(select(Chat).where(Chat.type == 'branch').order_by(Chat.is_official.desc(), Chat.updated_at.desc()))
    return list(result.scalars())


async def subscribe_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> Chat:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'branch':
        raise AuthError('Public branch not found')
    if not await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id}):
        session.add(ChatParticipant(chat_id=chat_id, user_id=user_id, role='member'))
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
    await session.commit()
    return branch


async def can_post_to_branch(session: AsyncSession, user_id: UUID, chat_id: UUID) -> bool:
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    return bool(participant and participant.role in {'owner', 'admin'})
