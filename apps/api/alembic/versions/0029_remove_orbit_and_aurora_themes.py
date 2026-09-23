"""remove retired Orbit and Aurora themes

Revision ID: 0029_remove_retired_themes
Revises: 0028_private_media_delivery
Create Date: 2026-09-22
"""
from alembic import op


revision = '0029_remove_retired_themes'
down_revision = '0028_private_media_delivery'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE user_profiles
        SET design_theme = 'halo'
        WHERE design_theme IN ('orbit', 'aurora')
        """
    )


def downgrade() -> None:
    # The previous theme choice cannot be recovered after normalization.
    pass
