"""branch administration

Revision ID: 0013_branch_administration
Revises: 0012_message_replies
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa


revision = '0013_branch_administration'
down_revision = '0012_message_replies'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chats', sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('chats', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_chats_is_archived', 'chats', ['is_archived'])


def downgrade() -> None:
    op.drop_index('ix_chats_is_archived', table_name='chats')
    op.drop_column('chats', 'archived_at')
    op.drop_column('chats', 'is_archived')
