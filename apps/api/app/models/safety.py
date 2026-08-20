from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserBlock(Base):
    __tablename__ = 'user_blocks'
    __table_args__ = (
        UniqueConstraint('blocker_user_id', 'blocked_user_id', name='uq_user_blocks_blocker_blocked'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    blocker_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    blocked_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentReport(Base):
    __tablename__ = 'content_reports'
    __table_args__ = (
        UniqueConstraint('reporter_user_id', 'target_type', 'target_id', name='uq_content_reports_reporter_target'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    reporter_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    target_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), index=True)
    target_type: Mapped[str] = mapped_column(String(16), index=True)
    target_id: Mapped[str] = mapped_column(String(128))
    reason: Mapped[str] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default='open', index=True)
    moderator_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
