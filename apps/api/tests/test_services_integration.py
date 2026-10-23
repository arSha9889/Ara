import base64
import json
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.chats import Chat, ChatParticipant, Message, Notification
from app.models.storage import StoredObject
from app.models.safety import UserBlock
from app.models.verification import EmailVerification
from app.models.users import UserProfile
from app.schemas.auth import RegisterCompleteRequest
from app.schemas.chats import MessageCreateRequest, MessageOut
from app.schemas.users import ProfileUpdateRequest
from app.services.auth_service import AuthError, complete_registration, login_with_password, refresh_access_token
from app.services.branch_comment_service import create_branch_comment, delete_branch_comment, list_branch_comments, update_branch_comment
from app.services.branch_service import create_private_branch, delete_private_branch, generate_private_branch_invite, join_private_branch_by_invite, leave_private_branch, list_public_branches, remove_private_branch_member, revoke_private_branch_invite, subscribe_to_branch, unsubscribe_from_branch, update_branch_notifications, update_private_branch_member
from app.services.group_service import add_group_member, create_group, delete_group, generate_group_invite, join_group_by_invite, leave_group, remove_group_member, revoke_group_invite, transfer_group_ownership, update_group_member_role
from app.services.call_signaling import CallSession
from app.services.call_history_service import finalize_call_record, list_call_history, start_call_record
from app.services.chat_service import create_call_history_message, create_message, create_or_get_direct_chat, create_or_get_direct_chat_for_user, create_or_get_saved_chat, delete_message, get_chat, get_message, hide_all_direct_chats, hide_chat, list_chats, list_messages, mark_message_read, mark_messages_read, restore_chat, set_branch_post_comments_enabled, toggle_reaction, update_chat_wallpaper
from app.services.media_service import MediaAccessError, get_private_media
from app.services.e2ee_service import E2EE_WEB_ALGORITHM, list_direct_chat_e2ee_keys, upsert_e2ee_web_key
from app.services.notification_service import clear_notifications, create_message_notifications, list_notifications
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
                registration_country='RU',
                design_theme='halo',
                accepted_terms=True,
                accepted_privacy_policy=True,
            ),
        )
        assert completion.user and completion.access_token and completion.refresh_token
        return completion.user, completion.access_token, completion.refresh_token


def _public_key(seed: int) -> str:
    return base64.b64encode(bytes([4]) + bytes([seed]) * 64).decode()


def _encrypted_envelope(sender_id, sender_device_id: str, recipient_keys) -> str:
    recipients = {
        f'{key.user_id}:{key.device_id}': {
            'ciphertext': base64.b64encode(b'ciphertext-and-auth-tag').decode(),
            'iv': base64.b64encode(b'0' * 12).decode(),
            'salt': base64.b64encode(b'1' * 32).decode(),
        }
        for key in recipient_keys
    }
    sender_key = next(key for key in recipient_keys if key.user_id == sender_id and key.device_id == sender_device_id)
    return json.dumps({
        'version': 1,
        'algorithm': E2EE_WEB_ALGORITHM,
        'sender_device_id': sender_device_id,
        'sender_ephemeral_public_key': _public_key(9),
        'sender_signing_public_key': sender_key.signing_public_key,
        'recipients': recipients,
        'signature': base64.b64encode(b'2' * 64).decode(),
    })


@pytest.mark.anyio
async def test_hiding_all_direct_chats_only_hides_current_users_list() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        first_user, _, _ = await _create_user(session_factory, 'clearalice', '901')
        second_user, _, _ = await _create_user(session_factory, 'clearbob', '902')
        third_user, _, _ = await _create_user(session_factory, 'clearcara', '903')

        async with session_factory() as session:
            first_chat = await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
            second_chat = await create_or_get_direct_chat_for_user(session, first_user.id, third_user.id)
            saved_chat = await create_or_get_saved_chat(session, first_user.id)

            assert await hide_all_direct_chats(session, first_user.id) == 2
            assert await hide_all_direct_chats(session, first_user.id) == 0

            visible_chat_ids = {chat.id for chat in await list_chats(session, first_user.id)}
            assert first_chat.id not in visible_chat_ids
            assert second_chat.id not in visible_chat_ids
            assert saved_chat.id in visible_chat_ids

            second_user_participant = await session.get(ChatParticipant, {'chat_id': first_chat.id, 'user_id': second_user.id})
            assert second_user_participant and second_user_participant.hidden_at is None
    finally:
        await engine.dispose()


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
                    design_theme='comet',
                    optional_phone='+7 (999) 000-00-01',
                    phone_public=True,
                ),
            )
            assert updated_user.profile.language == 'en'
            assert updated_user.profile.design_theme == 'comet'
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
            assert private_profile.nexus_id == second_user.nexus_id
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
            exact_message = await get_message(session, second_user.id, chat.id, message.id)
            assert exact_message.id == message.id
            with pytest.raises(AuthError, match='Message not found'):
                await get_message(session, second_user.id, chat.id, foreign_message.id)
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

            await hide_chat(session, second_user.id, chat.id)
            call_history = await create_call_history_message(
                session,
                CallSession(
                    call_id='call-history-test',
                    call_type='video',
                    chat_id=chat.id,
                    caller_user_id=first_user.id,
                    callee_user_id=second_user.id,
                    status='ringing',
                    expires_at=0,
                    pending_answer_user_id=None,
                ),
                'rejected',
            )
            assert call_history and call_history.type == 'call'
            assert json.loads(call_history.payload) == {
                'version': 1,
                'call_id': 'call-history-test',
                'call_type': 'video',
                'outcome': 'rejected',
            }
            assert chat.id in [item.id for item in await list_chats(session, second_user.id)]
            received_call_history = await get_message(session, second_user.id, chat.id, call_history.id)
            assert received_call_history.delivery_status == 'received'

            await delete_message(session, first_user.id, chat.id, message.id)
            messages_with_deleted_reply_source = await list_messages(session, second_user.id, chat.id)
            assert messages_with_deleted_reply_source[1].reply_to
            assert messages_with_deleted_reply_source[1].reply_to.deleted_at

            history_start = datetime.now(timezone.utc) + timedelta(days=1)
            history_messages = [
                Message(
                    chat_id=chat.id,
                    sender_id=first_user.id,
                    type='text',
                    payload=f'История {index}',
                    created_at=history_start + timedelta(seconds=index),
                )
                for index in range(101)
            ]
            session.add_all(history_messages)
            await session.commit()
            oldest_message_outside_history = history_messages[0]
            newest_history_message = history_messages[-1]

            ordinary_history = await list_messages(session, second_user.id, chat.id)
            assert len(ordinary_history) == 100
            history_message_ids = {item.id for item in ordinary_history}
            assert oldest_message_outside_history.id not in history_message_ids
            assert newest_history_message.id in history_message_ids
            exact_newest_history_message = await get_message(
                session,
                second_user.id,
                chat.id,
                newest_history_message.id,
            )
            assert exact_newest_history_message.id == newest_history_message.id
            assert exact_newest_history_message.payload == 'История 100'
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_persistent_call_history_includes_completed_calls_and_hides_blocked_peers() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        caller, _, _ = await _create_user(session_factory, 'calleralice', '601')
        callee, _, _ = await _create_user(session_factory, 'calleealice', '602')
        started_at = datetime(2026, 10, 7, 9, 0, tzinfo=timezone.utc)
        connected_at = started_at + timedelta(seconds=5)
        ended_at = connected_at + timedelta(seconds=65)

        async with session_factory() as session:
            chat = await create_or_get_direct_chat_for_user(session, caller.id, callee.id)
            call = CallSession(
                call_id='persistent-call-history',
                call_type='video',
                chat_id=chat.id,
                caller_user_id=caller.id,
                callee_user_id=callee.id,
                status='active',
                expires_at=0,
                pending_answer_user_id=None,
                created_at=started_at,
                connected_at=connected_at,
            )
            await start_call_record(session, call)
            await finalize_call_record(session, call, 'completed', ended_at=ended_at)

            caller_history = await list_call_history(session, caller.id, limit=100)
            callee_history = await list_call_history(session, callee.id, limit=100)
            assert len(caller_history) == len(callee_history) == 1
            assert caller_history[0].direction == 'outgoing'
            assert callee_history[0].direction == 'incoming'
            assert caller_history[0].peer.id == callee.id
            assert caller_history[0].duration_seconds == 65

            session.add(UserBlock(blocker_user_id=caller.id, blocked_user_id=callee.id))
            await session.commit()
            assert await list_call_history(session, caller.id, limit=100) == []
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_web_e2ee_keys_and_message_envelopes_support_multiple_devices() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        first_user, _, _ = await _create_user(session_factory, 'e2eealice', '301')
        second_user, _, _ = await _create_user(session_factory, 'e2eebob', '302')
        async with session_factory() as session:
            chat = await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
            first_key = await upsert_e2ee_web_key(
                session, first_user.id, 'web-device-alice-a', _public_key(1), _public_key(2), E2EE_WEB_ALGORITHM,
            )
            second_first_key = await upsert_e2ee_web_key(
                session, second_user.id, 'web-device-bob-a', _public_key(3), _public_key(4), E2EE_WEB_ALGORITHM,
            )
            second_device_key = await upsert_e2ee_web_key(
                session, second_user.id, 'web-device-bob-b', _public_key(5), _public_key(6), E2EE_WEB_ALGORITHM,
            )

            keys = await list_direct_chat_e2ee_keys(session, first_user.id, chat.id)
            assert {(key.user_id, key.device_id) for key in keys} == {
                (first_user.id, first_key.device_id),
                (second_user.id, second_first_key.device_id),
                (second_user.id, second_device_key.device_id),
            }

            encrypted_payload = _encrypted_envelope(first_user.id, first_key.device_id, keys)
            encrypted_message = await create_message(
                session,
                first_user.id,
                chat.id,
                MessageCreateRequest(text=encrypted_payload, encryption_state='e2ee_web_v1'),
            )
            assert encrypted_message.encryption_state == 'e2ee_web_v1'
            assert encrypted_message.payload == encrypted_payload

            preview = (await get_chat(session, second_user.id, chat.id)).last_message
            assert preview and preview.encryption_state == 'e2ee_web_v1'
            assert preview.payload == ''

            invalid_payload = json.loads(encrypted_payload)
            invalid_payload['recipients'].pop(f'{second_user.id}:{second_device_key.device_id}')
            with pytest.raises(AuthError, match='missing a recipient device'):
                await create_message(
                    session,
                    first_user.id,
                    chat.id,
                    MessageCreateRequest(text=json.dumps(invalid_payload), encryption_state='e2ee_web_v1'),
                )
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


@pytest.mark.anyio
async def test_private_branch_invites_access_roles_and_comments() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        owner, _, _ = await _create_user(session_factory, 'privateowner', '301')
        reader, _, _ = await _create_user(session_factory, 'privatereader', '302')
        outsider, _, _ = await _create_user(session_factory, 'privateoutsider', '303')

        async with session_factory() as session:
            branch, first_invite = await create_private_branch(
                session,
                owner.id,
                'Приватные новости',
                'Только для приглашённых',
                None,
            )
            assert branch.is_private
            assert branch.invite_token_hash != first_invite
            assert branch.id not in {item.id for item in await list_public_branches(session, owner.id)}

            post = await create_message(session, owner.id, branch.id, MessageCreateRequest(text='Закрытая публикация'))
            stored_object = StoredObject(
                owner_user_id=owner.id,
                message_id=post.id,
                storage_key=f'test-private-media/{uuid4()}',
                public_url='https://storage.example.test/private-media',
                purpose='message',
                status='attached_message',
                size_bytes=1,
            )
            session.add(stored_object)
            await session.commit()

            with pytest.raises(AuthError, match='Chat not found'):
                await get_chat(session, outsider.id, branch.id)
            with pytest.raises(AuthError, match='Chat not found'):
                await list_messages(session, outsider.id, branch.id)
            with pytest.raises(AuthError, match='Branch not found'):
                await list_branch_comments(session, outsider.id, branch.id, post.id)
            with pytest.raises(MediaAccessError, match='Media not found'):
                await get_private_media(session, outsider.id, stored_object.id)

            joined = await join_private_branch_by_invite(session, reader.id, first_invite)
            assert joined.id == branch.id
            assert (await get_chat(session, reader.id, branch.id)).current_role == 'member'
            comment, count = await create_branch_comment(session, reader.id, branch.id, post.id, 'Прочитано')
            assert count == 1

            disabled_post = await set_branch_post_comments_enabled(session, owner.id, branch.id, post.id, False)
            assert not disabled_post.comments_enabled
            assert [item.id for item in await list_branch_comments(session, reader.id, branch.id, post.id)] == [comment.id]
            with pytest.raises(AuthError, match='Comments are disabled'):
                await create_branch_comment(session, reader.id, branch.id, post.id, 'Ещё один комментарий')

            await revoke_private_branch_invite(session, owner.id, branch.id)
            with pytest.raises(AuthError, match='Invite link is invalid or revoked'):
                await join_private_branch_by_invite(session, outsider.id, first_invite)
            regenerated_invite = await generate_private_branch_invite(session, owner.id, branch.id)
            await join_private_branch_by_invite(session, outsider.id, regenerated_invite)

            with pytest.raises(AuthError, match='Transfer channel ownership before leaving'):
                await leave_private_branch(session, owner.id, branch.id)
            await update_private_branch_member(session, owner.id, branch.id, reader.id, 'owner')
            assert (await session.get(ChatParticipant, {'chat_id': branch.id, 'user_id': owner.id})).role == 'admin'
            assert (await session.get(ChatParticipant, {'chat_id': branch.id, 'user_id': reader.id})).role == 'owner'

            await update_private_branch_member(session, reader.id, branch.id, outsider.id, 'admin')
            with pytest.raises(AuthError, match='Administrators can remove members only'):
                await remove_private_branch_member(session, owner.id, branch.id, outsider.id)
            await update_private_branch_member(session, reader.id, branch.id, outsider.id, 'member')
            await remove_private_branch_member(session, owner.id, branch.id, outsider.id)
            with pytest.raises(AuthError, match='Chat not found'):
                await get_chat(session, outsider.id, branch.id)

            with pytest.raises(AuthError, match='Only the channel owner can delete this channel'):
                await delete_private_branch(session, owner.id, branch.id)
            participant_ids = await delete_private_branch(session, reader.id, branch.id)
            assert participant_ids == {owner.id, reader.id}
            assert await session.get(Chat, branch.id) is None
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_groups_are_private_manage_members_and_delete_registered_files(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    deleted_storage_keys: list[str] = []

    async def record_storage_delete(storage_key: str) -> None:
        deleted_storage_keys.append(storage_key)

    monkeypatch.setattr('app.services.group_service.delete_storage_object', record_storage_delete)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        owner, _, _ = await _create_user(session_factory, 'groupowner', '701')
        member, _, _ = await _create_user(session_factory, 'groupmember', '702')
        administrator, _, _ = await _create_user(session_factory, 'groupadmin', '703')
        outsider, _, _ = await _create_user(session_factory, 'groupoutsider', '704')

        async with session_factory() as session:
            group, created_message = await create_group(
                session,
                owner.id,
                'Команда продукта',
                'Закрытое обсуждение',
                None,
                [member.id],
            )
            assert group.type == 'group'
            assert group.is_private
            assert (await get_chat(session, owner.id, group.id)).current_role == 'owner'
            assert (await get_chat(session, member.id, group.id)).current_role == 'member'
            assert json.loads(created_message.payload)['action'] == 'group_created'
            with pytest.raises(AuthError, match='Chat not found'):
                await get_chat(session, outsider.id, group.id)
            with pytest.raises(AuthError, match='Chat not found'):
                await list_messages(session, outsider.id, group.id)

            _, added_message, _ = await add_group_member(session, owner.id, group.id, administrator.id)
            assert json.loads(added_message.payload)['action'] == 'member_added'
            role_message, _, _ = await update_group_member_role(
                session,
                owner.id,
                group.id,
                administrator.id,
                'admin',
            )
            assert role_message and json.loads(role_message.payload)['action'] == 'member_role_changed'
            invite = await generate_group_invite(session, administrator.id, group.id)
            joined_group, joined_message, joined = await join_group_by_invite(session, outsider.id, invite)
            assert joined and joined_message and joined_group.id == group.id
            assert json.loads(joined_message.payload)['action'] == 'member_joined'
            await revoke_group_invite(session, administrator.id, group.id)
            with pytest.raises(AuthError, match='Invite link is invalid or revoked'):
                await join_group_by_invite(session, outsider.id, invite)

            removed_message, remaining_ids, _ = await remove_group_member(session, administrator.id, group.id, outsider.id)
            assert owner.id in remaining_ids and outsider.id not in remaining_ids
            assert json.loads(removed_message.payload)['action'] == 'member_removed'
            with pytest.raises(AuthError, match='Chat not found'):
                await get_chat(session, outsider.id, group.id)

            with pytest.raises(AuthError, match='Transfer group ownership before leaving'):
                await leave_group(session, owner.id, group.id)
            transfer_message, _, _ = await transfer_group_ownership(session, owner.id, group.id, member.id)
            assert json.loads(transfer_message.payload)['action'] == 'ownership_transferred'
            assert (await get_chat(session, member.id, group.id)).current_role == 'owner'
            await leave_group(session, owner.id, group.id)
            assert (await session.get(ChatParticipant, {'chat_id': group.id, 'user_id': owner.id})) is None

            post = await create_message(session, member.id, group.id, MessageCreateRequest(text='Файл проекта'))
            stored_object = StoredObject(
                owner_user_id=member.id,
                message_id=post.id,
                storage_key=f'test-group-media/{uuid4()}',
                public_url='https://storage.example.test/group-media',
                purpose='message',
                status='attached_message',
                size_bytes=1,
            )
            session.add(stored_object)
            await session.commit()

            participant_ids = await delete_group(session, member.id, group.id)
            assert participant_ids == {member.id, administrator.id}
            assert deleted_storage_keys == [stored_object.storage_key]
            assert await session.get(Chat, group.id) is None
            assert await session.get(StoredObject, stored_object.id) is None
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_clearing_notifications_only_deletes_current_users_history() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        first_user, _, _ = await _create_user(session_factory, 'notificationfirst', '501')
        second_user, _, _ = await _create_user(session_factory, 'notificationsecond', '502')

        async with session_factory() as session:
            session.add_all([
                Notification(recipient_user_id=first_user.id, title='Первое уведомление', body='Для первого пользователя', url='/first'),
                Notification(recipient_user_id=second_user.id, title='Второе уведомление', body='Для второго пользователя', url='/second'),
            ])
            await session.commit()

            await clear_notifications(session, first_user.id)

            assert await list_notifications(session, first_user.id) == []
            assert [item.title for item in await list_notifications(session, second_user.id)] == ['Второе уведомление']
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_private_branch_muted_members_do_not_receive_post_notifications() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        owner, _, _ = await _create_user(session_factory, 'notifyowner', '401')
        member, _, _ = await _create_user(session_factory, 'notifymember', '402')

        async with session_factory() as session:
            branch, invite = await create_private_branch(session, owner.id, 'Уведомления', '', None)
            await join_private_branch_by_invite(session, member.id, invite)
            await update_branch_notifications(session, member.id, branch.id, False)

            muted_post = await create_message(session, owner.id, branch.id, MessageCreateRequest(text='Без уведомления'))
            await create_message_notifications(session, muted_post)
            assert await list_notifications(session, member.id) == []

            await update_branch_notifications(session, member.id, branch.id, True)
            notified_post = await create_message(session, owner.id, branch.id, MessageCreateRequest(text='С уведомлением'))
            await create_message_notifications(session, notified_post)
            notifications = await list_notifications(session, member.id)
            assert [notification.message_id for notification in notifications] == [notified_post.id]
    finally:
        await engine.dispose()
