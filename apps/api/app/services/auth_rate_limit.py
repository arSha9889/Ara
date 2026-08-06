import hashlib

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.config import settings
from app.services.redis_client import redis_client


RATE_LIMIT_WINDOW_SECONDS = 10 * 60
DELIVERY_REQUEST_LIMIT = 8
AUTH_REQUEST_LIMIT = 30

_DELIVERY_PATHS = {
    '/api/auth/email-verification/start',
    '/api/auth/password/change/start',
    '/api/auth/password/reset/start',
    '/api/auth/email/change/start',
}


async def enforce_sensitive_auth_rate_limit(request: Request) -> None:
    """Apply a production Redis limit in addition to the edge Nginx limit."""
    if settings.environment != 'production' or redis_client is None:
        return

    category = 'delivery' if request.url.path in _DELIVERY_PATHS else 'auth'
    limit = DELIVERY_REQUEST_LIMIT if category == 'delivery' else AUTH_REQUEST_LIMIT
    client_ip = request.headers.get('x-real-ip') or (request.client.host if request.client else 'unknown')
    client_hash = hashlib.sha256(client_ip.encode()).hexdigest()
    key = f'arachat:rate-limit:{category}:{client_hash}'

    try:
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, RATE_LIMIT_WINDOW_SECONDS)
    except RedisError:
        # Nginx remains the first line of defense. Do not make an otherwise
        # healthy login path unavailable solely because Redis is restarting.
        return

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many authentication requests. Try again later',
        )
