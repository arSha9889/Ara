from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chats import MobilePushToken


async def deactivate_mobile_push_tokens(
    session: AsyncSession,
    user_id: UUID,
    device_id: str | None = None,
    provider: str | None = None,
    *,
    commit: bool = True,
) -> None:
    statement = update(MobilePushToken).where(
        MobilePushToken.user_id == user_id,
        MobilePushToken.is_active.is_(True),
    ).values(is_active=False)
    if device_id is not None:
        statement = statement.where(MobilePushToken.device_id == device_id)
    if provider is not None:
        statement = statement.where(MobilePushToken.provider == provider)
    result = await session.execute(statement)
    if commit and result.rowcount:
        await session.commit()
