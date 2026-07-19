from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.models.chats import ChatParticipant
from app.schemas.chats import ChatOut, DirectChatCreateRequest, MessageCreateRequest, MessageReactionRequest, MessageReadRequest, MessageUpdateRequest, MessageOut
from app.schemas.users import UserOut
from app.services.auth_service import AuthError
from app.services.chat_service import create_message as create_chat_message
from app.services.chat_service import create_or_get_direct_chat, create_or_get_saved_chat, get_chat as get_user_chat
from app.services.chat_service import delete_message as delete_chat_message
from app.services.chat_service import edit_message as edit_chat_message
from app.services.chat_service import list_chats as list_user_chats
from app.services.chat_service import list_messages as list_chat_messages
from app.services.chat_service import mark_messages_read, toggle_pin_message, toggle_reaction
from app.services.realtime_manager import realtime_manager
from app.services.notification_service import create_message_notifications

router = APIRouter()


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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/saved')
async def create_saved_chat(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await create_or_get_saved_chat(session, current_user.id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('/{chat_id}')
async def get_chat(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChatOut:
    try:
        return await get_user_chat(session, current_user.id, chat_id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get('/{chat_id}/messages')
async def list_messages(
    chat_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    cursor: str | None = None,
) -> list[MessageOut]:
    try:
        return await list_chat_messages(session, current_user.id, chat_id)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await create_message_notifications(session, message)
    message_event = {
        'event': 'message.created',
        'chat_id': str(chat_id),
        'message': message.model_dump(mode='json'),
    }
    participant_ids = (await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars()
    for participant_id in participant_ids:
        await realtime_manager.broadcast_to_user(participant_id, message_event)
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await realtime_manager.broadcast_to_chat(
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for message in messages:
        await realtime_manager.broadcast_to_chat(
            chat_id,
            {
                'event': 'message.read',
                'chat_id': str(chat_id),
                'message': message.model_dump(mode='json'),
                'reader_id': str(current_user.id),
            },
        )
    return messages
