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
from app.schemas.chats import BranchCommentCreateRequest, BranchCommentOut, BranchCommentUpdateRequest, BranchInviteJoinRequest, BranchInviteOut, BranchInviteStateOut, BranchMemberOut, BranchMemberUpdateRequest, BranchNotificationsUpdateRequest, BranchPostCommentsUpdateRequest, ChatBulkHideOut, ChatE2eeKeyOut, ChatOut, ChatWallpaperUpdateRequest, DirectChatCreateRequest, MessageCreateRequest, MessageOut, MessageReactionRequest, MessageReadRequest, MessageUpdateRequest, PrivateBranchCreateOut, PrivateBranchCreateRequest, PrivateBranchUpdateRequest, PublicBranchCreateRequest
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.chat_service import create_message as create_chat_message
from app.services.chat_service import create_or_get_direct_chat, create_or_get_direct_chat_for_user, create_or_get_saved_chat, get_chat as get_user_chat, hide_all_direct_chats, hide_chat, restore_chat, update_chat_wallpaper
from app.services.chat_service import delete_message as delete_chat_message
from app.services.chat_service import edit_message as edit_chat_message
from app.services.chat_service import get_message as get_chat_message
from app.services.chat_service import list_chats as list_user_chats
from app.services.chat_service import list_messages as list_chat_messages
from app.services.chat_service import mark_messages_read, set_branch_post_comments_enabled, toggle_pin_message, toggle_reaction
from app.services.e2ee_service import list_direct_chat_e2ee_keys
from app.services.branch_comment_service import create_branch_comment, delete_branch_comment, get_branch_post_author_id, list_branch_comments, update_branch_comment
from app.services.branch_service import create_private_branch, create_public_branch, generate_private_branch_invite, join_private_branch_by_invite, leave_private_branch, list_private_branch_members, list_public_branches, private_branch_invite_is_active, private_branch_invite_link, remove_private_branch_member, revoke_private_branch_invite, subscribe_to_branch, unsubscribe_from_branch, update_branch_notifications, update_private_branch, update_private_branch_member
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


@router.delete('', response_model=ChatBulkHideOut)
async def hide_all_user_chats(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatBulkHideOut:
    return ChatBulkHideOut(hidden_count=await hide_all_direct_chats(session, current_user.id))


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


@router.post('/branches/private', response_model=PrivateBranchCreateOut)
async def create_private_channel(
    request: PrivateBranchCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PrivateBranchCreateOut:
    try:
        branch, invite_token = await create_private_branch(
            session,
            current_user.id,
            request.title,
            request.description,
            request.avatar_ref,
        )
        return PrivateBranchCreateOut(
            chat=await get_user_chat(session, current_user.id, branch.id),
            invite=BranchInviteOut(invite_link=private_branch_invite_link(invite_token)),
        )
    except (AuthError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/branches/join')
async def join_private_channel(
    request: BranchInviteJoinRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await join_private_branch_by_invite(session, current_user.id, request.invite_token)
        return await get_user_chat(session, current_user.id, branch.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch('/branches/{chat_id}')
async def update_private_channel(
    chat_id: UUID,
    request: PrivateBranchUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await update_private_branch(
            session,
            current_user.id,
            chat_id,
            title=request.title,
            description=request.description,
            avatar_ref=request.avatar_ref,
            update_avatar='avatar_ref' in request.model_fields_set,
        )
        return await get_user_chat(session, current_user.id, branch.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/branches/{chat_id}/leave', status_code=status.HTTP_204_NO_CONTENT)
async def leave_private_channel(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    try:
        await leave_private_branch(session, current_user.id, chat_id)
        await realtime_manager.unsubscribe_users_from_chats({current_user.id}, [chat_id])
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('/branches/{chat_id}/invite', response_model=BranchInviteStateOut)
async def private_channel_invite_state(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchInviteStateOut:
    try:
        return BranchInviteStateOut(is_active=await private_branch_invite_is_active(session, current_user.id, chat_id))
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post('/branches/{chat_id}/invite', response_model=BranchInviteOut)
async def generate_private_channel_invite(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchInviteOut:
    try:
        token = await generate_private_branch_invite(session, current_user.id, chat_id)
        return BranchInviteOut(invite_link=private_branch_invite_link(token))
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete('/branches/{chat_id}/invite', response_model=BranchInviteStateOut)
async def revoke_private_channel_invite(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchInviteStateOut:
    try:
        await revoke_private_branch_invite(session, current_user.id, chat_id)
        return BranchInviteStateOut(is_active=False)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('/branches/{chat_id}/members', response_model=list[BranchMemberOut])
async def list_private_channel_members(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BranchMemberOut]:
    try:
        return [BranchMemberOut(**member) for member in await list_private_branch_members(session, current_user.id, chat_id)]
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch('/branches/{chat_id}/members/{member_user_id}', status_code=status.HTTP_204_NO_CONTENT)
async def update_private_channel_member(
    chat_id: UUID,
    member_user_id: UUID,
    request: BranchMemberUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    try:
        await update_private_branch_member(session, current_user.id, chat_id, member_user_id, request.role)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete('/branches/{chat_id}/members/{member_user_id}', status_code=status.HTTP_204_NO_CONTENT)
async def remove_private_channel_member(
    chat_id: UUID,
    member_user_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    try:
        await remove_private_branch_member(session, current_user.id, chat_id, member_user_id)
        await realtime_manager.unsubscribe_users_from_chats({member_user_id}, [chat_id])
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch('/branches/{chat_id}/notifications')
async def update_channel_notifications(
    chat_id: UUID,
    request: BranchNotificationsUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        branch = await update_branch_notifications(session, current_user.id, chat_id, request.enabled)
        return await get_user_chat(session, current_user.id, branch.id)
    except AuthError as exc:
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
        chat = await get_user_chat(session, current_user.id, branch.id)
        if not chat.is_subscribed:
            await realtime_manager.unsubscribe_users_from_chats({current_user.id}, [chat_id])
        return chat
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch('/branches/{branch_id}/messages/{post_id}/comments-enabled', response_model=MessageOut)
async def update_branch_post_comments(
    branch_id: UUID,
    post_id: UUID,
    request: BranchPostCommentsUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MessageOut:
    try:
        message = await set_branch_post_comments_enabled(
            session,
            current_user.id,
            branch_id,
            post_id,
            request.comments_enabled,
        )
    except AuthError as exc:
        return domain_error_response(exc, status.HTTP_400_BAD_REQUEST)
    await _broadcast_chat_event(
        session,
        branch_id,
        {'event': 'message.updated', 'chat_id': str(branch_id), 'message': message.model_dump(mode='json')},
    )
    return message


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
