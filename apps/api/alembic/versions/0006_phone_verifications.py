"""phone verifications

Revision ID: 0006_phone_verifications
Revises: 0005_avatar_ref_length
Create Date: 2026-07-18
"""
from alembic import context, op
import sqlalchemy as sa


revision = '0006_phone_verifications'
down_revision = '0005_avatar_ref_length'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode():
        connection = op.get_bind()
        duplicate_phone = connection.execute(sa.text(
            """
            SELECT optional_phone
            FROM user_profiles
            WHERE optional_phone IS NOT NULL
            GROUP BY optional_phone
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )).scalar()
        if duplicate_phone is not None:
            raise RuntimeError('Cannot add a unique phone index: duplicate user profile phones exist')

    op.create_index('ix_user_profiles_optional_phone', 'user_profiles', ['optional_phone'], unique=True)
    op.create_table(
        'phone_verifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('public_token', sa.String(length=64), nullable=False),
        sa.Column('phone_country', sa.String(length=2), nullable=False),
        sa.Column('phone', sa.String(length=32), nullable=False),
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
        sa.PrimaryKeyConstraint('id', name='pk_phone_verifications'),
        sa.UniqueConstraint('public_token', name='uq_phone_verifications_public_token'),
    )
    op.create_index('ix_phone_verifications_device_id', 'phone_verifications', ['device_id'])
    op.create_index('ix_phone_verifications_status', 'phone_verifications', ['status'])
    op.create_index('ix_phone_verifications_telegram_chat_id', 'phone_verifications', ['telegram_chat_id'])
    op.create_index('ix_phone_verifications_telegram_user_id', 'phone_verifications', ['telegram_user_id'])


def downgrade() -> None:
    op.drop_index('ix_phone_verifications_telegram_user_id', table_name='phone_verifications')
    op.drop_index('ix_phone_verifications_telegram_chat_id', table_name='phone_verifications')
    op.drop_index('ix_phone_verifications_status', table_name='phone_verifications')
    op.drop_index('ix_phone_verifications_device_id', table_name='phone_verifications')
    op.drop_table('phone_verifications')
    op.drop_index('ix_user_profiles_optional_phone', table_name='user_profiles')
