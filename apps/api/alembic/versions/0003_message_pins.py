"""message pins

Revision ID: 0003_message_pins
Revises: 0002_web_communication
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0003_message_pins'
down_revision = '0002_web_communication'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chats', sa.Column('pinned_message_id', sa.Uuid(), nullable=True))
    op.create_index('ix_chats_pinned_message_id', 'chats', ['pinned_message_id'])


def downgrade() -> None:
    op.drop_index('ix_chats_pinned_message_id', table_name='chats')
    op.drop_column('chats', 'pinned_message_id')
