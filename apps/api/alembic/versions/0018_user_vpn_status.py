"""add user VPN status

Revision ID: 0018_user_vpn_status
Revises: 0017_branch_comments
Create Date: 2026-08-05
"""
from alembic import op
import sqlalchemy as sa


revision = '0018_user_vpn_status'
down_revision = '0017_branch_comments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('vpn_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('users', 'vpn_enabled')
