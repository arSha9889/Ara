"""release e-mail addresses of deleted users

Revision ID: 0031_release_deleted_user_emails
Revises: 0030_project_news
Create Date: 2026-09-27
"""
from alembic import op


revision = '0031_release_deleted_user_emails'
down_revision = '0030_project_news'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE user_profiles
        SET email = NULL,
            email_verified_at = NULL
        WHERE user_id IN (
            SELECT id
            FROM users
            WHERE deleted_at IS NOT NULL OR status = 'deleted'
        )
        """
    )


def downgrade() -> None:
    # Deleted e-mail addresses cannot be restored after they have been released.
    pass
