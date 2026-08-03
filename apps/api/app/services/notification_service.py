import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pywebpush import WebPushException, webpush
from py_vapid import Vapid
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chats import ChatParticipant, Message, Notification, PushSubscription
from app.models.users import UserProfile
from app.schemas.chats import MessageOut, NotificationOut, PushSubscriptionCreateRequest
from app.services.realtime_manager import realtime_manager


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PushDeliveryResult:
    delivered: bool
    expired: bool = False


def web_push_is_configured() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key and settings.vapid_claims_email)


def _vapid_claims_subject() -> str:
    subject = settings.vapid_claims_email.strip()
    if not subject or ':' in subject:
        return subject
    return f'mailto:{subject}'


def _vapid_private_key() -> str | Vapid:
    private_key = settings.vapid_private_key.strip().replace('\\n', '\n')
    if '-----BEGIN' in private_key:
        return Vapid.from_pem(private_key.encode('utf8'))
    return private_key


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
        subscription.device_id = request.device_id
        subscription.is_active = request.enabled
        subscription.p256dh = request.keys.p256dh
        subscription.auth = request.keys.auth
        subscription.expiration_time = request.expirationTime
    else:
        session.add(PushSubscription(
            user_id=user_id,
            device_id=request.device_id,
            is_active=request.enabled,
            endpoint=request.endpoint,
            p256dh=request.keys.p256dh,
            auth=request.keys.auth,
            expiration_time=request.expirationTime,
        ))
    await session.commit()


async def remove_push_subscription(session: AsyncSession, user_id: UUID, endpoint: str, device_id: str | None = None) -> None:
    conditions = [
        PushSubscription.user_id == user_id,
        PushSubscription.endpoint == endpoint,
    ]
    if device_id is not None:
        conditions.append(or_(PushSubscription.device_id == device_id, PushSubscription.device_id.is_(None)))
    subscription = (await session.execute(
        select(PushSubscription).where(*conditions)
    )).scalar_one_or_none()
    if subscription:
        subscription.is_active = False
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
    title = sender.display_name if sender else 'AraChat'
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


async def create_branch_comment_notification(
    session: AsyncSession,
    recipient_user_id: UUID,
    sender_user_id: UUID,
    branch_id: UUID,
    post_id: UUID,
    comment_text: str,
) -> None:
    if recipient_user_id == sender_user_id:
        return
    sender = await session.get(UserProfile, sender_user_id)
    notification = Notification(
        recipient_user_id=recipient_user_id,
        chat_id=branch_id,
        message_id=post_id,
        title=sender.display_name if sender else 'AraChat',
        body=f'Комментарий: {comment_text[:226]}',
        url=f'/app/chats/{branch_id}',
    )
    session.add(notification)
    await session.commit()
    payload = _notification_out(notification)
    await realtime_manager.broadcast_to_user(
        recipient_user_id,
        {'event': 'notification.created', 'notification': payload.model_dump(mode='json')},
    )
    await _send_push_to_user(session, recipient_user_id, payload)


async def send_test_push_notification(session: AsyncSession, user_id: UUID) -> bool:
    notification = NotificationOut(
        id=uuid4(),
        chat_id=None,
        message_id=None,
        title='AraChat',
        body='Проверка push-уведомлений',
        url='/app/settings',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )
    return await _send_push_to_user(session, user_id, notification)


async def _send_push_to_user(session: AsyncSession, user_id: UUID, notification: NotificationOut) -> bool:
    if not web_push_is_configured():
        return False
    subscriptions = list((await session.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.is_active.is_(True),
        )
    )).scalars())
    delivered = False
    for subscription in subscriptions:
        result = await asyncio.to_thread(_send_push, subscription, notification)
        delivered = delivered or result.delivered
        if result.expired:
            await session.delete(subscription)
    if subscriptions:
        await session.commit()
    return delivered


def _send_push(subscription: PushSubscription, notification: NotificationOut) -> PushDeliveryResult:
    try:
        webpush(
            subscription_info={
                'endpoint': subscription.endpoint,
                'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
            },
            data=json.dumps(notification.model_dump(mode='json')),
            vapid_private_key=_vapid_private_key(),
            vapid_claims={'sub': _vapid_claims_subject()},
            ttl=60 * 60 * 24,
        )
        return PushDeliveryResult(delivered=True)
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        logger.warning(
            'Web Push delivery failed for subscription %s: status=%s, reason=%s',
            subscription.id,
            status_code,
            str(exc),
        )
        return PushDeliveryResult(delivered=False, expired=status_code in {404, 410})
    except Exception as exc:
        logger.warning(
            'Web Push delivery failed for subscription %s: %s: %s',
            subscription.id,
            type(exc).__name__,
            str(exc),
        )
        return PushDeliveryResult(delivered=False)


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
        'video_note': '🎥 Видеосообщение',
        'voice': '🎤 Голосовое сообщение',
        'file': '📎 Файл',
    }
    label = labels.get(message.type, 'Новое сообщение')
    return f'{label}: {message.media_name}' if message.media_name else label
