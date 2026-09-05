"""add web end-to-end encryption public keys

Revision ID: 0026_web_e2ee_keys
Revises: 0025_support_tickets
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa


revision = '0026_web_e2ee_keys'
down_revision = '0025_support_tickets'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'e2ee_web_keys',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('encryption_public_key', sa.Text(), nullable=False),
        sa.Column('signing_public_key', sa.Text(), nullable=False),
        sa.Column('algorithm', sa.String(length=64), nullable=False, server_default='ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'device_id'),
    )
    op.create_index('ix_e2ee_web_keys_device_id', 'e2ee_web_keys', ['device_id'])


def downgrade() -> None:
    op.drop_index('ix_e2ee_web_keys_device_id', table_name='e2ee_web_keys')
    op.drop_table('e2ee_web_keys')
