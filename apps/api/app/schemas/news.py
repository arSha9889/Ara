from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


NewsLanguage = Literal['ru', 'en']
NewsStatus = Literal['draft', 'scheduled', 'published', 'archived']


class ProjectNewsTranslationIn(BaseModel):
    language: NewsLanguage
    title: str = Field(default='', max_length=180)
    excerpt: str = Field(default='', max_length=500)
    content: list[str] = Field(default_factory=list, max_length=100)

    @field_validator('title', 'excerpt')
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator('content')
    @classmethod
    def normalize_content(cls, value: list[str]) -> list[str]:
        paragraphs = [paragraph.strip() for paragraph in value if paragraph.strip()]
        if any(len(paragraph) > 4_000 for paragraph in paragraphs):
            raise ValueError('Each news paragraph must be at most 4000 characters')
        return paragraphs


class ProjectNewsCreateRequest(BaseModel):
    slug: str = Field(min_length=3, max_length=64, pattern=r'^[a-z0-9-]+$')
    translations: list[ProjectNewsTranslationIn] = Field(min_length=1, max_length=2)
    scheduled_at: datetime | None = None


class ProjectNewsUpdateRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=3, max_length=64, pattern=r'^[a-z0-9-]+$')
    translations: list[ProjectNewsTranslationIn] | None = Field(default=None, min_length=1, max_length=2)
    scheduled_at: datetime | None = None


class ProjectNewsTranslationOut(BaseModel):
    language: NewsLanguage
    title: str
    excerpt: str
    content: list[str]


class AdminProjectNewsOut(BaseModel):
    id: UUID
    slug: str
    status: NewsStatus
    scheduled_at: datetime | None
    published_at: datetime | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    translations: list[ProjectNewsTranslationOut]


class AdminProjectNewsListOut(BaseModel):
    news: list[AdminProjectNewsOut]


class PublicProjectNewsListItemOut(BaseModel):
    slug: str
    title: str
    excerpt: str
    published_at: datetime


class PublicProjectNewsOut(PublicProjectNewsListItemOut):
    content: list[str]
