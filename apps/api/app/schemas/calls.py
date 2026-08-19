from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class TurnIceServerOut(BaseModel):
    urls: list[str]
    username: str
    credential: str


class CallIceConfigurationOut(BaseModel):
    ice_servers: list[TurnIceServerOut]
    ice_transport_policy: Literal['relay']
    expires_at: datetime
