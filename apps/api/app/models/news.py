from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

JSON_TYPE = JSON().with_variant(JSONB(), 'postgresql')


class ProjectNews(Base):
    __tablename__ = 'project_news'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    author_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default='draft', index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProjectNewsTranslation(Base):
    __tablename__ = 'project_news_translations'
    __table_args__ = (
        UniqueConstraint('news_id', 'language', name='uq_project_news_translations_news_language'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    news_id: Mapped[UUID] = mapped_column(ForeignKey('project_news.id', ondelete='CASCADE'), index=True)
    language: Mapped[str] = mapped_column(String(8))
    title: Mapped[str] = mapped_column(String(180))
    excerpt: Mapped[str] = mapped_column(String(500))
    content: Mapped[list[str]] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
