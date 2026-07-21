from uuid import UUID

from pydantic import BaseModel, Field


class UserProfileOut(BaseModel):
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    optional_phone: str | None
    email: str | None
    phone_public: bool
    language: str
    design_theme: str
    current_mode: str


class UserOut(BaseModel):
    id: UUID
    nexus_id: str
    telegram_id: str | None
    status: str
    profile: UserProfileOut | None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    optional_phone: str | None = Field(default=None, max_length=32)
    phone_public: bool | None = None
    language: str | None = None
    design_theme: str | None = None
    avatar_type: str | None = Field(default=None, max_length=32)
    avatar_ref: str | None = Field(default=None, max_length=255)


class UsernameCheckRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)


class UsernameCheckResponse(BaseModel):
    username: str
    available: bool


class UsernameUpdateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
