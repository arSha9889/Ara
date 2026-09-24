from datetime import datetime, timezone
import re
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.news import ProjectNews, ProjectNewsTranslation
from app.schemas.news import ProjectNewsCreateRequest, ProjectNewsUpdateRequest
from app.services.admin_service import AdminError, record_admin_audit, require_admin


NEWS_EDITABLE_STATUSES = {'draft', 'scheduled'}
NEWS_LANGUAGES = {'ru', 'en'}
SLUG_PATTERN = re.compile(r'^[a-z0-9-]{3,64}$')


async def list_admin_project_news(session: AsyncSession, admin_user_id: UUID) -> list[dict]:
    await require_admin(session, admin_user_id)
    news = list((await session.execute(
        select(ProjectNews).order_by(ProjectNews.created_at.desc()).limit(100)
    )).scalars())
    return await _news_out_many(session, news)


async def create_project_news(
    session: AsyncSession,
    admin_user_id: UUID,
    request: ProjectNewsCreateRequest,
) -> dict:
    await require_admin(session, admin_user_id)
    _validate_translations(request.translations)
    _validate_schedule(request.scheduled_at)
    if request.scheduled_at:
        _validate_publishable(request.translations)
    await _ensure_slug_available(session, request.slug)

    news = ProjectNews(
        author_user_id=admin_user_id,
        slug=request.slug,
        status='scheduled' if request.scheduled_at else 'draft',
        scheduled_at=request.scheduled_at,
    )
    session.add(news)
    await session.flush()
    await _replace_translations(session, news.id, request.translations)
    record_admin_audit(
        session,
        admin_user_id,
        'project_news.scheduled' if request.scheduled_at else 'project_news.drafted',
        'project_news',
        str(news.id),
        metadata={'slug': news.slug, 'scheduled_at': request.scheduled_at.isoformat() if request.scheduled_at else None},
    )
    await session.commit()
    await session.refresh(news)
    return await _news_out(session, news)


async def update_project_news(
    session: AsyncSession,
    admin_user_id: UUID,
    news_id: UUID,
    request: ProjectNewsUpdateRequest,
) -> dict:
    await require_admin(session, admin_user_id)
    news = await _get_editable_news(session, news_id)
    updates = request.model_fields_set
    next_scheduled_at = request.scheduled_at if 'scheduled_at' in updates else news.scheduled_at
    next_translations = request.translations if 'translations' in updates and request.translations is not None else await _news_translations(session, news.id)

    if request.translations is not None:
        _validate_translations(request.translations)
    if 'scheduled_at' in updates:
        _validate_schedule(request.scheduled_at)
    if next_scheduled_at:
        _validate_publishable(next_translations)

    if 'slug' in updates and request.slug is not None and request.slug != news.slug:
        await _ensure_slug_available(session, request.slug, exclude_news_id=news.id)
        news.slug = request.slug
    if 'translations' in updates and request.translations is not None:
        await _replace_translations(session, news.id, request.translations)
    if 'scheduled_at' in updates:
        news.scheduled_at = request.scheduled_at
        news.status = 'scheduled' if request.scheduled_at else 'draft'

    record_admin_audit(session, admin_user_id, 'project_news.updated', 'project_news', str(news.id), {'slug': news.slug})
    await session.commit()
    await session.refresh(news)
    return await _news_out(session, news)


async def publish_project_news(session: AsyncSession, admin_user_id: UUID, news_id: UUID) -> dict:
    await require_admin(session, admin_user_id)
    news = await _get_editable_news(session, news_id)
    translations = await _news_translations(session, news.id)
    _validate_publishable(translations)

    news.status = 'published'
    news.scheduled_at = None
    news.published_at = datetime.now(timezone.utc)
    record_admin_audit(session, admin_user_id, 'project_news.published', 'project_news', str(news.id), {'slug': news.slug})
    await session.commit()
    await session.refresh(news)
    return await _news_out(session, news)


async def archive_project_news(session: AsyncSession, admin_user_id: UUID, news_id: UUID) -> dict:
    await require_admin(session, admin_user_id)
    news = (await session.execute(
        select(ProjectNews).where(ProjectNews.id == news_id).with_for_update()
    )).scalar_one_or_none()
    if not news:
        raise AdminError('News article not found')
    if news.status == 'archived':
        return await _news_out(session, news)

    news.status = 'archived'
    news.scheduled_at = None
    news.archived_at = datetime.now(timezone.utc)
    record_admin_audit(session, admin_user_id, 'project_news.archived', 'project_news', str(news.id), {'slug': news.slug})
    await session.commit()
    await session.refresh(news)
    return await _news_out(session, news)


async def publish_due_project_news(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    published = 0
    while news_id := (await session.execute(
        select(ProjectNews.id)
        .where(ProjectNews.status == 'scheduled', ProjectNews.scheduled_at <= now)
        .order_by(ProjectNews.scheduled_at.asc().nullsfirst())
        .limit(1)
        .with_for_update(skip_locked=True)
    )).scalar_one_or_none():
        news = (await session.execute(
            select(ProjectNews).where(ProjectNews.id == news_id).with_for_update()
        )).scalar_one()
        translations = await _news_translations(session, news.id)
        try:
            _validate_publishable(translations)
        except AdminError:
            news.status = 'draft'
            news.scheduled_at = None
            record_admin_audit(
                session,
                None,
                'project_news.schedule_cancelled_invalid_content',
                'project_news',
                str(news.id),
                {'slug': news.slug},
                actor_type='system',
            )
            await session.commit()
            continue
        news.status = 'published'
        news.scheduled_at = None
        news.published_at = now
        record_admin_audit(
            session,
            None,
            'project_news.published_scheduled',
            'project_news',
            str(news.id),
            {'slug': news.slug},
            actor_type='system',
        )
        await session.commit()
        published += 1
    return published


async def list_public_project_news(session: AsyncSession, language: str) -> list[dict]:
    news = list((await session.execute(
        select(ProjectNews)
        .where(ProjectNews.status == 'published', ProjectNews.published_at.is_not(None))
        .order_by(ProjectNews.published_at.desc())
        .limit(100)
    )).scalars())
    result = []
    for item in news:
        translation = _select_translation(await _news_translations(session, item.id), language)
        if translation:
            result.append({
                'slug': item.slug,
                'title': translation.title,
                'excerpt': translation.excerpt,
                'published_at': item.published_at,
            })
    return result


async def get_public_project_news(session: AsyncSession, slug: str, language: str) -> dict | None:
    news = (await session.execute(
        select(ProjectNews).where(
            ProjectNews.slug == slug,
            ProjectNews.status == 'published',
            ProjectNews.published_at.is_not(None),
        )
    )).scalar_one_or_none()
    if not news:
        return None
    translation = _select_translation(await _news_translations(session, news.id), language)
    if not translation:
        return None
    return {
        'slug': news.slug,
        'title': translation.title,
        'excerpt': translation.excerpt,
        'content': translation.content,
        'published_at': news.published_at,
    }


async def _get_editable_news(session: AsyncSession, news_id: UUID) -> ProjectNews:
    news = (await session.execute(
        select(ProjectNews).where(ProjectNews.id == news_id).with_for_update()
    )).scalar_one_or_none()
    if not news:
        raise AdminError('News article not found')
    if news.status not in NEWS_EDITABLE_STATUSES:
        raise AdminError('Published or archived news cannot be changed')
    return news


async def _ensure_slug_available(session: AsyncSession, slug: str, exclude_news_id: UUID | None = None) -> None:
    if not SLUG_PATTERN.fullmatch(slug):
        raise AdminError('News address must contain lowercase Latin letters, numbers, and hyphens only')
    statement = select(ProjectNews.id).where(ProjectNews.slug == slug)
    if exclude_news_id:
        statement = statement.where(ProjectNews.id != exclude_news_id)
    if (await session.execute(statement)).scalar_one_or_none():
        raise AdminError('News address is already in use')


def _validate_translations(translations: list) -> None:
    languages = [item.language for item in translations]
    if len(languages) != len(set(languages)):
        raise AdminError('Each news language can only be added once')
    if not set(languages).issubset(NEWS_LANGUAGES):
        raise AdminError('Unsupported news language')


def _validate_schedule(scheduled_at: datetime | None) -> None:
    if scheduled_at and scheduled_at.tzinfo is None:
        raise AdminError('Publication time must include a time zone')
    if scheduled_at and scheduled_at <= datetime.now(timezone.utc):
        raise AdminError('Publication time must be in the future')


def _validate_publishable(translations: list[ProjectNewsTranslation]) -> None:
    by_language = {item.language: item for item in translations}
    for language in NEWS_LANGUAGES:
        translation = by_language.get(language)
        if not translation or not translation.title or not translation.excerpt or not translation.content:
            raise AdminError('Russian and English news texts must be complete before publication')


async def _replace_translations(session: AsyncSession, news_id: UUID, translations: list) -> None:
    # The article row is locked by the caller when the article already exists.
    # Replacing the small fixed language set avoids stale translations and duplicate rows.
    await session.execute(delete(ProjectNewsTranslation).where(ProjectNewsTranslation.news_id == news_id))
    for translation in translations:
        session.add(ProjectNewsTranslation(
            news_id=news_id,
            language=translation.language,
            title=translation.title,
            excerpt=translation.excerpt,
            content=translation.content,
        ))


async def _news_translations(session: AsyncSession, news_id: UUID) -> list[ProjectNewsTranslation]:
    return list((await session.execute(
        select(ProjectNewsTranslation)
        .where(ProjectNewsTranslation.news_id == news_id)
        .order_by(ProjectNewsTranslation.language.asc())
    )).scalars())


async def _news_out_many(session: AsyncSession, news: list[ProjectNews]) -> list[dict]:
    return [await _news_out(session, item) for item in news]


async def _news_out(session: AsyncSession, news: ProjectNews) -> dict:
    translations = await _news_translations(session, news.id)
    return {
        'id': str(news.id),
        'slug': news.slug,
        'status': news.status,
        'scheduled_at': news.scheduled_at,
        'published_at': news.published_at,
        'archived_at': news.archived_at,
        'created_at': news.created_at,
        'updated_at': news.updated_at,
        'translations': [
            {
                'language': item.language,
                'title': item.title,
                'excerpt': item.excerpt,
                'content': item.content,
            }
            for item in translations
        ],
    }


def _select_translation(translations: list[ProjectNewsTranslation], language: str) -> ProjectNewsTranslation | None:
    by_language = {item.language: item for item in translations}
    return by_language.get(language) or by_language.get('ru')
