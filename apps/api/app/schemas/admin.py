from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminCountryOut(BaseModel):
    country: str
    count: int


class AdminUserOut(BaseModel):
    id: UUID
    nexus_id: str
    display_name: str
    username: str
    phone: str | None
    email: str | None
    country: str
    status: str
    created_at: datetime
    is_official: bool


class AdminOverviewOut(BaseModel):
    total_users: int
    active_users: int
    countries: list[AdminCountryOut]
    users: list[AdminUserOut]


class AdminUserStatusRequest(BaseModel):
    status: str = Field(pattern=r'^(active|blocked|deleted)$')
