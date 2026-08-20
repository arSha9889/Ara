from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


ReportTargetType = Literal['user', 'message', 'comment']
ReportReason = Literal['spam', 'abuse', 'harassment', 'violence', 'sexual_content', 'fraud', 'other']
ReportStatus = Literal['open', 'under_review', 'resolved', 'dismissed']


class BlockedUserOut(BaseModel):
    user_id: UUID
    display_name: str
    username: str
    avatar_type: str
    avatar_ref: str
    blocked_at: datetime


class ContentReportCreateRequest(BaseModel):
    target_type: ReportTargetType
    target_id: UUID
    reason: ReportReason
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def require_description_for_other(self) -> 'ContentReportCreateRequest':
        if self.reason == 'other' and not (self.description or '').strip():
            raise ValueError('A description is required when report reason is other')
        return self


class ContentReportOut(BaseModel):
    id: UUID
    target_type: ReportTargetType
    target_id: UUID
    reason: ReportReason
    description: str | None
    status: ReportStatus
    created_at: datetime
    updated_at: datetime


class ContentReportModerationRequest(BaseModel):
    status: Literal['under_review', 'resolved', 'dismissed']
    moderator_note: str | None = Field(default=None, max_length=2000)


class AdminContentReportOut(ContentReportOut):
    reporter_user_id: UUID
    target_user_id: UUID | None
    moderator_note: str | None
    reviewed_by_user_id: UUID | None
    reviewed_at: datetime | None
