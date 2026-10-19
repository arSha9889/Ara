from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Chat(Base):
    __tablename__ = 'chats'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    type: Mapped[str] = mapped_column(String(32), default='direct')
    title: Mapped[str | None] = mapped_column(String(120))
    slug: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500))
    avatar_ref: Mapped[str | None] = mapped_column(String(255))
    is_official: Mapped[bool] = mapped_column(default=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    is_archived: Mapped[bool] = mapped_column(default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class ChatPreference(Base):
    __tablename__ = 'chat_preferences'

    chat_id: Mapped[UUID] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    wallpaper_id: Mapped[str] = mapped_column(String(32), default='default')
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Message(Base):
    __tablename__ = 'messages'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    chat_id: Mapped[UUID] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    sender_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    reply_to_message_id: Mapped[UUID | None] = mapped_column(ForeignKey('messages.id', ondelete='SET NULL'), index=True)
    type: Mapped[str] = mapped_column(String(32), default='text')
    payload: Mapped[str] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(Text)
    media_name: Mapped[str | None] = mapped_column(String(255))
    media_mime_type: Mapped[str | None] = mapped_column(String(128))
    media_size_bytes: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    encryption_state: Mapped[str] = mapped_column(String(32), default='plain_web_core')
    comments_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
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


class BranchComment(Base):
    __tablename__ = 'branch_comments'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    branch_id: Mapped[UUID] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    post_id: Mapped[UUID] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    author_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushSubscription(Base):
    __tablename__ = 'push_subscriptions'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    device_id: Mapped[str | None] = mapped_column(String(128), index=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    expiration_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MobilePushToken(Base):
    __tablename__ = 'mobile_push_tokens'
    __table_args__ = (
        UniqueConstraint('user_id', 'device_id', 'provider', name='uq_mobile_push_tokens_user_device_provider'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    platform: Mapped[str] = mapped_column(String(16), default='android')
    provider: Mapped[str] = mapped_column(String(32))
    package_name: Mapped[str] = mapped_column(String(255))
    app_version: Mapped[str | None] = mapped_column(String(64))
    token: Mapped[str] = mapped_column(Text, unique=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Notification(Base):
    __tablename__ = 'notifications'
    __table_args__ = (
        UniqueConstraint('announcement_id', 'recipient_user_id', name='uq_notifications_announcement_recipient'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    recipient_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    chat_id: Mapped[UUID | None] = mapped_column(ForeignKey('chats.id', ondelete='CASCADE'), index=True)
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True)
    support_ticket_id: Mapped[UUID | None] = mapped_column(ForeignKey('support_tickets.id', ondelete='CASCADE'), index=True)
    announcement_id: Mapped[UUID | None] = mapped_column(ForeignKey('system_announcements.id', ondelete='SET NULL'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(240))
    url: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class SystemAnnouncement(Base):
    __tablename__ = 'system_announcements'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    author_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey('messages.id', ondelete='SET NULL'), unique=True)
    text: Mapped[str] = mapped_column(Text)
    audience_type: Mapped[str] = mapped_column(String(32), default='all')
    audience_country: Mapped[str | None] = mapped_column(String(8), index=True)
    audience_branch_id: Mapped[UUID | None] = mapped_column(ForeignKey('chats.id', ondelete='SET NULL'), index=True)
    status: Mapped[str] = mapped_column(String(32), default='draft', index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recipient_count: Mapped[int] = mapped_column(Integer, default=0)
    notification_count: Mapped[int] = mapped_column(Integer, default=0)
    push_provider_accepted_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
