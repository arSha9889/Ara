from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
JSON_TYPE = JSON().with_variant(JSONB(), 'postgresql')


class TelegramRecoveryRequest(Base):
    __tablename__ = 'telegram_recovery_requests'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    nexus_id: Mapped[str] = mapped_column(String(16), index=True)
    telegram_user_id: Mapped[str] = mapped_column(String(64), index=True)
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default='pending')
    admin_id: Mapped[UUID | None] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    audit_metadata: Mapped[dict | None] = mapped_column(JSON_TYPE)


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(index=True)
    actor_type: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(96), index=True)
    target_type: Mapped[str | None] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(128))
    metadata_json: Mapped[dict | None] = mapped_column('metadata', JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
