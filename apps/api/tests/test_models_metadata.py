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
        'chats',
        'chat_participants',
        'messages',
        'message_reactions',
        'message_receipts',
        'telegram_recovery_requests',
        'audit_logs',
    }

    assert expected_tables.issubset(set(Base.metadata.tables))
