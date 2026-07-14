import hashlib
import hmac
import time
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class TelegramIdentity:
    telegram_id: str
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None


def verify_telegram_login(payload: dict[str, str], max_age_seconds: int = 86400) -> TelegramIdentity:
    if not settings.telegram_bot_token:
        raise ValueError('Telegram bot token is not configured')

    received_hash = payload.get('hash')
    auth_date = payload.get('auth_date')
    telegram_id = payload.get('id')

    if not received_hash or not auth_date or not telegram_id:
        raise ValueError('Telegram payload is missing required fields')

    if int(time.time()) - int(auth_date) > max_age_seconds:
        raise ValueError('Telegram payload is expired')

    data_check_string = '\n'.join(
        f'{key}={value}' for key, value in sorted(payload.items()) if key != 'hash' and value is not None
    )
    secret_key = hashlib.sha256(settings.telegram_bot_token.encode()).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError('Telegram payload signature is invalid')

    return TelegramIdentity(
        telegram_id=telegram_id,
        first_name=payload.get('first_name'),
        last_name=payload.get('last_name'),
        username=payload.get('username'),
    )
