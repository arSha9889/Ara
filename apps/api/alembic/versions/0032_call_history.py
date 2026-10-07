"""add persistent call history

Revision ID: 0032_call_history
Revises: 0031_release_deleted_user_emails
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa


revision = '0032_call_history'
down_revision = '0031_release_deleted_user_emails'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'call_records',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('call_id', sa.String(length=200), nullable=False),
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('caller_user_id', sa.Uuid(), nullable=False),
        sa.Column('callee_user_id', sa.Uuid(), nullable=False),
        sa.Column('call_type', sa.String(length=16), nullable=False),
        sa.Column('outcome', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('connected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['callee_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['caller_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('call_id'),
    )
    op.create_index('ix_call_records_chat_id', 'call_records', ['chat_id'])
    op.create_index('ix_call_records_caller_user_id', 'call_records', ['caller_user_id'])
    op.create_index('ix_call_records_callee_user_id', 'call_records', ['callee_user_id'])
    op.create_index('ix_call_records_outcome', 'call_records', ['outcome'])
    op.create_index('ix_call_records_ended_at', 'call_records', ['ended_at'])
    op.create_index('ix_call_records_created_at', 'call_records', ['created_at'])


def downgrade() -> None:
    op.drop_table('call_records')
