from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.chats import MessageOut


class AdminCountryOut(BaseModel):
    country: str
    count: int


class AdminUserListItemOut(BaseModel):
    id: UUID
    nexus_id: str
    display_name: str
    username: str
    country: str
    status: str
    created_at: datetime
    is_official: bool


class AdminUserOut(AdminUserListItemOut):
    phone: str | None
    email: str | None


class AdminOverviewOut(BaseModel):
    total_users: int
    active_users: int
    countries: list[AdminCountryOut]


class AdminUserListOut(BaseModel):
    total: int
    users: list[AdminUserListItemOut]


class AdminUserStatusRequest(BaseModel):
    status: str = Field(pattern=r'^(active|blocked|deleted)$')


class AdminSecurityMetricsOut(BaseModel):
    active_sessions: int
    blocked_users: int
    locked_passwords: int
    locked_pins: int
    archived_branches: int


class AdminAuditLogOut(BaseModel):
    id: UUID
    action: str
    target_type: str | None
    target_id: str | None
    metadata: dict | None
    created_at: datetime


class AdminAuditLogListOut(BaseModel):
    total: int
    entries: list[AdminAuditLogOut]


class AdminBranchOut(BaseModel):
    id: UUID
    title: str
    slug: str
    description: str
    avatar_ref: str | None
    is_official: bool
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    subscriber_count: int
    owner_id: UUID | None
    owner_name: str | None
    owner_username: str | None


class AdminBranchListOut(BaseModel):
    branches: list[AdminBranchOut]


class AdminBranchUpdateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    slug: str = Field(pattern=r'^[a-z0-9-]{3,64}$')
    description: str = Field(default='', max_length=500)
    avatar_ref: str | None = Field(default=None, max_length=255)


class AdminBranchMemberRequest(BaseModel):
    user_id: UUID
    role: str = Field(pattern=r'^(admin|owner)$')


class AdminSystemBotOut(BaseModel):
    branch: AdminBranchOut
    messages: list[MessageOut]
