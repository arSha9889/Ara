"""web communication baseline

Revision ID: 0002_web_communication
Revises: 0001_web_core_foundation
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_web_communication'
down_revision = '0001_web_core_foundation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('media_url', sa.Text(), nullable=True))
    op.add_column('messages', sa.Column('media_name', sa.String(length=255), nullable=True))
    op.add_column('messages', sa.Column('media_mime_type', sa.String(length=128), nullable=True))
    op.add_column('messages', sa.Column('media_size_bytes', sa.Integer(), nullable=True))
    op.add_column('messages', sa.Column('duration_seconds', sa.Integer(), nullable=True))

    op.create_table(
        'message_reactions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('message_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('emoji', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], name='fk_message_reactions_message_id_messages', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_message_reactions_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_message_reactions'),
        sa.UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_message_reactions_message_user_emoji'),
    )
    op.create_index('ix_message_reactions_message_id', 'message_reactions', ['message_id'])
    op.create_index('ix_message_reactions_user_id', 'message_reactions', ['user_id'])

    op.create_table(
        'message_receipts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('message_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], name='fk_message_receipts_message_id_messages', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_message_receipts_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_message_receipts'),
        sa.UniqueConstraint('message_id', 'user_id', name='uq_message_receipts_message_user'),
    )
    op.create_index('ix_message_receipts_message_id', 'message_receipts', ['message_id'])
    op.create_index('ix_message_receipts_user_id', 'message_receipts', ['user_id'])


def downgrade() -> None:
    op.drop_table('message_receipts')
    op.drop_table('message_reactions')
    op.drop_column('messages', 'duration_seconds')
    op.drop_column('messages', 'media_size_bytes')
    op.drop_column('messages', 'media_mime_type')
    op.drop_column('messages', 'media_name')
    op.drop_column('messages', 'media_url')
