"""add user last seen timestamp

Revision ID: 0014_user_last_seen
Revises: 0013_branch_administration
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa


revision = '0014_user_last_seen'
down_revision = '0013_branch_administration'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_last_seen_at', 'users', ['last_seen_at'])


def downgrade() -> None:
    op.drop_index('ix_users_last_seen_at', table_name='users')
    op.drop_column('users', 'last_seen_at')
