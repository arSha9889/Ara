"""migrate uploaded avatar references to controlled media routes

Revision ID: 0028_private_media_delivery
Revises: 0027_mobile_push_providers
Create Date: 2026-09-20
"""
from alembic import op


revision = '0028_private_media_delivery'
down_revision = '0027_mobile_push_providers'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update profiles first: public_url still contains the legacy local/S3 URL
    # required to identify the attached avatar. External avatar references do
    # not match a registry object and remain unchanged.
    op.execute(
        """
        UPDATE user_profiles AS profile
        SET avatar_ref = '/api/media/avatars/' || CAST((
            SELECT stored.id
            FROM stored_objects AS stored
            WHERE stored.owner_user_id = profile.user_id
              AND stored.purpose = 'avatar'
              AND stored.status = 'attached_avatar'
              AND stored.public_url = profile.avatar_ref
            LIMIT 1
        ) AS TEXT)
        WHERE profile.avatar_type = 'uploaded'
          AND EXISTS (
            SELECT 1
            FROM stored_objects AS stored
            WHERE stored.owner_user_id = profile.user_id
              AND stored.purpose = 'avatar'
              AND stored.status = 'attached_avatar'
              AND stored.public_url = profile.avatar_ref
          )
        """
    )
    op.execute(
        """
        UPDATE stored_objects
        SET public_url = '/api/media/avatars/' || CAST(id AS TEXT)
        WHERE purpose = 'avatar'
          AND status = 'attached_avatar'
        """
    )


def downgrade() -> None:
    # The prior public URL cannot be reconstructed safely after it is replaced.
    pass
