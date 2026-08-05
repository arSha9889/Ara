from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.domain.registration_proof import create_registration_proof, verify_registration_proof
from app.domain.tokens import create_access_token, decode_access_token
from app.models.verification import PhoneVerification
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
        registration_proof='proof',
        username='belarususer',
        password='password123',
        device_id='device-123',
        language='be',
        registration_country='BY',
    )
    assert registration.registration_country == 'BY'
    assert registration.language == 'be'


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
    from app.domain.registration_proof import create_registration_proof
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
                        registration_proof=create_registration_proof('dev-over-limit'),
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
async def test_dev_registration_bypasses_telegram_password_confirmation(anyio_backend, monkeypatch) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base
    from app.schemas.auth import RegisterCompleteRequest
    from app.services.auth_service import complete_registration

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.auth_service.settings.environment', 'dev')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            completion = await complete_registration(
                session,
                RegisterCompleteRequest(
                    registration_proof=create_registration_proof('dev-password-confirmation'),
                    username='devconfirm',
                    password='password123',
                    device_id='device-dev-confirmation',
                    accepted_terms=True,
                    accepted_privacy_policy=True,
                ),
            )

            assert completion.confirmation is None
            assert completion.user and completion.user.status == 'active'
            assert completion.access_token and completion.refresh_token
    finally:
        await engine.dispose()


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
    with pytest.raises(AuthError, match='Phone number can only be changed through Telegram verification'):
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
