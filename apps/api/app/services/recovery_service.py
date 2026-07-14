from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.recovery_code import format_recovery_code, generate_recovery_code, is_valid_recovery_code
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.validators import is_valid_password
from app.models.audit import AuditLog
from app.models.security import PasswordCredential, RecoveryCode
from app.models.sessions import LoginHistory, Session
from app.models.users import User
from app.schemas.recovery import PasswordResetRequest
from app.schemas.users import UserOut
from app.services.auth_service import issue_session_for_user


class RecoveryError(ValueError):
    pass


async def verify_recovery_code_for_user(session: AsyncSession, nexus_id: str, recovery_code: str) -> bool:
    user = await _find_user_by_nexus_id(session, nexus_id)
    if not user:
        raise RecoveryError('Invalid Nexus ID or recovery code')

    recovery = await session.get(RecoveryCode, user.id)
    if not recovery:
        raise RecoveryError('Invalid Nexus ID or recovery code')

    if _is_recovery_locked_or_inactive(recovery):
        raise RecoveryError('Recovery code is locked')

    if _is_recovery_code_match(recovery, recovery_code):
        recovery.failed_attempts = 0
        await session.commit()
        return True

    await _register_failed_attempt(session, user.id, recovery)
    raise RecoveryError('Invalid Nexus ID or recovery code')


async def reset_password_with_recovery_code(
    session: AsyncSession,
    request: PasswordResetRequest,
) -> tuple[UserOut, str, str, str]:
    if not is_valid_password(request.new_password):
        raise RecoveryError('Password contains invalid characters')

    user = await _find_user_by_nexus_id(session, request.nexus_id)
    if not user:
        raise RecoveryError('Invalid Nexus ID or recovery code')

    recovery = await session.get(RecoveryCode, user.id)
    if not recovery:
        raise RecoveryError('Invalid Nexus ID or recovery code')

    if _is_recovery_locked_or_inactive(recovery):
        raise RecoveryError('Recovery code is locked')

    if not _is_recovery_code_match(recovery, request.recovery_code):
        await _register_failed_attempt(session, user.id, recovery)
        raise RecoveryError('Invalid Nexus ID or recovery code')

    credential = await session.get(PasswordCredential, user.id)
    if not credential:
        credential = PasswordCredential(user_id=user.id, password_hash=hash_secret(request.new_password))
        session.add(credential)
    else:
        credential.password_hash = hash_secret(request.new_password)
        credential.password_updated_at = datetime.now(timezone.utc)
        credential.failed_attempts = 0
        credential.locked_until = None

    new_recovery_code = _rotate_recovery_code(recovery)
    await session.execute(
        update(Session)
        .where(Session.user_id == user.id, Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    session.add(
        AuditLog(
            actor_user_id=user.id,
            actor_type='user',
            action='password_reset_with_recovery_code',
            target_type='user',
            target_id=str(user.id),
            metadata_json={'device_id': request.device_id},
        )
    )

    user_out, access_token, refresh_token = await issue_session_for_user(session, user, request.device_id, 'recovery_code')
    return user_out, access_token, refresh_token, format_recovery_code(new_recovery_code)


async def regenerate_recovery_code_for_user(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
) -> str:
    credential = await session.get(PasswordCredential, user_id)
    if not credential or not verify_secret(current_password, credential.password_hash):
        raise RecoveryError('Invalid current password')

    recovery = await session.get(RecoveryCode, user_id)
    if not recovery:
        recovery_code = generate_recovery_code()
        session.add(RecoveryCode(user_id=user_id, code_hash=hash_secret(recovery_code), status='active'))
    else:
        recovery_code = _rotate_recovery_code(recovery)

    session.add(
        AuditLog(
            actor_user_id=user_id,
            actor_type='user',
            action='recovery_code_regenerated',
            target_type='user',
            target_id=str(user_id),
            metadata_json=None,
        )
    )
    await session.commit()
    return format_recovery_code(recovery_code)


async def _find_user_by_nexus_id(session: AsyncSession, nexus_id: str) -> User | None:
    result = await session.execute(select(User).where(User.nexus_id == nexus_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


def _normalize_recovery_code(value: str) -> str:
    return value.replace(' ', '').replace('-', '').upper()


def _is_recovery_code_match(recovery: RecoveryCode, value: str) -> bool:
    normalized = _normalize_recovery_code(value)
    return is_valid_recovery_code(normalized) and verify_secret(normalized, recovery.code_hash)


def _is_recovery_locked_or_inactive(recovery: RecoveryCode) -> bool:
    now = datetime.now(timezone.utc)
    if recovery.status != 'active' or recovery.revoked_at is not None:
        return True
    return recovery.locked_until is not None and recovery.locked_until > now


async def _register_failed_attempt(session: AsyncSession, user_id: UUID, recovery: RecoveryCode) -> None:
    recovery.failed_attempts += 1
    if recovery.failed_attempts >= settings.max_auth_attempts:
        recovery.status = 'locked'
        recovery.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.recovery_lock_minutes)
    session.add(LoginHistory(user_id=user_id, device_id=None, method='recovery_code', result='failed'))
    await session.commit()


def _rotate_recovery_code(recovery: RecoveryCode) -> str:
    new_recovery_code = generate_recovery_code()
    recovery.code_hash = hash_secret(new_recovery_code)
    recovery.failed_attempts = 0
    recovery.locked_until = None
    recovery.status = 'active'
    recovery.used_at = None
    recovery.revoked_at = None
    recovery.created_at = datetime.now(timezone.utc)
    return new_recovery_code
