from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.audit import AuditLog
from app.models.chats import Chat, ChatParticipant, Message, Notification
from app.models.security import TrustedDevicePin
from app.models.sessions import Session
from app.models.users import User, UserProfile, UserRestriction
from app.services.admin_service import create_user_restriction, lift_user_restriction
from app.services.system_bot_service import create_system_announcement, publish_system_announcement
from app.services.user_access_service import expire_user_restrictions, user_can_access


async def _make_session_factory():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, session_factory


def _add_user(session, *, number: int, username: str, country: str, phone: str | None = None) -> User:
    user = User(
        id=uuid4(),
        nexus_id=str(number).zfill(16),
        telegram_id=f'telegram-{username}',
        status='active',
    )
    session.add_all([
        user,
        UserProfile(
            user_id=user.id,
            display_name=username.title(),
            username=username,
            optional_phone=phone,
            registration_country=country,
        ),
    ])
    return user


@pytest.mark.anyio
async def test_restriction_revokes_access_records_history_and_expires(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_user(session, number=1, username='admin', country='KZ', phone='+79990000001')
            target = _add_user(session, number=2, username='target', country='KZ')
            session.add_all([
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
            ])
            await session.commit()

            restriction = await create_user_restriction(
                session,
                admin.id,
                target.id,
                reason='spam',
                note='Repeated unsolicited messages.',
                ends_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
            assert restriction.reason == 'spam'
            assert not await user_can_access(session, await session.get(User, target.id))
            assert (await session.execute(select(Session).where(Session.user_id == target.id))).scalar_one().revoked_at is not None
            assert (await session.execute(select(TrustedDevicePin).where(TrustedDevicePin.user_id == target.id))).scalar_one().revoked_at is not None

            await lift_user_restriction(session, admin.id, target.id)
            assert await user_can_access(session, await session.get(User, target.id))

            expired = UserRestriction(
                user_id=target.id,
                admin_user_id=admin.id,
                reason='security',
                ends_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
            session.add(expired)
            target.status = 'blocked'
            await session.commit()

            assert await expire_user_restrictions(session) == 1
            assert (await session.get(User, target.id)).status == 'active'
            audit = (await session.execute(
                select(AuditLog).where(AuditLog.action == 'user.restriction_expired')
            )).scalar_one()
            assert audit.actor_type == 'system'
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_announcement_publishes_one_post_and_segmented_notifications(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_user(session, number=1, username='admin', country='RU', phone='+79990000001')
            kazakh_user = _add_user(session, number=2, username='kz-user', country='KZ')
            _add_user(session, number=3, username='ru-user', country='RU')
            official_branch = Chat(
                type='branch',
                title='Ara Updates',
                slug='ara-updates',
                description='Official updates',
                is_official=True,
            )
            session.add(official_branch)
            await session.flush()
            session.add(ChatParticipant(chat_id=official_branch.id, user_id=admin.id, role='owner'))
            await session.commit()

            announcement = await create_system_announcement(
                session,
                admin.id,
                text='Service update for Kazakhstan.',
                audience_type='country',
                audience_country='kz',
                audience_branch_id=None,
                scheduled_at=None,
            )
            published = await publish_system_announcement(session, UUID(announcement['id']), actor_user_id=admin.id)
            repeated = await publish_system_announcement(session, UUID(announcement['id']), actor_user_id=admin.id)

            assert published['status'] == 'published'
            assert published['recipient_count'] == 1
            assert published['notification_count'] == 1
            assert repeated['message_id'] == published['message_id']
            assert len(list((await session.execute(select(Message))).scalars())) == 1
            notifications = list((await session.execute(select(Notification))).scalars())
            assert len(notifications) == 1
            assert notifications[0].recipient_user_id == kazakh_user.id
    finally:
        await engine.dispose()
