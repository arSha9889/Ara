"""store personal chat wallpaper preferences

Revision ID: 0022_chat_wallpapers
Revises: 0021_storage_retention
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa


revision = '0022_chat_wallpapers'
down_revision = '0021_storage_retention'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'chat_preferences',
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('wallpaper_id', sa.String(length=32), nullable=False, server_default='default'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('chat_id', 'user_id'),
    )


def downgrade() -> None:
    op.drop_table('chat_preferences')
