import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.security_hashing import hash_secret
from app.models.verification import EmailVerification, PasswordConfirmation, PhoneVerification
from app.services.telegram_bot_client import answer_telegram_callback, send_telegram_message


PASSWORD_CONFIRMATION_TTL_MINUTES = 10
CONFIRM_CALLBACK_PREFIX = 'password_confirm:'


class PasswordConfirmationError(ValueError):
    pass


@dataclass(frozen=True)
class PasswordConfirmationStart:
    confirmation: PasswordConfirmation
    bot_url: str


async def create_password_confirmation(
    session: AsyncSession,
    user_id: UUID,
    telegram_id: str,
    password: str,
    device_id: str,
    purpose: str,
) -> PasswordConfirmationStart:
    telegram_chat_id = await _find_telegram_chat_id(session, telegram_id)
    if not telegram_chat_id:
        raise PasswordConfirmationError('Telegram chat is not available for password confirmation')

    confirmation = PasswordConfirmation(
        public_token=secrets.token_urlsafe(18),
        user_id=user_id,
        purpose=purpose,
        password_hash=hash_secret(password),
        device_id=device_id,
        telegram_user_id=telegram_id,
        telegram_chat_id=telegram_chat_id,
        status='pending',
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_CONFIRMATION_TTL_MINUTES),
    )
    session.add(confirmation)
    await session.flush()
    return PasswordConfirmationStart(
        confirmation=confirmation,
        bot_url=f'https://t.me/{settings.telegram_bot_name}' if settings.telegram_bot_name else '',
    )


async def send_password_confirmation_prompt(confirmation: PasswordConfirmation) -> None:
    action = 'создание аккаунта' if confirmation.purpose == 'registration' else 'смену пароля'
    await send_telegram_message(
        confirmation.telegram_chat_id,
        f'Подтвердите {action} в AraChat. Если это не вы, ничего не нажимайте.',
        {
            'inline_keyboard': [[{
                'text': 'Подтвердить',
                'callback_data': f'{CONFIRM_CALLBACK_PREFIX}{confirmation.public_token}',
            }]],
        },
    )


async def handle_password_confirmation_callback(session: AsyncSession, callback_query: dict) -> bool:
    data = callback_query.get('data') or ''
    if not data.startswith(CONFIRM_CALLBACK_PREFIX):
        return False

    callback_query_id = callback_query.get('id')
    telegram_user_id = str((callback_query.get('from') or {}).get('id') or '')
    token = data.removeprefix(CONFIRM_CALLBACK_PREFIX)
    confirmation = await _find_by_token(session, token)
    if not confirmation or _is_expired(confirmation):
        if confirmation:
            confirmation.status = 'expired'
            await session.commit()
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, 'Подтверждение истекло')
        return True
    if confirmation.telegram_user_id != telegram_user_id:
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, 'Это подтверждение другого Telegram-аккаунта')
        return True
    if confirmation.status == 'confirmed':
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, 'Уже подтверждено')
        return True

    confirmation.status = 'confirmed'
    confirmation.confirmed_at = datetime.now(timezone.utc)
    await session.commit()
    if callback_query_id:
        await answer_telegram_callback(callback_query_id, 'Подтверждено. Вернитесь в AraChat.')
    await send_telegram_message(confirmation.telegram_chat_id, 'Подтверждение получено. Вернитесь в AraChat, чтобы завершить действие.')
    return True


async def consume_password_confirmation(
    session: AsyncSession,
    confirmation_id: UUID,
    public_token: str,
    user_id: UUID | None = None,
) -> PasswordConfirmation:
    confirmation = await session.get(PasswordConfirmation, confirmation_id)
    if not confirmation or not secrets.compare_digest(confirmation.public_token, public_token):
        raise PasswordConfirmationError('Password confirmation not found')
    if user_id and confirmation.user_id != user_id:
        raise PasswordConfirmationError('Password confirmation is not available')
    if _is_expired(confirmation):
        confirmation.status = 'expired'
        await session.commit()
        raise PasswordConfirmationError('Password confirmation has expired')
    if confirmation.status != 'confirmed' or confirmation.consumed_at:
        raise PasswordConfirmationError('Confirm the action in Telegram first')
    confirmation.consumed_at = datetime.now(timezone.utc)
    confirmation.status = 'consumed'
    return confirmation


async def _find_telegram_chat_id(session: AsyncSession, telegram_id: str) -> str | None:
    for model in (PhoneVerification, EmailVerification):
        result = await session.execute(
            select(model.telegram_chat_id)
            .where(model.telegram_user_id == telegram_id, model.telegram_chat_id.is_not(None))
            .order_by(model.created_at.desc())
            .limit(1)
        )
        if chat_id := result.scalar_one_or_none():
            return chat_id
    return None


async def _find_by_token(session: AsyncSession, token: str) -> PasswordConfirmation | None:
    result = await session.execute(select(PasswordConfirmation).where(PasswordConfirmation.public_token == token))
    return result.scalar_one_or_none()


def _is_expired(confirmation: PasswordConfirmation) -> bool:
    return confirmation.expires_at <= datetime.now(timezone.utc)
