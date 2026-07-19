import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import settings
from app.domain.nexus_id import generate_nexus_id
from app.domain.registration_proof import verify_registration_proof
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.tokens import create_access_token
from app.domain.validators import is_valid_password, is_valid_pin, is_valid_username
from app.models.chats import PushSubscription
from app.models.security import PasswordCredential, TrustedDevicePin
from app.models.sessions import LoginHistory, Session
from app.models.users import User, UserProfile
from app.schemas.auth import RegisterCompleteRequest
from app.schemas.users import UserOut, UserProfileOut
from app.services.phone_verification_service import PhoneVerificationError, consume_verified_phone, normalize_phone


class AuthError(ValueError):
    pass


async def find_user_by_telegram_id(session: AsyncSession, telegram_id: str) -> User | None:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


async def find_user_by_id(session: AsyncSession, user_id: UUID) -> User | None:
    result = await session.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()

async def get_user_with_profile(session: AsyncSession, user_id: UUID) -> User | None:
    user = await find_user_by_id(session, user_id)
    if user:
        await _load_profile(session, user)
    return user


async def complete_registration(session: AsyncSession, request: RegisterCompleteRequest) -> tuple[UserOut, str, str]:
    telegram_id = verify_registration_proof(request.registration_proof)
    _validate_registration_request(request)
    verified_phone = None
    is_dev_registration = telegram_id.startswith('dev-')

    if await find_user_by_telegram_id(session, telegram_id):
        raise AuthError('Этот Telegram-аккаунт уже зарегистрирован')

    if await _username_exists(session, request.username):
        raise AuthError('Этот username уже занят')

    if request.phone_verification_id:
        try:
            verified_phone = await consume_verified_phone(session, request.phone_verification_id, telegram_id)
        except PhoneVerificationError as exc:
            raise AuthError(str(exc)) from exc
        if await _phone_exists(session, verified_phone):
            raise AuthError('Phone number is already registered')
    elif not is_dev_registration:
        raise AuthError('Phone number is not verified')

    nexus_id = await _generate_unique_nexus_id(session)
    user = User(nexus_id=nexus_id, telegram_id=telegram_id, status='active')
    session.add(user)
    await session.flush()

    profile = UserProfile(
        user_id=user.id,
        display_name=request.display_name or request.username,
        username=request.username,
        avatar_type=request.avatar_type,
        avatar_ref=request.avatar_ref,
        optional_phone=verified_phone,
        language=request.language,
        design_theme=request.design_theme,
    )
    session.add(profile)
    session.add(PasswordCredential(user_id=user.id, password_hash=hash_secret(request.password)))

    if request.pin:
        session.add(_create_trusted_pin(user.id, request.device_id, request.pin))

    refresh_token = _generate_refresh_token()
    session.add(_create_session(user.id, request.device_id, refresh_token))
    session.add(_login_history(user.id, request.device_id, 'telegram_register', 'success'))
    await session.commit()
    await session.refresh(user)
    set_committed_value(user, 'profile', profile)

    return to_user_out(user), create_access_token(user.id), refresh_token


async def login_with_password(session: AsyncSession, identifier: str, password: str, device_id: str) -> tuple[UserOut, str, str]:
    user = await _find_user_by_login_identifier(session, identifier)
    if not user:
        raise AuthError('Invalid phone or password')

    credential = await session.get(PasswordCredential, user.id)
    if not credential or not verify_secret(password, credential.password_hash):
        session.add(_login_history(user.id, device_id, 'password', 'failed'))
        await session.commit()
        raise AuthError('Invalid phone or password')

    refresh_token = _generate_refresh_token()
    session.add(_create_session(user.id, device_id, refresh_token))
    session.add(_login_history(user.id, device_id, 'password', 'success'))
    await session.commit()
    await _load_profile(session, user)
    return to_user_out(user), create_access_token(user.id), refresh_token


async def issue_session_for_user(session: AsyncSession, user: User, device_id: str, method: str) -> tuple[UserOut, str, str]:
    refresh_token = _generate_refresh_token()
    session.add(_create_session(user.id, device_id, refresh_token))
    session.add(_login_history(user.id, device_id, method, 'success'))
    await session.commit()
    await _load_profile(session, user)
    return to_user_out(user), create_access_token(user.id), refresh_token


async def refresh_access_token(session: AsyncSession, refresh_token: str) -> tuple[UserOut, str, str]:
    result = await session.execute(
        select(Session).where(
            Session.refresh_token_lookup_hash == _refresh_token_lookup_hash(refresh_token),
            Session.revoked_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if item and item.expires_at > now and verify_secret(refresh_token, item.refresh_token_hash):
        user = await find_user_by_id(session, item.user_id)
        if not user:
            raise AuthError('Session user not found')
        item.expires_at = now + timedelta(days=settings.refresh_token_days)
        await session.commit()
        await _load_profile(session, user)
        return to_user_out(user), create_access_token(user.id), refresh_token
    raise AuthError('Invalid refresh token')


async def logout_by_refresh_token(session: AsyncSession, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    result = await session.execute(
        select(Session).where(
            Session.refresh_token_lookup_hash == _refresh_token_lookup_hash(refresh_token),
            Session.revoked_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item and verify_secret(refresh_token, item.refresh_token_hash):
        item.revoked_at = datetime.now(timezone.utc)
        await session.commit()


async def delete_account(session: AsyncSession, user_id: UUID) -> None:
    user = await find_user_by_id(session, user_id)
    if not user:
        raise AuthError('User not found')

    now = datetime.now(timezone.utc)
    user.status = 'deleted'
    user.deleted_at = now
    await session.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.execute(
        update(TrustedDevicePin)
        .where(TrustedDevicePin.user_id == user_id, TrustedDevicePin.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user_id))
    await session.commit()


async def _username_exists(session: AsyncSession, username: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.username == username))
    return result.scalar_one_or_none() is not None


async def _phone_exists(session: AsyncSession, phone: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.optional_phone == phone))
    return result.scalar_one_or_none() is not None


async def _find_user_by_login_identifier(session: AsyncSession, identifier: str) -> User | None:
    value = identifier.strip()
    if value.isdigit() and len(value) == settings.nexus_id_length:
        result = await session.execute(select(User).where(User.nexus_id == value, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    try:
        phone = normalize_phone(value)
    except PhoneVerificationError:
        return None

    result = await session.execute(
        select(User)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(UserProfile.optional_phone == phone, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def _generate_unique_nexus_id(session: AsyncSession) -> str:
    for _ in range(10):
        nexus_id = generate_nexus_id()
        result = await session.execute(select(User.id).where(User.nexus_id == nexus_id))
        if result.scalar_one_or_none() is None:
            return nexus_id
    raise AuthError('Could not generate unique Nexus ID')


def _validate_registration_request(request: RegisterCompleteRequest) -> None:
    if not is_valid_username(request.username):
        raise AuthError('Username должен содержать только латинские буквы и цифры, от 3 до 32 символов')
    if not is_valid_password(request.password):
        raise AuthError('Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов')
    if request.pin and not is_valid_pin(request.pin):
        raise AuthError('PIN должен содержать от 4 до 8 цифр')
    if request.language not in {'ru', 'en', 'es', 'fr', 'uk'}:
        raise AuthError('Неподдерживаемый язык интерфейса')
    if request.design_theme not in {'halo', 'orbit', 'aurora', 'liquid_glass'}:
        raise AuthError('Неподдерживаемая тема оформления')
    if request.avatar_type not in {'built_in', 'uploaded'}:
        raise AuthError('Неподдерживаемый тип аватара')
    if request.avatar_type == 'built_in' and request.avatar_ref not in {f'animal-{index:02d}' for index in range(1, 21)}:
        raise AuthError('Такой стандартный аватар недоступен')
    if request.avatar_type == 'uploaded' and not request.avatar_ref.startswith(('http://', 'https://', '/storage/')):
        raise AuthError('Загруженный аватар имеет неподдерживаемый формат')
    if request.phone_verification_id and not request.registration_proof:
        raise AuthError('Phone verification requires registration proof')


def _generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _refresh_token_lookup_hash(refresh_token: str) -> str:
    return hashlib.sha256(refresh_token.encode()).hexdigest()


def _create_session(user_id: UUID, device_id: str, refresh_token: str) -> Session:
    return Session(
        user_id=user_id,
        device_id=device_id,
        refresh_token_lookup_hash=_refresh_token_lookup_hash(refresh_token),
        refresh_token_hash=hash_secret(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days),
    )


def _create_trusted_pin(user_id: UUID, device_id: str, pin: str) -> TrustedDevicePin:
    return TrustedDevicePin(
        user_id=user_id,
        device_id=device_id,
        pin_hash=hash_secret(pin),
        trusted_until=datetime.now(timezone.utc) + timedelta(days=settings.pin_trusted_days),
    )


def _login_history(user_id: UUID, device_id: str | None, method: str, result: str) -> LoginHistory:
    return LoginHistory(user_id=user_id, device_id=device_id, method=method, result=result)


async def _load_profile(session: AsyncSession, user: User) -> None:
    set_committed_value(user, 'profile', await session.get(UserProfile, user.id))


def to_user_out(user: User) -> UserOut:
    profile = user.profile
    return UserOut(
        id=user.id,
        nexus_id=user.nexus_id,
        telegram_id=user.telegram_id,
        status=user.status,
        profile=UserProfileOut(
            display_name=profile.display_name,
            username=profile.username,
            avatar_type=profile.avatar_type,
            avatar_ref=profile.avatar_ref,
            optional_phone=profile.optional_phone,
            phone_public=profile.phone_public,
            language=profile.language,
            design_theme=profile.design_theme,
            current_mode=profile.current_mode,
        ) if profile else None,
    )
