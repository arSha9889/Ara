import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.registration_proof import create_registration_proof
from app.domain.security_hashing import hash_secret, verify_secret
from app.models.verification import PhoneVerification
from app.services.localization import country_name, normalize_language, tr
from app.services.password_confirmation_service import handle_password_confirmation_callback
from app.services.telegram_bot_client import answer_telegram_callback, send_telegram_message


class PhoneVerificationError(ValueError):
    pass


PHONE_VERIFICATION_TTL_MINUTES = 10
START_PAYLOAD_PREFIX = 'phone_'
CONFIRM_CALLBACK_PREFIX = 'phone_confirm:'
SUPPORTED_PHONE_COUNTRIES = {'RU', 'KZ', 'KG', 'UA', 'BY', 'UZ'}
KAZAKHSTAN_MOBILE_PREFIXES = {'700', '701', '702', '705', '707', '708', '747', '771', '775', '776', '777', '778'}
KYRGYZSTAN_MOBILE_PREFIXES = {'500', '501', '502', '505', '507', '508', '509', '550', '551', '552', '553', '554', '555', '556', '557', '558', '559', '700', '701', '702', '703', '704', '705', '706', '707', '708', '709', '770', '771', '772', '773', '774', '775', '776', '777', '778', '779', '990', '991', '992', '993', '994', '995', '996', '997', '998', '999'}
UKRAINE_MOBILE_PREFIXES = {'39', '50', '63', '66', '67', '68', '73', '91', '92', '93', '94', '95', '96', '97', '98', '99'}
BELARUS_MOBILE_PREFIXES = {'25', '29', '33', '44'}
UZBEKISTAN_MOBILE_PREFIXES = {'20', '33', '50', '55', '70', '77', '88', '90', '91', '93', '94', '95', '97', '98', '99'}


@dataclass(frozen=True)
class PhoneVerificationStart:
    verification: PhoneVerification
    start_payload: str


@dataclass(frozen=True)
class PhoneVerificationResult:
    verification: PhoneVerification
    registration_proof: str


async def create_phone_verification(
    session: AsyncSession,
    country: str,
    phone: str,
    device_id: str,
    language: str = 'ru',
) -> PhoneVerificationStart:
    normalized_country = normalize_phone_country(country)
    normalized_phone = normalize_phone(phone, normalized_country)
    now = datetime.now(timezone.utc)
    public_token = secrets.token_urlsafe(18)
    verification = PhoneVerification(
        public_token=public_token,
        phone_country=normalized_country,
        phone=normalized_phone,
        device_id=device_id,
        language=normalize_language(language),
        status='pending',
        expires_at=now + timedelta(minutes=PHONE_VERIFICATION_TTL_MINUTES),
    )
    session.add(verification)
    await session.commit()
    await session.refresh(verification)
    return PhoneVerificationStart(
        verification=verification,
        start_payload=f'{START_PAYLOAD_PREFIX}{public_token}',
    )


async def verify_phone_code(session: AsyncSession, verification_id: UUID, code: str) -> PhoneVerificationResult:
    verification = await session.get(PhoneVerification, verification_id)
    if not verification:
        raise PhoneVerificationError('Phone verification request not found')
    if verification.consumed_at:
        raise PhoneVerificationError('Phone verification request is already used')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise PhoneVerificationError('Phone verification request is expired')
    if verification.status == 'verified' and verification.telegram_user_id:
        return PhoneVerificationResult(verification, create_registration_proof(verification.telegram_user_id))
    if verification.status != 'code_sent' or not verification.code_hash or not verification.telegram_user_id:
        raise PhoneVerificationError('Telegram confirmation code has not been sent yet')
    if not re.fullmatch(r'\d{4}', code):
        raise PhoneVerificationError('Invalid Telegram confirmation code')

    if not verify_secret(code, verification.code_hash):
        verification.failed_attempts += 1
        if verification.failed_attempts >= settings.max_auth_attempts:
            verification.status = 'expired'
        await session.commit()
        raise PhoneVerificationError('Invalid Telegram confirmation code')

    verification.status = 'verified'
    verification.verified_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(verification)
    return PhoneVerificationResult(verification, create_registration_proof(verification.telegram_user_id))


async def consume_verified_phone(session: AsyncSession, verification_id: UUID, telegram_id: str) -> str:
    verification = await session.get(PhoneVerification, verification_id)
    if not verification:
        raise PhoneVerificationError('Phone verification request not found')
    if verification.consumed_at:
        raise PhoneVerificationError('Phone verification request is already used')
    if verification.status != 'verified' or not verification.verified_at:
        raise PhoneVerificationError('Phone number is not verified')
    if _is_expired(verification):
        verification.status = 'expired'
        await session.commit()
        raise PhoneVerificationError('Phone verification request is expired')
    if verification.telegram_user_id != telegram_id:
        raise PhoneVerificationError('Phone verification does not match Telegram identity')

    verification.consumed_at = datetime.now(timezone.utc)
    return verification.phone


async def handle_telegram_bot_update(session: AsyncSession, update: dict) -> None:
    if callback_query := update.get('callback_query'):
        await _handle_callback_query(session, callback_query)
        return
    if message := update.get('message'):
        await _handle_message(session, message)


async def _handle_message(session: AsyncSession, message: dict) -> None:
    chat_id = _extract_chat_id(message)
    telegram_user_id = _extract_user_id(message.get('from'))
    if not chat_id or not telegram_user_id:
        return

    text = (message.get('text') or '').strip()
    contact = message.get('contact')
    if text.startswith('/start'):
        await _handle_start_command(session, text, chat_id, telegram_user_id, _extract_username(message.get('from')))
        return
    if contact:
        await _handle_contact(session, contact, chat_id, telegram_user_id)
        return
    if text:
        await _handle_phone_text(session, text, chat_id)


async def _handle_start_command(
    session: AsyncSession,
    text: str,
    chat_id: str,
    telegram_user_id: str,
    telegram_username: str | None,
) -> None:
    parts = text.split(maxsplit=1)
    payload = parts[1] if len(parts) > 1 else ''
    if not payload.startswith(START_PAYLOAD_PREFIX):
        await send_telegram_message(
            chat_id,
            tr(None, 'telegram.greeting'),
        )
        return

    public_token = payload.removeprefix(START_PAYLOAD_PREFIX)
    verification = await _get_verification_by_public_token(session, public_token)
    if not verification or _is_expired(verification):
        if verification:
            verification.status = 'expired'
            await session.commit()
        await send_telegram_message(chat_id, tr(verification.language if verification else None, 'telegram.expired'))
        return
    if verification.consumed_at:
        await send_telegram_message(chat_id, tr(verification.language, 'telegram.used'))
        return
    if verification.telegram_user_id and verification.telegram_user_id != telegram_user_id:
        await send_telegram_message(chat_id, tr(verification.language, 'telegram.other_account'))
        return

    verification.telegram_chat_id = chat_id
    verification.telegram_user_id = telegram_user_id
    verification.telegram_username = telegram_username
    await session.commit()
    await _send_phone_confirmation_prompt(chat_id, verification)


async def _handle_contact(session: AsyncSession, contact: dict, chat_id: str, telegram_user_id: str) -> None:
    if str(contact.get('user_id') or '') != telegram_user_id:
        await send_telegram_message(chat_id, tr(None, 'telegram.own_contact'))
        return

    verification = await _get_active_verification_by_chat(session, chat_id)
    if not verification:
        await send_telegram_message(chat_id, tr(None, 'telegram.start_in_app'))
        return

    try:
        verification.phone = normalize_phone(str(contact.get('phone_number') or ''), verification.phone_country)
    except PhoneVerificationError:
        await send_telegram_message(chat_id, tr(verification.language, 'telegram.invalid_phone'))
        return
    await session.commit()
    await _send_phone_confirmation_prompt(chat_id, verification)


async def _handle_phone_text(session: AsyncSession, text: str, chat_id: str) -> None:
    verification = await _get_active_verification_by_chat(session, chat_id)
    if not verification:
        await send_telegram_message(chat_id, tr(None, 'telegram.start_in_app'))
        return

    try:
        verification.phone = normalize_phone(text, verification.phone_country)
    except PhoneVerificationError:
        await send_telegram_message(chat_id, tr(verification.language, 'telegram.invalid_phone'))
        return
    await session.commit()
    await _send_phone_confirmation_prompt(chat_id, verification)


async def _handle_callback_query(session: AsyncSession, callback_query: dict) -> None:
    if await handle_password_confirmation_callback(session, callback_query):
        return

    data = callback_query.get('data') or ''
    callback_query_id = callback_query.get('id')
    message = callback_query.get('message') or {}
    chat_id = _extract_chat_id(message)
    telegram_user_id = _extract_user_id(callback_query.get('from'))
    if not data.startswith(CONFIRM_CALLBACK_PREFIX) or not chat_id or not telegram_user_id:
        return

    public_token = data.removeprefix(CONFIRM_CALLBACK_PREFIX)
    verification = await _get_verification_by_public_token(session, public_token)
    if not verification or _is_expired(verification):
        if verification:
            verification.status = 'expired'
            await session.commit()
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, tr(verification.language if verification else None, 'telegram.callback_expired'))
        await send_telegram_message(chat_id, tr(verification.language if verification else None, 'telegram.expired'))
        return
    if verification.telegram_user_id != telegram_user_id:
        if callback_query_id:
            await answer_telegram_callback(callback_query_id, tr(verification.language, 'telegram.callback_other_account'))
        return

    code = _generate_code()
    verification.code_hash = hash_secret(code)
    verification.status = 'code_sent'
    verification.failed_attempts = 0
    await session.commit()
    if callback_query_id:
        await answer_telegram_callback(callback_query_id, tr(verification.language, 'telegram.callback_sent'))
    await send_telegram_message(
        chat_id,
        tr(verification.language, 'telegram.code', code=code, minutes=PHONE_VERIFICATION_TTL_MINUTES),
        {'remove_keyboard': True},
    )


async def _send_phone_confirmation_prompt(chat_id: str, verification: PhoneVerification) -> None:
    await send_telegram_message(
        chat_id,
        tr(
            verification.language,
            'telegram.prompt',
            country=country_name(verification.language, verification.phone_country),
            phone=verification.phone,
        ),
        {
            'inline_keyboard': [[
                {'text': tr(verification.language, 'telegram.confirm'), 'callback_data': f'{CONFIRM_CALLBACK_PREFIX}{verification.public_token}'},
            ]],
        },
    )
    await send_telegram_message(
        chat_id,
        tr(verification.language, 'telegram.contact_prompt'),
        {
            'keyboard': [[{'text': tr(verification.language, 'telegram.share_contact'), 'request_contact': True}]],
            'resize_keyboard': True,
            'one_time_keyboard': True,
        },
    )


async def _get_verification_by_public_token(session: AsyncSession, public_token: str) -> PhoneVerification | None:
    result = await session.execute(select(PhoneVerification).where(PhoneVerification.public_token == public_token))
    return result.scalar_one_or_none()


async def _get_active_verification_by_chat(session: AsyncSession, chat_id: str) -> PhoneVerification | None:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(PhoneVerification)
        .where(
            PhoneVerification.telegram_chat_id == chat_id,
            PhoneVerification.consumed_at.is_(None),
            PhoneVerification.expires_at > now,
            PhoneVerification.status.in_(['pending', 'code_sent']),
        )
        .order_by(PhoneVerification.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def normalize_phone(value: str, country: str | None = None) -> str:
    normalized_country = normalize_phone_country(country) if country else None
    cleaned = re.sub(r'[\s().-]+', '', value.strip())
    if cleaned.startswith('00'):
        cleaned = f'+{cleaned[2:]}'
    if cleaned.startswith('8') and len(cleaned) == 11:
        cleaned = f'+7{cleaned[1:]}'
    if normalized_country in {'RU', 'KZ'} and cleaned.isdigit() and len(cleaned) == 10:
        cleaned = f'+7{cleaned}'
    if normalized_country == 'UA' and cleaned.isdigit() and len(cleaned) == 10 and cleaned.startswith('0'):
        cleaned = f'+380{cleaned[1:]}'
    if normalized_country == 'UA' and cleaned.isdigit() and len(cleaned) == 9:
        cleaned = f'+380{cleaned}'
    if normalized_country == 'KG' and cleaned.isdigit() and len(cleaned) == 10 and cleaned.startswith('0'):
        cleaned = f'+996{cleaned[1:]}'
    if normalized_country == 'KG' and cleaned.isdigit() and len(cleaned) == 9:
        cleaned = f'+996{cleaned}'
    if normalized_country == 'BY' and cleaned.isdigit() and len(cleaned) == 10 and cleaned.startswith('0'):
        cleaned = f'+375{cleaned[1:]}'
    if normalized_country == 'BY' and cleaned.isdigit() and len(cleaned) == 9:
        cleaned = f'+375{cleaned}'
    if normalized_country == 'UZ' and cleaned.isdigit() and len(cleaned) == 10 and cleaned.startswith('0'):
        cleaned = f'+998{cleaned[1:]}'
    if normalized_country == 'UZ' and cleaned.isdigit() and len(cleaned) == 9:
        cleaned = f'+998{cleaned}'
    if cleaned.startswith('+'):
        digits = cleaned[1:]
    else:
        digits = cleaned
        cleaned = f'+{cleaned}'
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        raise PhoneVerificationError('Phone number has invalid format')
    if normalized_country == 'RU' and not re.fullmatch(r'\+79\d{9}', cleaned):
        raise PhoneVerificationError('Only Russian mobile numbers are supported')
    if normalized_country == 'KZ' and not _is_kazakhstan_mobile_phone(cleaned):
        raise PhoneVerificationError('Only Kazakhstan mobile numbers are supported')
    if normalized_country == 'KG' and not _is_kyrgyzstan_mobile_phone(cleaned):
        raise PhoneVerificationError('Only Kyrgyzstan mobile numbers are supported')
    if normalized_country == 'UA' and not _is_ukraine_mobile_phone(cleaned):
        raise PhoneVerificationError('Only Ukrainian mobile numbers are supported')
    if normalized_country == 'BY' and not _is_belarus_mobile_phone(cleaned):
        raise PhoneVerificationError('Only Belarusian mobile numbers are supported')
    if normalized_country == 'UZ' and not _is_uzbekistan_mobile_phone(cleaned):
        raise PhoneVerificationError('Only Uzbekistan mobile numbers are supported')
    return cleaned


def normalize_phone_country(country: str) -> str:
    normalized_country = country.strip().upper()
    if normalized_country not in SUPPORTED_PHONE_COUNTRIES:
        raise PhoneVerificationError('Phone country is not supported')
    return normalized_country


def _is_kazakhstan_mobile_phone(phone: str) -> bool:
    return bool(re.fullmatch(r'\+7\d{10}', phone)) and phone[2:5] in KAZAKHSTAN_MOBILE_PREFIXES


def _is_kyrgyzstan_mobile_phone(phone: str) -> bool:
    return bool(re.fullmatch(r'\+996\d{9}', phone)) and phone[4:7] in KYRGYZSTAN_MOBILE_PREFIXES


def _is_ukraine_mobile_phone(phone: str) -> bool:
    return bool(re.fullmatch(r'\+380\d{9}', phone)) and phone[4:6] in UKRAINE_MOBILE_PREFIXES


def _is_belarus_mobile_phone(phone: str) -> bool:
    return bool(re.fullmatch(r'\+375\d{9}', phone)) and phone[4:6] in BELARUS_MOBILE_PREFIXES


def _is_uzbekistan_mobile_phone(phone: str) -> bool:
    return bool(re.fullmatch(r'\+998\d{9}', phone)) and phone[4:6] in UZBEKISTAN_MOBILE_PREFIXES


def _generate_code() -> str:
    return f'{secrets.randbelow(10_000):04d}'


def _is_expired(verification: PhoneVerification) -> bool:
    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= datetime.now(timezone.utc)


def _extract_chat_id(message: dict) -> str | None:
    chat = message.get('chat') or {}
    chat_id = chat.get('id')
    return str(chat_id) if chat_id is not None else None


def _extract_user_id(user: dict | None) -> str | None:
    if not user:
        return None
    user_id = user.get('id')
    return str(user_id) if user_id is not None else None


def _extract_username(user: dict | None) -> str | None:
    if not user:
        return None
    username = user.get('username')
    return str(username)[:64] if username else None
