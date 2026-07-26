"""public branches and registration country

Revision ID: 0011_public_branches_and_registration_country
Revises: 0010_password_confirmations
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa


revision = '0011_public_branches_and_registration_country'
down_revision = '0010_password_confirmations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('registration_country', sa.String(length=8), nullable=True))
    op.create_index('ix_user_profiles_registration_country', 'user_profiles', ['registration_country'])
    op.add_column('chats', sa.Column('title', sa.String(length=120), nullable=True))
    op.add_column('chats', sa.Column('slug', sa.String(length=64), nullable=True))
    op.add_column('chats', sa.Column('description', sa.String(length=500), nullable=True))
    op.add_column('chats', sa.Column('avatar_ref', sa.String(length=255), nullable=True))
    op.add_column('chats', sa.Column('is_official', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_chats_slug', 'chats', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_chats_slug', table_name='chats')
    op.drop_column('chats', 'is_official')
    op.drop_column('chats', 'avatar_ref')
    op.drop_column('chats', 'description')
    op.drop_column('chats', 'slug')
    op.drop_column('chats', 'title')
    op.drop_index('ix_user_profiles_registration_country', table_name='user_profiles')
    op.drop_column('user_profiles', 'registration_country')
