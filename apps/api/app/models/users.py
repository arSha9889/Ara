from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
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
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_version: Mapped[str | None] = mapped_column(String(32))
    privacy_policy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_policy_version: Mapped[str | None] = mapped_column(String(32))
    vpn_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    profile: Mapped['UserProfile'] = relationship(back_populates='user', cascade='all, delete-orphan')


class UserRestriction(Base):
    __tablename__ = 'user_restrictions'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    admin_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    lifted_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), index=True)


class UserProfile(Base):
    __tablename__ = 'user_profiles'

    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    avatar_type: Mapped[str] = mapped_column(String(32), default='built_in')
    avatar_ref: Mapped[str] = mapped_column(String(255), default='animal-01')
    optional_phone: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_country: Mapped[str | None] = mapped_column(String(8), index=True)
    phone_public: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(8), default='ru')
    design_theme: Mapped[str] = mapped_column(String(32), default='halo')
    current_mode: Mapped[str] = mapped_column(String(32), default='regular')

    user: Mapped[User] = relationship(back_populates='profile')
