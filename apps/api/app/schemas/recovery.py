from pydantic import BaseModel, Field

from app.schemas.users import UserOut


class RecoveryCodeVerifyRequest(BaseModel):
    nexus_id: str = Field(min_length=16, max_length=16)
    recovery_code: str = Field(min_length=24, max_length=64)


class RecoveryCodeVerifyResponse(BaseModel):
    valid: bool


class PasswordResetRequest(BaseModel):
    nexus_id: str = Field(min_length=16, max_length=16)
    recovery_code: str = Field(min_length=24, max_length=64)
    new_password: str = Field(min_length=5, max_length=30)
    device_id: str = Field(min_length=8, max_length=128)


class PasswordResetResponse(BaseModel):
    access_token: str
    refresh_token: str
    recovery_code: str
    user: UserOut


class RecoveryCodeRegenerateRequest(BaseModel):
    current_password: str = Field(min_length=5, max_length=30)


class RecoveryCodeRegenerateResponse(BaseModel):
    recovery_code: str
