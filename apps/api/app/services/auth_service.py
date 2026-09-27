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
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.tokens import create_access_token
from app.domain.validators import is_valid_password, is_valid_pin, is_valid_username
from app.models.audit import AuditLog
from app.models.chats import MobilePushToken, PushSubscription
from app.models.security import PasswordCredential, TrustedDevicePin
from app.models.sessions import LoginHistory, Session
from app.models.users import User, UserProfile
from app.models.verification import EmailVerification
from app.schemas.auth import RegisterCompleteRequest
from app.schemas.users import UserOut, UserProfileOut
from app.services.email_verification_service import (
    EmailVerificationError,
    EmailVerificationStart,
    consume_verified_email,
    create_email_verification,
    normalize_email,
    verify_email_code,
)
from app.services.smtp_mailer import SmtpDeliveryError
from app.services.phone_verification_service import PhoneVerificationError, normalize_phone
from app.services.user_access_service import user_can_access


class AuthError(ValueError):
    pass


@dataclass(frozen=True)
class RegistrationCompletion:
    user: UserOut
    access_token: str
    refresh_token: str


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
    _validate_registration_request(request)

    if await _is_registration_limit_reached(session):
        raise AuthError('Early access registration limit is reached')

    if await _username_exists(session, request.username):
        raise AuthError('Этот username уже занят')

    try:
        verification = await consume_verified_email(
            session,
            request.email_verification_id,
            'registration',
            device_id=request.device_id,
        )
    except EmailVerificationError as exc:
        raise AuthError(str(exc)) from exc
    verified_email = verification.email
    if await _email_exists(session, verified_email):
        raise AuthError('Email is already registered')

    nexus_id = await _generate_unique_nexus_id(session)
    consented_at = datetime.now(timezone.utc)
    user = User(
        nexus_id=nexus_id,
        telegram_id=None,
        status='active',
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
        email=verified_email,
        email_verified_at=verification.verified_at,
        registration_country=request.registration_country,
        language=request.language,
        design_theme=request.design_theme,
    )
    session.add(profile)
    session.add(PasswordCredential(user_id=user.id, password_hash=hash_secret(request.password)))

    if request.pin:
        session.add(_create_trusted_pin(user.id, request.device_id, request.pin))

    refresh_token = _generate_refresh_token()
    session.add(_create_session(user.id, request.device_id, refresh_token))
    session.add(_login_history(user.id, request.device_id, 'email_register', 'success'))

    await session.commit()
    await _load_profile(session, user)
    return RegistrationCompletion(
        user=to_user_out(user),
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
    )


async def start_password_change(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
    new_password: str,
    device_id: str,
) -> EmailVerificationStart:
    if not is_valid_password(new_password):
        raise AuthError('Password must contain only Latin letters and digits and be 5–30 characters long')
    user = await find_user_by_id(session, user_id)
    credential = await session.get(PasswordCredential, user_id)
    if not user or user.status != 'active' or not credential or not verify_secret(current_password, credential.password_hash):
        raise AuthError('Current password is incorrect')
    profile = await session.get(UserProfile, user_id)
    if not profile or not profile.email or not profile.email_verified_at:
        raise AuthError('Подтвердите e-mail через SMTP, прежде чем менять пароль')
    try:
        return await create_email_verification(
            session,
            profile.email,
            device_id,
            purpose='password_change',
            user_id=user_id,
            pending_password_hash=hash_secret(new_password),
            language=profile.language,
        )
    except EmailVerificationError as exc:
        raise AuthError(str(exc)) from exc


async def confirm_password_change(
    session: AsyncSession,
    user_id: UUID,
    verification_id: UUID,
    code: str,
    device_id: str,
) -> None:
    try:
        await verify_email_code(session, verification_id, code, purpose='password_change', user_id=user_id)
        verification = await consume_verified_email(
            session,
            verification_id,
            'password_change',
            device_id=device_id,
            user_id=user_id,
        )
    except EmailVerificationError as exc:
        raise AuthError(str(exc)) from exc
    credential = await session.get(PasswordCredential, user_id)
    if not credential or not verification.pending_password_hash:
        raise AuthError('Password credential not found')
    credential.password_hash = verification.pending_password_hash
    credential.password_updated_at = datetime.now(timezone.utc)
    session.add(_audit(user_id, 'password_changed', verification.device_id))
    await session.commit()


async def start_password_reset(session: AsyncSession, email: str, device_id: str, language: str = 'ru') -> None:
    try:
        normalized_email = normalize_email(email)
    except EmailVerificationError:
        normalized_email = 'invalid@example.invalid'
    result = await session.execute(
        select(User).join(UserProfile).where(
            UserProfile.email == normalized_email,
            UserProfile.email_verified_at.is_not(None),
            User.deleted_at.is_(None),
            User.status == 'active',
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        return
    try:
        await create_email_verification(
            session,
            normalized_email,
            device_id,
            purpose='password_reset',
            user_id=user.id,
            language=language,
        )
    except (EmailVerificationError, SmtpDeliveryError):
        return


async def finish_password_reset(
    session: AsyncSession,
    email: str,
    code: str,
    new_password: str,
    device_id: str,
) -> None:
    if not is_valid_password(new_password):
        raise AuthError('Password must contain only Latin letters and digits and be 5–30 characters long')
    try:
        normalized_email = normalize_email(email)
    except EmailVerificationError as exc:
        raise AuthError('Password reset request is invalid') from exc
    result = await session.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == normalized_email,
            EmailVerification.device_id == device_id,
            EmailVerification.purpose == 'password_reset',
            EmailVerification.status == 'code_sent',
            EmailVerification.consumed_at.is_(None),
        )
        .order_by(EmailVerification.created_at.desc())
        .limit(1)
    )
    pending = result.scalar_one_or_none()
    if not pending:
        raise AuthError('Password reset request is invalid or expired')
    try:
        await verify_email_code(session, pending.id, code, purpose='password_reset')
        verification = await consume_verified_email(session, pending.id, 'password_reset', device_id=device_id)
    except (EmailVerificationError, SmtpDeliveryError) as exc:
        raise AuthError(str(exc)) from exc
    if not verification.user_id:
        raise AuthError('Password reset request is invalid')
    user = await find_user_by_id(session, verification.user_id)
    credential = await session.get(PasswordCredential, verification.user_id)
    if not user or not credential:
        raise AuthError('Password reset request is invalid')
    now = datetime.now(timezone.utc)
    credential.password_hash = hash_secret(new_password)
    credential.password_updated_at = now
    await session.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
    await session.execute(
        update(TrustedDevicePin)
        .where(TrustedDevicePin.user_id == user.id, TrustedDevicePin.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.add(_audit(user.id, 'password_reset', device_id))
    await session.commit()


async def start_email_change(
    session: AsyncSession,
    user_id: UUID,
    current_password: str,
    new_email: str,
    device_id: str,
) -> EmailVerificationStart:
    user = await find_user_by_id(session, user_id)
    credential = await session.get(PasswordCredential, user_id)
    if not user or not credential or not verify_secret(current_password, credential.password_hash):
        raise AuthError('Current password is incorrect')
    try:
        normalized_email = normalize_email(new_email)
    except (EmailVerificationError, SmtpDeliveryError) as exc:
        raise AuthError(str(exc)) from exc
    if await _email_exists(session, normalized_email):
        raise AuthError('Email is already registered')
    profile = await session.get(UserProfile, user_id)
    try:
        return await create_email_verification(
            session,
            normalized_email,
            device_id,
            purpose='email_change',
            user_id=user_id,
            language=profile.language if profile else 'ru',
        )
    except EmailVerificationError as exc:
        raise AuthError(str(exc)) from exc


async def confirm_email_change(
    session: AsyncSession,
    user_id: UUID,
    verification_id: UUID,
    code: str,
    device_id: str,
) -> UserOut:
    try:
        await verify_email_code(session, verification_id, code, purpose='email_change', user_id=user_id)
        verification = await consume_verified_email(
            session,
            verification_id,
            'email_change',
            device_id=device_id,
            user_id=user_id,
        )
    except EmailVerificationError as exc:
        raise AuthError(str(exc)) from exc
    if await _email_exists(session, verification.email):
        raise AuthError('Email is already registered')
    profile = await session.get(UserProfile, user_id)
    if not profile:
        raise AuthError('Profile not found')
    profile.email = verification.email
    profile.email_verified_at = verification.verified_at
    session.add(_audit(user_id, 'email_changed', verification.device_id))
    await session.commit()
    user = await get_user_with_profile(session, user_id)
    if not user:
        raise AuthError('User not found')
    return to_user_out(user)


async def login_with_password(session: AsyncSession, identifier: str, password: str, device_id: str) -> tuple[UserOut, str, str]:
    user = await _find_user_by_login_identifier(session, identifier)
    if not user:
        raise AuthError('Invalid login identifier or password')
    if user.status == 'deleted' or user.deleted_at:
        raise AuthError('Account has been deleted')
    if not await user_can_access(session, user):
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
    if user.status == 'deleted' or user.deleted_at:
        raise AuthError('Account has been deleted')
    if not await user_can_access(session, user):
        raise AuthError('Invalid login identifier or password')
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
            raise AuthError('Invalid refresh token')
        if not await user_can_access(session, user):
            raise AuthError('Invalid refresh token')
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
    await session.execute(
        update(UserProfile)
        .where(UserProfile.user_id == user_id)
        .values(email=None, email_verified_at=None)
    )
    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user_id))
    await session.execute(delete(MobilePushToken).where(MobilePushToken.user_id == user_id))
    await session.commit()


async def accept_legal_documents(session: AsyncSession, user_id: UUID) -> UserOut:
    user = await get_user_with_profile(session, user_id)
    if not user:
        raise AuthError('User not found')

    consented_at = datetime.now(timezone.utc)
    user.terms_accepted_at = consented_at
    user.terms_version = TERMS_VERSION
    user.privacy_policy_accepted_at = consented_at
    user.privacy_policy_version = PRIVACY_POLICY_VERSION
    await session.commit()
    return to_user_out(user)


def legal_documents_are_current(user: User) -> bool:
    return (
        user.terms_version == TERMS_VERSION
        and user.privacy_policy_version == PRIVACY_POLICY_VERSION
        and user.terms_accepted_at is not None
        and user.privacy_policy_accepted_at is not None
    )


async def _username_exists(session: AsyncSession, username: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.username == username))
    return result.scalar_one_or_none() is not None


async def _is_registration_limit_reached(session: AsyncSession) -> bool:
    if settings.early_access_bypass_limit <= 0:
        return False
    result = await session.execute(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))
    return result.scalar_one() >= settings.early_access_bypass_limit


async def _email_exists(session: AsyncSession, email: str) -> bool:
    result = await session.execute(select(UserProfile.user_id).where(UserProfile.email == email))
    return result.scalar_one_or_none() is not None


async def _find_user_by_login_identifier(session: AsyncSession, identifier: str) -> User | None:
    value = identifier.strip()
    if value.isdigit() and len(value) == settings.nexus_id_length:
        result = await session.execute(select(User).where(User.nexus_id == value))
        return result.scalar_one_or_none()

    if '@' in value:
        try:
            email = normalize_email(value)
        except EmailVerificationError:
            return None
        result = await session.execute(
            select(User)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(UserProfile.email == email)
        )
        return result.scalar_one_or_none()

    return None


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
    if request.language not in {'ru', 'en', 'kk', 'ky', 'uk', 'be', 'uz'}:
        raise AuthError('Неподдерживаемый язык интерфейса')
    if request.design_theme not in {'halo', 'comet', 'liquid_glass'}:
        raise AuthError('Неподдерживаемая тема оформления')
    if request.avatar_type not in {'built_in', 'uploaded'}:
        raise AuthError('Неподдерживаемый тип аватара')
    if request.avatar_type == 'built_in' and request.avatar_ref not in {f'animal-{index:02d}' for index in range(1, 21)}:
        raise AuthError('Такой стандартный аватар недоступен')
    if request.avatar_type == 'uploaded' and not request.avatar_ref.startswith(('http://', 'https://', '/storage/', '/api/media/avatars/')):
        raise AuthError('Загруженный аватар имеет неподдерживаемый формат')
    if not request.email_verification_id:
        raise AuthError('Подтвердите e-mail перед регистрацией')


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
        legal_documents_current=legal_documents_are_current(user),
        vpn_enabled=bool(user.vpn_enabled),
        profile=UserProfileOut(
            display_name=profile.display_name,
            username=profile.username,
            avatar_type=profile.avatar_type,
            avatar_ref=profile.avatar_ref,
            optional_phone=profile.optional_phone,
            email=profile.email,
            email_verified=profile.email_verified_at is not None,
            registration_country=profile.registration_country,
            phone_public=profile.phone_public,
            language=profile.language,
            design_theme=profile.design_theme,
            current_mode=profile.current_mode,
        ) if profile else None,
    )


def _is_configured_admin(profile: UserProfile | None) -> bool:
    if not profile:
        return False
    if settings.admin_email.strip():
        try:
            return profile.email_verified_at is not None and profile.email == normalize_email(settings.admin_email)
        except EmailVerificationError:
            return False
    if not settings.admin_phone.strip():
        return False
    try:
        return profile.optional_phone == normalize_phone(settings.admin_phone)
    except PhoneVerificationError:
        return False


def _audit(user_id: UUID, action: str, device_id: str) -> AuditLog:
    return AuditLog(
        actor_user_id=user_id,
        actor_type='user',
        action=action,
        target_type='authentication',
        target_id=device_id,
        metadata_json={'device_id': device_id},
    )
