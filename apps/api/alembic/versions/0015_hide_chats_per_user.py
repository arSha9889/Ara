"""allow users to hide direct chats

Revision ID: 0015_hide_chats_per_user
Revises: 0014_user_last_seen
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa


revision = '0015_hide_chats_per_user'
down_revision = '0014_user_last_seen'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chat_participants', sa.Column('hidden_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_chat_participants_hidden_at', 'chat_participants', ['hidden_at'])


def downgrade() -> None:
    op.drop_index('ix_chat_participants_hidden_at', table_name='chat_participants')
    op.drop_column('chat_participants', 'hidden_at')
