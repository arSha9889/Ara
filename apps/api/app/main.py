from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update
from starlette.websockets import WebSocketDisconnect

from app.api.router import api_router
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.domain.tokens import decode_access_token
from app.models.chats import Chat, ChatParticipant
from app.models.users import User
from app.db.health import check_database
from app.services.call_signaling import CallSignalingError, call_signaling_manager, normalize_call_signal
from app.services.realtime_manager import realtime_manager
from app.services.redis_client import check_redis
from app.services.storage_service import check_storage, storage_root
from app.services.user_access_service import user_can_access


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
    if settings.storage_backend == 'local':
        from fastapi.staticfiles import StaticFiles

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
        status = {'database': 'unavailable', 'redis': 'unavailable', 'storage': 'unavailable'}
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

        if await check_storage():
            status['storage'] = 'ok'

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
                    await _handle_call_signal(websocket, message, user_id)
                    continue

                await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'unsupported_event'})
        except (RuntimeError, WebSocketDisconnect):
            disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
            if disconnected_user_id and went_offline:
                await _end_calls_for_disconnected_user(disconnected_user_id)
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


async def _get_direct_call_peer(user_id: UUID, chat_id: UUID) -> UUID | None:
    async with AsyncSessionLocal() as session:
        chat = await session.get(Chat, chat_id)
        if not chat or chat.type != 'direct':
            return None
        result = await session.execute(
            select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
        )
        participant_ids = set(result.scalars())

    if user_id not in participant_ids or len(participant_ids) != 2:
        return None
    return next(participant_id for participant_id in participant_ids if participant_id != user_id)


async def _can_subscribe_to_chat(user_id: UUID, chat_id: UUID) -> bool:
    async with AsyncSessionLocal() as session:
        chat = await session.get(Chat, chat_id)
        if chat and chat.type == 'branch':
            return True
        participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
        return participant is not None


async def _is_active_user(user_id: UUID) -> bool:
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        return await user_can_access(session, user)


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


async def _handle_call_signal(websocket: WebSocket, message: dict, user_id: UUID) -> None:
    chat_id = _parse_uuid(message.get('chat_id'))
    if not chat_id:
        await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'invalid_chat_id'})
        return

    try:
        signal = normalize_call_signal(message)
    except CallSignalingError as exc:
        await _send_call_failure(websocket, message.get('call_id'), exc.reason)
        return

    if signal['event'] == 'call.invite':
        peer_user_id = await _get_direct_call_peer(user_id, chat_id)
        if not peer_user_id:
            await _send_call_failure(websocket, signal['call_id'], 'direct_chat_required')
            return
        if not realtime_manager.is_user_online(peer_user_id):
            await _send_call_failure(websocket, signal['call_id'], 'peer_offline')
            return
        try:
            await call_signaling_manager.start_call(signal['call_id'], chat_id, user_id, peer_user_id)
        except CallSignalingError as exc:
            await _send_call_failure(websocket, signal['call_id'], exc.reason)
            return
        await realtime_manager.broadcast_to_user(peer_user_id, {
            **signal,
            'chat_id': str(chat_id),
            'user_id': str(user_id),
        })
        return

    try:
        recipient_user_id = await call_signaling_manager.relay_call_signal(
            signal['call_id'],
            chat_id,
            user_id,
            signal['event'],
        )
    except CallSignalingError as exc:
        await _send_call_failure(websocket, signal['call_id'], exc.reason)
        return

    await realtime_manager.broadcast_to_user(recipient_user_id, {
        **signal,
        'chat_id': str(chat_id),
        'user_id': str(user_id),
    })


async def _send_call_failure(websocket: WebSocket, call_id: object, reason: str) -> None:
    payload = {'event': 'call.failed', 'reason': reason}
    if isinstance(call_id, str):
        payload['call_id'] = call_id
    await _safe_send_json(websocket, payload)


async def _end_calls_for_disconnected_user(user_id: UUID) -> None:
    for recipient_user_id, session in await call_signaling_manager.end_calls_for_user(user_id):
        await realtime_manager.broadcast_to_user(recipient_user_id, {
            'event': 'call.end',
            'call_id': session.call_id,
            'chat_id': str(session.chat_id),
            'user_id': str(user_id),
        })


async def _safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except WebSocketDisconnect:
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            await _end_calls_for_disconnected_user(disconnected_user_id)
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
        return False


async def _safe_close_websocket(websocket: WebSocket, code: int = 1000) -> None:
    try:
        await websocket.close(code=code)
    except (RuntimeError, WebSocketDisconnect):
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            await _end_calls_for_disconnected_user(disconnected_user_id)
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
    except RuntimeError:
        disconnected_user_id, went_offline = await realtime_manager.disconnect(websocket)
        if disconnected_user_id and went_offline:
            await _end_calls_for_disconnected_user(disconnected_user_id)
            last_seen_at = await _mark_user_last_seen(disconnected_user_id)
            await _broadcast_presence_to_user_chats(disconnected_user_id, False, last_seen_at)
        return False


app = create_app()
