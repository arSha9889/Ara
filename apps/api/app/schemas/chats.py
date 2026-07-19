from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DirectChatCreateRequest(BaseModel):
    country: str = Field(pattern=r'^(RU|KZ)$')
    phone: str = Field(min_length=7, max_length=32)


class MessageCreateRequest(BaseModel):
    text: str = Field(default='', max_length=4000)
    type: str = Field(default='text', max_length=32)
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


class ChatPeerOut(BaseModel):
    id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    is_online: bool = False


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


class MessageOut(BaseModel):
    id: UUID
    chat_id: UUID
    sender_id: UUID
    type: str
    payload: str
    media_url: str | None
    media_name: str | None
    media_mime_type: str | None
    media_size_bytes: int | None
    duration_seconds: int | None
    encryption_state: str
    delivery_status: str
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
    expirationTime: datetime | None = None
    keys: PushSubscriptionKeys


class PushSubscriptionDeleteRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4096)


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
