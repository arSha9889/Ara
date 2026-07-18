from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PhoneVerification(Base):
    __tablename__ = 'phone_verifications'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    phone_country: Mapped[str] = mapped_column(String(2))
    phone: Mapped[str] = mapped_column(String(32))
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    telegram_user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), index=True)
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    code_hash: Mapped[str | None] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(32), default='pending', index=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
