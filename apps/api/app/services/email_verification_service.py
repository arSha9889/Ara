import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.registration_proof import create_registration_proof
from app.domain.security_hashing import hash_secret, verify_secret
from app.models.verification import EmailVerification
from app.services.telegram_bot_client import answer_telegram_callback, send_telegram_message


class EmailVerificationError(ValueError):
    pass


EMAIL_VERIFICATION_TTL_MINUTES = 10
START_PAYLOAD_PREFIX = 'email_'
CONFIRM_CALLBACK_PREFIX = 'email_confirm:'


@dataclass(frozen=True)
class EmailVerificationStart:
    verification: EmailVerification
    start_payload: str


@dataclass(frozen=True)
class EmailVerificationResult:
    verification: EmailVerification
    registration_proof: str


async def create_email_verification(session: AsyncSession, email: str, device_id: str) -> EmailVerificationStart:
    normalized_email = normalize_email(email)
    now = datetime.now(timezone.utc)
    public_token = secrets.token_urlsafe(18)
    verification = EmailVerification(
        public_token=public_token,
        email=normalized_email,
        device_id=device_id,
        status='pending',
        expires_at=now + timedelta(minutes=EMAIL_VERIFICATION_TTL_MINUTES),
    )
    session.add(verification)
    await session.commit()
    await session.refresh(verification)
    return EmailVerificationStart(
        verification=verification,
        start_payload=f'{START_PAYLOAD_PREFIX}{public_token}',
    )


async def verify_email_code(session: AsyncSession, verification_id: UUID, code: str) -> EmailVerificationResult:
    verification = await session.get(EmailVerification, verification_id)
    if not verification:
        raise EmailVerificationError('Email verification request not found')
    if verification.consumed_at:
        raise EmailVerificationError('Email verification request is already used')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('Email verification request is expired')
    if verification.status == 'verified' and verification.telegram_user_id:
        return EmailVerificationResult(verification, create_registration_proof(verification.telegram_user_id))
    if verification.status != 'code_sent' or not verification.code_hash or not verification.telegram_user_id:
        raise EmailVerificationError('Telegram confirmation code has not been sent yet')
    if not re.fullmatch(r'\d{4}', code):
        raise EmailVerificationError('Invalid Telegram confirmation code')

    if not verify_secret(code, verification.code_hash):
        verification.failed_attempts += 1
        if verification.failed_attempts >= settings.max_auth_attempts:
            verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('Invalid Telegram confirmation code')

    verification.status = 'verified'
    verification.verified_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(verification)
    return EmailVerificationResult(verification, create_registration_proof(verification.telegram_user_id))


async def consume_verified_email(session: AsyncSession, verification_id: UUID, telegram_id: str) -> str:
    verification = await session.get(EmailVerification, verification_id)
    if not verification:
        raise EmailVerificationError('Email verification request not found')
    if verification.consumed_at:
        raise EmailVerificationError('Email verification request is already used')
    if verification.status != 'verified' or not verification.verified_at:
        raise EmailVerificationError('Email is not verified')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('Email verification request is expired')
    if verification.telegram_user_id != telegram_id:
        raise EmailVerificationError('Email verification does not match Telegram identity')

    verification.consumed_at = datetime.now(timezone.utc)
    return verification.email


async def handle_email_start_command(
    session: AsyncSession,
    public_token: str,
    chat_id: str,
    telegram_user_id: str,
    telegram_username: str | None,
) -> bool:
    verification = await _get_verification_by_public_token(session, public_token)
    if not verification:
        return False
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        await send_telegram_message(chat_id, 'Заявка на подтверждение email истекла. Запросите новый код в приложении Nexus.')
        return True
    if verification.consumed_at:
        await send_telegram_message(chat_id, 'Эта заявка уже использована. Если нужно, запросите новый код в приложении.')
        return True
    if verification.telegram_user_id and verification.telegram_user_id != telegram_user_id:
        await send_telegram_message(chat_id, 'Эта заявка уже привязана к другому Telegram-аккаунту. Запросите новый код в приложении Nexus.')
        return True

    verification.telegram_chat_id = chat_id
    verification.telegram_user_id = telegram_user_id
    verification.telegram_username = telegram_username
    await session.commit()
    await send_email_confirmation_prompt(chat_id, verification)
    return True


async def handle_email_callback_query(session: AsyncSession, callback_query: dict) -> bool:
    data = callback_query.get('data') or ''
    if not data.startswith(CONFIRM_CALLBACK_PREFIX):
        return False

    callback_query_id = callback_query.get('id')
    message = callback_query.get('message') or {}
    chat_id = _extract_chat_id(message)
    telegram_user_id = _extract_user_id(callback_query.get('from'))
    if not chat_id or not telegram_user_id:
        return True

    public_token = data.removeprefix(CONFIRM_CALLBACK_PREFIX)
    verification = await _get_verification_by_public_token(session, public_token)
    if not verification or _is_expired(verification):
        if verification:
            verification.status = 'expired'
            await session.commit()
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, 'Заявка истекла')
        await send_telegram_message(chat_id, 'Заявка истекла. Запросите новый код в приложении Nexus.')
        return True
    if verification.telegram_user_id != telegram_user_id:
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, 'Это заявка другого Telegram-аккаунта')
        return True

    code = _generate_code()
    verification.code_hash = hash_secret(code)
    verification.status = 'code_sent'
    verification.failed_attempts = 0
    await session.commit()
    if callback_query_id:
        await answer_telegram_callback(callback_query_id, 'Код отправлен')
    await send_telegram_message(
        chat_id,
        f'Ваш код подтверждения email в Nexus: {code}\nВведите его в приложении. Код действует {EMAIL_VERIFICATION_TTL_MINUTES} минут.',
        {'remove_keyboard': True},
    )
    return True


async def send_email_confirmation_prompt(chat_id: str, verification: EmailVerification) -> None:
    await send_telegram_message(
        chat_id,
        (
            'Привет! Подтвердите email для регистрации в Nexus.\n\n'
            f'Email из приложения: {verification.email}\n\n'
            'Если это ваш email, нажмите «Подтвердить». Важно: Telegram подтверждает связь email с вашим Telegram-аккаунтом, но не доказывает доступ к почтовому ящику.'
        ),
        {
            'inline_keyboard': [[
                {'text': 'Подтвердить email', 'callback_data': f'{CONFIRM_CALLBACK_PREFIX}{verification.public_token}'},
            ]],
        },
    )


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 255 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise EmailVerificationError('Email has invalid format')
    return email


def _generate_code() -> str:
    return f'{secrets.randbelow(10_000):04d}'


def _is_expired(verification: EmailVerification) -> bool:
    return verification.expires_at <= datetime.now(timezone.utc)


async def _get_verification_by_public_token(session: AsyncSession, public_token: str) -> EmailVerification | None:
    result = await session.execute(select(EmailVerification).where(EmailVerification.public_token == public_token))
    return result.scalar_one_or_none()


def _extract_chat_id(message: dict) -> str | None:
    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    return str(chat_id) if chat_id is not None else None


def _extract_user_id(user: dict | None) -> str | None:
    if not user:
        return None
    user_id = user.get('id')
    return str(user_id) if user_id is not None else None
