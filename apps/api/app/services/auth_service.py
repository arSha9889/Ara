import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import settings
from app.core.legal import PRIVACY_POLICY_VERSION, TERMS_VERSION
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
from app.services.email_verification_service import EmailVerificationError, consume_verified_email, normalize_email
from app.services.password_confirmation_service import (
    PasswordConfirmationError,
    PasswordConfirmationStart,
    consume_password_confirmation,
    create_password_confirmation,
    send_password_confirmation_prompt,
)
from app.services.phone_verification_service import PhoneVerificationError, consume_verified_phone, normalize_phone


class AuthError(ValueError):
    pass


@dataclass(frozen=True)
class RegistrationCompletion:
    confirmation: PasswordConfirmationStart | None = None
    user: UserOut | None = None
    access_token: str | None = None
    refresh_token: str | None = None


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


async def complete_registration(session: AsyncSession, request: RegisterCompleteRequest) -> RegistrationCompletion:
    telegram_id = verify_registration_proof(request.registration_proof)
    _validate_registration_request(request)
    verified_phone = None
    verified_email = None
    is_dev_registration = telegram_id.startswith('dev-')
    bypass_password_confirmation = settings.environment == 'dev' and is_dev_registration

    if await find_user_by_telegram_id(session, telegram_id):
        raise AuthError('Этот Telegram-аккаунт уже зарегистрирован')

    if await _is_registration_limit_reached(session):
        raise AuthError('Early access registration limit is reached')

    if await _username_exists(session, request.username):
        raise AuthError('Этот username уже занят')

    if request.phone_verification_id:
        try:
            verified_phone = await consume_verified_phone(session, request.phone_verification_id, telegram_id)
        except PhoneVerificationError as exc:
            raise AuthError(str(exc)) from exc
        if await _phone_exists(session, verified_phone):
            raise AuthError('Phone number is already registered')

    if request.email_verification_id:
        try:
            verified_email = await consume_verified_email(session, request.email_verification_id, telegram_id)
        except EmailVerificationError as exc:
            raise AuthError(str(exc)) from exc
        if await _email_exists(session, verified_email):
            raise AuthError('Email is already registered')

    if not verified_phone and not verified_email and not is_dev_registration:
        raise AuthError('Access contact is not verified')

    nexus_id = await _generate_unique_nexus_id(session)
    consented_at = datetime.now(timezone.utc)
    user = User(
        nexus_id=nexus_id,
        telegram_id=telegram_id,
        status='active' if bypass_password_confirmation else 'pending_password_confirmation',
        terms_accepted_at=consented_at,
        terms_version=TERMS_VERSION,
        privacy_policy_accepted_at=consented_at,
        privacy_policy_version=PRIVACY_POLICY_VERSION,
    )
    session.add(user)
    await session.flush()

    profile = UserProfile(
        user_id=user.id,
        display_name=request.display_name or request.username,
        username=request.username,
        avatar_type=request.avatar_type,
        avatar_ref=request.avatar_ref,
        optional_phone=verified_phone,
        email=verified_email,
        registration_country=request.registration_country,
        language=request.language,
        design_theme=request.design_theme,
    )
    session.add(profile)
    confirmation = None
    if bypass_password_confirmation:
        session.add(PasswordCredential(user_id=user.id, password_hash=hash_secret(request.password)))
    else:
        try:
            confirmation = await create_password_confirmation(
                session,
                user.id,
                telegram_id,
                request.password,
                request.device_id,
                'registration',
            )
        except PasswordConfirmationError as exc:
            raise AuthError(str(exc)) from exc
        session.add(PasswordCredential(user_id=user.id, password_hash=confirmation.confirmation.password_hash))

    if request.pin:
        session.add(_create_trusted_pin(user.id, request.device_id, request.pin))

    refresh_token = None
    if bypass_password_confirmation:
        refresh_token = _generate_refresh_token()
        session.add(_create_session(user.id, request.device_id, refresh_token))
        session.add(_login_history(user.id, request.device_id, 'dev_register', 'success'))

    await session.commit()
    if bypass_password_confirmation:
        await _load_profile(session, user)
        return RegistrationCompletion(
            user=to_user_out(user),
            access_token=create_access_token(user.id),
            refresh_token=refresh_token,
        )

    await send_password_confirmation_prompt(confirmation.confirmation)
    return RegistrationCompletion(confirmation=confirmation)


async def confirm_registration_password(
    session: AsyncSession,
    confirmation_id: UUID,
    confirmation_token: str,
) -> tuple[UserOut, str, str]:
    try:
        confirmation = await consume_password_confirmation(session, confirmation_id, confirmation_token)
    except PasswordConfirmationError as exc:
        raise AuthError(str(exc)) from exc
    if confirmation.purpose != 'registration':
        raise AuthError('Password confirmation has invalid purpose')

    user = await find_user_by_id(session, confirmation.user_id)
    if not user or user.status != 'pending_password_confirmation':
        raise AuthError('Pending registration not found')
    user.status = 'active'
    refresh_token = _generate_refresh_token()
    session.add(_create_session(user.id, confirmation.device_id, refresh_token))
    session.add(_login_history(user.id, confirmation.device_id, 'telegram_register', 'success'))
    await session.commit()
    await _load_profile(session, user)
    return to_user_out(user), create_access_token(user.id), refresh_token


async def start_password_change(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
    new_password: str,
    device_id: str,
) -> PasswordConfirmationStart:
    if not is_valid_password(new_password):
        raise AuthError('Password must contain only Latin letters and digits and be 5–30 characters long')
    user = await find_user_by_id(session, user_id)
    credential = await session.get(PasswordCredential, user_id)
    if not user or user.status != 'active' or not credential or not verify_secret(current_password, credential.password_hash):
        raise AuthError('Current password is incorrect')
    if not user.telegram_id:
        raise AuthError('Telegram is not connected to this account')
    confirmation = await create_password_confirmation(
        session,
        user_id,
        user.telegram_id,
        new_password,
        device_id,
        'password_change',
    )
    await session.commit()
    await send_password_confirmation_prompt(confirmation.confirmation)
    return confirmation


async def confirm_password_change(
    session: AsyncSession,
    user_id: UUID,
    confirmation_id: UUID,
    confirmation_token: str,
) -> None:
    try:
        confirmation = await consume_password_confirmation(session, confirmation_id, confirmation_token, user_id)
    except PasswordConfirmationError as exc:
        raise AuthError(str(exc)) from exc
    if confirmation.purpose != 'password_change':
        raise AuthError('Password confirmation has invalid purpose')
    credential = await session.get(PasswordCredential, user_id)
    if not credential:
        raise AuthError('Password credential not found')
    credential.password_hash = confirmation.password_hash
    credential.password_updated_at = datetime.now(timezone.utc)
    await session.commit()


async def login_with_password(session: AsyncSession, identifier: str, password: str, device_id: str) -> tuple[UserOut, str, str]:
    user = await _find_user_by_login_identifier(session, identifier)
    if not user or user.status != 'active':
        raise AuthError('Invalid login identifier or password')

    credential = await session.get(PasswordCredential, user.id)
    if not credential or not verify_secret(password, credential.password_hash):
        session.add(_login_history(user.id, device_id, 'password', 'failed'))
        await session.commit()
        raise AuthError('Invalid login identifier or password')

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


async def _is_registration_limit_reached(session: AsyncSession) -> bool:
    if settings.early_access_bypass_limit <= 0:
        return False
    result = await session.execute(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))
    return result.scalar_one() >= settings.early_access_bypass_limit


async def _phone_exists(session: AsyncSession, phone: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.optional_phone == phone))
    return result.scalar_one_or_none() is not None


async def _email_exists(session: AsyncSession, email: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.email == email))
    return result.scalar_one_or_none() is not None


async def _find_user_by_login_identifier(session: AsyncSession, identifier: str) -> User | None:
    value = identifier.strip()
    if value.isdigit() and len(value) == settings.nexus_id_length:
        result = await session.execute(select(User).where(User.nexus_id == value, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    if '@' in value:
        try:
            email = normalize_email(value)
        except EmailVerificationError:
            return None
        result = await session.execute(
            select(User)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(UserProfile.email == email, User.deleted_at.is_(None))
        )
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
    raise AuthError('Could not generate unique AraChat ID')


def _validate_registration_request(request: RegisterCompleteRequest) -> None:
    if not request.accepted_terms or not request.accepted_privacy_policy:
        raise AuthError('Для регистрации нужно принять Политику конфиденциальности и Пользовательское соглашение')
    if not is_valid_username(request.username):
        raise AuthError('Username должен содержать только латинские буквы и цифры, от 3 до 32 символов')
    if not is_valid_password(request.password):
        raise AuthError('Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов')
    if request.pin and not is_valid_pin(request.pin):
        raise AuthError('PIN должен содержать от 4 до 8 цифр')
    if request.language not in {'ru', 'en', 'kk', 'ky', 'uk'}:
        raise AuthError('Неподдерживаемый язык интерфейса')
    if request.design_theme not in {'halo', 'orbit', 'aurora', 'liquid_glass'}:
        raise AuthError('Неподдерживаемая тема оформления')
    if request.avatar_type not in {'built_in', 'uploaded'}:
        raise AuthError('Неподдерживаемый тип аватара')
    if request.avatar_type == 'built_in' and request.avatar_ref not in {f'animal-{index:02d}' for index in range(1, 21)}:
        raise AuthError('Такой стандартный аватар недоступен')
    if request.avatar_type == 'uploaded' and not request.avatar_ref.startswith(('http://', 'https://', '/storage/')):
        raise AuthError('Загруженный аватар имеет неподдерживаемый формат')
    if request.phone_verification_id and request.email_verification_id:
        raise AuthError('Choose phone or email verification, not both')
    if (request.phone_verification_id or request.email_verification_id) and not request.registration_proof:
        raise AuthError('Access verification requires registration proof')


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
        is_official=_is_configured_admin(profile),
        profile=UserProfileOut(
            display_name=profile.display_name,
            username=profile.username,
            avatar_type=profile.avatar_type,
            avatar_ref=profile.avatar_ref,
            optional_phone=profile.optional_phone,
            email=profile.email,
            registration_country=profile.registration_country,
            phone_public=profile.phone_public,
            language=profile.language,
            design_theme=profile.design_theme,
            current_mode=profile.current_mode,
        ) if profile else None,
    )


def _is_configured_admin(profile: UserProfile | None) -> bool:
    if not profile or not settings.admin_phone.strip():
        return False
    try:
        return profile.optional_phone == normalize_phone(settings.admin_phone)
    except PhoneVerificationError:
        return False
