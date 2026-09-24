"""add project news journal

Revision ID: 0030_project_news
Revises: 0029_remove_retired_themes
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa


revision = '0030_project_news'
down_revision = '0029_remove_retired_themes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_news',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('author_user_id', sa.Uuid(), nullable=False),
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=32), server_default='draft', nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('ix_project_news_author_user_id', 'project_news', ['author_user_id'])
    op.create_index('ix_project_news_slug', 'project_news', ['slug'])
    op.create_index('ix_project_news_status', 'project_news', ['status'])
    op.create_index('ix_project_news_scheduled_at', 'project_news', ['scheduled_at'])
    op.create_index('ix_project_news_published_at', 'project_news', ['published_at'])

    op.create_table(
        'project_news_translations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('news_id', sa.Uuid(), nullable=False),
        sa.Column('language', sa.String(length=8), nullable=False),
        sa.Column('title', sa.String(length=180), nullable=False),
        sa.Column('excerpt', sa.String(length=500), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['news_id'], ['project_news.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('news_id', 'language', name='uq_project_news_translations_news_language'),
    )
    op.create_index('ix_project_news_translations_news_id', 'project_news_translations', ['news_id'])


def downgrade() -> None:
    op.drop_index('ix_project_news_translations_news_id', table_name='project_news_translations')
    op.drop_table('project_news_translations')
    op.drop_index('ix_project_news_published_at', table_name='project_news')
    op.drop_index('ix_project_news_scheduled_at', table_name='project_news')
    op.drop_index('ix_project_news_status', table_name='project_news')
    op.drop_index('ix_project_news_slug', table_name='project_news')
    op.drop_index('ix_project_news_author_user_id', table_name='project_news')
    op.drop_table('project_news')
