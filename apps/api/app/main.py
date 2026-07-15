from uuid import UUID

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from app.api.router import api_router
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.domain.tokens import decode_access_token
from app.models.chats import ChatParticipant
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
        return {'status': 'ok', 'service': 'nexus-api'}

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

        if not await _safe_send_json(websocket, {'event': 'connection.authenticated', 'user_id': str(user_id)}):
            return
        await realtime_manager.connect_user(websocket, user_id)

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
                    if not await _is_chat_participant(user_id, chat_id):
                        await _safe_send_json(websocket, {'event': 'error.unauthorized', 'reason': 'chat_not_available'})
                        continue
                    await realtime_manager.subscribe(websocket, chat_id)
                    await _safe_send_json(websocket, {'event': 'chat.subscribed', 'chat_id': str(chat_id)})
                    continue

                if event == 'chat.unsubscribe':
                    chat_id = _parse_uuid(message.get('chat_id'))
                    if chat_id:
                        await realtime_manager.unsubscribe(websocket, chat_id)
                    await _safe_send_json(websocket, {'event': 'chat.unsubscribed', 'chat_id': str(chat_id) if chat_id else None})
                    continue

                if event in {'typing.started', 'typing.stopped', 'presence.active', 'file.uploading'}:
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

                await _safe_send_json(websocket, {'event': 'error.validation_failed', 'reason': 'unsupported_event'})
        except (RuntimeError, WebSocketDisconnect):
            await realtime_manager.disconnect(websocket)
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


async def _safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except WebSocketDisconnect:
        await realtime_manager.disconnect(websocket)
        return False


async def _safe_close_websocket(websocket: WebSocket, code: int = 1000) -> None:
    try:
        await websocket.close(code=code)
    except (RuntimeError, WebSocketDisconnect):
        await realtime_manager.disconnect(websocket)
    except RuntimeError:
        await realtime_manager.disconnect(websocket)
        return False


app = create_app()
