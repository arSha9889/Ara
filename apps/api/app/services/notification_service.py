import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chats import ChatParticipant, Message, Notification, PushSubscription
from app.models.users import UserProfile
from app.schemas.chats import MessageOut, NotificationOut, PushSubscriptionCreateRequest
from app.services.realtime_manager import realtime_manager


logger = logging.getLogger(__name__)


def web_push_is_configured() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key and settings.vapid_claims_email)


async def save_push_subscription(
    session: AsyncSession,
    user_id: UUID,
    request: PushSubscriptionCreateRequest,
) -> None:
    subscription = (await session.execute(
        select(PushSubscription).where(PushSubscription.endpoint == request.endpoint)
    )).scalar_one_or_none()
    if subscription:
        subscription.user_id = user_id
        subscription.p256dh = request.keys.p256dh
        subscription.auth = request.keys.auth
        subscription.expiration_time = request.expirationTime
    else:
        session.add(PushSubscription(
            user_id=user_id,
            endpoint=request.endpoint,
            p256dh=request.keys.p256dh,
            auth=request.keys.auth,
            expiration_time=request.expirationTime,
        ))
    await session.commit()


async def remove_push_subscription(session: AsyncSession, user_id: UUID, endpoint: str) -> None:
    subscription = (await session.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )).scalar_one_or_none()
    if subscription:
        await session.delete(subscription)
        await session.commit()


async def list_notifications(session: AsyncSession, user_id: UUID, limit: int = 40) -> list[NotificationOut]:
    result = await session.execute(
        select(Notification)
        .where(Notification.recipient_user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return [_notification_out(item) for item in result.scalars()]


async def mark_notifications_read(session: AsyncSession, user_id: UUID, notification_ids: list[UUID] | None = None) -> None:
    statement = select(Notification).where(
        Notification.recipient_user_id == user_id,
        Notification.read_at.is_(None),
    )
    if notification_ids is not None:
        statement = statement.where(Notification.id.in_(notification_ids))
    result = await session.execute(statement)
    now = datetime.now(timezone.utc)
    for notification in result.scalars():
        notification.read_at = now
    await session.commit()


async def create_message_notifications(session: AsyncSession, message: MessageOut) -> None:
    recipients = list((await session.execute(
        select(ChatParticipant.user_id).where(
            ChatParticipant.chat_id == message.chat_id,
            ChatParticipant.user_id != message.sender_id,
        )
    )).scalars())
    if not recipients:
        return

    sender = await session.get(UserProfile, message.sender_id)
    title = sender.display_name if sender else 'Nexus'
    body = _message_preview(message)
    notifications = [
        Notification(
            recipient_user_id=recipient_id,
            chat_id=message.chat_id,
            message_id=message.id,
            title=title,
            body=body,
            url=f'/app/chats/{message.chat_id}',
        )
        for recipient_id in recipients
    ]
    session.add_all(notifications)
    await session.commit()

    for notification in notifications:
        payload = _notification_out(notification)
        await realtime_manager.broadcast_to_user(
            notification.recipient_user_id,
            {'event': 'notification.created', 'notification': payload.model_dump(mode='json')},
        )
        await _send_push_to_user(session, notification.recipient_user_id, payload)


async def _send_push_to_user(session: AsyncSession, user_id: UUID, notification: NotificationOut) -> None:
    if not web_push_is_configured():
        return
    subscriptions = list((await session.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )).scalars())
    for subscription in subscriptions:
        expired = await asyncio.to_thread(_send_push, subscription, notification)
        if expired:
            await session.delete(subscription)
    if subscriptions:
        await session.commit()


def _send_push(subscription: PushSubscription, notification: NotificationOut) -> bool:
    try:
        webpush(
            subscription_info={
                'endpoint': subscription.endpoint,
                'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
            },
            data=json.dumps(notification.model_dump(mode='json')),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={'sub': settings.vapid_claims_email},
            ttl=60 * 60 * 24,
        )
        return False
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        logger.warning(
            'Web Push delivery failed for subscription %s: status=%s, reason=%s',
            subscription.id,
            status_code,
            str(exc),
        )
        return status_code in {404, 410}
    except Exception as exc:
        logger.warning(
            'Web Push delivery failed for subscription %s: %s: %s',
            subscription.id,
            type(exc).__name__,
            str(exc),
        )
        return False


def _notification_out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        chat_id=notification.chat_id,
        message_id=notification.message_id,
        title=notification.title,
        body=notification.body,
        url=notification.url,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


def _message_preview(message: MessageOut) -> str:
    if message.type in {'text', 'emoji'}:
        return message.payload[:240]
    labels = {
        'photo': '📷 Фото',
        'video': '🎬 Видео',
        'voice': '🎤 Голосовое сообщение',
        'file': '📎 Файл',
    }
    label = labels.get(message.type, 'Новое сообщение')
    return f'{label}: {message.media_name}' if message.media_name else label
