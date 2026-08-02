"""track enabled push subscriptions

Revision ID: 0016_push_sub_active
Revises: 0015_hide_chats_per_user
Create Date: 2026-08-02
"""
from alembic import op
import sqlalchemy as sa


revision = '0016_push_sub_active'
down_revision = '0015_hide_chats_per_user'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'push_subscriptions',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_push_subscriptions_is_active', 'push_subscriptions', ['is_active'])


def downgrade() -> None:
    op.drop_index('ix_push_subscriptions_is_active', table_name='push_subscriptions')
    op.drop_column('push_subscriptions', 'is_active')
