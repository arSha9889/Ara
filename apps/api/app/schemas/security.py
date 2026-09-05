from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.users import UserOut


class PinCreateRequest(BaseModel):
    current_password: str = Field(min_length=5, max_length=30)
    pin: str = Field(min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)


class PinResetRequest(BaseModel):
    current_password: str = Field(min_length=5, max_length=30)
    pin: str | None = Field(default=None, min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)


class PinLoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=5, max_length=255)
    email: str | None = Field(default=None, min_length=5, max_length=255)
    nexus_id: str | None = Field(default=None, min_length=16, max_length=16)
    pin: str = Field(min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)


class PinLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class E2eeWebKeyUpsertRequest(BaseModel):
    device_id: str = Field(min_length=8, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')
    encryption_public_key: str = Field(min_length=1, max_length=2048)
    signing_public_key: str = Field(min_length=1, max_length=2048)
    algorithm: Literal['ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256']
