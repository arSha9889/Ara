"""web push notifications

Revision ID: 0004_web_push_notifications
Revises: 0003_message_pins
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa


revision = '0004_web_push_notifications'
down_revision = '0003_message_pins'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('expiration_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_push_subscriptions_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_push_subscriptions'),
        sa.UniqueConstraint('endpoint', name='uq_push_subscriptions_endpoint'),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('recipient_user_id', sa.Uuid(), nullable=False),
        sa.Column('chat_id', sa.Uuid(), nullable=True),
        sa.Column('message_id', sa.Uuid(), nullable=True),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('body', sa.String(length=240), nullable=False),
        sa.Column('url', sa.String(length=512), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['recipient_user_id'], ['users.id'], name='fk_notifications_recipient_user_id_users', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], name='fk_notifications_chat_id_chats', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], name='fk_notifications_message_id_messages', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_notifications'),
    )
    op.create_index('ix_notifications_recipient_user_id', 'notifications', ['recipient_user_id'])
    op.create_index('ix_notifications_chat_id', 'notifications', ['chat_id'])
    op.create_index('ix_notifications_message_id', 'notifications', ['message_id'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])
    op.create_index('ix_notifications_read_at', 'notifications', ['read_at'])


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_table('push_subscriptions')
