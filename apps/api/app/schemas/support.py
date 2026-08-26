from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


SupportCategory = Literal['account', 'security', 'messages', 'notifications', 'bug', 'suggestion', 'other']
SupportTicketStatus = Literal['new', 'in_progress', 'waiting_user', 'resolved', 'closed']


class SupportAttachmentIn(BaseModel):
    attachment_url: str | None = Field(default=None, max_length=4096)
    attachment_name: str | None = Field(default=None, max_length=255)
    attachment_mime_type: str | None = Field(default=None, max_length=128)
    attachment_size_bytes: int | None = Field(default=None, ge=0)


class SupportTicketCreateRequest(SupportAttachmentIn):
    category: SupportCategory
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=1, max_length=4000)


class SupportMessageCreateRequest(SupportAttachmentIn):
    text: str = Field(min_length=1, max_length=4000)


class AdminSupportMessageCreateRequest(SupportMessageCreateRequest):
    is_internal: bool = False


class SupportTicketUpdateRequest(BaseModel):
    status: SupportTicketStatus


class SupportPersonOut(BaseModel):
    id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str


class SupportMessageOut(BaseModel):
    id: UUID
    ticket_id: UUID
    author_user_id: UUID | None
    author: SupportPersonOut | None = None
    text: str
    attachment_url: str | None
    attachment_name: str | None
    attachment_mime_type: str | None
    attachment_size_bytes: int | None
    is_internal: bool = False
    created_at: datetime


class SupportTicketOut(BaseModel):
    id: UUID
    number: int
    category: SupportCategory
    subject: str
    status: SupportTicketStatus
    requester_user_id: UUID
    requester: SupportPersonOut | None = None
    assigned_to_user_id: UUID | None
    assigned_to: SupportPersonOut | None = None
    last_message_preview: str | None = None
    last_message_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SupportTicketDetailOut(SupportTicketOut):
    messages: list[SupportMessageOut]


class AdminSupportTicketListOut(BaseModel):
    tickets: list[SupportTicketOut]
