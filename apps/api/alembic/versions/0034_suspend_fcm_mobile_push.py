"""deactivate FCM mobile push tokens

Revision ID: 0034_suspend_fcm_mobile_push
Revises: 0033_private_channels
Create Date: 2026-10-26
"""
from alembic import op


revision = '0034_suspend_fcm_mobile_push'
down_revision = '0033_private_channels'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE mobile_push_tokens SET is_active = false WHERE provider = 'fcm' AND is_active = true")


def downgrade() -> None:
    # Re-enabling FCM must require an explicit client registration, never revive stale tokens.
    pass
