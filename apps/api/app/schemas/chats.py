from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DirectChatCreateRequest(BaseModel):
    country: str = Field(pattern=r'^(RU|KZ|KG|UA)$')
    phone: str = Field(min_length=7, max_length=32)


class MessageCreateRequest(BaseModel):
    text: str = Field(default='', max_length=4000)
    type: str = Field(default='text', max_length=32)
    reply_to_message_id: UUID | None = None
    media_url: str | None = None
    media_name: str | None = Field(default=None, max_length=255)
    media_mime_type: str | None = Field(default=None, max_length=128)
    media_size_bytes: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)


class MessageUpdateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class MessageReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class MessageReadRequest(BaseModel):
    message_ids: list[UUID] = Field(min_length=1, max_length=100)


class MessageReactionOut(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool


class MessageReplyOut(BaseModel):
    id: UUID
    sender_id: UUID
    type: str
    payload: str
    media_name: str | None
    deleted_at: datetime | None


class ChatPeerOut(BaseModel):
    id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    is_online: bool = False
    last_seen_at: datetime | None = None
    is_official: bool = False


class MessageAuthorOut(BaseModel):
    id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    is_official: bool = False


class ChatPreviewMessageOut(BaseModel):
    id: UUID
    sender_id: UUID
    type: str
    payload: str
    media_name: str | None
    created_at: datetime


class ChatOut(BaseModel):
    id: UUID
    type: str
    created_at: datetime
    updated_at: datetime
    last_message_id: UUID | None
    pinned_message_id: UUID | None = None
    participant_ids: list[UUID]
    peer: ChatPeerOut | None = None
    last_message: ChatPreviewMessageOut | None = None
    pinned_message: ChatPreviewMessageOut | None = None
    unread_count: int = 0
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    avatar_ref: str | None = None
    is_official: bool = False
    is_subscribed: bool = True
    can_post: bool = False


class PublicBranchCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    slug: str = Field(pattern=r'^[a-z0-9-]{3,64}$')
    description: str = Field(default='', max_length=500)
    avatar_ref: str | None = Field(default=None, max_length=255)


class MessageOut(BaseModel):
    id: UUID
    chat_id: UUID
    sender_id: UUID
    author: MessageAuthorOut | None = None
    type: str
    payload: str
    media_url: str | None
    media_name: str | None
    media_mime_type: str | None
    media_size_bytes: int | None
    duration_seconds: int | None
    encryption_state: str
    delivery_status: str
    reply_to: MessageReplyOut | None = None
    reactions: list[MessageReactionOut]
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    is_pinned: bool = False


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=1024)
    auth: str = Field(min_length=1, max_length=1024)


class PushSubscriptionCreateRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4096)
    device_id: str | None = Field(default=None, min_length=8, max_length=128)
    expirationTime: datetime | None = None
    keys: PushSubscriptionKeys


class PushSubscriptionDeleteRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4096)
    device_id: str | None = Field(default=None, min_length=8, max_length=128)


class PushConfigOut(BaseModel):
    enabled: bool
    public_key: str | None = None


class NotificationOut(BaseModel):
    id: UUID
    chat_id: UUID | None
    message_id: UUID | None
    title: str
    body: str
    url: str
    created_at: datetime
    read_at: datetime | None
