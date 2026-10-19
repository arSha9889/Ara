from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoredObject(Base):
    __tablename__ = 'stored_objects'
    __table_args__ = (Index('ix_stored_objects_status_delete_after', 'status', 'delete_after'),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    chat_id: Mapped[UUID | None] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    support_message_id: Mapped[UUID | None] = mapped_column(ForeignKey('support_messages.id', ondelete='CASCADE'), index=True)
    storage_key: Mapped[str] = mapped_column(String(1024), unique=True)
    public_url: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(String(32), default='message')
    status: Mapped[str] = mapped_column(String(32), default='pending', index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    attached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
