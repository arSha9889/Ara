"""store verification request languages

Revision ID: 0020_verification_languages
Revises: 0019_email_smtp_oauth_identities
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = '0020_verification_languages'
down_revision = '0019_email_smtp_oauth_identities'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'phone_verifications',
        sa.Column('language', sa.String(length=8), nullable=False, server_default='ru'),
    )


def downgrade() -> None:
    op.drop_column('phone_verifications', 'language')
