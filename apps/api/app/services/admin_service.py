from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.security import TrustedDevicePin
from app.models.sessions import Session
from app.models.users import User, UserProfile
from app.services.phone_verification_service import PhoneVerificationError, normalize_phone


class AdminError(ValueError):
    pass


def configured_admin_phone() -> str | None:
    if not settings.admin_phone.strip():
        return None
    try:
        return normalize_phone(settings.admin_phone)
    except PhoneVerificationError:
        return None


def is_configured_admin_profile(profile: UserProfile | None) -> bool:
    return bool(profile and configured_admin_phone() and profile.optional_phone == configured_admin_phone())


async def require_admin(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    profile = await session.get(UserProfile, user_id)
    if not user or user.deleted_at or user.status != 'active' or not is_configured_admin_profile(profile):
        raise AdminError('Administrator access is required')
    return user


async def find_configured_admin(session: AsyncSession) -> User | None:
    phone = configured_admin_phone()
    if not phone:
        return None
    result = await session.execute(
        select(User)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(UserProfile.optional_phone == phone, User.deleted_at.is_(None), User.status == 'active')
        .limit(1)
    )
    return result.scalar_one_or_none()


async def admin_overview(session: AsyncSession, user_id: UUID) -> dict:
    await require_admin(session, user_id)
    total_users = int((await session.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    )).scalar_one())
    active_users = int((await session.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None), User.status == 'active')
    )).scalar_one())
    country_rows = await session.execute(
        select(UserProfile.registration_country, func.count())
        .join(User, User.id == UserProfile.user_id)
        .where(User.deleted_at.is_(None))
        .group_by(UserProfile.registration_country)
        .order_by(func.count().desc())
    )
    user_rows = await session.execute(
        select(User, UserProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .limit(200)
    )
    return {
        'total_users': total_users,
        'active_users': active_users,
        'countries': [
            {'country': country or 'GLOBAL', 'count': int(count)}
            for country, count in country_rows.all()
        ],
        'users': [
            {
                'id': str(user.id),
                'nexus_id': user.nexus_id,
                'display_name': profile.display_name,
                'username': profile.username,
                'phone': profile.optional_phone,
                'email': profile.email,
                'country': profile.registration_country or 'GLOBAL',
                'status': user.status,
                'created_at': user.created_at,
                'is_official': is_configured_admin_profile(profile),
            }
            for user, profile in user_rows.all()
        ],
    }


async def change_user_status(session: AsyncSession, admin_user_id: UUID, target_user_id: UUID, next_status: str) -> None:
    await require_admin(session, admin_user_id)
    if next_status not in {'active', 'blocked', 'deleted'}:
        raise AdminError('Unsupported user status')
    if target_user_id == admin_user_id:
        raise AdminError('Administrator account cannot be changed here')
    user = await session.get(User, target_user_id)
    if not user or user.deleted_at:
        raise AdminError('User not found')
    now = datetime.now(timezone.utc)
    user.status = next_status
    if next_status == 'deleted':
        user.deleted_at = now
    if next_status in {'blocked', 'deleted'}:
        await session.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
        await session.execute(update(TrustedDevicePin).where(TrustedDevicePin.user_id == user.id, TrustedDevicePin.revoked_at.is_(None)).values(revoked_at=now))
    await session.commit()
