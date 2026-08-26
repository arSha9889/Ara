from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.support import SupportTicketCounter
from app.models.users import User, UserProfile
from app.schemas.support import AdminSupportMessageCreateRequest, SupportTicketCreateRequest
from app.services.support_service import (
    add_admin_message,
    create_ticket,
    get_admin_ticket,
    get_user_ticket,
)


async def _make_session_factory():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, session_factory


def _add_user(session, *, number: int, username: str, phone: str | None = None) -> User:
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
            registration_country='KZ',
        ),
    ])
    return user


@pytest.mark.anyio
async def test_support_tickets_initialize_counter_and_hide_internal_notes(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')

    async def no_notification(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr('app.services.support_service.create_support_notification', no_notification)
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_user(session, number=1, username='admin', phone='+79990000001')
            requester = _add_user(session, number=2, username='requester')
            await session.commit()

            first_ticket = await create_ticket(
                session,
                requester.id,
                SupportTicketCreateRequest(category='bug', subject='Cannot send a message', message='The send button does nothing.'),
            )
            second_ticket = await create_ticket(
                session,
                requester.id,
                SupportTicketCreateRequest(category='account', subject='Need account help', message='Please help me update my profile.'),
            )

            assert first_ticket.number == 1
            assert second_ticket.number == 2
            counter = (await session.execute(select(SupportTicketCounter))).scalar_one()
            assert counter.last_number == 2

            await add_admin_message(
                session,
                admin.id,
                first_ticket.id,
                AdminSupportMessageCreateRequest(text='Investigate server logs first.', is_internal=True),
            )
            user_ticket = await get_user_ticket(session, requester.id, first_ticket.id)
            admin_ticket = await get_admin_ticket(session, admin.id, first_ticket.id)

            assert len(user_ticket.messages) == 1
            assert all(not message.is_internal for message in user_ticket.messages)
            assert len(admin_ticket.messages) == 2
            assert admin_ticket.messages[-1].is_internal is True
    finally:
        await engine.dispose()
