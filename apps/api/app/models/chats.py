from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Chat(Base):
    __tablename__ = 'chats'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    type: Mapped[str] = mapped_column(String(32), default='direct')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_id: Mapped[UUID | None] = mapped_column(index=True)
    pinned_message_id: Mapped[UUID | None] = mapped_column(index=True)


class ChatParticipant(Base):
    __tablename__ = 'chat_participants'

    chat_id: Mapped[UUID] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), default='member')
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_read_message_id: Mapped[UUID | None] = mapped_column(index=True)


class Message(Base):
    __tablename__ = 'messages'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    chat_id: Mapped[UUID] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    sender_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    type: Mapped[str] = mapped_column(String(32), default='text')
    payload: Mapped[str] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(Text)
    media_name: Mapped[str | None] = mapped_column(String(255))
    media_mime_type: Mapped[str | None] = mapped_column(String(128))
    media_size_bytes: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    encryption_state: Mapped[str] = mapped_column(String(32), default='plain_web_core')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageReaction(Base):
    __tablename__ = 'message_reactions'
    __table_args__ = (UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_message_reactions_message_user_emoji'),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    message_id: Mapped[UUID] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    emoji: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MessageReceipt(Base):
    __tablename__ = 'message_receipts'
    __table_args__ = (UniqueConstraint('message_id', 'user_id', name='uq_message_receipts_message_user'),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    message_id: Mapped[UUID] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    status: Mapped[str] = mapped_column(String(32), default='sent')
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushSubscription(Base):
    __tablename__ = 'push_subscriptions'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    expiration_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Notification(Base):
    __tablename__ = 'notifications'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    recipient_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    chat_id: Mapped[UUID | None] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(240))
    url: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
