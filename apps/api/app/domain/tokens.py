from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.core.config import settings


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: UUID
    session_id: UUID
    expires_at: datetime


def create_access_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(user_id),
        'sid': str(session_id),
        'type': 'access',
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.access_token_secret, algorithm=settings.access_token_algorithm)


def decode_access_token(token: str) -> AccessTokenClaims:
    payload = jwt.decode(token, settings.access_token_secret, algorithms=[settings.access_token_algorithm])
    if payload.get('type') != 'access':
        raise ValueError('Token is not an access token')
    try:
        expires_at = datetime.fromtimestamp(int(payload['exp']), timezone.utc)
        return AccessTokenClaims(
            user_id=UUID(payload['sub']),
            session_id=UUID(payload['sid']),
            expires_at=expires_at,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('Access token is missing required session claims') from exc
