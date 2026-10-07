import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pywebpush import WebPushException, webpush
from py_vapid import Vapid
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chats import Chat, ChatParticipant, Message, MobilePushToken, Notification, PushSubscription, SystemAnnouncement
from app.models.users import User, UserProfile
from app.schemas.chats import MessageOut, MobilePushTokenRegisterRequest, NotificationOut, PushSubscriptionCreateRequest
from app.services.localization import message_preview, tr
from app.services.mobile_push_client import send_mobile_push
from app.services.mobile_push_token_service import deactivate_mobile_push_tokens
from app.services.realtime_manager import realtime_manager
from app.services.safety_service import is_user_interaction_blocked


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


async def save_mobile_push_token(
    session: AsyncSession,
    user_id: UUID,
    request: MobilePushTokenRegisterRequest,
) -> MobilePushToken:
    try:
        matching_token = await session.scalar(select(MobilePushToken).where(MobilePushToken.token == request.token))
        matching_device = await session.scalar(
            select(MobilePushToken).where(
                MobilePushToken.user_id == user_id,
                MobilePushToken.device_id == request.device_id,
                MobilePushToken.provider == request.provider,
            )
        )
        now = datetime.now(timezone.utc)
        if matching_token and matching_device and matching_device.id != matching_token.id:
            await session.delete(matching_device)
            await session.flush()
            token = matching_token
            token.user_id = user_id
            token.device_id = request.device_id
            token.provider = request.provider
            token.package_name = request.package_name
            token.app_version = request.app_version
            token.is_active = True
            token.last_seen_at = now
        elif matching_token:
            token = matching_token
            token.user_id = user_id
            token.device_id = request.device_id
            token.provider = request.provider
            token.package_name = request.package_name
            token.app_version = request.app_version
            token.is_active = True
            token.last_seen_at = now
        elif matching_device:
            token = matching_device
            token.package_name = request.package_name
            token.app_version = request.app_version
            token.token = request.token
            token.is_active = True
            token.last_seen_at = now
        else:
            token = MobilePushToken(
                user_id=user_id,
                device_id=request.device_id,
                provider=request.provider,
                package_name=request.package_name,
                app_version=request.app_version,
                token=request.token,
                is_active=True,
                last_seen_at=now,
            )
            session.add(token)
        await session.execute(
            MobilePushToken.__table__.update()
            .where(
                MobilePushToken.user_id == user_id,
                MobilePushToken.device_id == request.device_id,
                MobilePushToken.provider != request.provider,
                MobilePushToken.is_active.is_(True),
            )
            .values(is_active=False)
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await session.refresh(token)
    return token


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
    chat = await session.get(Chat, message.chat_id)
    if chat and chat.type == 'direct':
        recipients = [
            recipient_id for recipient_id in recipients
            if not await is_user_interaction_blocked(session, message.sender_id, recipient_id)
        ]
    if not recipients:
        return

    sender = await session.get(UserProfile, message.sender_id)
    sender_name = sender.display_name.strip() if sender else ''
    if not sender_name:
        logger.warning('Skipping Android mobile push without a sender name: %s', message.id)
    title = sender_name or 'AraChat'
    mobile_push_preview_available = bool(sender_name) and message.encryption_state != 'e2ee_web_v1'
    recipient_languages = dict((await session.execute(
        select(UserProfile.user_id, UserProfile.language).where(UserProfile.user_id.in_(recipients))
    )).all())
    notifications = [
        Notification(
            recipient_user_id=recipient_id,
            chat_id=message.chat_id,
            message_id=message.id,
            title=title,
            body=(
                tr(recipient_languages.get(recipient_id), 'notification.new_message')
                if message.encryption_state == 'e2ee_web_v1'
                else message_preview(recipient_languages.get(recipient_id), message.type, message.payload, message.media_name)
            ),
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
        await _send_push_to_user(
            session,
            notification.recipient_user_id,
            payload,
            mobile_push_preview_available=mobile_push_preview_available,
        )


async def create_announcement_notifications(
    session: AsyncSession,
    announcement: SystemAnnouncement,
    message: MessageOut,
) -> tuple[dict[str, int], list[Notification]]:
    recipients = await _announcement_recipient_ids(session, announcement)
    existing_recipient_ids = set((await session.execute(
        select(Notification.recipient_user_id).where(Notification.announcement_id == announcement.id)
    )).scalars())
    recipients = [user_id for user_id in recipients if user_id not in existing_recipient_ids]

    sender = await session.get(UserProfile, message.sender_id)
    title = sender.display_name if sender else 'AraChat'
    recipient_languages = dict((await session.execute(
        select(UserProfile.user_id, UserProfile.language).where(UserProfile.user_id.in_(recipients))
    )).all()) if recipients else {}
    notifications = [
        Notification(
            recipient_user_id=recipient_id,
            chat_id=message.chat_id,
            message_id=message.id,
            announcement_id=announcement.id,
            title=title,
            body=message_preview(recipient_languages.get(recipient_id), message.type, message.payload, message.media_name),
            url=f'/app/chats/{message.chat_id}',
        )
        for recipient_id in recipients
    ]
    if notifications:
        session.add_all(notifications)
        await session.flush()

    recipient_count = int((await session.execute(
        select(func.count()).select_from(Notification).where(Notification.announcement_id == announcement.id)
    )).scalar_one())
    return {
        'recipient_count': recipient_count,
        'notification_count': recipient_count,
    }, notifications


async def deliver_announcement_notifications(session: AsyncSession, notifications: list[Notification]) -> int:
    push_provider_accepted = 0
    for notification in notifications:
        payload = _notification_out(notification)
        await realtime_manager.broadcast_to_user(
            notification.recipient_user_id,
            {'event': 'notification.created', 'notification': payload.model_dump(mode='json')},
        )
        if await _send_push_to_user(session, notification.recipient_user_id, payload):
            push_provider_accepted += 1
    return push_provider_accepted


async def _announcement_recipient_ids(session: AsyncSession, announcement: SystemAnnouncement) -> list[UUID]:
    statement = select(User.id).where(User.deleted_at.is_(None), User.status == 'active')
    if announcement.audience_type == 'country':
        statement = statement.join(UserProfile, UserProfile.user_id == User.id).where(
            UserProfile.registration_country == announcement.audience_country,
        )
    elif announcement.audience_type == 'branch':
        statement = statement.join(ChatParticipant, ChatParticipant.user_id == User.id).where(
            ChatParticipant.chat_id == announcement.audience_branch_id,
            ChatParticipant.role == 'member',
        )
    return list((await session.execute(statement)).scalars())


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
    recipient = await session.get(UserProfile, recipient_user_id)
    notification = Notification(
        recipient_user_id=recipient_user_id,
        chat_id=branch_id,
        message_id=post_id,
        title=sender.display_name if sender else 'AraChat',
        body=tr(recipient.language if recipient else None, 'notification.comment', text=comment_text[:226]),
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


async def create_support_notification(
    session: AsyncSession,
    recipient_user_id: UUID,
    ticket_id: UUID,
    title: str,
    body: str,
) -> None:
    notification = Notification(
        recipient_user_id=recipient_user_id,
        support_ticket_id=ticket_id,
        title=title[:120],
        body=body[:240],
        url=f'/app/support/{ticket_id}',
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
    profile = await session.get(UserProfile, user_id)
    notification = NotificationOut(
        id=uuid4(),
        notification_id=uuid4(),
        kind='system',
        chat_id=None,
        message_id=None,
        title='AraChat',
        body=tr(profile.language if profile else None, 'notification.test'),
        url='/app/settings',
        created_at=datetime.now(timezone.utc),
        read_at=None,
    )
    return await _send_push_to_user(session, user_id, notification)


async def _send_push_to_user(
    session: AsyncSession,
    user_id: UUID,
    notification: NotificationOut,
    *,
    mobile_push_preview_available: bool = True,
) -> bool:
    delivered = False
    subscriptions: list[PushSubscription] = []
    if web_push_is_configured():
        subscriptions = list((await session.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.is_active.is_(True),
            )
        )).scalars())
        for subscription in subscriptions:
            result = await asyncio.to_thread(_send_push, subscription, notification)
            delivered = delivered or result.delivered
            if result.expired:
                await session.delete(subscription)
    if subscriptions:
        await session.commit()
    mobile_data = _mobile_push_data(
        notification,
        preview_available=mobile_push_preview_available,
    )
    if mobile_data:
        mobile_tokens = list((await session.execute(
            select(MobilePushToken).where(
                MobilePushToken.user_id == user_id,
                MobilePushToken.is_active.is_(True),
            )
        )).scalars())
        if mobile_tokens:
            mobile_result = await send_mobile_push(
                _mobile_tokens_by_provider(mobile_tokens),
                mobile_data,
            )
            delivered = delivered or mobile_result.delivered
            for provider, prefixes in mobile_result.invalid_token_prefixes.items():
                for prefix in prefixes:
                    matching_tokens = [
                        token for token in mobile_tokens
                        if token.provider == provider and token.token.startswith(prefix)
                    ]
                    if len(matching_tokens) == 1:
                        matching_tokens[0].is_active = False
            await session.commit()
    return delivered


async def send_mobile_call_invite_push(
    session: AsyncSession,
    recipient_user_id: UUID,
    caller_user_id: UUID,
    chat_id: UUID,
    call_id: str,
    call_type: str,
) -> bool:
    caller = await session.get(UserProfile, caller_user_id)
    recipient = await session.get(UserProfile, recipient_user_id)
    mobile_tokens = list((await session.execute(
        select(MobilePushToken).where(
            MobilePushToken.user_id == recipient_user_id,
            MobilePushToken.is_active.is_(True),
        )
    )).scalars())
    if not mobile_tokens:
        return False

    mobile_result = await send_mobile_push(
        _mobile_tokens_by_provider(mobile_tokens),
        _mobile_call_push_data(
            chat_id=chat_id,
            call_id=call_id,
            call_type=call_type,
            caller_name=caller.display_name if caller else '',
            recipient_language=recipient.language if recipient else None,
        ),
    )
    for provider, prefixes in mobile_result.invalid_token_prefixes.items():
        for prefix in prefixes:
            matching_tokens = [
                token for token in mobile_tokens
                if token.provider == provider and token.token.startswith(prefix)
            ]
            if len(matching_tokens) == 1:
                matching_tokens[0].is_active = False
    await session.commit()
    return mobile_result.delivered


def _mobile_tokens_by_provider(tokens: list[MobilePushToken]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for token in tokens:
        if token.provider in {'rustore', 'fcm'}:
            result.setdefault(token.provider, []).append(token.token)
    return result


def _mobile_push_data(
    notification: NotificationOut,
    *,
    preview_available: bool = True,
) -> dict[str, str] | None:
    if not preview_available or notification.kind != 'message' or not notification.chat_id:
        return None

    title = _mobile_push_text(notification.title, maximum_length=120)
    body = _mobile_push_text(notification.body, maximum_length=240)
    if not title or not body:
        return None

    data = {
        'kind': 'message',
        'notification_id': str(notification.notification_id),
        'chat_id': str(notification.chat_id),
        'title': title,
        'body': body,
    }
    if notification.message_id:
        data['message_id'] = str(notification.message_id)
    return data


def _mobile_call_push_data(
    *,
    chat_id: UUID,
    call_id: str,
    call_type: str,
    caller_name: str,
    recipient_language: str | None,
) -> dict[str, str]:
    normalized_call_type = 'video' if call_type == 'video' else 'audio'
    title = _mobile_push_text(caller_name, maximum_length=120) or 'AraChat'
    return {
        'kind': 'call',
        'call_id': call_id,
        'call_type': normalized_call_type,
        'chat_id': str(chat_id),
        'title': title,
        'body': tr(recipient_language, f'notification.call.{normalized_call_type}'),
    }


def _mobile_push_text(value: str, maximum_length: int) -> str:
    return ' '.join(value.split())[:maximum_length]


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
        notification_id=notification.id,
        kind='announcement' if notification.announcement_id else 'support' if notification.support_ticket_id else 'message',
        chat_id=notification.chat_id,
        message_id=notification.message_id,
        support_ticket_id=notification.support_ticket_id,
        title=notification.title,
        body=notification.body,
        url=notification.url,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )
