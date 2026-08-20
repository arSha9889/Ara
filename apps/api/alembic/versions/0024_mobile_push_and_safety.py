"""add mobile push tokens and user safety controls

Revision ID: 0024_mobile_push_safety
Revises: 0023_restrictions_announce
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa


revision = '0024_mobile_push_safety'
down_revision = '0023_restrictions_announce'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mobile_push_tokens',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('platform', sa.String(length=16), server_default='android', nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('app_version', sa.String(length=64), nullable=True),
        sa.Column('token', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
        sa.UniqueConstraint('user_id', 'device_id', 'provider', name='uq_mobile_push_tokens_user_device_provider'),
    )
    op.create_index('ix_mobile_push_tokens_user_id', 'mobile_push_tokens', ['user_id'])
    op.create_index('ix_mobile_push_tokens_device_id', 'mobile_push_tokens', ['device_id'])
    op.create_index('ix_mobile_push_tokens_is_active', 'mobile_push_tokens', ['is_active'])

    op.create_table(
        'user_blocks',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('blocker_user_id', sa.Uuid(), nullable=False),
        sa.Column('blocked_user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['blocker_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocked_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_user_id', 'blocked_user_id', name='uq_user_blocks_blocker_blocked'),
    )
    op.create_index('ix_user_blocks_blocker_user_id', 'user_blocks', ['blocker_user_id'])
    op.create_index('ix_user_blocks_blocked_user_id', 'user_blocks', ['blocked_user_id'])

    op.create_table(
        'content_reports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('reporter_user_id', sa.Uuid(), nullable=False),
        sa.Column('target_user_id', sa.Uuid(), nullable=True),
        sa.Column('target_type', sa.String(length=16), nullable=False),
        sa.Column('target_id', sa.String(length=128), nullable=False),
        sa.Column('reason', sa.String(length=32), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=32), server_default='open', nullable=False),
        sa.Column('moderator_note', sa.Text(), nullable=True),
        sa.Column('reviewed_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['reporter_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewed_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reporter_user_id', 'target_type', 'target_id', name='uq_content_reports_reporter_target'),
    )
    op.create_index('ix_content_reports_reporter_user_id', 'content_reports', ['reporter_user_id'])
    op.create_index('ix_content_reports_target_user_id', 'content_reports', ['target_user_id'])
    op.create_index('ix_content_reports_target_type', 'content_reports', ['target_type'])
    op.create_index('ix_content_reports_status', 'content_reports', ['status'])
    op.create_index('ix_content_reports_reviewed_by_user_id', 'content_reports', ['reviewed_by_user_id'])


def downgrade() -> None:
    op.drop_index('ix_content_reports_reviewed_by_user_id', table_name='content_reports')
    op.drop_index('ix_content_reports_status', table_name='content_reports')
    op.drop_index('ix_content_reports_target_type', table_name='content_reports')
    op.drop_index('ix_content_reports_target_user_id', table_name='content_reports')
    op.drop_index('ix_content_reports_reporter_user_id', table_name='content_reports')
    op.drop_table('content_reports')
    op.drop_index('ix_user_blocks_blocked_user_id', table_name='user_blocks')
    op.drop_index('ix_user_blocks_blocker_user_id', table_name='user_blocks')
    op.drop_table('user_blocks')
    op.drop_index('ix_mobile_push_tokens_is_active', table_name='mobile_push_tokens')
    op.drop_index('ix_mobile_push_tokens_device_id', table_name='mobile_push_tokens')
    op.drop_index('ix_mobile_push_tokens_user_id', table_name='mobile_push_tokens')
    op.drop_table('mobile_push_tokens')
