from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.domain.registration_proof import create_registration_proof, verify_registration_proof
from app.domain.tokens import create_access_token, decode_access_token
from app.models.verification import EmailVerification, PhoneVerification
from app.schemas.auth import PhoneVerificationStartRequest, RegisterCompleteRequest
from app.schemas.chats import DirectChatCreateRequest
from app.services.phone_verification_service import (
    handle_telegram_bot_update,
    normalize_phone,
    verify_phone_code,
)


def test_registration_proof_roundtrip() -> None:
    proof = create_registration_proof('123456')

    assert verify_registration_proof(proof) == '123456'


def test_access_token_roundtrip() -> None:
    user_id = uuid4()
    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id


def test_legal_documents_current_only_for_the_latest_accepted_versions() -> None:
    from app.core.legal import PRIVACY_POLICY_VERSION, TERMS_VERSION
    from app.models.users import User
    from app.services.auth_service import legal_documents_are_current, to_user_out

    user = User(
        id=uuid4(),
        nexus_id='1234567890123456',
        telegram_id='legal-user',
        status='active',
        vpn_enabled=True,
        terms_version=TERMS_VERSION,
        privacy_policy_version=PRIVACY_POLICY_VERSION,
        terms_accepted_at=datetime.now(timezone.utc),
        privacy_policy_accepted_at=datetime.now(timezone.utc),
    )
    assert legal_documents_are_current(user)
    assert to_user_out(user).vpn_enabled is True

    user.terms_version = '2026-07-21'
    assert not legal_documents_are_current(user)


def test_normalize_phone() -> None:
    assert normalize_phone('8 (999) 123-45-67') == '+79991234567'
    assert normalize_phone('+1 555 123 4567') == '+15551234567'
    assert normalize_phone('9991234567', 'RU') == '+79991234567'
    assert normalize_phone('7011234567', 'KZ') == '+77011234567'
    assert normalize_phone('+996 700 123 456', 'KG') == '+996700123456'
    assert normalize_phone('0700 123 456', 'KG') == '+996700123456'
    assert normalize_phone('700123456', 'KG') == '+996700123456'
    assert normalize_phone('+380 67 123 45 67', 'UA') == '+380671234567'
    assert normalize_phone('067 123 45 67', 'UA') == '+380671234567'
    assert normalize_phone('671234567', 'UA') == '+380671234567'
    assert normalize_phone('+375 29 123-45-67', 'BY') == '+375291234567'
    assert normalize_phone('029 123-45-67', 'BY') == '+375291234567'
    assert normalize_phone('291234567', 'BY') == '+375291234567'
    assert normalize_phone('+998 90 123-45-67', 'UZ') == '+998901234567'
    assert normalize_phone('090 123-45-67', 'UZ') == '+998901234567'
    assert normalize_phone('901234567', 'UZ') == '+998901234567'
    with pytest.raises(ValueError):
        normalize_phone('+1 555 123 4567', 'RU')
    with pytest.raises(ValueError):
        normalize_phone('+7 999 123 45 67', 'KZ')
    with pytest.raises(ValueError):
        normalize_phone('+996 312 123 456', 'KG')
    with pytest.raises(ValueError):
        normalize_phone('+380 44 123 45 67', 'UA')
    with pytest.raises(ValueError):
        normalize_phone('+375 17 123-45-67', 'BY')
    with pytest.raises(ValueError):
        normalize_phone('+998 71 123-45-67', 'UZ')


def test_phone_country_api_contracts_include_belarus_and_uzbekistan() -> None:
    assert PhoneVerificationStartRequest(country='BY', phone='+375291234567', device_id='device-123').country == 'BY'
    assert PhoneVerificationStartRequest(country='UZ', phone='+998901234567', device_id='device-123').country == 'UZ'
    assert DirectChatCreateRequest(country='BY', phone='+375291234567').country == 'BY'
    assert DirectChatCreateRequest(country='UZ', phone='+998901234567').country == 'UZ'

    registration = RegisterCompleteRequest(
        email_verification_id=uuid4(),
        username='belarususer',
        password='password123',
        device_id='device-123',
        language='be',
        registration_country='BY',
    )
    assert registration.registration_country == 'BY'
    assert registration.language == 'be'


def test_registration_empty_pin_is_treated_as_absent() -> None:
    registration = RegisterCompleteRequest(
        email_verification_id=uuid4(),
        username='withoutpin',
        password='password123',
        pin='',
        device_id='device-123',
    )

    assert registration.pin is None


@pytest.mark.anyio
async def test_deleted_account_cannot_log_in_again(anyio_backend) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app import models  # noqa: F401
    from app.db.base import Base
    from app.domain.security_hashing import hash_secret
    from app.models.security import PasswordCredential
    from app.models.users import User, UserProfile
    from app.services.auth_service import AuthError, login_with_password
    from app.services.security_service import SecurityError, login_with_pin

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            user = User(
                id=uuid4(),
                nexus_id='1234567890123456',
                telegram_id='deleted-user',
                status='deleted',
                deleted_at=datetime.now(timezone.utc),
            )
            session.add_all([
                user,
                UserProfile(user_id=user.id, display_name='Deleted user', username='deleteduser'),
                PasswordCredential(user_id=user.id, password_hash=hash_secret('password123')),
            ])
            await session.commit()

            with pytest.raises(AuthError, match='Account has been deleted'):
                await login_with_password(session, user.nexus_id, 'password123', 'deleted-device')
            with pytest.raises(SecurityError, match='Account has been deleted'):
                await login_with_pin(session, user.nexus_id, '1234', 'deleted-device')
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_registration_limit_blocks_new_accounts(anyio_backend) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base
    from app.models.users import User
    from app.schemas.auth import RegisterCompleteRequest
    from app.services.auth_service import AuthError, complete_registration

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            for index in range(100):
                session.add(User(nexus_id=f'{index:016d}', telegram_id=f'existing-{index}', status='active'))
            await session.commit()

            with pytest.raises(AuthError, match='Early access registration limit is reached'):
                await complete_registration(
                    session,
                    RegisterCompleteRequest(
                        email_verification_id=uuid4(),
                        username='overlimit',
                        password='password123',
                        device_id='device-over-limit',
                        accepted_terms=True,
                        accepted_privacy_policy=True,
                    ),
                )
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_smtp_verified_registration_creates_active_email_account(anyio_backend) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base
    from app.models.users import UserProfile
    from app.schemas.auth import RegisterCompleteRequest
    from app.services.auth_service import complete_registration

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            verification = EmailVerification(
                public_token='registration-email-token',
                email='new-user@example.test',
                device_id='device-dev-confirmation',
                purpose='registration',
                status='verified',
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                verified_at=datetime.now(timezone.utc),
            )
            session.add(verification)
            await session.commit()
            completion = await complete_registration(
                session,
                RegisterCompleteRequest(
                    email_verification_id=verification.id,
                    username='devconfirm',
                    password='password123',
                    device_id='device-dev-confirmation',
                    accepted_terms=True,
                    accepted_privacy_policy=True,
                ),
            )

            profile = await session.get(UserProfile, completion.user.id)
            await session.refresh(verification)

            assert completion.user.status == 'active'
            assert completion.access_token and completion.refresh_token
            assert completion.user.profile.email == 'new-user@example.test'
            assert completion.user.profile.email_verified is True
            assert profile and profile.email_verified_at == verification.verified_at
            assert verification.status == 'consumed'
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_smtp_code_is_hashed_bound_to_device_and_single_use(anyio_backend, monkeypatch) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app import models  # noqa: F401
    from app.db.base import Base
    from app.services.email_verification_service import (
        EmailVerificationError,
        consume_verified_email,
        create_email_verification,
        verify_email_code,
    )

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    delivered_codes = []

    async def capture_email_code(email, code, purpose, expires_in_minutes):
        delivered_codes.append((email, code, purpose, expires_in_minutes))

    monkeypatch.setattr('app.services.email_verification_service.send_verification_code', capture_email_code)
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            started = await create_email_verification(
                session,
                ' New.User@Example.test ',
                'email-device-123',
                purpose='registration',
            )
            verification = started.verification
            code = delivered_codes[0][1]
            wrong_code = '000000' if code != '000000' else '000001'

            assert delivered_codes == [('new.user@example.test', code, 'registration', 10)]
            assert verification.code_hash and code not in verification.code_hash

            with pytest.raises(EmailVerificationError, match='Invalid e-mail confirmation code'):
                await verify_email_code(session, verification.id, wrong_code, purpose='registration')

            await verify_email_code(session, verification.id, code, purpose='registration')
            with pytest.raises(EmailVerificationError, match='not available on this device'):
                await consume_verified_email(
                    session,
                    verification.id,
                    'registration',
                    device_id='other-device-123',
                )

            consumed = await consume_verified_email(
                session,
                verification.id,
                'registration',
                device_id='email-device-123',
            )
            await session.commit()

            assert consumed.status == 'consumed'
            with pytest.raises(EmailVerificationError, match='already used'):
                await consume_verified_email(
                    session,
                    verification.id,
                    'registration',
                    device_id='email-device-123',
                )
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_oauth_requires_existing_manual_link_and_binds_result_to_device(anyio_backend, monkeypatch) -> None:
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app import models  # noqa: F401
    from app.db.base import Base
    from app.models.oauth import OAuthAttempt, OAuthIdentity
    from app.models.users import User
    from app.services import oauth_service

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    async def fake_exchange(provider, code, state, verifier, provider_device_id):
        assert provider == 'yandex'
        assert code == 'provider-code'
        return 'yandex-subject-42' if state == 'link-state' else 'unlinked-yandex-subject'

    monkeypatch.setattr(oauth_service, '_exchange_code_and_get_subject', fake_exchange)
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            user = User(nexus_id='1234567890123456', status='active')
            session.add(user)
            await session.flush()
            link_attempt = OAuthAttempt(
                provider='yandex',
                state_hash=oauth_service._hash('link-state'),
                code_verifier='server-only-verifier',
                flow='link',
                user_id=user.id,
                device_id='oauth-device-123',
                status='pending',
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            unlinked_login_attempt = OAuthAttempt(
                provider='yandex',
                state_hash=oauth_service._hash('login-state'),
                code_verifier='another-server-only-verifier',
                flow='login',
                device_id='oauth-device-456',
                status='pending',
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            session.add_all([link_attempt, unlinked_login_attempt])
            await session.commit()

            result_token = await oauth_service.finish_oauth_callback(
                session,
                'yandex',
                'provider-code',
                'link-state',
            )
            identity = await session.scalar(select(OAuthIdentity))

            assert identity and identity.user_id == user.id
            assert identity.provider_subject == 'yandex-subject-42'
            assert oauth_service.callback_redirect_url(result_token=result_token).endswith(f'#result={result_token}')

            with pytest.raises(oauth_service.OAuthError, match='expired or is invalid'):
                await oauth_service.oauth_link_result(session, result_token, user.id, 'other-device-123')

            completion = await oauth_service.oauth_link_result(session, result_token, user.id, 'oauth-device-123')
            assert completion.status == 'linked'
            with pytest.raises(oauth_service.OAuthError, match='expired or is invalid'):
                await oauth_service.oauth_link_result(session, result_token, user.id, 'oauth-device-123')

            with pytest.raises(oauth_service.OAuthError, match='not linked'):
                await oauth_service.finish_oauth_callback(
                    session,
                    'yandex',
                    'provider-code',
                    'login-state',
                )
            await session.refresh(unlinked_login_attempt)

            assert unlinked_login_attempt.status == 'unlinked'
            assert await session.scalar(select(func.count()).select_from(User)) == 1
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_production_auth_rate_limit_hashes_ip_and_fails_open_for_redis_errors(anyio_backend, monkeypatch) -> None:
    from fastapi import HTTPException
    from redis.exceptions import RedisError
    from starlette.requests import Request

    from app.services import auth_rate_limit

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')

    class RateLimitRedis:
        def __init__(self, count):
            self.count = count
            self.keys = []

        async def incr(self, key):
            self.keys.append(key)
            return self.count

        async def expire(self, key, seconds):
            return True

    request = Request({
        'type': 'http',
        'method': 'POST',
        'path': '/api/auth/email-verification/start',
        'headers': [(b'x-real-ip', b'203.0.113.10')],
        'client': ('127.0.0.1', 1234),
    })
    redis = RateLimitRedis(auth_rate_limit.DELIVERY_REQUEST_LIMIT + 1)
    monkeypatch.setattr(auth_rate_limit.settings, 'environment', 'production')
    monkeypatch.setattr(auth_rate_limit, 'redis_client', redis)

    with pytest.raises(HTTPException, match='Too many authentication requests'):
        await auth_rate_limit.enforce_sensitive_auth_rate_limit(request)
    assert '203.0.113.10' not in redis.keys[0]

    class UnavailableRedis:
        async def incr(self, key):
            raise RedisError('redis is restarting')

    monkeypatch.setattr(auth_rate_limit, 'redis_client', UnavailableRedis())
    await auth_rate_limit.enforce_sensitive_auth_rate_limit(request)


@pytest.mark.anyio
async def test_profile_update_cannot_claim_configured_administrator_phone(anyio_backend, monkeypatch) -> None:
    from app.models.users import User, UserProfile
    from app.schemas.users import ProfileUpdateRequest
    from app.services.admin_service import AdminError, require_admin
    from app.services.auth_service import AuthError, to_user_out
    from app.services.user_service import update_profile

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    monkeypatch.setattr('app.services.admin_service.settings.admin_email', '')

    user = User(id=uuid4(), nexus_id='1234567890123456', telegram_id='non-admin', status='active')
    profile = UserProfile(
        user_id=user.id,
        display_name='Non-admin',
        username='nonadmin',
        avatar_type='built_in',
        avatar_ref='animal-01',
        optional_phone=None,
        email=None,
        registration_country=None,
        phone_public=False,
        language='ru',
        design_theme='halo',
        current_mode='regular',
    )
    user.profile = profile

    class ProfileSession:
        async def get(self, model, _user_id):
            if model is UserProfile:
                return profile
            if model is User:
                return user
            return None

        async def commit(self):
            return None

    session = ProfileSession()
    with pytest.raises(AuthError, match='Phone number is reserved for administrator access'):
        await update_profile(
            session,
            user.id,
            ProfileUpdateRequest(optional_phone='+7 (999) 000-00-01'),
        )

    current_user = to_user_out(user)
    assert current_user.profile.optional_phone is None
    assert current_user.is_official is False
    with pytest.raises(AdminError, match='Administrator access is required'):
        await require_admin(session, user.id)


@pytest.mark.anyio
async def test_profile_contact_phone_can_be_saved_when_admin_uses_email(anyio_backend, monkeypatch) -> None:
    from app.models.users import User, UserProfile
    from app.schemas.users import ProfileUpdateRequest
    from app.services import user_service

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    monkeypatch.setattr('app.services.user_service.settings.admin_phone', '+79990000001')
    monkeypatch.setattr('app.services.user_service.settings.admin_email', 'owner@example.test')

    user = User(id=uuid4(), nexus_id='1234567890123456', status='active')
    profile = UserProfile(user_id=user.id, display_name='Contact User', username='contactuser')

    class ProfileSession:
        async def get(self, model, _user_id):
            return profile if model is UserProfile else None

        async def scalar(self, _statement):
            return None

        async def commit(self):
            return None

        async def rollback(self):
            return None

    async def fake_get_current_user_out(_session, _user_id):
        return type('UserOut', (), {'profile': profile})()

    monkeypatch.setattr(user_service, 'get_current_user_out', fake_get_current_user_out)
    session = ProfileSession()

    added_user = await user_service.update_profile(
        session,
        user.id,
        ProfileUpdateRequest(optional_phone='+7 (999) 000-00-01'),
    )
    assert added_user.profile.optional_phone == '+79990000001'
    assert added_user.profile.phone_public is False

    updated_user = await user_service.update_profile(
        session,
        user.id,
        ProfileUpdateRequest(phone_public=True),
    )
    assert updated_user.profile.phone_public is True

    cleared_user = await user_service.update_profile(
        session,
        user.id,
        ProfileUpdateRequest(optional_phone=''),
    )
    assert cleared_user.profile.optional_phone is None
    assert cleared_user.profile.phone_public is False


@pytest.mark.anyio
async def test_contact_phone_cannot_be_used_to_log_in(anyio_backend) -> None:
    from app.services import auth_service, security_service

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')

    assert await auth_service._find_user_by_login_identifier(None, '+7 (999) 000-00-02') is None
    assert await security_service._find_user_by_login_identifier(None, '+7 (999) 000-00-02') is None


@pytest.mark.anyio
async def test_phone_verification_bot_flow(anyio_backend, monkeypatch) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    sent_messages = []

    async def fake_send_telegram_message(chat_id, text, reply_markup=None):
        sent_messages.append((chat_id, text, reply_markup))

    async def fake_answer_telegram_callback(callback_query_id, text=None):
        sent_messages.append((callback_query_id, text, None))

    monkeypatch.setattr('app.services.phone_verification_service.send_telegram_message', fake_send_telegram_message)
    monkeypatch.setattr('app.services.phone_verification_service.answer_telegram_callback', fake_answer_telegram_callback)

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            verification = PhoneVerification(
                public_token='token123',
                phone_country='RU',
                phone='+79991234567',
                device_id='device-123456',
                status='pending',
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            session.add(verification)
            await session.commit()
            await session.refresh(verification)

            await handle_telegram_bot_update(session, {
                'message': {
                    'text': '/start phone_token123',
                    'chat': {'id': 1001},
                    'from': {'id': 42, 'username': 'nexus'},
                },
            })
            await handle_telegram_bot_update(session, {
                'callback_query': {
                    'id': 'callback-1',
                    'data': 'phone_confirm:token123',
                    'from': {'id': 42},
                    'message': {'chat': {'id': 1001}},
                },
            })

            code_message = next(text for _, text, _ in sent_messages if 'Ваш код подтверждения AraChat:' in text)
            code = code_message.split(': ')[1][:4]
            result = await verify_phone_code(session, verification.id, code)

            assert verify_registration_proof(result.registration_proof) == '42'
            assert result.verification.status == 'verified'
    finally:
        await engine.dispose()
