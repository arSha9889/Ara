from datetime import datetime, timedelta, timezone
import hashlib
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.domain.security_hashing import hash_secret
from app.models.chats import MobilePushToken
from app.models.security import PasswordCredential
from app.models.sessions import Session
from app.models.users import User, UserProfile
from app.models.verification import EmailVerification
from app.services.admin_service import create_user_restriction
from app.services.auth_service import finish_password_reset, logout_by_refresh_token
from app.services.device_service import revoke_device


async def _make_session_factory():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, session_factory


def _mobile_token(user_id, device_id: str, token: str, provider: str = 'fcm') -> MobilePushToken:
    return MobilePushToken(
        user_id=user_id,
        device_id=device_id,
        provider=provider,
        package_name='arachat.messenger',
        token=token,
    )


def _session(user_id, device_id: str, marker: str, refresh_token: str | None = None) -> Session:
    token = refresh_token or f'refresh-{marker}'
    return Session(
        user_id=user_id,
        device_id=device_id,
        refresh_token_lookup_hash=hashlib.sha256(token.encode()).hexdigest(),
        refresh_token_hash=hash_secret(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )


@pytest.mark.anyio
async def test_device_revoke_deactivates_only_the_target_mobile_push_tokens(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            user = User(id=uuid4(), nexus_id='1000000000000001', telegram_id='device-revoke-user', status='active')
            session.add_all([
                user,
                _session(user.id, 'revoked-device', 'one'),
                _session(user.id, 'active-device', 'two'),
                _mobile_token(user.id, 'revoked-device', 'revoked-fcm'),
                _mobile_token(user.id, 'revoked-device', 'revoked-rustore', provider='rustore'),
                _mobile_token(user.id, 'active-device', 'active-fcm'),
            ])
            await session.commit()

            revoked_session_ids = await revoke_device(session, user.id, 'revoked-device')

            tokens = list((await session.execute(select(MobilePushToken).order_by(MobilePushToken.device_id))).scalars())
            revoked_sessions = list((await session.execute(select(Session).where(Session.device_id == 'revoked-device'))).scalars())
            assert len(revoked_session_ids) == 1
            assert all(item.revoked_at is not None for item in revoked_sessions)
            assert [(item.device_id, item.is_active) for item in tokens] == [
                ('active-device', True),
                ('revoked-device', False),
                ('revoked-device', False),
            ]
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_logout_deactivates_mobile_push_tokens_for_its_device_only(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            user = User(id=uuid4(), nexus_id='1000000000000002', telegram_id='logout-user', status='active')
            refresh_token = 'logout-refresh-token'
            current_session = _session(user.id, 'logout-device', 'logout', refresh_token)
            session.add_all([
                user,
                current_session,
                _mobile_token(user.id, 'logout-device', 'logout-fcm'),
                _mobile_token(user.id, 'other-device', 'other-fcm'),
            ])
            await session.commit()

            revoked = await logout_by_refresh_token(session, refresh_token)

            tokens = list((await session.execute(select(MobilePushToken).order_by(MobilePushToken.device_id))).scalars())
            assert revoked == current_session.id
            assert current_session.revoked_at is not None
            assert [(item.device_id, item.is_active) for item in tokens] == [
                ('logout-device', False),
                ('other-device', True),
            ]
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_password_reset_deactivates_mobile_push_tokens_for_all_user_devices(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            user = User(id=uuid4(), nexus_id='1000000000000003', telegram_id='password-reset-user', status='active')
            recovery_device_id = 'recovery-device'
            session.add_all([
                user,
                PasswordCredential(user_id=user.id, password_hash=hash_secret('old-password')),
                _session(user.id, recovery_device_id, 'one'),
                _session(user.id, 'other-device', 'two'),
                _mobile_token(user.id, recovery_device_id, 'recovery-fcm'),
                _mobile_token(user.id, 'other-device', 'other-fcm'),
                EmailVerification(
                    public_token='password-reset-verification',
                    email='reset@example.test',
                    device_id=recovery_device_id,
                    user_id=user.id,
                    purpose='password_reset',
                    code_hash=hash_secret('000000'),
                    status='code_sent',
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                ),
            ])
            await session.commit()

            reset_user_id = await finish_password_reset(
                session,
                'reset@example.test',
                '000000',
                'newpassword123',
                recovery_device_id,
            )

            tokens = list((await session.execute(select(MobilePushToken))).scalars())
            sessions = list((await session.execute(select(Session))).scalars())
            assert reset_user_id == user.id
            assert all(not item.is_active for item in tokens)
            assert all(item.revoked_at is not None for item in sessions)
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_user_restriction_deactivates_mobile_push_tokens_for_all_devices(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    monkeypatch.setattr('app.services.admin_service.settings.admin_email', '')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = User(id=uuid4(), nexus_id='1000000000000004', telegram_id='admin-user', status='active')
            target = User(id=uuid4(), nexus_id='1000000000000005', telegram_id='restricted-user', status='active')
            session.add_all([
                admin,
                target,
                UserProfile(user_id=admin.id, display_name='Admin', username='admin', optional_phone='+79990000001'),
                UserProfile(user_id=target.id, display_name='Target', username='target'),
                _session(target.id, 'first-device', 'one'),
                _mobile_token(target.id, 'first-device', 'first-fcm'),
                _mobile_token(target.id, 'second-device', 'second-fcm'),
            ])
            await session.commit()

            await create_user_restriction(
                session,
                admin.id,
                target.id,
                reason='security',
                note=None,
                ends_at=None,
            )

            tokens = list((await session.execute(select(MobilePushToken))).scalars())
            target_session = (await session.execute(select(Session).where(Session.user_id == target.id))).scalar_one()
            assert all(not item.is_active for item in tokens)
            assert target_session.revoked_at is not None
    finally:
        await engine.dispose()
