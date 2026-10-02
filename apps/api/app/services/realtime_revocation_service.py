import asyncio
from contextlib import suppress
import json
import logging
from uuid import UUID, uuid4

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.services.realtime_manager import RealtimeManager, realtime_manager
from app.services.redis_client import redis_client

logger = logging.getLogger(__name__)

REALTIME_REVOCATION_CHANNEL = 'arachat:realtime-revocations:v1'
RECONNECT_DELAY_SECONDS = 1
SESSION_REVOKED_CLOSE_CODE = 4003


class RealtimeRevocationService:
    """Closes revoked realtime connections on this and other API instances."""

    def __init__(self, manager: RealtimeManager, redis: Redis | None, instance_id: str | None = None) -> None:
        self._manager = manager
        self._redis = redis
        self._instance_id = instance_id or str(uuid4())
        self._listener_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if not self._redis or (self._listener_task and not self._listener_task.done()):
            return
        self._listener_task = asyncio.create_task(
            self._listen(),
            name='realtime-revocation-listener',
        )

    async def stop(self) -> None:
        if not self._listener_task:
            return
        self._listener_task.cancel()
        with suppress(asyncio.CancelledError):
            await self._listener_task
        self._listener_task = None

    async def disconnect_session(self, session_id: UUID, code: int = SESSION_REVOKED_CLOSE_CODE) -> None:
        await self._manager.disconnect_session(session_id, code=code)
        await self._publish('session', session_id)

    async def disconnect_user(self, user_id: UUID, code: int = SESSION_REVOKED_CLOSE_CODE) -> None:
        await self._manager.disconnect_user(user_id, code=code)
        await self._publish('user', user_id)

    async def _publish(self, scope: str, identifier: UUID) -> None:
        if not self._redis:
            return
        payload = json.dumps({
            'source': self._instance_id,
            'scope': scope,
            'id': str(identifier),
        })
        try:
            await self._redis.publish(REALTIME_REVOCATION_CHANNEL, payload)
        except RedisError:
            logger.warning('Could not broadcast realtime revocation to other API instances.', exc_info=True)

    async def _listen(self) -> None:
        while True:
            pubsub = None
            try:
                pubsub = self._redis.pubsub(ignore_subscribe_messages=True) if self._redis else None
                if not pubsub:
                    return
                await pubsub.subscribe(REALTIME_REVOCATION_CHANNEL)
                async for message in pubsub.listen():
                    if message.get('type') == 'message':
                        await self._handle_message(message.get('data'))
            except asyncio.CancelledError:
                raise
            except RedisError:
                logger.warning('Realtime revocation listener lost its Redis subscription.', exc_info=True)
            except Exception:
                logger.exception('Realtime revocation listener stopped unexpectedly.')
            finally:
                if pubsub:
                    with suppress(RedisError):
                        await pubsub.aclose()
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)

    async def _handle_message(self, raw_message: object) -> None:
        if not isinstance(raw_message, str):
            return
        try:
            payload = json.loads(raw_message)
            if not isinstance(payload, dict):
                raise ValueError('Realtime revocation payload must be an object')
            if payload.get('source') == self._instance_id:
                return
            identifier = UUID(payload['id'])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            logger.warning('Ignored malformed realtime revocation message.')
            return

        if payload.get('scope') == 'session':
            await self._manager.disconnect_session(identifier, code=SESSION_REVOKED_CLOSE_CODE)
        elif payload.get('scope') == 'user':
            await self._manager.disconnect_user(identifier, code=SESSION_REVOKED_CLOSE_CODE)
        else:
            logger.warning('Ignored realtime revocation message with an unknown scope.')


realtime_revocation_service = RealtimeRevocationService(realtime_manager, redis_client)
