from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, update
from starlette.websockets import WebSocketDisconnect

from app.api.router import api_router
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.domain.tokens import decode_access_token
from app.models.chats import Chat, ChatParticipant
from app.models.users import User
from app.db.health import check_database
from app.services.realtime_manager import realtime_manager
from app.services.redis_client import check_redis
from app.services.storage_service import storage_root


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    app.mount(
        settings.storage_public_url_prefix,
        StaticFiles(directory=storage_root(), check_dir=False),
        name='storage_uploads',
    )

    @app.get('/health')
    async def health() -> dict[str, str]:
        return {'status': 'ok', 'service': 'arachat-api'}

    @app.get('/health/infrastructure')
    async def infrastructure_health() -> dict[str, str]:
        status = {'database': 'unavailable', 'redis': 'unavailable'}
        try:
            if await check_database():
                status['database'] = 'ok'
        except Exception:
            status['database'] = 'unavailable'

        try:
            if await check_redis():
                status['redis'] = 'ok'
        except Exception:
            status['redis'] = 'unavailable'

        return status

    @app.websocket('/ws')
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()
        token = websocket.query_params.get('token')
        if not token:
            await _safe_send_json(websocket, {'event': 'connection.rejected', 'reason': 'missing_token'})
            await _safe_close_websocket(websocket, code=1008)
            return

        try:
            user_id = decode_access_token(token)
        except Exception:
            await _safe_send_json(websocket, {'event': 'connection.rejected', 'reason': 'invalid_token'})
            await _safe_close_websocket(websocket, code=1008)
            return

        if not await _is_active_user(user_id):
            await _safe_send_json(websocket, {'event': 'connection.rejected', 'reason': 'user_not_available'})
            await _safe_close_websocket(websocket, code=1008)
            return

        if not await _safe_send_json(websocket, {'event': 'connection.authenticated', 'user_id': str(user_id)}):
            return
        was_offline = await realtime_manager.connect_user(websocket, user_id)
        if was_offline:
            await _broadcast_presence_to_user_chats(user_id, True)

        try:
            while True:
                message = await websocket.receive_json()
                event = message.get('event')

                if event == 'ping':
                    await _safe_send_json(websocket, {'event': 'pong'})
                    continue

                if event == 'chat.subscribe':
                    chat_id = _parse_uuid(message.get('chat_id'))
                    if not chat_id:
                        await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'invalid_chat_id'})
                        continue
                    if not await _can_subscribe_to_chat(user_id, chat_id):
                        await _safe_send_json(websocket, {'event': 'error.unauthorized', 'reason': 'chat_not_available'})
                        continue
                    await realtime_manager.subscribe(websocket, chat_id)
                    await _safe_send_json(websocket, {'event': 'chat.subscribed', 'chat_id': str(chat_id)})
                    await realtime_manager.broadcast_to_chat(
                        chat_id,
                        {
                            'event': 'presence.status',
                            'chat_id': str(chat_id),
                            'user_id': str(user_id),
                            'is_online': True,
                            'last_seen_at': None,
                        },
                    )
                    continue

                if event == 'chat.unsubscribe':
                    chat_id = _parse_uuid(message.get('chat_id'))
                    if chat_id:
                        await realtime_manager.unsubscribe(websocket, chat_id)
                    await _safe_send_json(websocket, {'event': 'chat.unsubscribed', 'chat_id': str(chat_id) if chat_id else None})
                    continue

                if event in {'typing.started', 'typing.stopped', 'presence.active', 'file.uploading', 'voice.uploading'}:
                    chat_id = _parse_uuid(message.get('chat_id'))
                    if not chat_id:
                        await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'invalid_chat_id'})
                        continue
                    if not await _is_chat_participant(user_id, chat_id):
                        await _safe_send_json(websocket, {'event': 'error.unauthorized', 'reason': 'chat_not_available'})
                        continue
                    await realtime_manager.broadcast_to_chat(
                        chat_id,
                        {
                            'event': event,
                            'chat_id': str(chat_id),
                            'user_id': str(user_id),
                        },
                    )
                    continue

                if isinstance(event, str) and event.startswith('call.'):
                    await _safe_send_json(
                        websocket,
                        {'event': 'error.validation_failed', 'reason': 'calls_temporarily_unavailable'},
                    )
                    continue

                await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'unsupported_event'})
        except (RuntimeError, WebSocketDisconnect):
            disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
            if disconnected_user_id and went_offline:
                last_seen_at = await _mark_user_last_seen(disconnected_user_id)
                await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
            return

    return app


def _parse_uuid(value: object) -> UUID | None:
    if not isinstance(value, str):
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


async def _is_chat_participant(user_id: UUID, chat_id: UUID) -> bool:
    async with AsyncSessionLocal() as session:
        participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
        return participant is not None


async def _can_subscribe_to_chat(user_id: UUID, chat_id: UUID) -> bool:
    async with AsyncSessionLocal() as session:
        chat = await session.get(Chat, chat_id)
        if chat and chat.type == 'branch':
            return True
        participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
        return participant is not None


async def _is_active_user(user_id: UUID) -> bool:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User.id).where(User.id == user_id, User.deleted_at.is_(None)))
        return result.scalar_one_or_none() is not None


async def _broadcast_presence_to_user_chats(
    user_id: UUID,
    is_online: bool,
    last_seen_at: datetime | None = None,
) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(ChatParticipant.chat_id).where(ChatParticipant.user_id == user_id))
        chat_ids = list(result.scalars())
    for chat_id in chat_ids:
        await realtime_manager.broadcast_to_chat(chat_id, {
            'event': 'presence.status',
            'chat_id': str(chat_id),
            'user_id': str(user_id),
            'is_online': is_online,
            'last_seen_at': last_seen_at.isoformat() if last_seen_at else None,
        })


async def _mark_user_last_seen(user_id: UUID) -> datetime:
    last_seen_at = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(last_seen_at=last_seen_at)
        )
        await session.commit()
    return last_seen_at


async def _safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except WebSocketDisconnect:
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
        return False


async def _safe_close_websocket(websocket: WebSocket, code: int = 1000) -> None:
    try:
        await websocket.close(code=code)
    except (RuntimeError, WebSocketDisconnect):
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
    except RuntimeError:
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
        return False


app = create_app()
