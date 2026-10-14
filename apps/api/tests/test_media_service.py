from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.main import create_app
from app.models.chats import Chat, ChatParticipant, Message
from app.models.safety import UserBlock
from app.models.storage import StoredObject
from app.models.support import SupportMessage, SupportTicket
from app.models.users import User, UserProfile
from app.services.auth_service import AuthError
from app.services.media_service import MediaAccessError, get_private_media, get_public_avatar
from app.services.storage_service import E2EE_ATTACHMENT_FILENAME, E2EE_ATTACHMENT_MIME_TYPE, E2EE_ATTACHMENT_PURPOSE
from app.services.stored_object_service import attach_upload_to_message


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


def _stored_object(
    *,
    owner_user_id: UUID,
    storage_name: str,
    purpose: str,
    status: str,
    message_id: UUID | None = None,
    support_message_id: UUID | None = None,
) -> StoredObject:
    return StoredObject(
        owner_user_id=owner_user_id,
        storage_key=f'/storage/uploads/{owner_user_id}/{storage_name}',
        public_url=f'/api/media/{uuid4()}',
        purpose=purpose,
        status=status,
        size_bytes=1,
        message_id=message_id,
        support_message_id=support_message_id,
    )


@pytest.mark.anyio
async def test_message_attachment_is_available_only_to_chat_participants(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            sender = _add_user(session, number=1, username='sender')
            participant = _add_user(session, number=2, username='participant')
            outsider = _add_user(session, number=3, username='outsider')
            chat = Chat(type='direct')
            session.add(chat)
            await session.flush()
            session.add_all([
                ChatParticipant(chat_id=chat.id, user_id=sender.id),
                ChatParticipant(chat_id=chat.id, user_id=participant.id),
            ])
            message = Message(chat_id=chat.id, sender_id=sender.id, type='photo', payload='', media_url='legacy-url')
            session.add(message)
            await session.flush()
            stored_object = _stored_object(
                owner_user_id=sender.id,
                storage_name='message.png',
                purpose='message',
                status='attached_message',
                message_id=message.id,
            )
            session.add(stored_object)
            await session.commit()

            assert (await get_private_media(session, sender.id, stored_object.id)).stored_object.id == stored_object.id
            assert (await get_private_media(session, participant.id, stored_object.id)).stored_object.id == stored_object.id
            with pytest.raises(MediaAccessError):
                await get_private_media(session, outsider.id, stored_object.id)

            session.add(UserBlock(blocker_user_id=sender.id, blocked_user_id=participant.id))
            await session.flush()
            with pytest.raises(MediaAccessError):
                await get_private_media(session, participant.id, stored_object.id)
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_e2ee_attachment_uses_neutral_delivery_metadata(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            sender = _add_user(session, number=1, username='sender')
            participant = _add_user(session, number=2, username='participant')
            chat = Chat(type='direct')
            session.add(chat)
            await session.flush()
            session.add_all([
                ChatParticipant(chat_id=chat.id, user_id=sender.id),
                ChatParticipant(chat_id=chat.id, user_id=participant.id),
            ])
            message = Message(
                chat_id=chat.id,
                sender_id=sender.id,
                type='file',
                payload='encrypted-envelope',
                encryption_state='e2ee_web_v1',
            )
            session.add(message)
            await session.flush()
            stored_object = _stored_object(
                owner_user_id=sender.id,
                storage_name='attachment.arachat',
                purpose=E2EE_ATTACHMENT_PURPOSE,
                status='attached_message',
                message_id=message.id,
            )
            session.add(stored_object)
            await session.commit()

            media = await get_private_media(session, participant.id, stored_object.id)
            assert media.mime_type == E2EE_ATTACHMENT_MIME_TYPE
            assert media.filename == E2EE_ATTACHMENT_FILENAME
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_e2ee_attachment_cannot_attach_a_regular_or_external_upload(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            sender = _add_user(session, number=1, username='sender')
            participant = _add_user(session, number=2, username='participant')
            chat = Chat(type='direct')
            session.add(chat)
            await session.flush()
            session.add_all([
                ChatParticipant(chat_id=chat.id, user_id=sender.id),
                ChatParticipant(chat_id=chat.id, user_id=participant.id),
            ])
            message = Message(
                chat_id=chat.id,
                sender_id=sender.id,
                type='file',
                payload='encrypted-envelope',
                encryption_state='e2ee_web_v1',
            )
            regular_upload = _stored_object(
                owner_user_id=sender.id,
                storage_name='regular.pdf',
                purpose='message',
                status='pending',
            )
            e2ee_upload = _stored_object(
                owner_user_id=sender.id,
                storage_name='attachment.arachat',
                purpose=E2EE_ATTACHMENT_PURPOSE,
                status='pending',
            )
            session.add_all([message, regular_upload, e2ee_upload])
            await session.flush()

            with pytest.raises(AuthError, match='Uploaded file is not available'):
                await attach_upload_to_message(
                    session,
                    sender.id,
                    message.id,
                    regular_upload.public_url,
                    required_purpose=E2EE_ATTACHMENT_PURPOSE,
                    require_registered_upload=True,
                )
            with pytest.raises(AuthError, match='Encrypted attachment upload is not available'):
                await attach_upload_to_message(
                    session,
                    sender.id,
                    message.id,
                    '/api/media/00000000-0000-0000-0000-000000000001',
                    required_purpose=E2EE_ATTACHMENT_PURPOSE,
                    require_registered_upload=True,
                )

            await attach_upload_to_message(
                session,
                sender.id,
                message.id,
                e2ee_upload.public_url,
                required_purpose=E2EE_ATTACHMENT_PURPOSE,
                require_registered_upload=True,
            )
            assert e2ee_upload.status == 'attached_message'
            assert e2ee_upload.message_id == message.id
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_support_attachment_allows_requester_and_admin_but_hides_internal_note(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    monkeypatch.setattr(settings, 'admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_user(session, number=1, username='admin', phone='+79990000001')
            requester = _add_user(session, number=2, username='requester')
            outsider = _add_user(session, number=3, username='outsider')
            ticket = SupportTicket(number=1, requester_user_id=requester.id, category='bug', subject='Attachment access')
            session.add(ticket)
            await session.flush()
            message = SupportMessage(
                ticket_id=ticket.id,
                author_user_id=requester.id,
                text='See attachment',
                attachment_url='legacy-url',
                attachment_name='report.txt',
                attachment_mime_type='text/plain',
                attachment_size_bytes=1,
                is_internal=False,
            )
            session.add(message)
            await session.flush()
            stored_object = _stored_object(
                owner_user_id=requester.id,
                storage_name='report.txt',
                purpose='support',
                status='attached_support_message',
                support_message_id=message.id,
            )
            session.add(stored_object)
            await session.commit()

            assert (await get_private_media(session, requester.id, stored_object.id)).stored_object.id == stored_object.id
            assert (await get_private_media(session, admin.id, stored_object.id)).stored_object.id == stored_object.id
            with pytest.raises(MediaAccessError):
                await get_private_media(session, outsider.id, stored_object.id)

            message.is_internal = True
            await session.flush()
            with pytest.raises(MediaAccessError):
                await get_private_media(session, requester.id, stored_object.id)
            assert (await get_private_media(session, admin.id, stored_object.id)).stored_object.id == stored_object.id
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_only_attached_uploaded_avatars_are_public(anyio_backend) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            user = _add_user(session, number=1, username='owner')
            attached_avatar = _stored_object(
                owner_user_id=user.id,
                storage_name='avatar.png',
                purpose='avatar',
                status='attached_avatar',
            )
            pending_avatar = _stored_object(
                owner_user_id=user.id,
                storage_name='pending.png',
                purpose='avatar',
                status='pending',
            )
            session.add_all([attached_avatar, pending_avatar])
            await session.commit()

            assert (await get_public_avatar(session, attached_avatar.id)).stored_object.id == attached_avatar.id
            with pytest.raises(MediaAccessError):
                await get_public_avatar(session, pending_avatar.id)
    finally:
        await engine.dispose()


def test_api_has_no_public_local_storage_mount() -> None:
    paths = {route.path for route in create_app().routes}
    assert settings.storage_public_url_prefix not in paths
    assert '/api/media/{object_id}' in paths
