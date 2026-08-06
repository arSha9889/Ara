"""add SMTP verification and OAuth identity persistence

Revision ID: 0019_email_smtp_oauth_identities
Revises: 0018_user_vpn_status
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = '0019_email_smtp_oauth_identities'
down_revision = '0018_user_vpn_status'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))

    op.add_column('email_verifications', sa.Column('user_id', sa.Uuid(), nullable=True))
    op.add_column(
        'email_verifications',
        sa.Column('purpose', sa.String(length=32), nullable=False, server_default='registration'),
    )
    op.add_column('email_verifications', sa.Column('pending_password_hash', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_email_verifications_user_id_users',
        'email_verifications',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_email_verifications_user_id', 'email_verifications', ['user_id'])
    op.create_index('ix_email_verifications_purpose', 'email_verifications', ['purpose'])

    op.create_table(
        'oauth_identities',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('provider', sa.String(length=16), nullable=False),
        sa.Column('provider_subject', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider', 'provider_subject', name='uq_oauth_identities_provider_subject'),
        sa.UniqueConstraint('user_id', 'provider', name='uq_oauth_identities_user_provider'),
    )
    op.create_index('ix_oauth_identities_user_id', 'oauth_identities', ['user_id'])

    op.create_table(
        'oauth_attempts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('provider', sa.String(length=16), nullable=False),
        sa.Column('state_hash', sa.String(length=64), nullable=False),
        sa.Column('code_verifier', sa.Text(), nullable=False),
        sa.Column('flow', sa.String(length=16), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('provider_device_id', sa.String(length=255), nullable=True),
        sa.Column('result_token_hash', sa.String(length=64), nullable=True),
        sa.Column('result_user_id', sa.Uuid(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['result_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('result_token_hash'),
        sa.UniqueConstraint('state_hash'),
    )
    op.create_index('ix_oauth_attempts_user_id', 'oauth_attempts', ['user_id'])
    op.create_index('ix_oauth_attempts_result_user_id', 'oauth_attempts', ['result_user_id'])
    op.create_index('ix_oauth_attempts_status', 'oauth_attempts', ['status'])


def downgrade() -> None:
    op.drop_index('ix_oauth_attempts_status', table_name='oauth_attempts')
    op.drop_index('ix_oauth_attempts_result_user_id', table_name='oauth_attempts')
    op.drop_index('ix_oauth_attempts_user_id', table_name='oauth_attempts')
    op.drop_table('oauth_attempts')
    op.drop_index('ix_oauth_identities_user_id', table_name='oauth_identities')
    op.drop_table('oauth_identities')

    op.drop_index('ix_email_verifications_purpose', table_name='email_verifications')
    op.drop_index('ix_email_verifications_user_id', table_name='email_verifications')
    op.drop_constraint('fk_email_verifications_user_id_users', 'email_verifications', type_='foreignkey')
    op.drop_column('email_verifications', 'pending_password_hash')
    op.drop_column('email_verifications', 'purpose')
    op.drop_column('email_verifications', 'user_id')
    op.drop_column('user_profiles', 'email_verified_at')
