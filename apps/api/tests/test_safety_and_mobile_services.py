import os
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.chats import MobilePushToken, Notification
from app.models.safety import ContentReport, UserBlock
from app.models.users import User, UserProfile
from app.schemas.chats import MessageCreateRequest, MobilePushTokenRegisterRequest
from app.schemas.safety import ContentReportCreateRequest
from app.services.auth_service import AuthError
from app.services.chat_service import create_message, create_or_get_direct_chat_for_user, list_chats, list_messages
from app.services.notification_service import create_message_notifications, deactivate_mobile_push_tokens, save_mobile_push_token
from app.services.safety_service import block_user, create_content_report


DATABASE_URL = os.getenv('NEXUS_TEST_DATABASE_URL')


pytestmark = pytest.mark.skipif(not DATABASE_URL, reason='NEXUS_TEST_DATABASE_URL is required')


@pytest.fixture
def anyio_backend() -> str:
    return 'asyncio'


async def _prepare_database(engine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


async def _create_user(session, marker: str) -> User:
    user = User(nexus_id=f'{int(marker):016d}')
    session.add(user)
    await session.flush()
    session.add(UserProfile(
        user_id=user.id,
        display_name=f'User {marker}',
        username=f'user{marker}',
        avatar_type='built_in',
        avatar_ref='animal-01',
        language='ru',
        design_theme='halo',
        current_mode='regular',
    ))
    await session.commit()
    return user


def _mobile_request(
    device_id: str,
    token: str,
    provider: str = 'fcm',
) -> MobilePushTokenRegisterRequest:
    return MobilePushTokenRegisterRequest(
        device_id=device_id,
        provider=provider,
        package_name='arachat.messenger',
        app_version='1.0.0',
        token=token,
    )


@pytest.mark.anyio
async def test_mobile_push_token_moves_to_current_user_and_deactivates() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        async with session_factory() as session:
            first_user = await _create_user(session, '101')
            second_user = await _create_user(session, '102')
            device_id = f'device-{uuid4()}'
            first_token = f'token-{uuid4()}-first'
            second_token = f'token-{uuid4()}-second'

            await save_mobile_push_token(session, first_user.id, _mobile_request(device_id, first_token))
            moved = await save_mobile_push_token(session, second_user.id, _mobile_request(device_id, first_token))
            assert moved.user_id == second_user.id

            refreshed = await save_mobile_push_token(session, second_user.id, _mobile_request(device_id, second_token))
            assert refreshed.id == moved.id
            assert refreshed.token == second_token

            tokens = list((await session.execute(select(MobilePushToken))).scalars())
            assert len(tokens) == 1
            assert tokens[0].user_id == second_user.id

            await deactivate_mobile_push_tokens(session, second_user.id, device_id, 'fcm')
            assert not (await session.get(MobilePushToken, refreshed.id)).is_active
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_mobile_push_token_registration_deactivates_the_other_provider_for_one_device() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        async with session_factory() as session:
            user = await _create_user(session, '103')
            device_id = f'device-{uuid4()}'
            await save_mobile_push_token(
                session,
                user.id,
                _mobile_request(device_id, f'rustore-{uuid4()}', provider='rustore'),
            )
            await save_mobile_push_token(
                session,
                user.id,
                _mobile_request(device_id, f'fcm-{uuid4()}', provider='fcm'),
            )

            tokens = list((await session.execute(select(MobilePushToken))).scalars())
            assert {token.provider for token in tokens} == {'rustore', 'fcm'}
            assert {
                token.provider
                for token in tokens
                if token.is_active
            } == {'fcm'}
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_block_closes_existing_direct_interaction_and_clears_notifications() -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        try:
            await _prepare_database(engine)
        except (OSError, OperationalError) as exc:
            pytest.skip(f'database is not available: {exc}')

        async with session_factory() as session:
            first_user = await _create_user(session, '201')
            second_user = await _create_user(session, '202')
            chat = await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
            message = await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Привет'))
            await create_message_notifications(session, message)
            assert len(list((await session.execute(select(Notification))).scalars())) == 1

            report = await create_content_report(
                session,
                second_user.id,
                ContentReportCreateRequest(target_type='message', target_id=message.id, reason='spam'),
            )
            assert report.target_id == message.id
            assert len(list((await session.execute(select(ContentReport))).scalars())) == 1

            await block_user(session, second_user.id, first_user.id)

            assert len(list((await session.execute(select(UserBlock))).scalars())) == 1
            assert list((await session.execute(select(Notification))).scalars()) == []
            assert await list_chats(session, first_user.id) == []
            assert await list_chats(session, second_user.id) == []
            with pytest.raises(AuthError, match='This interaction is unavailable'):
                await list_messages(session, first_user.id, chat.id)
            with pytest.raises(AuthError, match='This interaction is unavailable'):
                await create_message(session, first_user.id, chat.id, MessageCreateRequest(text='Обход блокировки'))
            with pytest.raises(AuthError, match='This interaction is unavailable'):
                await create_or_get_direct_chat_for_user(session, first_user.id, second_user.id)
    finally:
        await engine.dispose()
