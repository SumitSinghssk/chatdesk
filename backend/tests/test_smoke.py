import pytest

from app.main import app

from .conftest import ADMIN_EMAIL, CSRF

SKIP_PATHS = {
    "/api/v1/admin/auth/logout",
}


def _get_routes(prefix: str) -> list[str]:
    paths = app.openapi().get("paths", {})
    return sorted(
        path
        for path, methods in paths.items()
        if "get" in methods and path.startswith(prefix) and "{" not in path and path not in SKIP_PATHS
    )


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] is True


def test_login_requires_csrf_header(client):
    res = client.post("/api/v1/admin/auth/login", json={"email": ADMIN_EMAIL, "password": "x"})
    assert res.status_code == 403


def test_login_rejects_wrong_password(client):
    res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
        headers=CSRF,
    )
    assert res.status_code in (401, 422)
    assert "access_token" not in res.text


def test_admin_api_requires_token(client):
    res = client.get("/api/v1/admin/users/", headers=CSRF)
    assert res.status_code == 401


def test_me_returns_signed_in_user(client, admin_headers):
    res = client.get("/api/v1/admin/auth/me", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json()["data"]["email"] == ADMIN_EMAIL


@pytest.mark.parametrize("path", _get_routes("/api/v1/admin/"))
def test_admin_get_endpoints_do_not_crash(client, admin_headers, path):
    res = client.get(path, headers=admin_headers)
    assert res.status_code < 500, f"{path} -> {res.status_code}: {res.text[:300]}"


@pytest.mark.parametrize("path", _get_routes("/api/v1/website/"))
def test_website_get_endpoints_do_not_crash(client, path):
    res = client.get(path)
    assert res.status_code < 500, f"{path} -> {res.status_code}: {res.text[:300]}"
