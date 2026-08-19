from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.users import User, UserRestriction


async def get_active_user_restriction(session: AsyncSession, user_id: UUID) -> UserRestriction | None:
    now = datetime.now(timezone.utc)
    expired = list((await session.execute(
        select(UserRestriction).where(
            UserRestriction.user_id == user_id,
            UserRestriction.lifted_at.is_(None),
            UserRestriction.ends_at.is_not(None),
            UserRestriction.ends_at <= now,
        )
    )).scalars())
    if expired:
        for restriction in expired:
            restriction.lifted_at = now
            _record_expiration_audit(session, restriction)
        await _restore_users_without_active_restrictions(session, {user_id}, now)
        await session.commit()

    return (await session.execute(
        select(UserRestriction)
        .where(
            UserRestriction.user_id == user_id,
            UserRestriction.lifted_at.is_(None),
            or_(UserRestriction.ends_at.is_(None), UserRestriction.ends_at > now),
        )
        .order_by(UserRestriction.started_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def user_can_access(session: AsyncSession, user: User | None) -> bool:
    if not user or user.deleted_at or user.status != 'active':
        if user and user.status == 'blocked':
            await get_active_user_restriction(session, user.id)
        return bool(user and not user.deleted_at and user.status == 'active')
    return await get_active_user_restriction(session, user.id) is None


async def expire_user_restrictions(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    expired = list((await session.execute(
        select(UserRestriction).where(
            UserRestriction.lifted_at.is_(None),
            UserRestriction.ends_at.is_not(None),
            UserRestriction.ends_at <= now,
        )
    )).scalars())
    if not expired:
        return 0
    user_ids = {restriction.user_id for restriction in expired}
    for restriction in expired:
        restriction.lifted_at = now
        _record_expiration_audit(session, restriction)
    await _restore_users_without_active_restrictions(session, user_ids, now)
    await session.commit()
    return len(expired)


async def _restore_users_without_active_restrictions(
    session: AsyncSession,
    user_ids: set[UUID],
    now: datetime,
) -> None:
    for user_id in user_ids:
        active = (await session.execute(
            select(UserRestriction.id).where(
                UserRestriction.user_id == user_id,
                UserRestriction.lifted_at.is_(None),
                or_(UserRestriction.ends_at.is_(None), UserRestriction.ends_at > now),
            ).limit(1)
        )).scalar_one_or_none()
        if active:
            continue
        user = await session.get(User, user_id)
        if user and user.status == 'blocked':
            user.status = 'active'


def _record_expiration_audit(session: AsyncSession, restriction: UserRestriction) -> None:
    session.add(AuditLog(
        actor_user_id=None,
        actor_type='system',
        action='user.restriction_expired',
        target_type='user',
        target_id=str(restriction.user_id),
        metadata_json={'restriction_id': str(restriction.id)},
    ))
