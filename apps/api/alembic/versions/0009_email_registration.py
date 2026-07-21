"""email registration

Revision ID: 0009_email_registration
Revises: 0008_user_legal_consents
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = '0009_email_registration'
down_revision = '0008_user_legal_consents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('email', sa.String(length=255), nullable=True))
    op.create_index('ix_user_profiles_email', 'user_profiles', ['email'], unique=True)
    op.create_table(
        'email_verifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('public_token', sa.String(length=64), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('telegram_user_id', sa.String(length=64), nullable=True),
        sa.Column('telegram_chat_id', sa.String(length=64), nullable=True),
        sa.Column('telegram_username', sa.String(length=64), nullable=True),
        sa.Column('code_hash', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_email_verifications'),
        sa.UniqueConstraint('public_token', name='uq_email_verifications_public_token'),
    )
    op.create_index('ix_email_verifications_device_id', 'email_verifications', ['device_id'])
    op.create_index('ix_email_verifications_email', 'email_verifications', ['email'])
    op.create_index('ix_email_verifications_status', 'email_verifications', ['status'])
    op.create_index('ix_email_verifications_telegram_chat_id', 'email_verifications', ['telegram_chat_id'])
    op.create_index('ix_email_verifications_telegram_user_id', 'email_verifications', ['telegram_user_id'])


def downgrade() -> None:
    op.drop_index('ix_email_verifications_telegram_user_id', table_name='email_verifications')
    op.drop_index('ix_email_verifications_telegram_chat_id', table_name='email_verifications')
    op.drop_index('ix_email_verifications_status', table_name='email_verifications')
    op.drop_index('ix_email_verifications_email', table_name='email_verifications')
    op.drop_index('ix_email_verifications_device_id', table_name='email_verifications')
    op.drop_table('email_verifications')
    op.drop_index('ix_user_profiles_email', table_name='user_profiles')
    op.drop_column('user_profiles', 'email')
