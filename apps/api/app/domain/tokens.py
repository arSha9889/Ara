from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.core.config import settings


def create_access_token(user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(user_id),
        'type': 'access',
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.access_token_secret, algorithm=settings.access_token_algorithm)


def decode_access_token(token: str) -> UUID:
    payload = jwt.decode(token, settings.access_token_secret, algorithms=[settings.access_token_algorithm])
    if payload.get('type') != 'access':
        raise ValueError('Token is not an access token')
    return UUID(payload['sub'])
