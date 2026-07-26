"""telegram password confirmations

Revision ID: 0010_password_confirmations
Revises: 0009_email_registration
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa


revision = '0010_password_confirmations'
down_revision = '0009_email_registration'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'password_confirmations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('public_token', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('purpose', sa.String(length=32), nullable=False),
        sa.Column('password_hash', sa.Text(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('telegram_user_id', sa.String(length=64), nullable=False),
        sa.Column('telegram_chat_id', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_password_confirmations'),
        sa.UniqueConstraint('public_token', name='uq_password_confirmations_public_token'),
    )
    op.create_index('ix_password_confirmations_public_token', 'password_confirmations', ['public_token'])
    op.create_index('ix_password_confirmations_user_id', 'password_confirmations', ['user_id'])
    op.create_index('ix_password_confirmations_telegram_user_id', 'password_confirmations', ['telegram_user_id'])
    op.create_index('ix_password_confirmations_telegram_chat_id', 'password_confirmations', ['telegram_chat_id'])
    op.create_index('ix_password_confirmations_status', 'password_confirmations', ['status'])


def downgrade() -> None:
    op.drop_index('ix_password_confirmations_status', table_name='password_confirmations')
    op.drop_index('ix_password_confirmations_telegram_chat_id', table_name='password_confirmations')
    op.drop_index('ix_password_confirmations_telegram_user_id', table_name='password_confirmations')
    op.drop_index('ix_password_confirmations_user_id', table_name='password_confirmations')
    op.drop_index('ix_password_confirmations_public_token', table_name='password_confirmations')
    op.drop_table('password_confirmations')
