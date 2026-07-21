"""user legal consents

Revision ID: 0008_user_legal_consents
Revises: 0007_push_subscription_devices
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = '0008_user_legal_consents'
down_revision = '0007_push_subscription_devices'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('terms_version', sa.String(length=32), nullable=True))
    op.add_column('users', sa.Column('privacy_policy_accepted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('privacy_policy_version', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'privacy_policy_version')
    op.drop_column('users', 'privacy_policy_accepted_at')
    op.drop_column('users', 'terms_version')
    op.drop_column('users', 'terms_accepted_at')
