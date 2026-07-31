from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.validators import is_valid_pin
from app.models.audit import AuditLog
from app.models.security import PasswordCredential, TrustedDevicePin
from app.models.sessions import LoginHistory
from app.models.users import User, UserProfile
from app.schemas.users import UserOut
from app.services.auth_service import issue_session_for_user
from app.services.email_verification_service import EmailVerificationError, normalize_email
from app.services.phone_verification_service import PhoneVerificationError, normalize_phone


class SecurityError(ValueError):
    pass


async def create_or_replace_pin(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
    pin: str,
    device_id: str,
) -> None:
    await _verify_current_password(session, user_id, current_password)
    if not is_valid_pin(pin):
        raise SecurityError('PIN must contain 4-8 digits')

    existing = await _get_active_pin_for_device(session, user_id, device_id)
    if existing:
        existing.pin_hash = hash_secret(pin)
        existing.failed_attempts = 0
        existing.locked_until = None
        existing.trusted_until = _trusted_until()
        existing.revoked_at = None
    else:
        session.add(_new_pin(user_id, device_id, pin))

    session.add(_audit(user_id, 'pin_created_or_replaced', device_id))
    await session.commit()


async def reset_pin(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
    device_id: str,
    pin: str | None,
) -> None:
    await _verify_current_password(session, user_id, current_password)
    await revoke_pin_device(session, user_id, device_id, commit=False)
    if pin:
        if not is_valid_pin(pin):
            raise SecurityError('PIN must contain 4-8 digits')
        session.add(_new_pin(user_id, device_id, pin))
        action = 'pin_reset'
    else:
        action = 'pin_removed'
    session.add(_audit(user_id, action, device_id))
    await session.commit()


async def login_with_pin(session: AsyncSession, identifier: str, pin: str, device_id: str) -> tuple[UserOut, str, str]:
    if not is_valid_pin(pin):
        raise SecurityError('Invalid login identifier or PIN')

    user = await _find_user_by_login_identifier(session, identifier)
    if not user:
        raise SecurityError('Invalid login identifier or PIN')
    if user.status == 'deleted' or user.deleted_at:
        raise SecurityError('Account has been deleted')
    if user.status != 'active':
        raise SecurityError('Invalid login identifier or PIN')

    trusted_pin = await _get_active_pin_for_device(session, user.id, device_id)
    if not trusted_pin:
        session.add(LoginHistory(user_id=user.id, device_id=device_id, method='pin', result='failed'))
        await session.commit()
        raise SecurityError('PIN is not available for this device')

    now = datetime.now(timezone.utc)
    if trusted_pin.locked_until is not None and trusted_pin.locked_until <= now:
        trusted_pin.locked_until = None
        trusted_pin.failed_attempts = 0

    if trusted_pin.locked_until is not None and trusted_pin.locked_until > now:
        raise SecurityError('PIN is locked')

    if trusted_pin.trusted_until <= now:
        trusted_pin.revoked_at = now
        session.add(LoginHistory(user_id=user.id, device_id=device_id, method='pin', result='failed'))
        await session.commit()
        raise SecurityError('PIN is expired on this device')

    if not verify_secret(pin, trusted_pin.pin_hash):
        trusted_pin.failed_attempts += 1
        if trusted_pin.failed_attempts >= settings.max_auth_attempts:
            trusted_pin.locked_until = now + timedelta(minutes=settings.pin_lock_minutes)
        session.add(LoginHistory(user_id=user.id, device_id=device_id, method='pin', result='failed'))
        await session.commit()
        raise SecurityError('Invalid login identifier or PIN')

    trusted_pin.failed_attempts = 0
    trusted_pin.locked_until = None
    trusted_pin.last_used_at = now
    trusted_pin.trusted_until = _trusted_until()
    return await issue_session_for_user(session, user, device_id, 'pin')


async def revoke_pin_device(session: AsyncSession, user_id: UUID, device_id: str, commit: bool = True) -> None:
    result = await session.execute(
        select(TrustedDevicePin).where(
            TrustedDevicePin.user_id == user_id,
            TrustedDevicePin.device_id == device_id,
            TrustedDevicePin.revoked_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    for item in result.scalars():
        item.revoked_at = now
    if commit:
        session.add(_audit(user_id, 'pin_device_revoked', device_id))
        await session.commit()


async def _verify_current_password(session: AsyncSession, user_id: UUID, current_password: str) -> None:
    credential = await session.get(PasswordCredential, user_id)
    if not credential or not verify_secret(current_password, credential.password_hash):
        raise SecurityError('Invalid current password')


async def _get_active_pin_for_device(session: AsyncSession, user_id: UUID, device_id: str) -> TrustedDevicePin | None:
    result = await session.execute(
        select(TrustedDevicePin).where(
            TrustedDevicePin.user_id == user_id,
            TrustedDevicePin.device_id == device_id,
            TrustedDevicePin.revoked_at.is_(None),
        ).order_by(TrustedDevicePin.created_at.desc())
    )
    return result.scalars().first()


def _new_pin(user_id: UUID, device_id: str, pin: str) -> TrustedDevicePin:
    return TrustedDevicePin(
        user_id=user_id,
        device_id=device_id,
        pin_hash=hash_secret(pin),
        trusted_until=_trusted_until(),
    )


def _trusted_until() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.pin_trusted_days)


async def _find_user_by_login_identifier(session: AsyncSession, identifier: str) -> User | None:
    value = identifier.strip()
    if value.isdigit() and len(value) == settings.nexus_id_length:
        result = await session.execute(select(User).where(User.nexus_id == value))
        return result.scalar_one_or_none()

    if '@' in value:
        try:
            email = normalize_email(value)
        except EmailVerificationError:
            return None
        result = await session.execute(
            select(User)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(UserProfile.email == email)
        )
        return result.scalar_one_or_none()

    try:
        phone = normalize_phone(value)
    except PhoneVerificationError:
        return None

    result = await session.execute(
        select(User)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(UserProfile.optional_phone == phone)
    )
    return result.scalar_one_or_none()


def _audit(user_id: UUID, action: str, device_id: str) -> AuditLog:
    return AuditLog(
        actor_user_id=user_id,
        actor_type='user',
        action=action,
        target_type='trusted_device_pin',
        target_id=device_id,
        metadata_json={'device_id': device_id},
    )
