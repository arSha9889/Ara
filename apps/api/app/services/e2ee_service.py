import base64
import binascii
import json
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import Chat, ChatParticipant
from app.models.security import E2eeWebKey
from app.schemas.chats import ChatE2eeKeyOut
from app.services.auth_service import AuthError
from app.services.safety_service import ensure_chat_interaction_allowed

E2EE_WEB_ALGORITHM = 'ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256'
P256_PUBLIC_KEY_BYTES = 65
ECDSA_P256_SIGNATURE_BYTES = 64
E2EE_MESSAGE_MAX_LENGTH = 524288
MAX_E2EE_WEB_KEYS_PER_USER = 8


def _validate_public_key(value: str, field_name: str) -> str:
    normalized = value.strip()
    try:
        decoded = base64.b64decode(normalized, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AuthError(f'Invalid {field_name}') from exc
    if len(decoded) != P256_PUBLIC_KEY_BYTES:
        raise AuthError(f'Invalid {field_name}')
    return normalized


async def upsert_e2ee_web_key(
    session: AsyncSession,
    user_id: UUID,
    device_id: str,
    encryption_public_key: str,
    signing_public_key: str,
    algorithm: str,
) -> ChatE2eeKeyOut:
    if algorithm != E2EE_WEB_ALGORITHM:
        raise AuthError('Unsupported end-to-end encryption algorithm')

    encryption_key = _validate_public_key(encryption_public_key, 'encryption public key')
    signing_key = _validate_public_key(signing_public_key, 'signing public key')
    key = await session.get(E2eeWebKey, {'user_id': user_id, 'device_id': device_id})
    if key:
        key.encryption_public_key = encryption_key
        key.signing_public_key = signing_key
        key.algorithm = algorithm
    else:
        key_count = await session.scalar(
            select(func.count()).select_from(E2eeWebKey).where(E2eeWebKey.user_id == user_id)
        )
        if key_count and key_count >= MAX_E2EE_WEB_KEYS_PER_USER:
            raise AuthError('The maximum number of protected web devices has been reached')
        key = E2eeWebKey(
            user_id=user_id,
            device_id=device_id,
            encryption_public_key=encryption_key,
            signing_public_key=signing_key,
            algorithm=algorithm,
        )
        session.add(key)
    await session.commit()
    await session.refresh(key)
    return _key_out(key)


async def list_direct_chat_e2ee_keys(
    session: AsyncSession,
    user_id: UUID,
    chat_id: UUID,
) -> list[ChatE2eeKeyOut]:
    chat = await session.get(Chat, chat_id)
    if not chat or chat.type != 'direct':
        raise AuthError('End-to-end encryption is available only in direct chats')
    participant = await session.get(ChatParticipant, {'chat_id': chat_id, 'user_id': user_id})
    if not participant:
        raise AuthError('Chat not found')
    await ensure_chat_interaction_allowed(session, user_id, chat)

    participant_ids = list((await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars())
    keys = list((await session.execute(
        select(E2eeWebKey)
        .where(E2eeWebKey.user_id.in_(participant_ids))
        .order_by(E2eeWebKey.user_id, E2eeWebKey.device_id)
    )).scalars())
    return [_key_out(key) for key in keys]


async def validate_e2ee_message_envelope(
    session: AsyncSession,
    chat_id: UUID,
    sender_id: UUID,
    payload: str,
) -> None:
    if len(payload) > E2EE_MESSAGE_MAX_LENGTH:
        raise AuthError('Encrypted message is too large')
    try:
        envelope = json.loads(payload)
    except (TypeError, ValueError) as exc:
        raise AuthError('Invalid encrypted message envelope') from exc

    required_fields = {
        'version',
        'algorithm',
        'sender_device_id',
        'sender_ephemeral_public_key',
        'sender_signing_public_key',
        'recipients',
        'signature',
    }
    if not isinstance(envelope, dict) or set(envelope) != required_fields:
        raise AuthError('Invalid encrypted message envelope')
    if envelope['version'] != 1 or envelope['algorithm'] != E2EE_WEB_ALGORITHM:
        raise AuthError('Unsupported encrypted message envelope')
    if not isinstance(envelope['sender_device_id'], str) or not envelope['sender_device_id']:
        raise AuthError('Invalid encrypted message envelope')

    participant_ids = list((await session.execute(
        select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
    )).scalars())
    if len(participant_ids) != 2:
        raise AuthError('End-to-end encryption requires two direct-chat participants')
    keys = list((await session.execute(
        select(E2eeWebKey).where(E2eeWebKey.user_id.in_(participant_ids))
    )).scalars())
    if {key.user_id for key in keys} != set(participant_ids):
        raise AuthError('Both chat participants must use a protected web browser')

    sender_key = next(
        (
            key for key in keys
            if key.user_id == sender_id and key.device_id == envelope['sender_device_id']
        ),
        None,
    )
    if not sender_key or sender_key.signing_public_key != envelope['sender_signing_public_key']:
        raise AuthError('Encrypted message does not match the sender device key')

    _validate_exact_base64(envelope['sender_ephemeral_public_key'], P256_PUBLIC_KEY_BYTES)
    _validate_exact_base64(envelope['sender_signing_public_key'], P256_PUBLIC_KEY_BYTES)
    _validate_exact_base64(envelope['signature'], ECDSA_P256_SIGNATURE_BYTES)
    recipients = envelope['recipients']
    expected_recipient_ids = {_recipient_id(key) for key in keys}
    if not isinstance(recipients, dict) or set(recipients) != expected_recipient_ids:
        raise AuthError('Encrypted message is missing a recipient device')
    for recipient in recipients.values():
        if not isinstance(recipient, dict) or set(recipient) != {'ciphertext', 'iv', 'salt'}:
            raise AuthError('Invalid encrypted message recipient')
        _validate_exact_base64(recipient['iv'], 12)
        _validate_exact_base64(recipient['salt'], 32)
        ciphertext = _decode_base64(recipient['ciphertext'])
        if len(ciphertext) < 17 or len(ciphertext) > 16384 + 16:
            raise AuthError('Invalid encrypted message recipient')


def _key_out(key: E2eeWebKey) -> ChatE2eeKeyOut:
    return ChatE2eeKeyOut(
        user_id=key.user_id,
        device_id=key.device_id,
        encryption_public_key=key.encryption_public_key,
        signing_public_key=key.signing_public_key,
        algorithm=key.algorithm,
        updated_at=key.updated_at,
    )


def _recipient_id(key: E2eeWebKey) -> str:
    return f'{key.user_id}:{key.device_id}'


def _validate_exact_base64(value: object, expected_bytes: int) -> None:
    if len(_decode_base64(value)) != expected_bytes:
        raise AuthError('Invalid encrypted message envelope')


def _decode_base64(value: object) -> bytes:
    if not isinstance(value, str):
        raise AuthError('Invalid encrypted message envelope')
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AuthError('Invalid encrypted message envelope') from exc
