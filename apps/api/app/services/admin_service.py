from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.chats import Chat, MobilePushToken, PushSubscription
from app.models.security import PasswordCredential, TrustedDevicePin
from app.models.sessions import Session
from app.models.users import User, UserProfile, UserRestriction
from app.services.email_verification_service import EmailVerificationError, normalize_email
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
    if not profile:
        return False
    if settings.admin_email.strip():
        try:
            return profile.email_verified_at is not None and profile.email == normalize_email(settings.admin_email)
        except EmailVerificationError:
            return False
    return bool(configured_admin_phone() and profile.optional_phone == configured_admin_phone())


async def require_admin(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    profile = await session.get(UserProfile, user_id)
    if not user or user.deleted_at or user.status != 'active' or not is_configured_admin_profile(profile):
        raise AdminError('Administrator access is required')
    return user


async def find_configured_admin(session: AsyncSession) -> User | None:
    if settings.admin_email.strip():
        try:
            email = normalize_email(settings.admin_email)
        except EmailVerificationError:
            return None
        result = await session.execute(
            select(User)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(
                UserProfile.email == email,
                UserProfile.email_verified_at.is_not(None),
                User.deleted_at.is_(None),
                User.status == 'active',
            )
            .limit(1)
        )
        return result.scalar_one_or_none()
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
    return {
        'total_users': total_users,
        'active_users': active_users,
        'countries': [
            {'country': country or 'GLOBAL', 'count': int(count)}
            for country, count in country_rows.all()
        ],
    }


def record_admin_audit(
    session: AsyncSession,
    admin_user_id: UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict | None = None,
    actor_type: str = 'admin',
) -> None:
    session.add(AuditLog(
        actor_user_id=admin_user_id,
        actor_type=actor_type,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_json=metadata,
    ))


async def admin_security_metrics(session: AsyncSession, user_id: UUID) -> dict:
    await require_admin(session, user_id)
    now = datetime.now(timezone.utc)
    active_sessions = int((await session.execute(
        select(func.count()).select_from(Session).where(Session.revoked_at.is_(None), Session.expires_at > now)
    )).scalar_one())
    blocked_users = int((await session.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None), User.status == 'blocked')
    )).scalar_one())
    locked_passwords = int((await session.execute(
        select(func.count()).select_from(PasswordCredential).where(PasswordCredential.locked_until > now)
    )).scalar_one())
    locked_pins = int((await session.execute(
        select(func.count()).select_from(TrustedDevicePin).where(TrustedDevicePin.locked_until > now, TrustedDevicePin.revoked_at.is_(None))
    )).scalar_one())
    archived_branches = int((await session.execute(
        select(func.count()).select_from(Chat).where(Chat.type == 'branch', Chat.is_archived.is_(True))
    )).scalar_one())
    return {
        'active_sessions': active_sessions,
        'blocked_users': blocked_users,
        'locked_passwords': locked_passwords,
        'locked_pins': locked_pins,
        'archived_branches': archived_branches,
    }


async def list_admin_audit_logs(session: AsyncSession, user_id: UUID, limit: int = 50) -> dict:
    await require_admin(session, user_id)
    statement = select(AuditLog).where(AuditLog.actor_type == 'admin')
    total = int((await session.execute(select(func.count()).select_from(statement.subquery()))).scalar_one())
    entries = await session.execute(statement.order_by(AuditLog.created_at.desc()).limit(limit))
    return {
        'total': total,
        'entries': [
            {
                'id': str(item.id),
                'action': item.action,
                'target_type': item.target_type,
                'target_id': item.target_id,
                'metadata': item.metadata_json,
                'created_at': item.created_at,
            }
            for item in entries.scalars()
        ],
    }


async def list_admin_users(
    session: AsyncSession,
    admin_user_id: UUID,
    query: str = '',
    user_status: str = 'all',
    country: str | None = None,
    sort: str = 'newest',
    limit: int = 50,
) -> dict:
    await require_admin(session, admin_user_id)
    statement = select(User, UserProfile).join(UserProfile, UserProfile.user_id == User.id)
    filters = []
    if user_status == 'deleted':
        filters.append(User.deleted_at.is_not(None))
    else:
        filters.append(User.deleted_at.is_(None))
        if user_status != 'all':
            filters.append(User.status == user_status)
    if country:
        filters.append(UserProfile.registration_country == country)
    normalized_query = query.strip()
    if normalized_query:
        pattern = f'%{normalized_query.lstrip("@")}%'
        filters.append(or_(
            UserProfile.display_name.ilike(pattern),
            UserProfile.username.ilike(pattern),
            User.nexus_id.ilike(pattern),
            UserProfile.email.ilike(pattern),
            UserProfile.optional_phone.ilike(pattern),
        ))
    if filters:
        statement = statement.where(*filters)
    total = int((await session.execute(select(func.count()).select_from(statement.subquery()))).scalar_one())
    ordering = {
        'oldest': User.created_at.asc(),
        'name': UserProfile.display_name.asc(),
        'newest': User.created_at.desc(),
    }[sort]
    rows = await session.execute(statement.order_by(ordering).limit(limit))
    return {
        'total': total,
        'users': [
            {
                'id': str(user.id),
                'nexus_id': user.nexus_id,
                'display_name': profile.display_name,
                'username': profile.username,
                'country': profile.registration_country or 'GLOBAL',
                'status': user.status,
                'created_at': user.created_at,
                'is_official': is_configured_admin_profile(profile),
            }
            for user, profile in rows.all()
        ],
    }


async def get_admin_user(session: AsyncSession, admin_user_id: UUID, target_user_id: UUID) -> dict:
    await require_admin(session, admin_user_id)
    result = await session.execute(
        select(User, UserProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(User.id == target_user_id)
    )
    row = result.one_or_none()
    if not row:
        raise AdminError('User not found')
    user, profile = row
    restrictions = list((await session.execute(
        select(UserRestriction)
        .where(UserRestriction.user_id == target_user_id)
        .order_by(UserRestriction.started_at.desc())
        .limit(20)
    )).scalars())
    now = datetime.now(timezone.utc)
    active_restriction = next((item for item in restrictions if item.lifted_at is None and (item.ends_at is None or item.ends_at > now)), None)
    return {
        'id': str(user.id),
        'nexus_id': user.nexus_id,
        'display_name': profile.display_name,
        'username': profile.username,
        'phone': profile.optional_phone,
        'email': profile.email,
        'vpn_enabled': user.vpn_enabled,
        'country': profile.registration_country or 'GLOBAL',
        'status': user.status,
        'created_at': user.created_at,
        'is_official': is_configured_admin_profile(profile),
        'active_restriction': _restriction_out(active_restriction) if active_restriction else None,
        'restrictions': [_restriction_out(item) for item in restrictions],
    }


async def change_user_status(session: AsyncSession, admin_user_id: UUID, target_user_id: UUID, next_status: str) -> None:
    await require_admin(session, admin_user_id)
    if next_status not in {'active', 'blocked', 'deleted'}:
        raise AdminError('Unsupported user status')
    if target_user_id == admin_user_id:
        raise AdminError('Administrator account cannot be changed here')
    if next_status == 'blocked':
        await create_user_restriction(
            session,
            admin_user_id,
            target_user_id,
            reason='other',
            note='Created through the legacy status endpoint.',
            ends_at=None,
        )
        return
    user = (await session.execute(
        select(User).where(User.id == target_user_id).with_for_update()
    )).scalar_one_or_none()
    if not user or user.deleted_at:
        raise AdminError('User not found')
    now = datetime.now(timezone.utc)
    previous_status = user.status
    if next_status == 'active':
        restrictions = list((await session.execute(
            select(UserRestriction).where(
                UserRestriction.user_id == target_user_id,
                UserRestriction.lifted_at.is_(None),
            )
        )).scalars())
        for restriction in restrictions:
            restriction.lifted_at = now
            restriction.lifted_by_user_id = admin_user_id
    user.status = next_status
    if next_status == 'deleted':
        user.deleted_at = now
    if next_status in {'blocked', 'deleted'}:
        await session.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
        await session.execute(update(TrustedDevicePin).where(TrustedDevicePin.user_id == user.id, TrustedDevicePin.revoked_at.is_(None)).values(revoked_at=now))
    if next_status == 'deleted':
        await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
        await session.execute(delete(MobilePushToken).where(MobilePushToken.user_id == user.id))
    record_admin_audit(
        session,
        admin_user_id,
        f'user.{next_status}',
        target_type='user',
        target_id=str(user.id),
        metadata={'previous_status': previous_status},
    )
    await session.commit()


async def create_user_restriction(
    session: AsyncSession,
    admin_user_id: UUID,
    target_user_id: UUID,
    reason: str,
    note: str | None,
    ends_at: datetime | None,
) -> UserRestriction:
    await require_admin(session, admin_user_id)
    if target_user_id == admin_user_id:
        raise AdminError('Administrator account cannot be changed here')
    if ends_at and ends_at <= datetime.now(timezone.utc):
        raise AdminError('Restriction end time must be in the future')
    user = (await session.execute(
        select(User).where(User.id == target_user_id).with_for_update()
    )).scalar_one_or_none()
    if not user or user.deleted_at:
        raise AdminError('User not found')

    now = datetime.now(timezone.utc)
    active_restrictions = list((await session.execute(
        select(UserRestriction).where(
            UserRestriction.user_id == target_user_id,
            UserRestriction.lifted_at.is_(None),
        )
    )).scalars())
    for restriction in active_restrictions:
        restriction.lifted_at = now
        restriction.lifted_by_user_id = admin_user_id
    restriction = UserRestriction(
        user_id=target_user_id,
        admin_user_id=admin_user_id,
        reason=reason,
        note=note.strip() if note else None,
        ends_at=ends_at,
    )
    session.add(restriction)
    user.status = 'blocked'
    await session.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
    await session.execute(update(TrustedDevicePin).where(TrustedDevicePin.user_id == user.id, TrustedDevicePin.revoked_at.is_(None)).values(revoked_at=now))
    record_admin_audit(
        session,
        admin_user_id,
        'user.restricted',
        target_type='user',
        target_id=str(user.id),
        metadata={'reason': reason, 'ends_at': ends_at.isoformat() if ends_at else None},
    )
    await session.commit()
    await session.refresh(restriction)
    return restriction


async def lift_user_restriction(session: AsyncSession, admin_user_id: UUID, target_user_id: UUID) -> None:
    await require_admin(session, admin_user_id)
    user = (await session.execute(
        select(User).where(User.id == target_user_id).with_for_update()
    )).scalar_one_or_none()
    if not user or user.deleted_at:
        raise AdminError('User not found')
    now = datetime.now(timezone.utc)
    restrictions = list((await session.execute(
        select(UserRestriction).where(
            UserRestriction.user_id == target_user_id,
            UserRestriction.lifted_at.is_(None),
        )
    )).scalars())
    if not restrictions:
        raise AdminError('Active restriction not found')
    for restriction in restrictions:
        restriction.lifted_at = now
        restriction.lifted_by_user_id = admin_user_id
    user.status = 'active'
    record_admin_audit(session, admin_user_id, 'user.restriction_lifted', 'user', str(user.id))
    await session.commit()


async def set_user_vpn_enabled(
    session: AsyncSession,
    admin_user_id: UUID,
    target_user_id: UUID,
    vpn_enabled: bool,
) -> bool:
    await require_admin(session, admin_user_id)
    user = await session.get(User, target_user_id)
    if not user or user.deleted_at:
        raise AdminError('User not found')

    if user.vpn_enabled != vpn_enabled:
        user.vpn_enabled = vpn_enabled
        record_admin_audit(
            session,
            admin_user_id,
            f"user.vpn_{'enabled' if vpn_enabled else 'disabled'}",
            target_type='user',
            target_id=str(user.id),
        )
        await session.commit()
    return user.vpn_enabled


def _restriction_out(restriction: UserRestriction) -> dict:
    return {
        'id': str(restriction.id),
        'reason': restriction.reason,
        'note': restriction.note,
        'started_at': restriction.started_at,
        'ends_at': restriction.ends_at,
        'lifted_at': restriction.lifted_at,
    }
