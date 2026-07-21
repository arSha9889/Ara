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
    phone: str | None = Field(default=None, min_length=7, max_length=32)
    email: str | None = Field(default=None, min_length=5, max_length=255)
    nexus_id: str | None = Field(default=None, min_length=16, max_length=16)
    pin: str = Field(min_length=4, max_length=8)
    device_id: str = Field(min_length=8, max_length=128)


class PinLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut
