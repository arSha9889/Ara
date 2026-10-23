import pytest

from app.core.config import Settings
from app.main import app


def test_default_allowed_origins_include_tauri(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv('NEXUS_ALLOWED_ORIGINS', raising=False)

    assert Settings(_env_file=None).allowed_origins == [
        'http://localhost:5173',
        'http://localhost:1420',
        'tauri://localhost',
        'http://tauri.localhost',
    ]


def test_app_imports_with_auth_routes() -> None:
    paths = {route.path for route in app.routes}

    assert '/api/auth/register/complete' in paths
    assert '/api/auth/login' in paths
    assert '/api/auth/me' in paths
    assert '/api/uploads' in paths
    assert '/api/admin/security/metrics' in paths
    assert '/api/admin/maintenance' in paths
    assert '/api/admin/maintenance/retention' in paths
    assert '/api/admin/audit-logs' in paths
    assert '/api/admin/branches' in paths
    assert '/api/admin/reports' in paths
    assert '/api/news' in paths
    assert '/api/news/admin/news' in paths
    assert '/api/chats/branches/private' in paths
    assert '/api/chats/branches/{chat_id}' in paths
    assert '/api/chats/branches/{chat_id}/notifications' in paths
    assert '/api/chats/groups' in paths
    assert '/api/chats/groups/join' in paths
    assert '/api/chats/groups/{chat_id}/members' in paths
    assert '/api/chats/groups/{chat_id}/ownership' in paths
    assert '/api/chats/groups/{chat_id}/invite' in paths
    assert '/api/chats/{branch_id}/messages/{post_id}/comments' in paths
    assert '/api/notifications/mobile-config' in paths
    assert '/api/notifications/history' in paths
    assert '/api/releases/android' in paths
    assert '/api/notifications/mobile-tokens' in paths
    assert '/api/chats/{chat_id}/messages/{message_id}' in paths
    assert '/api/safety/blocks' in paths
    assert '/api/safety/reports' in paths
