import os
from uuid import uuid4

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.domain.registration_proof import create_registration_proof
from app.schemas.auth import RegisterCompleteRequest
from app.schemas.chats import MessageCreateRequest, MessageOut
from app.schemas.users import ProfileUpdateRequest
from app.services.auth_service import complete_registration, login_with_password, refresh_access_token
from app.services.chat_service import create_message, create_or_get_direct_chat, list_messages, mark_message_read, mark_messages_read, toggle_reaction
from app.services.notification_service import create_message_notifications, list_notifications
from app.services.user_service import update_profile


DATABASE_URL = os.getenv('NEXUS_TEST_DATABASE_URL')


pytestmark = pytest.mark.skipif(not DATABASE_URL, reason='NEXUS_TEST_DATABASE_URL is required')


@pytest.fixture
def anyio_backend() -> str:
    return 'asyncio'


async def _prepare_database(engine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


async def _create_user(session_factory, username: str, telegram_id: str):
    async with session_factory() as session:
        proof_identity = telegram_id if telegram_id.startswith('dev-') else f'dev-{telegram_id}'
        user, access_token, refresh_token = await complete_registration(
            session,
            RegisterCompleteRequest(
                registration_proof=create_registration_proof(proof_identity),
                username=username,
                password='password123',
                pin='1234',
                device_id=f'device-{uuid4()}',
                language='ru',
                design_theme='halo',
            ),
        )
        return user, access_token, refresh_token


@pytest.mark.anyio
async def test_auth_profile_and_chat_services_roundtrip() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        first_user, _, first_refresh_token = await _create_user(session_factory, 'alicenexus', '101')
        second_user, _, _ = await _create_user(session_factory, 'bobnexus', '102')

        async with session_factory() as session:
            logged_user, access_token, refresh_token = await login_with_password(
                session,
                first_user.nexus_id,
                'password123',
                'browser-device-1',
            )
            assert logged_user.id == first_user.id
            assert access_token
            assert refresh_token

        async with session_factory() as session:
            refreshed_user, refreshed_access_token, same_refresh_token = await refresh_access_token(session, first_refresh_token)
            assert refreshed_user.id == first_user.id
            assert refreshed_access_token
            assert same_refresh_token == first_refresh_token

        async with session_factory() as session:
            updated_user = await update_profile(
                session,
                first_user.id,
                ProfileUpdateRequest(language='en', design_theme='aurora', phone_public=True),
            )
            assert updated_user.profile.language == 'en'
            assert updated_user.profile.design_theme == 'aurora'
            assert updated_user.profile.phone_public is True

        async with session_factory() as session:
            chat = await create_or_get_direct_chat(session, first_user.id, second_user.nexus_id)
            assert first_user.id in chat.participant_ids
            assert second_user.id in chat.participant_ids

            message = await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Привет'))
            assert isinstance(message, MessageOut)
            assert message.payload == 'Привет'
            assert message.delivery_status == 'delivered'
            unread_chat = await create_or_get_direct_chat(session, second_user.id, first_user.nexus_id)
            assert unread_chat.unread_count == 1

            reacted_message = await toggle_reaction(session, second_user.id, chat.id, message.id, '👍')
            assert reacted_message.reactions[0].emoji == '👍'
            assert reacted_message.reactions[0].count == 1

            read_message = await mark_message_read(session, second_user.id, chat.id, message.id)
            assert read_message.delivery_status == 'received'
            read_chat = await create_or_get_direct_chat(session, second_user.id, first_user.nexus_id)
            assert read_chat.unread_count == 0

            second_message = await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Ещё одно сообщение'))
            await create_message_notifications(session, second_message)
            read_messages = await mark_messages_read(session, second_user.id, chat.id, [message.id, second_message.id])
            assert [item.id for item in read_messages] == [second_message.id]

            notifications = await list_notifications(session, second_user.id)
            assert len(notifications) == 1
            assert notifications[0].message_id == second_message.id
            assert notifications[0].read_at is not None

            messages_for_reader = await list_messages(session, second_user.id, chat.id)
            assert [item.payload for item in messages_for_reader] == ['Привет', 'Ещё одно сообщение']
            assert messages_for_reader[0].reactions[0].emoji == '👍'

            messages_for_sender = await list_messages(session, first_user.id, chat.id)
            assert [item.delivery_status for item in messages_for_sender] == ['read', 'read']
    finally:
        await engine.dispose()
