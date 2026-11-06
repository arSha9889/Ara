"""track E2EE envelope format support per device

Revision ID: 0035_e2ee_envelope_versions
Revises: 0034_suspend_fcm_mobile_push
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa


revision = '0035_e2ee_envelope_versions'
down_revision = '0034_suspend_fcm_mobile_push'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'e2ee_web_keys',
        sa.Column('envelope_version', sa.Integer(), nullable=False, server_default='1'),
    )


def downgrade() -> None:
    op.drop_column('e2ee_web_keys', 'envelope_version')
