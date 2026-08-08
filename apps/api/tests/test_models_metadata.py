import ast
from pathlib import Path

from app.db.base import Base
from app import models  # noqa: F401


def test_web_core_tables_are_registered() -> None:
    expected_tables = {
        'users',
        'user_profiles',
        'password_credentials',
        'recovery_codes',
        'trusted_device_pins',
        'sessions',
        'login_history',
        'branch_comments',
        'chats',
        'chat_participants',
        'messages',
        'message_reactions',
        'message_receipts',
        'telegram_recovery_requests',
        'phone_verifications',
        'email_verifications',
        'oauth_identities',
        'oauth_attempts',
        'audit_logs',
        'stored_objects',
    }

    assert expected_tables.issubset(set(Base.metadata.tables))


def test_alembic_revision_ids_fit_the_version_table() -> None:
    versions_dir = Path(__file__).resolve().parents[1] / 'alembic' / 'versions'
    revision_ids = []
    for migration_path in versions_dir.glob('*.py'):
        module = ast.parse(migration_path.read_text())
        for node in module.body:
            if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Constant):
                continue
            if any(isinstance(target, ast.Name) and target.id == 'revision' for target in node.targets):
                revision_ids.append(node.value.value)

    assert all(isinstance(revision_id, str) and len(revision_id) <= 32 for revision_id in revision_ids)
