from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = 'users'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    nexus_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    telegram_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default='active')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped['UserProfile'] = relationship(back_populates='user', cascade='all, delete-orphan')


class UserProfile(Base):
    __tablename__ = 'user_profiles'

    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    avatar_type: Mapped[str] = mapped_column(String(32), default='built_in')
    avatar_ref: Mapped[str] = mapped_column(String(64), default='animal-01')
    optional_phone: Mapped[str | None] = mapped_column(String(32))
    phone_public: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(8), default='ru')
    design_theme: Mapped[str] = mapped_column(String(32), default='halo')
    current_mode: Mapped[str] = mapped_column(String(32), default='regular')

    user: Mapped[User] = relationship(back_populates='profile')
