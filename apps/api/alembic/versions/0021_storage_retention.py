"""track stored objects for safe retention

Revision ID: 0021_storage_retention
Revises: 0020_verification_languages
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa


revision = '0021_storage_retention'
down_revision = '0020_verification_languages'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'stored_objects',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_user_id', sa.Uuid(), nullable=False),
        sa.Column('message_id', sa.Uuid(), nullable=True),
        sa.Column('storage_key', sa.String(length=1024), nullable=False),
        sa.Column('public_url', sa.Text(), nullable=False),
        sa.Column('purpose', sa.String(length=32), nullable=False, server_default='message'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('attached_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delete_after', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('storage_key'),
    )
    op.create_index('ix_stored_objects_owner_user_id', 'stored_objects', ['owner_user_id'])
    op.create_index('ix_stored_objects_message_id', 'stored_objects', ['message_id'])
    op.create_index('ix_stored_objects_status', 'stored_objects', ['status'])
    op.create_index('ix_stored_objects_status_delete_after', 'stored_objects', ['status', 'delete_after'])


def downgrade() -> None:
    op.drop_index('ix_stored_objects_status_delete_after', table_name='stored_objects')
    op.drop_index('ix_stored_objects_status', table_name='stored_objects')
    op.drop_index('ix_stored_objects_message_id', table_name='stored_objects')
    op.drop_index('ix_stored_objects_owner_user_id', table_name='stored_objects')
    op.drop_table('stored_objects')
