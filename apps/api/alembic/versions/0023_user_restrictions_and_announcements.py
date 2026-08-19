"""add user restrictions and system announcements

Revision ID: 0023_user_restrictions_and_announcements
Revises: 0022_chat_wallpapers
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa


revision = '0023_user_restrictions_and_announcements'
down_revision = '0022_chat_wallpapers'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_restrictions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('admin_user_id', sa.Uuid(), nullable=True),
        sa.Column('reason', sa.String(length=32), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lifted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lifted_by_user_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['admin_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['lifted_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_restrictions_user_id', 'user_restrictions', ['user_id'])
    op.create_index('ix_user_restrictions_admin_user_id', 'user_restrictions', ['admin_user_id'])
    op.create_index('ix_user_restrictions_ends_at', 'user_restrictions', ['ends_at'])
    op.create_index('ix_user_restrictions_lifted_at', 'user_restrictions', ['lifted_at'])

    op.create_table(
        'system_announcements',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('author_user_id', sa.Uuid(), nullable=False),
        sa.Column('message_id', sa.Uuid(), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('audience_type', sa.String(length=32), server_default='all', nullable=False),
        sa.Column('audience_country', sa.String(length=8), nullable=True),
        sa.Column('audience_branch_id', sa.Uuid(), nullable=True),
        sa.Column('status', sa.String(length=32), server_default='draft', nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recipient_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('notification_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('push_provider_accepted_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['audience_branch_id'], ['chats.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id'),
    )
    op.create_index('ix_system_announcements_author_user_id', 'system_announcements', ['author_user_id'])
    op.create_index('ix_system_announcements_audience_country', 'system_announcements', ['audience_country'])
    op.create_index('ix_system_announcements_audience_branch_id', 'system_announcements', ['audience_branch_id'])
    op.create_index('ix_system_announcements_status', 'system_announcements', ['status'])
    op.create_index('ix_system_announcements_scheduled_at', 'system_announcements', ['scheduled_at'])
    op.create_index('ix_system_announcements_published_at', 'system_announcements', ['published_at'])
    op.add_column('notifications', sa.Column('announcement_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_notifications_announcement_id_system_announcements', 'notifications', 'system_announcements', ['announcement_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_notifications_announcement_id', 'notifications', ['announcement_id'])
    op.create_unique_constraint('uq_notifications_announcement_recipient', 'notifications', ['announcement_id', 'recipient_user_id'])


def downgrade() -> None:
    op.drop_constraint('uq_notifications_announcement_recipient', 'notifications', type_='unique')
    op.drop_index('ix_notifications_announcement_id', table_name='notifications')
    op.drop_constraint('fk_notifications_announcement_id_system_announcements', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'announcement_id')
    op.drop_index('ix_system_announcements_published_at', table_name='system_announcements')
    op.drop_index('ix_system_announcements_scheduled_at', table_name='system_announcements')
    op.drop_index('ix_system_announcements_status', table_name='system_announcements')
    op.drop_index('ix_system_announcements_audience_branch_id', table_name='system_announcements')
    op.drop_index('ix_system_announcements_audience_country', table_name='system_announcements')
    op.drop_index('ix_system_announcements_author_user_id', table_name='system_announcements')
    op.drop_table('system_announcements')
    op.drop_index('ix_user_restrictions_lifted_at', table_name='user_restrictions')
    op.drop_index('ix_user_restrictions_ends_at', table_name='user_restrictions')
    op.drop_index('ix_user_restrictions_admin_user_id', table_name='user_restrictions')
    op.drop_index('ix_user_restrictions_user_id', table_name='user_restrictions')
    op.drop_table('user_restrictions')
