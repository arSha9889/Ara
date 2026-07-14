"""web core foundation

Revision ID: 0001_web_core_foundation
Revises:
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001_web_core_foundation'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('nexus_id', sa.String(length=16), nullable=False),
        sa.Column('telegram_id', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_users'),
        sa.UniqueConstraint('nexus_id', name='uq_users_nexus_id'),
        sa.UniqueConstraint('telegram_id', name='uq_users_telegram_id'),
    )
    op.create_index('ix_users_nexus_id', 'users', ['nexus_id'])
    op.create_index('ix_users_telegram_id', 'users', ['telegram_id'])

    op.create_table(
        'chats',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_message_id', sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_chats'),
    )
    op.create_index('ix_chats_last_message_id', 'chats', ['last_message_id'])

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('actor_user_id', sa.Uuid(), nullable=True),
        sa.Column('actor_type', sa.String(length=32), nullable=False),
        sa.Column('action', sa.String(length=96), nullable=False),
        sa.Column('target_type', sa.String(length=64), nullable=True),
        sa.Column('target_id', sa.String(length=128), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_audit_logs'),
    )
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_actor_user_id', 'audit_logs', ['actor_user_id'])

    op.create_table(
        'telegram_recovery_requests',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('request_id', sa.String(length=64), nullable=False),
        sa.Column('nexus_id', sa.String(length=16), nullable=False),
        sa.Column('telegram_user_id', sa.String(length=64), nullable=False),
        sa.Column('telegram_username', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('admin_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('audit_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_telegram_recovery_requests'),
        sa.UniqueConstraint('request_id', name='uq_telegram_recovery_requests_request_id'),
    )
    op.create_index('ix_telegram_recovery_requests_admin_id', 'telegram_recovery_requests', ['admin_id'])
    op.create_index('ix_telegram_recovery_requests_nexus_id', 'telegram_recovery_requests', ['nexus_id'])
    op.create_index('ix_telegram_recovery_requests_request_id', 'telegram_recovery_requests', ['request_id'])
    op.create_index('ix_telegram_recovery_requests_telegram_user_id', 'telegram_recovery_requests', ['telegram_user_id'])

    op.create_table(
        'user_profiles',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('display_name', sa.String(length=80), nullable=False),
        sa.Column('username', sa.String(length=32), nullable=False),
        sa.Column('avatar_type', sa.String(length=32), nullable=False),
        sa.Column('avatar_ref', sa.String(length=64), nullable=False),
        sa.Column('optional_phone', sa.String(length=32), nullable=True),
        sa.Column('phone_public', sa.Boolean(), nullable=False),
        sa.Column('language', sa.String(length=8), nullable=False),
        sa.Column('design_theme', sa.String(length=32), nullable=False),
        sa.Column('current_mode', sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_user_profiles_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', name='pk_user_profiles'),
        sa.UniqueConstraint('username', name='uq_user_profiles_username'),
    )
    op.create_index('ix_user_profiles_username', 'user_profiles', ['username'])

    _create_security_tables()
    _create_session_tables()
    _create_message_tables()


def _create_security_tables() -> None:
    op.create_table(
        'password_credentials',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('password_hash', sa.Text(), nullable=False),
        sa.Column('password_updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_password_credentials_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', name='pk_password_credentials'),
    )
    op.create_table(
        'recovery_codes',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('code_hash', sa.Text(), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_recovery_codes_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', name='pk_recovery_codes'),
    )
    op.create_table(
        'trusted_device_pins',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('pin_hash', sa.Text(), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trusted_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_trusted_device_pins_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_trusted_device_pins'),
    )
    op.create_index('ix_trusted_device_pins_device_id', 'trusted_device_pins', ['device_id'])
    op.create_index('ix_trusted_device_pins_user_id', 'trusted_device_pins', ['user_id'])


def _create_session_tables() -> None:
    op.create_table(
        'sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('refresh_token_lookup_hash', sa.String(length=64), nullable=False),
        sa.Column('refresh_token_hash', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_hash', sa.Text(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_sessions_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_sessions'),
        sa.UniqueConstraint('refresh_token_lookup_hash', name='uq_sessions_refresh_token_lookup_hash'),
    )
    op.create_index('ix_sessions_device_id', 'sessions', ['device_id'])
    op.create_index('ix_sessions_refresh_token_lookup_hash', 'sessions', ['refresh_token_lookup_hash'])
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])
    op.create_table(
        'login_history',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=True),
        sa.Column('method', sa.String(length=32), nullable=False),
        sa.Column('result', sa.String(length=32), nullable=False),
        sa.Column('ip_hash', sa.Text(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_login_history_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_login_history'),
    )
    op.create_index('ix_login_history_device_id', 'login_history', ['device_id'])
    op.create_index('ix_login_history_user_id', 'login_history', ['user_id'])


def _create_message_tables() -> None:
    op.create_table(
        'chat_participants',
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_read_message_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], name='fk_chat_participants_chat_id_chats', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_chat_participants_user_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('chat_id', 'user_id', name='pk_chat_participants'),
    )
    op.create_index('ix_chat_participants_last_read_message_id', 'chat_participants', ['last_read_message_id'])
    op.create_table(
        'messages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('sender_id', sa.Uuid(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('encryption_state', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], name='fk_messages_chat_id_chats', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], name='fk_messages_sender_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_messages'),
    )
    op.create_index('ix_messages_chat_id', 'messages', ['chat_id'])
    op.create_index('ix_messages_sender_id', 'messages', ['sender_id'])


def downgrade() -> None:
    for table in [
        'messages',
        'chat_participants',
        'login_history',
        'sessions',
        'trusted_device_pins',
        'recovery_codes',
        'password_credentials',
        'user_profiles',
        'telegram_recovery_requests',
        'audit_logs',
        'chats',
        'users',
    ]:
        op.drop_table(table)
