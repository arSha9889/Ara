from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.chats import PushSubscription
from app.models.security import TrustedDevicePin
from app.models.sessions import Session
from app.models.users import User, UserProfile
from app.services.admin_service import change_user_status, get_admin_user, list_admin_users


@pytest.mark.anyio
async def test_list_admin_users_searches_filters_and_includes_deleted(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    user_number = 0

    def add_user(session, *, name: str, username: str, country: str, phone: str | None = None, email: str | None = None, status: str = 'active', deleted: bool = False) -> User:
        nonlocal user_number
        user_number += 1
        user = User(
            id=uuid4(),
            nexus_id=str(user_number).zfill(16),
            telegram_id=f'telegram-{username}',
            status=status,
            deleted_at=datetime.now(timezone.utc) if deleted else None,
        )
        session.add_all([
            user,
            UserProfile(
                user_id=user.id,
                display_name=name,
                username=username,
                optional_phone=phone,
                email=email,
                registration_country=country,
            ),
        ])
        return user

    try:
        async with session_factory() as session:
            admin = add_user(session, name='Administrator', username='admin', country='RU', phone='+79990000001')
            add_user(session, name='Alice Active', username='alice', country='RU', email='alice@example.com')
            add_user(session, name='Blocked User', username='blocked', country='KZ', status='blocked')
            add_user(session, name='Deleted User', username='deleted', country='UA', deleted=True)
            await session.commit()

            all_users = await list_admin_users(session, admin.id)
            assert all_users['total'] == 3
            assert {user['username'] for user in all_users['users']} == {'admin', 'alice', 'blocked'}
            assert 'email' not in all_users['users'][0]

            blocked = await list_admin_users(session, admin.id, query='@blocked', user_status='blocked', country='KZ')
            assert blocked['total'] == 1
            assert blocked['users'][0]['username'] == 'blocked'

            found_by_email = await list_admin_users(session, admin.id, query='alice@example.com')
            assert found_by_email['total'] == 1
            assert found_by_email['users'][0]['username'] == 'alice'

            details = await get_admin_user(session, admin.id, found_by_email['users'][0]['id'])
            assert details['email'] == 'alice@example.com'

            deleted = await list_admin_users(session, admin.id, user_status='deleted')
            assert deleted['total'] == 1
            assert deleted['users'][0]['username'] == 'deleted'
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_administrator_can_delete_another_user_and_revoke_access(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            admin = User(id=uuid4(), nexus_id='1111111111111111', telegram_id='admin', status='active')
            target = User(id=uuid4(), nexus_id='2222222222222222', telegram_id='target', status='active')
            session.add_all([
                admin,
                target,
                UserProfile(user_id=admin.id, display_name='Administrator', username='admin', optional_phone='+79990000001'),
                UserProfile(user_id=target.id, display_name='Target user', username='target', optional_phone='+79990000002'),
                Session(
                    user_id=target.id,
                    device_id='target-device',
                    refresh_token_lookup_hash='a' * 64,
                    refresh_token_hash='hash',
                    expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                ),
                TrustedDevicePin(
                    user_id=target.id,
                    device_id='target-device',
                    pin_hash='hash',
                    trusted_until=datetime.now(timezone.utc) + timedelta(days=1),
                ),
                PushSubscription(
                    user_id=target.id,
                    device_id='target-device',
                    endpoint='https://push.example/target',
                    p256dh='key',
                    auth='auth',
                ),
            ])
            await session.commit()

            await change_user_status(session, admin.id, target.id, 'deleted')

            deleted_user = await session.get(User, target.id)
            assert deleted_user.status == 'deleted'
            assert deleted_user.deleted_at is not None
            target_session = (await session.execute(select(Session).where(Session.user_id == target.id))).scalar_one()
            target_pin = (await session.execute(select(TrustedDevicePin).where(TrustedDevicePin.user_id == target.id))).scalar_one()
            push_subscription = (await session.execute(select(PushSubscription).where(PushSubscription.user_id == target.id))).scalar_one_or_none()
            assert target_session.revoked_at is not None
            assert target_pin.revoked_at is not None
            assert push_subscription is None
    finally:
        await engine.dispose()
