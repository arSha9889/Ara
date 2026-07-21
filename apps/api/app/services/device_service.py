from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import PushSubscription
from app.models.sessions import LoginHistory, Session
from app.schemas.devices import DeviceOut, LoginHistoryOut


async def list_devices(session: AsyncSession, user_id) -> list[DeviceOut]:
    result = await session.execute(select(Session).where(Session.user_id == user_id).order_by(Session.created_at.desc()))
    return [
        DeviceOut(
            id=item.id,
            device_id=item.device_id,
            created_at=item.created_at,
            expires_at=item.expires_at,
            revoked_at=item.revoked_at,
        )
        for item in result.scalars()
    ]


async def revoke_device(session: AsyncSession, user_id, device_id: str) -> None:
    result = await session.execute(select(Session).where(Session.user_id == user_id, Session.device_id == device_id))
    for item in result.scalars():
        from datetime import datetime, timezone

        item.revoked_at = datetime.now(timezone.utc)
    subscriptions = await session.execute(select(PushSubscription).where(PushSubscription.user_id == user_id, PushSubscription.device_id == device_id))
    for subscription in subscriptions.scalars():
        await session.delete(subscription)
    await session.commit()


async def list_login_history(session: AsyncSession, user_id) -> list[LoginHistoryOut]:
    result = await session.execute(select(LoginHistory).where(LoginHistory.user_id == user_id).order_by(LoginHistory.created_at.desc()).limit(50))
    return [
        LoginHistoryOut(
            id=item.id,
            device_id=item.device_id,
            method=item.method,
            result=item.result,
            created_at=item.created_at,
        )
        for item in result.scalars()
    ]
