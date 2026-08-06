from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.users import UserOut


class DevRegistrationProofRequest(BaseModel):
    telegram_id: str = Field(min_length=1, max_length=64)


class DevRegistrationProofResponse(BaseModel):
    registration_proof: str


class PhoneVerificationStartRequest(BaseModel):
    country: str = Field(pattern=r'^(RU|KZ|KG|UA|BY|UZ)$')
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


class EmailVerificationStartRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    device_id: str = Field(min_length=8, max_length=128)


class EmailVerificationStartResponse(BaseModel):
    verification_id: UUID
    expires_in_seconds: int


class EmailVerificationConfirmRequest(BaseModel):
    verification_id: UUID
    code: str = Field(pattern=r'^\d{6}$')


class EmailVerificationConfirmResponse(BaseModel):
    email: str


class RegisterCompleteRequest(BaseModel):
    email_verification_id: UUID
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=5, max_length=30)
    pin: str | None = Field(default=None, min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)
    language: str = 'ru'
    registration_country: str = Field(default='GLOBAL', pattern=r'^(RU|KZ|KG|UA|BY|UZ|GLOBAL)$')
    design_theme: str = 'halo'
    display_name: str | None = Field(default=None, max_length=80)
    avatar_type: str = Field(default='built_in', max_length=32)
    avatar_ref: str = Field(default='animal-01', max_length=255)
    accepted_terms: bool = False
    accepted_privacy_policy: bool = False


class RegisterCompleteResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RegisterConfirmRequest(BaseModel):
    password_confirmation_id: UUID
    password_confirmation_token: str = Field(min_length=1, max_length=64)


class RegisterConfirmResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class LoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=5, max_length=255)
    phone: str | None = Field(default=None, min_length=7, max_length=32)
    email: str | None = Field(default=None, min_length=5, max_length=255)
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


class LegalDocumentsAcceptRequest(BaseModel):
    accepted_terms: bool
    accepted_privacy_policy: bool


class PasswordChangeStartRequest(BaseModel):
    current_password: str = Field(min_length=5, max_length=30)
    new_password: str = Field(min_length=5, max_length=30)
    device_id: str = Field(min_length=8, max_length=128)


class PasswordChangeStartResponse(BaseModel):
    verification_id: UUID
    expires_in_seconds: int


class PasswordChangeConfirmRequest(BaseModel):
    verification_id: UUID
    code: str = Field(pattern=r'^\d{6}$')
    device_id: str = Field(min_length=8, max_length=128)


class PasswordResetStartRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    device_id: str = Field(min_length=8, max_length=128)


class PasswordResetStartResponse(BaseModel):
    status: str = 'ok'


class PasswordResetConfirmRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(pattern=r'^\d{6}$')
    new_password: str = Field(min_length=5, max_length=30)
    device_id: str = Field(min_length=8, max_length=128)


class EmailChangeStartRequest(BaseModel):
    current_password: str = Field(min_length=5, max_length=30)
    email: str = Field(min_length=5, max_length=255)
    device_id: str = Field(min_length=8, max_length=128)


class EmailChangeStartResponse(BaseModel):
    verification_id: UUID
    expires_in_seconds: int


class EmailChangeConfirmRequest(BaseModel):
    verification_id: UUID
    code: str = Field(pattern=r'^\d{6}$')
    device_id: str = Field(min_length=8, max_length=128)


class OAuthStartRequest(BaseModel):
    device_id: str = Field(min_length=8, max_length=128)


class OAuthStartResponse(BaseModel):
    authorization_url: str


class OAuthCompleteRequest(BaseModel):
    result_token: str = Field(min_length=16, max_length=255)
    device_id: str = Field(min_length=8, max_length=128)


class OAuthCompleteResponse(BaseModel):
    status: str
    access_token: str | None = None
    refresh_token: str | None = None
    user: UserOut | None = None
