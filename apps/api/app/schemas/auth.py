from pydantic import BaseModel, Field

from app.schemas.users import UserOut


class TelegramCallbackRequest(BaseModel):
    payload: dict[str, str]
    device_id: str | None = Field(default=None, min_length=8, max_length=128)


class TelegramCallbackResponse(BaseModel):
    registration_proof: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    user: UserOut | None = None
    is_registered: bool


class DevRegistrationProofRequest(BaseModel):
    telegram_id: str = Field(min_length=1, max_length=64)


class DevRegistrationProofResponse(BaseModel):
    registration_proof: str


class EarlyAccessRegistrationProofResponse(BaseModel):
    registration_proof: str
    remaining_slots: int


class RegisterCompleteRequest(BaseModel):
    registration_proof: str
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=5, max_length=30)
    pin: str | None = Field(default=None, min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)
    language: str = 'ru'
    design_theme: str = 'halo'
    display_name: str | None = Field(default=None, max_length=80)
    avatar_type: str = Field(default='built_in', max_length=32)
    avatar_ref: str = Field(default='animal-01', max_length=255)


class RegisterCompleteResponse(BaseModel):
    access_token: str
    refresh_token: str
    recovery_code: str
    user: UserOut


class LoginRequest(BaseModel):
    nexus_id: str
    password: str
    device_id: str = Field(min_length=8, max_length=128)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None
