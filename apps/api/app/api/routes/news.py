from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.schemas.news import (
    AdminProjectNewsListOut,
    AdminProjectNewsOut,
    ProjectNewsCreateRequest,
    ProjectNewsUpdateRequest,
    PublicProjectNewsListItemOut,
    PublicProjectNewsOut,
)
from app.schemas.users import UserOut
from app.services.admin_service import AdminError
from app.services.project_news_service import (
    archive_project_news,
    create_project_news,
    get_public_project_news,
    list_admin_project_news,
    list_public_project_news,
    publish_project_news,
    update_project_news,
)

router = APIRouter()


@router.get('/admin/news', response_model=AdminProjectNewsListOut)
async def get_admin_news(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminProjectNewsListOut:
    try:
        return AdminProjectNewsListOut(news=await list_admin_project_news(session, current_user.id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post('/admin/news', response_model=AdminProjectNewsOut, status_code=status.HTTP_201_CREATED)
async def create_admin_news(
    request: ProjectNewsCreateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminProjectNewsOut:
    try:
        return AdminProjectNewsOut.model_validate(await create_project_news(session, current_user.id, request))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get('', response_model=list[PublicProjectNewsListItemOut])
async def get_public_news(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    language: str = Query(default='ru', max_length=8),
) -> list[PublicProjectNewsListItemOut]:
    return [PublicProjectNewsListItemOut.model_validate(item) for item in await list_public_project_news(session, language)]


@router.get('/{slug}', response_model=PublicProjectNewsOut)
async def get_public_news_article(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    language: str = Query(default='ru', max_length=8),
) -> PublicProjectNewsOut:
    article = await get_public_project_news(session, slug, language)
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='News article not found')
    return PublicProjectNewsOut.model_validate(article)


@router.patch('/admin/news/{news_id}', response_model=AdminProjectNewsOut)
async def update_admin_news(
    news_id: UUID,
    request: ProjectNewsUpdateRequest,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminProjectNewsOut:
    try:
        return AdminProjectNewsOut.model_validate(await update_project_news(session, current_user.id, news_id, request))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/admin/news/{news_id}/publish', response_model=AdminProjectNewsOut)
async def publish_admin_news(
    news_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminProjectNewsOut:
    try:
        return AdminProjectNewsOut.model_validate(await publish_project_news(session, current_user.id, news_id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/admin/news/{news_id}/archive', response_model=AdminProjectNewsOut)
async def archive_admin_news(
    news_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminProjectNewsOut:
    try:
        return AdminProjectNewsOut.model_validate(await archive_project_news(session, current_user.id, news_id))
    except AdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
