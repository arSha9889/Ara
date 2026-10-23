from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db_session
from app.schemas.chats import (
    MobilePushConfigOut,
    MobilePushTokenDeleteRequest,
    MobilePushTokenOut,
    MobilePushTokenRegisterRequest,
    NotificationOut,
    PushConfigOut,
    PushSubscriptionCreateRequest,
    PushSubscriptionDeleteRequest,
)
from app.schemas.users import UserOut
from app.services.notification_service import (
    clear_notifications,
    list_notifications,
    mark_notifications_read,
    deactivate_mobile_push_tokens,
    remove_push_subscription,
    save_mobile_push_token,
    save_push_subscription,
    send_test_push_notification,
    web_push_is_configured,
)
from app.services.mobile_push_client import mobile_push_is_configured

router = APIRouter()


@router.get('/mobile-config', response_model=MobilePushConfigOut)
async def get_mobile_push_config(
    current_user: Annotated[UserOut, Depends(get_current_user)],
) -> MobilePushConfigOut:
    return MobilePushConfigOut(enabled=mobile_push_is_configured(), package_name='arachat.messenger')


@router.put('/mobile-tokens', response_model=MobilePushTokenOut)
async def register_mobile_push_token(
    request: MobilePushTokenRegisterRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MobilePushTokenOut:
    token = await save_mobile_push_token(session, current_user.id, request)
    return MobilePushTokenOut(active=token.is_active)


@router.delete('/mobile-tokens')
async def unregister_mobile_push_token(
    request: MobilePushTokenDeleteRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    await deactivate_mobile_push_tokens(session, current_user.id, request.device_id, request.provider)
    return {'ok': True}


@router.get('/push-config')
async def get_push_config(
    current_user: Annotated[UserOut, Depends(get_current_user)],
) -> PushConfigOut:
    return PushConfigOut(
        enabled=web_push_is_configured(),
        public_key=settings.vapid_public_key if web_push_is_configured() else None,
    )


@router.post('/subscriptions')
async def create_push_subscription(
    request: PushSubscriptionCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    await save_push_subscription(session, current_user.id, request)
    return {'ok': True}


@router.post('/test-push')
async def test_push_notification(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    if not (web_push_is_configured() or mobile_push_is_configured()):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Push notifications are not configured')
    delivered = await send_test_push_notification(session, current_user.id)
    if not delivered:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Push notification delivery failed')
    return {'ok': True}


@router.delete('/subscriptions')
async def delete_push_subscription(
    request: PushSubscriptionDeleteRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    await remove_push_subscription(session, current_user.id, request.endpoint, request.device_id)
    return {'ok': True}


@router.delete('/history')
async def clear_notifications_history(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, bool]:
    await clear_notifications(session, current_user.id)
    return {'ok': True}


@router.get('')
async def get_notifications(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[NotificationOut]:
    return await list_notifications(session, current_user.id)


@router.post('/read')
async def read_notifications(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    notification_ids: list[UUID] | None = Body(default=None),
) -> dict[str, bool]:
    await mark_notifications_read(session, current_user.id, notification_ids)
    return {'ok': True}
