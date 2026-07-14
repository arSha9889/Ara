import base64
import hashlib
import hmac
import json
import time

from app.core.config import settings


def create_registration_proof(telegram_id: str, ttl_seconds: int = 900) -> str:
    payload = {
        'telegram_id': telegram_id,
        'exp': int(time.time()) + ttl_seconds,
    }
    raw_payload = _b64encode(json.dumps(payload, separators=(',', ':')).encode())
    signature = _sign(raw_payload)
    return f'{raw_payload}.{signature}'


def verify_registration_proof(proof: str) -> str:
    try:
        raw_payload, signature = proof.split('.', 1)
    except ValueError as exc:
        raise ValueError('Registration proof is malformed') from exc

    if not hmac.compare_digest(_sign(raw_payload), signature):
        raise ValueError('Registration proof signature is invalid')

    payload = json.loads(_b64decode(raw_payload))
    if int(payload['exp']) < int(time.time()):
        raise ValueError('Registration proof is expired')

    return str(payload['telegram_id'])


def _sign(raw_payload: str) -> str:
    return hmac.new(settings.registration_proof_secret.encode(), raw_payload.encode(), hashlib.sha256).hexdigest()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def _b64decode(value: str) -> bytes:
    padding = '=' * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
