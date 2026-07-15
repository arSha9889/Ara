"""expand avatar ref length

Revision ID: 0005_avatar_ref_length
Revises: 0004_web_push_notifications
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa


revision = '0005_avatar_ref_length'
down_revision = '0004_web_push_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('user_profiles', 'avatar_ref', existing_type=sa.String(length=64), type_=sa.String(length=255), existing_nullable=False)


def downgrade() -> None:
    op.alter_column('user_profiles', 'avatar_ref', existing_type=sa.String(length=255), type_=sa.String(length=64), existing_nullable=False)
