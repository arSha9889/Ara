"""branch comments

Revision ID: 0017_branch_comments
Revises: 0016_push_sub_active
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa


revision = '0017_branch_comments'
down_revision = '0016_push_sub_active'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'branch_comments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('branch_id', sa.Uuid(), nullable=False),
        sa.Column('post_id', sa.Uuid(), nullable=False),
        sa.Column('author_id', sa.Uuid(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['branch_id'], ['chats.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['post_id'], ['messages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_branch_comments_branch_id', 'branch_comments', ['branch_id'])
    op.create_index('ix_branch_comments_post_id', 'branch_comments', ['post_id'])
    op.create_index('ix_branch_comments_author_id', 'branch_comments', ['author_id'])
    op.create_index('ix_branch_comments_post_created_at', 'branch_comments', ['post_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_branch_comments_post_created_at', table_name='branch_comments')
    op.drop_index('ix_branch_comments_author_id', table_name='branch_comments')
    op.drop_index('ix_branch_comments_post_id', table_name='branch_comments')
    op.drop_index('ix_branch_comments_branch_id', table_name='branch_comments')
    op.drop_table('branch_comments')
