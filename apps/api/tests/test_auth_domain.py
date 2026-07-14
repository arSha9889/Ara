import hashlib
import hmac
import time
from uuid import uuid4

from app.core.config import settings
from app.domain.registration_proof import create_registration_proof, verify_registration_proof
from app.domain.telegram_auth import verify_telegram_login
from app.domain.tokens import create_access_token, decode_access_token


def test_registration_proof_roundtrip() -> None:
    proof = create_registration_proof('123456')

    assert verify_registration_proof(proof) == '123456'


def test_access_token_roundtrip() -> None:
    user_id = uuid4()
    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id


def test_telegram_login_verification(monkeypatch) -> None:
    monkeypatch.setattr(settings, 'telegram_bot_token', 'bot-secret')
    payload = {
        'id': '42',
        'first_name': 'Nex',
        'username': 'nexus_user',
        'auth_date': str(int(time.time())),
    }
    data_check_string = '\n'.join(f'{key}={value}' for key, value in sorted(payload.items()))
    secret_key = hashlib.sha256(settings.telegram_bot_token.encode()).digest()
    payload['hash'] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    identity = verify_telegram_login(payload)

    assert identity.telegram_id == '42'
    assert identity.username == 'nexus_user'
