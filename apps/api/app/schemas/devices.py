from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DeviceOut(BaseModel):
    id: UUID
    device_id: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class LoginHistoryOut(BaseModel):
    id: UUID
    device_id: str | None
    method: str
    result: str
    created_at: datetime
