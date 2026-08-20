import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.chats import Chat, ChatParticipant
from app.models.verification import EmailVerification
from app.models.users import UserProfile
from app.schemas.auth import RegisterCompleteRequest
from app.schemas.chats import MessageCreateRequest, MessageOut
from app.schemas.users import ProfileUpdateRequest
from app.services.auth_service import AuthError, complete_registration, login_with_password, refresh_access_token
from app.services.branch_comment_service import create_branch_comment, delete_branch_comment, list_branch_comments, update_branch_comment
from app.services.branch_service import subscribe_to_branch, unsubscribe_from_branch
from app.services.chat_service import create_message, create_or_get_direct_chat, create_or_get_direct_chat_for_user, delete_message, get_chat, hide_chat, list_chats, list_messages, mark_message_read, mark_messages_read, restore_chat, toggle_reaction, update_chat_wallpaper
from app.services.notification_service import create_message_notifications, list_notifications
from app.services.user_service import find_public_user, update_profile


DATABASE_URL = os.getenv('NEXUS_TEST_DATABASE_URL')


pytestmark = pytest.mark.skipif(not DATABASE_URL, reason='NEXUS_TEST_DATABASE_URL is required')


@pytest.fixture
def anyio_backend() -> str:
    return 'asyncio'


async def _prepare_database(engine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


async def _create_user(session_factory, username: str, user_marker: str):
    async with session_factory() as session:
        device_id = f'device-{uuid4()}'
        verification = EmailVerification(
            public_token=f'email-{uuid4()}',
            email=f'{username}-{user_marker}@example.test',
            device_id=device_id,
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
                username=username,
                password='password123',
                pin='1234',
                device_id=device_id,
                language='ru',
                design_theme='halo',
                accepted_terms=True,
                accepted_privacy_policy=True,
            ),
        )
        assert completion.user and completion.access_token and completion.refresh_token
        return completion.user, completion.access_token, completion.refresh_token


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
        third_user, _, _ = await _create_user(session_factory, 'charlienexus', '103')

        async with session_factory() as session:
            direct_chat = await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
            same_direct_chat = await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
            assert direct_chat.id == same_direct_chat.id
            assert direct_chat.peer and direct_chat.peer.id == second_user.id

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
                ProfileUpdateRequest(
                    language='en',
                    design_theme='aurora',
                    optional_phone='+7 (999) 000-00-01',
                    phone_public=True,
                ),
            )
            assert updated_user.profile.language == 'en'
            assert updated_user.profile.design_theme == 'aurora'
            assert updated_user.profile.optional_phone == '+79990000001'
            assert updated_user.profile.phone_public is True

        async with session_factory() as session:
            first_profile = await session.get(UserProfile, first_user.id)
            assert first_profile.optional_phone == '+79990000001'
            second_profile = await session.get(UserProfile, second_user.id)
            second_profile.optional_phone = '+79990000002'
            await session.commit()

        async with session_factory() as session:
            with pytest.raises(AuthError, match='User not found'):
                await create_or_get_direct_chat(session, first_user.id, 'RU', '+7 999 000-00-02')

            second_profile = await session.get(UserProfile, second_user.id)
            second_profile.phone_public = True
            await session.commit()

        async with session_factory() as session:
            private_profile = await find_public_user(session, 'bobnexus')
            assert private_profile.profile and private_profile.profile.optional_phone == '+79990000002'
            assert 'nexus_id' not in private_profile.model_dump()
            assert 'telegram_id' not in private_profile.model_dump()
            assert 'email' not in private_profile.profile.model_dump()

        async with session_factory() as session:
            chat = await create_or_get_direct_chat(session, first_user.id, 'RU', '+7 999 000-00-02')
            other_chat = await create_or_get_direct_chat_for_user(session, first_user.id, third_user.id)
            foreign_message = await create_message(session, first_user.id, other_chat.id, MessageCreateRequest(text='Другое сообщение'))
            assert first_user.id in chat.participant_ids
            assert second_user.id in chat.participant_ids
            assert [item.id for item in await list_chats(session, second_user.id)] == []

            updated_wallpaper = await update_chat_wallpaper(session, first_user.id, chat.id, 'aurora')
            assert updated_wallpaper.wallpaper_id == 'aurora'
            assert (await get_chat(session, second_user.id, chat.id)).wallpaper_id == 'default'

            message = await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Привет'))
            assert isinstance(message, MessageOut)
            assert message.payload == 'Привет'
            assert message.delivery_status == 'delivered'
            assert message.author and message.author.id == first_user.id
            assert message.author.display_name == 'alicenexus'
            assert 'optional_phone' not in message.author.model_dump()
            assert 'email' not in message.author.model_dump()
            reply = await create_message(
                session,
                second_user.id,
                chat.id,
                MessageCreateRequest(text='И тебе привет', reply_to_message_id=message.id),
            )
            assert reply.reply_to and reply.reply_to.id == message.id
            assert reply.reply_to.payload == 'Привет'
            with pytest.raises(AuthError, match='Reply message not found'):
                await create_message(
                    session,
                    second_user.id,
                    chat.id,
                    MessageCreateRequest(text='Неверный ответ', reply_to_message_id=foreign_message.id),
                )
            assert [item.id for item in await list_chats(session, second_user.id)] == [chat.id]
            unread_chat = await create_or_get_direct_chat(session, second_user.id, 'RU', '+7 999 000-00-01')
            assert unread_chat.unread_count == 1

            await hide_chat(session, second_user.id, chat.id)
            assert chat.id not in [item.id for item in await list_chats(session, second_user.id)]
            restored_chat = await restore_chat(session, second_user.id, chat.id)
            assert restored_chat.id == chat.id
            await hide_chat(session, second_user.id, chat.id)
            await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Новое входящее'))
            assert chat.id in [item.id for item in await list_chats(session, second_user.id)]

            reacted_message = await toggle_reaction(session, second_user.id, chat.id, message.id, '👍')
            assert reacted_message.reactions[0].emoji == '👍'
            assert reacted_message.reactions[0].count == 1

            read_message = await mark_message_read(session, second_user.id, chat.id, message.id)
            assert read_message.delivery_status == 'received'
            read_chat = await create_or_get_direct_chat(session, second_user.id, 'RU', '+7 999 000-00-01')
            assert read_chat.unread_count == 1

            second_message = await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Ещё одно сообщение'))
            await create_message_notifications(session, second_message)
            read_messages = await mark_messages_read(session, second_user.id, chat.id, [message.id, second_message.id])
            assert [item.id for item in read_messages] == [second_message.id]

            notifications = await list_notifications(session, second_user.id)
            assert len(notifications) == 1
            assert notifications[0].message_id == second_message.id
            assert notifications[0].read_at is not None

            messages_for_reader = await list_messages(session, second_user.id, chat.id)
            assert [item.payload for item in messages_for_reader] == [
                'Привет',
                'И тебе привет',
                'Новое входящее',
                'Ещё одно сообщение',
            ]
            assert messages_for_reader[1].reply_to and messages_for_reader[1].reply_to.id == message.id
            assert messages_for_reader[0].reactions[0].emoji == '👍'

            messages_for_sender = await list_messages(session, first_user.id, chat.id)
            assert [item.delivery_status for item in messages_for_sender] == ['read', 'received', 'delivered', 'read']

            await delete_message(session, first_user.id, chat.id, message.id)
            messages_with_deleted_reply_source = await list_messages(session, second_user.id, chat.id)
            assert messages_with_deleted_reply_source[1].reply_to
            assert messages_with_deleted_reply_source[1].reply_to.deleted_at
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_public_branch_subscriptions_and_comments() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        owner, _, _ = await _create_user(session_factory, 'branchowner', '201')
        subscriber, _, _ = await _create_user(session_factory, 'branchreader', '202')
        outsider, _, _ = await _create_user(session_factory, 'branchoutsider', '203')

        async with session_factory() as session:
            branch = Chat(type='branch', title='Новости', slug='news-branch', description='Новости продукта')
            session.add(branch)
            await session.flush()
            session.add(ChatParticipant(chat_id=branch.id, user_id=owner.id, role='owner'))
            await session.commit()

            branch_for_owner = await get_chat(session, owner.id, branch.id)
            assert branch_for_owner.subscriber_count == 0
            assert branch_for_owner.participant_ids == []

            public_wallpaper = await update_chat_wallpaper(session, subscriber.id, branch.id, 'night')
            assert public_wallpaper.wallpaper_id == 'night'
            assert (await get_chat(session, owner.id, branch.id)).wallpaper_id == 'default'

            await subscribe_to_branch(session, subscriber.id, branch.id)
            await subscribe_to_branch(session, subscriber.id, branch.id)
            branch_for_subscriber = await get_chat(session, subscriber.id, branch.id)
            assert branch_for_subscriber.is_subscribed
            assert branch_for_subscriber.subscriber_count == 1

            post = await create_message(session, owner.id, branch.id, MessageCreateRequest(text='Первая публикация'))
            with pytest.raises(AuthError, match='Subscribe to this branch'):
                await create_branch_comment(session, outsider.id, branch.id, post.id, 'Хочу ответить')

            session.add(ChatParticipant(chat_id=branch.id, user_id=outsider.id, role='admin'))
            await session.commit()
            assert (await get_chat(session, subscriber.id, branch.id)).subscriber_count == 1

            comment, count = await create_branch_comment(session, subscriber.id, branch.id, post.id, 'Отличные новости')
            assert count == 1
            assert comment.author_id == subscriber.id
            assert (await list_messages(session, subscriber.id, branch.id))[0].comment_count == 1

            updated = await update_branch_comment(session, subscriber.id, branch.id, comment.id, 'Очень отличные новости')
            assert updated.text == 'Очень отличные новости'
            comments = await list_branch_comments(session, subscriber.id, branch.id, post.id)
            assert [item.id for item in comments] == [comment.id]

            deleted, count = await delete_branch_comment(session, owner.id, branch.id, comment.id)
            assert deleted.deleted_at is not None
            assert count == 0
            assert (await list_messages(session, subscriber.id, branch.id))[0].comment_count == 0

            await unsubscribe_from_branch(session, subscriber.id, branch.id)
            unsubscribed_branch = await get_chat(session, subscriber.id, branch.id)
            assert not unsubscribed_branch.is_subscribed
            assert unsubscribed_branch.subscriber_count == 0
    finally:
        await engine.dispose()
