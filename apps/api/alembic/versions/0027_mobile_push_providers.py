"""replace ambiguous legacy mobile push providers

Revision ID: 0027_mobile_push_providers
Revises: 0026_web_e2ee_keys
Create Date: 2026-09-05
"""
from alembic import op


revision = '0027_mobile_push_providers'
down_revision = '0026_web_e2ee_keys'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The legacy value cannot tell which transport issued the token. Keep it
    # inert until the client registers it again with its exact provider.
    op.execute(
        "UPDATE mobile_push_tokens SET is_active = false WHERE provider = 'universal'"
    )


def downgrade() -> None:
    # Legacy values are ambiguous, so stale records must stay inactive.
    pass
