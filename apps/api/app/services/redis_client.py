from redis.asyncio import Redis

from app.core.config import settings

redis_client = Redis.from_url(settings.redis_url, decode_responses=True) if settings.redis_url else None


async def check_redis() -> bool:
    return bool(redis_client and await redis_client.ping())
