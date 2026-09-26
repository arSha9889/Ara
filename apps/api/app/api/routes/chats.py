from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.routes._responses import domain_error_response
from app.db.session import get_db_session
from app.models.chats import Chat, ChatParticipant
from app.schemas.chats import BranchCommentCreateRequest, BranchCommentOut, BranchCommentUpdateRequest, ChatE2eeKeyOut, ChatOut, ChatWallpaperUpdateRequest, DirectChatCreateRequest, MessageCreateRequest, MessageReactionRequest, MessageReadRequest, MessageUpdateRequest, MessageOut, PublicBranchCreateRequest
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.chat_service import create_message as create_chat_message
from app.services.chat_service import create_or_get_direct_chat, create_or_get_direct_chat_for_user, create_or_get_saved_chat, get_chat as get_user_chat, hide_chat, restore_chat, update_chat_wallpaper
from app.services.chat_service import delete_message as delete_chat_message
from app.services.chat_service import edit_message as edit_chat_message
from app.services.chat_service import get_message as get_chat_message
from app.services.chat_service import list_chats as list_user_chats
from app.services.chat_service import list_messages as list_chat_messages
from app.services.chat_service import mark_messages_read, toggle_pin_message, toggle_reaction
from app.services.e2ee_service import list_direct_chat_e2ee_keys
from app.services.branch_comment_service import create_branch_comment, delete_branch_comment, get_branch_post_author_id, list_branch_comments, update_branch_comment
from app.services.branch_service import create_public_branch, list_public_branches, subscribe_to_branch, unsubscribe_from_branch
from app.services.realtime_manager import realtime_manager
from app.services.safety_service import is_user_interaction_blocked
from app.services.notification_service import create_branch_comment_notification, create_message_notifications

router = APIRouter()


async def _broadcast_chat_event(session: AsyncSession, chat_id: UUID, payload: dict) -> None:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'direct':
        await realtime_manager.broadcast_to_chat(chat_id, payload)
        return

    participant_ids = list((await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars())
    if len(participant_ids) != 2 or await is_user_interaction_blocked(session, participant_ids[0], participant_ids[1]):
        return
    for participant_id in participant_ids:
        await realtime_manager.broadcast_to_user(participant_id, payload)


@router.get('')
async def list_chats(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ChatOut]:
    return await list_user_chats(session, current_user.id)


@router.post('/direct')
async def create_direct_chat(
    request: DirectChatCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await create_or_get_direct_chat(session, current_user.id, request.country, request.phone)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.post('/direct/users/{user_id}')
async def create_direct_chat_for_user(
    user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await create_or_get_direct_chat_for_user(session, current_user.id, user_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.post('/saved')
async def create_saved_chat(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await create_or_get_saved_chat(session, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('/branches/public')
async def list_public_branches_route(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ChatOut]:
    branches = await list_public_branches(session, current_user.id)
    return [await get_user_chat(session, current_user.id, branch.id) for branch in branches]


@router.post('/branches')
async def create_branch(
    request: PublicBranchCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await create_public_branch(
            session,
            current_user.id,
            request.title,
            request.slug,
            request.description,
            request.avatar_ref,
        )
        return await get_user_chat(session, current_user.id, branch.id)
    except (AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/branches/{chat_id}/subscribe')
async def subscribe_branch(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await subscribe_to_branch(session, current_user.id, chat_id)
        return await get_user_chat(session, current_user.id, branch.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete('/branches/{chat_id}/subscribe')
async def unsubscribe_branch(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await unsubscribe_from_branch(session, current_user.id, chat_id)
        return await get_user_chat(session, current_user.id, branch.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get('/{chat_id}')
async def get_chat(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await get_user_chat(session, current_user.id, chat_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.delete('/{chat_id}')
async def hide_user_chat(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    try:
        await hide_chat(session, current_user.id, chat_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.post('/{chat_id}/restore')
async def restore_user_chat(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await restore_chat(session, current_user.id, chat_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)


@router.patch('/{chat_id}/wallpaper')
async def update_user_chat_wallpaper(
    chat_id: UUID,
    request: ChatWallpaperUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        chat = await update_chat_wallpaper(session, current_user.id, chat_id, request.wallpaper_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await realtime_manager.broadcast_to_user(
        current_user.id,
        {
            'event': 'chat.wallpaper_updated',
            'chat_id': str(chat_id),
            'wallpaper_id': chat.wallpaper_id,
        },
    )
    return chat


@router.get('/{chat_id}/messages')
async def list_messages(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    cursor: datetime | None = None,
) -> list[MessageOut]:
    try:
        return await list_chat_messages(session, current_user.id, chat_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.get('/{chat_id}/messages/{message_id}')
async def get_message(
    chat_id: UUID,
    message_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        return await get_chat_message(session, current_user.id, chat_id, message_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.get('/{chat_id}/e2ee-keys', response_model=list[ChatE2eeKeyOut])
async def list_e2ee_keys(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ChatE2eeKeyOut]:
    try:
        return await list_direct_chat_e2ee_keys(session, current_user.id, chat_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_404_NOT_FOUND)


@router.get('/{branch_id}/messages/{post_id}/comments', response_model=list[BranchCommentOut])
async def list_branch_comments_route(
    branch_id: UUID,
    post_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    cursor: datetime | None = None,
    limit: int = 50,
) -> list[BranchCommentOut]:
    try:
        return await list_branch_comments(session, current_user.id, branch_id, post_id, cursor, min(max(limit, 1), 100))
    except (AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post('/{branch_id}/messages/{post_id}/comments', response_model=BranchCommentOut)
async def create_branch_comment_route(
    branch_id: UUID,
    post_id: UUID,
    request: BranchCommentCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchCommentOut:
    try:
        comment, comment_count = await create_branch_comment(session, current_user.id, branch_id, post_id, request.text)
        post_author_id = await get_branch_post_author_id(session, branch_id, post_id)
        await create_branch_comment_notification(session, post_author_id, current_user.id, branch_id, post_id, comment.text)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
        branch_id,
        {
            'event': 'branch_comment.created',
            'chat_id': str(branch_id),
            'post_id': str(post_id),
            'comment': comment.model_dump(mode='json'),
            'comment_count': comment_count,
        },
    )
    return comment


@router.patch('/{branch_id}/comments/{comment_id}', response_model=BranchCommentOut)
async def update_branch_comment_route(
    branch_id: UUID,
    comment_id: UUID,
    request: BranchCommentUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchCommentOut:
    try:
        comment = await update_branch_comment(session, current_user.id, branch_id, comment_id, request.text)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
        branch_id,
        {'event': 'branch_comment.updated', 'chat_id': str(branch_id), 'post_id': str(comment.post_id), 'comment': comment.model_dump(mode='json')},
    )
    return comment


@router.delete('/{branch_id}/comments/{comment_id}', response_model=BranchCommentOut)
async def delete_branch_comment_route(
    branch_id: UUID,
    comment_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchCommentOut:
    try:
        comment, comment_count = await delete_branch_comment(session, current_user.id, branch_id, comment_id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
        branch_id,
        {
            'event': 'branch_comment.deleted',
            'chat_id': str(branch_id),
            'post_id': str(comment.post_id),
            'comment': comment.model_dump(mode='json'),
            'comment_count': comment_count,
        },
    )
    return comment


@router.post('/{chat_id}/messages')
async def create_message(
    chat_id: UUID,
    request: MessageCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await create_chat_message(session, current_user.id, chat_id, request)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await create_message_notifications(session, message)
    message_event = {
        'event': 'message.created',
        'chat_id': str(chat_id),
        'message': message.model_dump(mode='json'),
    }
    await _broadcast_chat_event(session, chat_id, message_event)
    return message


@router.patch('/{chat_id}/messages/{message_id}')
async def update_message(
    chat_id: UUID,
    message_id: UUID,
    request: MessageUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await edit_chat_message(session, current_user.id, chat_id, message_id, request.text)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await _broadcast_chat_event(
        session,
        chat_id,
        {
            'event': 'message.updated',
            'chat_id': str(chat_id),
            'message': message.model_dump(mode='json'),
        },
    )
    return message


@router.delete('/{chat_id}/messages/{message_id}')
async def remove_message(
    chat_id: UUID,
    message_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await delete_chat_message(session, current_user.id, chat_id, message_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await _broadcast_chat_event(
        session,
        chat_id,
        {
            'event': 'message.deleted',
            'chat_id': str(chat_id),
            'message': message.model_dump(mode='json'),
        },
    )
    return message


@router.post('/{chat_id}/messages/{message_id}/pin')
async def pin_message(
    chat_id: UUID,
    message_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        chat = await toggle_pin_message(session, current_user.id, chat_id, message_id)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await _broadcast_chat_event(
        session,
        chat_id,
        {
            'event': 'message.pin_updated',
            'chat_id': str(chat_id),
            'chat': chat.model_dump(mode='json'),
        },
    )
    return chat


@router.post('/{chat_id}/messages/{message_id}/reactions')
async def react_to_message(
    chat_id: UUID,
    message_id: UUID,
    request: MessageReactionRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await toggle_reaction(session, current_user.id, chat_id, message_id, request.emoji)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await _broadcast_chat_event(
        session,
        chat_id,
        {
            'event': 'message.reactions_updated',
            'chat_id': str(chat_id),
            'message': message.model_dump(mode='json'),
        },
    )
    return message


@router.post('/{chat_id}/read')
async def read_message(
    chat_id: UUID,
    request: MessageReadRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[MessageOut]:
    try:
        messages = await mark_messages_read(session, current_user.id, chat_id, request.message_ids)
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    for message in messages:
        await _broadcast_chat_event(
            session,
            chat_id,
            {
                'event': 'message.read',
                'chat_id': str(chat_id),
                'message': message.model_dump(mode='json'),
                'reader_id': str(current_user.id),
            },
        )
    return messages
