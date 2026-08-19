import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.config import settings


class TurnConfigurationError(ValueError):
    pass


def create_turn_rest_credentials(
    user_id: UUID,
    shared_secret: str,
    ttl_seconds: int,
    now: datetime | None = None,
) -> tuple[str, str, datetime]:
    issued_at = now or datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(seconds=ttl_seconds)
    username = f'{int(expires_at.timestamp())}:{user_id}'
    credential = base64.b64encode(
        hmac.new(shared_secret.encode('utf-8'), username.encode('utf-8'), hashlib.sha1).digest()
    ).decode('ascii')
    return username, credential, expires_at


def get_turn_ice_configuration(user_id: UUID) -> dict:
    public_host = settings.turn_public_host.strip()
    shared_secret = settings.turn_shared_secret.strip()
    if not public_host or not shared_secret:
        raise TurnConfigurationError('Calls are not configured on this server')

    username, credential, expires_at = create_turn_rest_credentials(
        user_id,
        shared_secret,
        settings.turn_credential_ttl_seconds,
    )
    port = settings.turn_port
    return {
        'ice_servers': [{
            'urls': [
                f'turn:{public_host}:{port}?transport=udp',
                f'turn:{public_host}:{port}?transport=tcp',
            ],
            'username': username,
            'credential': credential,
        }],
        'ice_transport_policy': 'relay',
        'expires_at': expires_at,
    }
