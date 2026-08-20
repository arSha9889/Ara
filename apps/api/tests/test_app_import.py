from app.main import app


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
    assert '/api/chats/{branch_id}/messages/{post_id}/comments' in paths
    assert '/api/notifications/mobile-config' in paths
    assert '/api/notifications/mobile-tokens' in paths
    assert '/api/safety/blocks' in paths
    assert '/api/safety/reports' in paths
