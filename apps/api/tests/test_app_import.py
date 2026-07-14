from app.main import app


def test_app_imports_with_auth_routes() -> None:
    paths = {route.path for route in app.routes}

    assert '/api/auth/register/complete' in paths
    assert '/api/auth/login' in paths
    assert '/api/auth/me' in paths
    assert '/api/uploads' in paths
