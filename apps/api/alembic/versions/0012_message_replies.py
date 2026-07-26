"""message replies

Revision ID: 0012_message_replies
Revises: 0011_branches_region
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa


revision = '0012_message_replies'
down_revision = '0011_branches_region'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('reply_to_message_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_messages_reply_to_message_id_messages',
        'messages',
        'messages',
        ['reply_to_message_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_messages_reply_to_message_id', 'messages', ['reply_to_message_id'])


def downgrade() -> None:
    op.drop_index('ix_messages_reply_to_message_id', table_name='messages')
    op.drop_constraint('fk_messages_reply_to_message_id_messages', 'messages', type_='foreignkey')
    op.drop_column('messages', 'reply_to_message_id')
