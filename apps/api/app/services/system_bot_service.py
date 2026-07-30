from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat
from app.schemas.chats import MessageCreateRequest, MessageOut
from app.services.admin_service import AdminError, record_admin_audit, require_admin
from app.services.branch_service import ensure_official_branch, list_admin_branches
from app.services.chat_service import create_message, delete_message, edit_message, list_messages, toggle_pin_message


async def get_system_bot(session: AsyncSession, admin_user_id: UUID) -> dict:
    branch = await _get_official_branch(session, admin_user_id)
    branches = await list_admin_branches(session, admin_user_id)
    branch_data = next(item for item in branches if item['id'] == str(branch.id))
    messages = await list_messages(session, admin_user_id, branch.id)
    return {'branch': branch_data, 'messages': messages}


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
