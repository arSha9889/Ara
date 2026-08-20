import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.security_hashing import hash_secret, verify_secret
from app.models.verification import EmailVerification
from app.services.smtp_mailer import SmtpDeliveryError, send_verification_code


class EmailVerificationError(ValueError):
    pass


EMAIL_VERIFICATION_TTL_MINUTES = 10
MAX_EMAIL_STARTS_PER_ADDRESS = 3
MAX_EMAIL_STARTS_PER_DEVICE = 6
EMAIL_VERIFICATION_PURPOSES = {'registration', 'password_change', 'password_reset', 'email_change'}


@dataclass(frozen=True)
class EmailVerificationStart:
    verification: EmailVerification


@dataclass(frozen=True)
class EmailVerificationResult:
    verification: EmailVerification


async def create_email_verification(
    session: AsyncSession,
    email: str,
    device_id: str,
    purpose: str = 'registration',
    user_id: UUID | None = None,
    pending_password_hash: str | None = None,
    deliver: bool = True,
    language: str = 'ru',
) -> EmailVerificationStart:
    normalized_email = normalize_email(email)
    if purpose not in EMAIL_VERIFICATION_PURPOSES:
        raise EmailVerificationError('Unsupported e-mail verification purpose')

    now = datetime.now(timezone.utc)
    await _enforce_start_limits(session, normalized_email, device_id, now)
    code = _generate_code()
    verification = EmailVerification(
        public_token=secrets.token_urlsafe(18),
        email=normalized_email,
        device_id=device_id,
        user_id=user_id,
        purpose=purpose,
        pending_password_hash=pending_password_hash,
        code_hash=hash_secret(code),
        status='code_sent',
        failed_attempts=0,
        expires_at=now + timedelta(minutes=EMAIL_VERIFICATION_TTL_MINUTES),
    )
    session.add(verification)
    # Persist the code before it can leave the process. This prevents a delivered
    # code from being unusable if the following database commit were to fail.
    await session.commit()
    await session.refresh(verification)
    if deliver:
        try:
            await send_verification_code(normalized_email, code, purpose, EMAIL_VERIFICATION_TTL_MINUTES, language)
        except SmtpDeliveryError:
            verification.status = 'delivery_failed'
            verification.expires_at = now
            await session.commit()
            raise

    return EmailVerificationStart(verification=verification)


async def verify_email_code(
    session: AsyncSession,
    verification_id: UUID,
    code: str,
    purpose: str | None = None,
    user_id: UUID | None = None,
) -> EmailVerificationResult:
    verification = await _get_verification_for_update(session, verification_id)
    _validate_verification_access(verification, purpose, user_id)
    if verification.consumed_at:
        raise EmailVerificationError('E-mail verification request is already used')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('E-mail verification request is expired')
    if verification.status == 'verified' and verification.verified_at:
        return EmailVerificationResult(verification)
    if verification.status != 'code_sent' or not verification.code_hash:
        raise EmailVerificationError('E-mail confirmation code is not available')
    if not re.fullmatch(r'\d{6}', code):
        raise EmailVerificationError('Invalid e-mail confirmation code')

    if not verify_secret(code, verification.code_hash):
        verification.failed_attempts += 1
        if verification.failed_attempts >= settings.max_auth_attempts:
            verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('Invalid e-mail confirmation code')

    verification.status = 'verified'
    verification.verified_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(verification)
    return EmailVerificationResult(verification)


async def consume_verified_email(
    session: AsyncSession,
    verification_id: UUID,
    purpose: str,
    device_id: str | None = None,
    user_id: UUID | None = None,
) -> EmailVerification:
    verification = await _get_verification_for_update(session, verification_id)
    _validate_verification_access(verification, purpose, user_id)
    if verification.consumed_at:
        raise EmailVerificationError('E-mail verification request is already used')
    if verification.status != 'verified' or not verification.verified_at:
        raise EmailVerificationError('E-mail is not verified')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise EmailVerificationError('E-mail verification request is expired')
    if device_id and verification.device_id != device_id:
        raise EmailVerificationError('E-mail verification is not available on this device')

    verification.consumed_at = datetime.now(timezone.utc)
    verification.status = 'consumed'
    return verification


async def handle_email_start_command(
    session: AsyncSession,
    public_token: str,
    chat_id: str,
    telegram_user_id: str,
    telegram_username: str | None,
) -> bool:
    return False


async def handle_email_callback_query(session: AsyncSession, callback_query: dict) -> bool:
    return False


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 255 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise EmailVerificationError('Email has invalid format')
    return email


async def _enforce_start_limits(session: AsyncSession, email: str, device_id: str, now: datetime) -> None:
    since = now - timedelta(minutes=EMAIL_VERIFICATION_TTL_MINUTES)
    address_count = await session.scalar(
        select(func.count()).select_from(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.created_at >= since,
        )
    )
    device_count = await session.scalar(
        select(func.count()).select_from(EmailVerification).where(
            EmailVerification.device_id == device_id,
            EmailVerification.created_at >= since,
        )
    )
    if (address_count or 0) >= MAX_EMAIL_STARTS_PER_ADDRESS or (device_count or 0) >= MAX_EMAIL_STARTS_PER_DEVICE:
        raise EmailVerificationError('Too many e-mail verification requests. Try again later')


def _validate_verification_access(
    verification: EmailVerification | None,
    purpose: str | None,
    user_id: UUID | None,
) -> None:
    if not verification:
        raise EmailVerificationError('E-mail verification request not found')
    if purpose and verification.purpose != purpose:
        raise EmailVerificationError('E-mail verification has invalid purpose')
    if user_id is not None and verification.user_id != user_id:
        raise EmailVerificationError('E-mail verification is not available')


def _generate_code() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'


def _is_expired(verification: EmailVerification) -> bool:
    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= datetime.now(timezone.utc)


async def _get_verification_for_update(session: AsyncSession, verification_id: UUID) -> EmailVerification | None:
    result = await session.execute(
        select(EmailVerification).where(EmailVerification.id == verification_id).with_for_update()
    )
    return result.scalar_one_or_none()
