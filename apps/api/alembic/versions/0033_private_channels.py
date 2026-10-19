"""add private channels

Revision ID: 0033_private_channels
Revises: 0032_call_history
Create Date: 2026-10-19
"""
from alembic import op
import sqlalchemy as sa


revision = '0033_private_channels'
down_revision = '0032_call_history'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chats', sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('chats', sa.Column('invite_token_hash', sa.String(length=64), nullable=True))
    op.create_index('ix_chats_is_private', 'chats', ['is_private'])
    op.create_index('ix_chats_invite_token_hash', 'chats', ['invite_token_hash'], unique=True)

    op.add_column('chat_preferences', sa.Column('notifications_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('messages', sa.Column('comments_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))

    op.add_column('stored_objects', sa.Column('chat_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_stored_objects_chat_id_chats', 'stored_objects', 'chats', ['chat_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_stored_objects_chat_id', 'stored_objects', ['chat_id'])


def downgrade() -> None:
    op.drop_index('ix_stored_objects_chat_id', table_name='stored_objects')
    op.drop_constraint('fk_stored_objects_chat_id_chats', 'stored_objects', type_='foreignkey')
    op.drop_column('stored_objects', 'chat_id')
    op.drop_column('messages', 'comments_enabled')
    op.drop_column('chat_preferences', 'notifications_enabled')
    op.drop_index('ix_chats_invite_token_hash', table_name='chats')
    op.drop_index('ix_chats_is_private', table_name='chats')
    op.drop_column('chats', 'invite_token_hash')
    op.drop_column('chats', 'is_private')
