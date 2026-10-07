from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class TurnIceServerOut(BaseModel):
    urls: list[str]
    username: str
    credential: str


class CallIceConfigurationOut(BaseModel):
    ice_servers: list[TurnIceServerOut]
    ice_transport_policy: Literal['relay']
    expires_at: datetime


class CallHistoryPeerOut(BaseModel):
    id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    is_official: bool = False


class CallHistoryItemOut(BaseModel):
    id: UUID
    call_id: str
    chat_id: UUID
    call_type: Literal['audio', 'video']
    direction: Literal['incoming', 'outgoing']
    outcome: Literal['completed', 'cancelled', 'rejected', 'busy', 'failed']
    peer: CallHistoryPeerOut
    started_at: datetime
    connected_at: datetime | None
    ended_at: datetime
    duration_seconds: int | None
