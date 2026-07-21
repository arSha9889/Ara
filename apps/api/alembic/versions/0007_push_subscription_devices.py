"""push subscription devices

Revision ID: 0007_push_subscription_devices
Revises: 0006_phone_verifications
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = '0007_push_subscription_devices'
down_revision = '0006_phone_verifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('push_subscriptions', sa.Column('device_id', sa.String(length=128), nullable=True))
    op.create_index('ix_push_subscriptions_device_id', 'push_subscriptions', ['device_id'])


def downgrade() -> None:
    op.drop_index('ix_push_subscriptions_device_id', table_name='push_subscriptions')
    op.drop_column('push_subscriptions', 'device_id')
