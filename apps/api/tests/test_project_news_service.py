from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401
from app.db.base import Base
from app.models.chats import Chat, Message, Notification
from app.models.news import ProjectNews, ProjectNewsTranslation
from app.models.users import User, UserProfile
from app.schemas.news import ProjectNewsCreateRequest, ProjectNewsUpdateRequest
from app.services.admin_service import AdminError
from app.services.project_news_service import (
    create_project_news,
    list_public_project_news,
    publish_due_project_news,
    publish_project_news,
    update_project_news,
)


async def _make_session_factory():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, session_factory


def _add_admin(session) -> User:
    admin = User(
        id=uuid4(),
        nexus_id='0000000000000001',
        telegram_id='telegram-admin',
        status='active',
    )
    session.add_all([
        admin,
        UserProfile(
            user_id=admin.id,
            display_name='Administrator',
            username='admin',
            optional_phone='+79990000001',
            registration_country='RU',
        ),
    ])
    return admin


def _translations(*, ru_title: str = 'Русский заголовок', en_title: str = 'English headline') -> list[dict]:
    return [
        {
            'language': 'ru',
            'title': ru_title,
            'excerpt': 'Краткое описание на русском.',
            'content': ['Первый русский абзац.', 'Второй русский абзац.'],
        },
        {
            'language': 'en',
            'title': en_title,
            'excerpt': 'Short English summary.',
            'content': ['First English paragraph.', 'Second English paragraph.'],
        },
    ]


@pytest.mark.anyio
async def test_project_news_publish_is_public_only_without_chat_or_notifications(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_admin(session)
            await session.commit()

            created = await create_project_news(
                session,
                admin.id,
                ProjectNewsCreateRequest(slug='public-release', translations=_translations()),
            )
            published = await publish_project_news(session, admin.id, UUID(created['id']))

            assert published['status'] == 'published'
            assert (await list_public_project_news(session, 'en')) == [
                {
                    'slug': 'public-release',
                    'title': 'English headline',
                    'excerpt': 'Short English summary.',
                    'published_at': published['published_at'],
                },
            ]
            assert not list((await session.execute(select(Chat))).scalars())
            assert not list((await session.execute(select(Message))).scalars())
            assert not list((await session.execute(select(Notification))).scalars())
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_scheduled_project_news_requires_complete_versions_and_publishes_once(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_admin(session)
            await session.commit()
            scheduled_at = datetime.now(timezone.utc) + timedelta(hours=1)

            with pytest.raises(AdminError, match='Russian and English'):
                await create_project_news(
                    session,
                    admin.id,
                    ProjectNewsCreateRequest(
                        slug='incomplete-release',
                        scheduled_at=scheduled_at,
                        translations=_translations()[:1],
                    ),
                )

            created = await create_project_news(
                session,
                admin.id,
                ProjectNewsCreateRequest(
                    slug='scheduled-release',
                    scheduled_at=scheduled_at,
                    translations=_translations(),
                ),
            )
            article = await session.get(ProjectNews, UUID(created['id']))
            article.scheduled_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            await session.commit()

            assert await publish_due_project_news(session) == 1
            assert await publish_due_project_news(session) == 0
            assert (await session.get(ProjectNews, UUID(created['id']))).status == 'published'
            assert not list((await session.execute(select(Message))).scalars())
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_project_news_update_replaces_translations_without_duplicates(anyio_backend, monkeypatch) -> None:
    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    monkeypatch.setattr('app.services.admin_service.settings.admin_phone', '+79990000001')
    engine, session_factory = await _make_session_factory()

    try:
        async with session_factory() as session:
            admin = _add_admin(session)
            await session.commit()
            created = await create_project_news(
                session,
                admin.id,
                ProjectNewsCreateRequest(slug='editable-release', translations=_translations()),
            )

            updated = await update_project_news(
                session,
                admin.id,
                UUID(created['id']),
                ProjectNewsUpdateRequest(translations=_translations(ru_title='Обновлённый заголовок')),
            )

            translations = list((await session.execute(
                select(ProjectNewsTranslation).where(ProjectNewsTranslation.news_id == UUID(created['id']))
            )).scalars())
            assert len(translations) == 2
            assert next(item for item in updated['translations'] if item['language'] == 'ru')['title'] == 'Обновлённый заголовок'
    finally:
        await engine.dispose()
