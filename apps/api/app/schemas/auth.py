from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.users import UserOut


class DevRegistrationProofRequest(BaseModel):
    telegram_id: str = Field(min_length=1, max_length=64)


class DevRegistrationProofResponse(BaseModel):
    registration_proof: str


class PhoneVerificationStartRequest(BaseModel):
    country: str = Field(pattern=r'^(RU|KZ|UA)$')
    phone: str = Field(min_length=7, max_length=32)
    device_id: str = Field(min_length=8, max_length=128)


class PhoneVerificationStartResponse(BaseModel):
    verification_id: UUID
    bot_url: str
    expires_in_seconds: int


class PhoneVerificationConfirmRequest(BaseModel):
    verification_id: UUID
    code: str = Field(pattern=r'^\d{4}$')


class PhoneVerificationConfirmResponse(BaseModel):
    registration_proof: str
    phone: str


class RegisterCompleteRequest(BaseModel):
    registration_proof: str
    phone_verification_id: UUID | None = None
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
    user: UserOut


class LoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=7, max_length=32)
    phone: str | None = Field(default=None, min_length=7, max_length=32)
    nexus_id: str | None = Field(default=None, min_length=16, max_length=16)
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
