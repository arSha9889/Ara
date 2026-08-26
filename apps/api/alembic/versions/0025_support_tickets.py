"""add support ticket conversations

Revision ID: 0025_support_tickets
Revises: 0024_mobile_push_safety
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa


revision = '0025_support_tickets'
down_revision = '0024_mobile_push_safety'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'support_tickets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('number', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('requester_user_id', sa.Uuid(), nullable=False),
        sa.Column('assigned_to_user_id', sa.Uuid(), nullable=True),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('subject', sa.String(length=160), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='new'),
        sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['requester_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('number'),
    )
    op.create_index('ix_support_tickets_number', 'support_tickets', ['number'])
    op.create_index('ix_support_tickets_requester_user_id', 'support_tickets', ['requester_user_id'])
    op.create_index('ix_support_tickets_assigned_to_user_id', 'support_tickets', ['assigned_to_user_id'])
    op.create_index('ix_support_tickets_category', 'support_tickets', ['category'])
    op.create_index('ix_support_tickets_status', 'support_tickets', ['status'])
    op.create_index('ix_support_tickets_last_message_at', 'support_tickets', ['last_message_at'])

    op.create_table(
        'support_ticket_counters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('last_number', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.execute("INSERT INTO support_ticket_counters (id, last_number) VALUES (1, 0)")

    op.create_table(
        'support_messages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_id', sa.Uuid(), nullable=False),
        sa.Column('author_user_id', sa.Uuid(), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('attachment_url', sa.Text(), nullable=True),
        sa.Column('attachment_name', sa.String(length=255), nullable=True),
        sa.Column('attachment_mime_type', sa.String(length=128), nullable=True),
        sa.Column('attachment_size_bytes', sa.Integer(), nullable=True),
        sa.Column('is_internal', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_support_messages_ticket_id', 'support_messages', ['ticket_id'])
    op.create_index('ix_support_messages_author_user_id', 'support_messages', ['author_user_id'])
    op.create_index('ix_support_messages_is_internal', 'support_messages', ['is_internal'])
    op.create_index('ix_support_messages_created_at', 'support_messages', ['created_at'])

    op.add_column('stored_objects', sa.Column('support_message_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_stored_objects_support_message_id_support_messages', 'stored_objects', 'support_messages', ['support_message_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_stored_objects_support_message_id', 'stored_objects', ['support_message_id'])

    op.add_column('notifications', sa.Column('support_ticket_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_notifications_support_ticket_id_support_tickets', 'notifications', 'support_tickets', ['support_ticket_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_notifications_support_ticket_id', 'notifications', ['support_ticket_id'])


def downgrade() -> None:
    op.drop_index('ix_notifications_support_ticket_id', table_name='notifications')
    op.drop_constraint('fk_notifications_support_ticket_id_support_tickets', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'support_ticket_id')
    op.drop_index('ix_stored_objects_support_message_id', table_name='stored_objects')
    op.drop_constraint('fk_stored_objects_support_message_id_support_messages', 'stored_objects', type_='foreignkey')
    op.drop_column('stored_objects', 'support_message_id')
    op.drop_index('ix_support_messages_created_at', table_name='support_messages')
    op.drop_index('ix_support_messages_is_internal', table_name='support_messages')
    op.drop_index('ix_support_messages_author_user_id', table_name='support_messages')
    op.drop_index('ix_support_messages_ticket_id', table_name='support_messages')
    op.drop_table('support_messages')
    op.drop_table('support_ticket_counters')
    op.drop_index('ix_support_tickets_last_message_at', table_name='support_tickets')
    op.drop_index('ix_support_tickets_status', table_name='support_tickets')
    op.drop_index('ix_support_tickets_category', table_name='support_tickets')
    op.drop_index('ix_support_tickets_assigned_to_user_id', table_name='support_tickets')
    op.drop_index('ix_support_tickets_requester_user_id', table_name='support_tickets')
    op.drop_index('ix_support_tickets_number', table_name='support_tickets')
    op.drop_table('support_tickets')
