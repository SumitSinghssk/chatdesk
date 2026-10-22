from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.shared.utils.datetime import day_start, iso, to_site, to_utc

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD, CSRF

KOLKATA = ZoneInfo("Asia/Kolkata")


def test_times_are_utc_and_serialized_with_z():
    assert iso(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05Z"
    assert iso(date(2026, 1, 2)) == "2026-01-02"
    assert to_utc(datetime(2026, 1, 2, 10, 0), KOLKATA) == datetime(2026, 1, 2, 4, 30)
    assert to_utc(datetime(2026, 1, 2, 10, 0, tzinfo=ZoneInfo("UTC"))) == datetime(2026, 1, 2, 10, 0)
    assert to_site(datetime(2026, 1, 2, 4, 30), KOLKATA) == datetime(2026, 1, 2, 10, 0)
    assert day_start(date(2026, 1, 2), KOLKATA) == datetime(2026, 1, 1, 18, 30)


def test_token_lifetimes_come_from_security_settings(client, admin_headers):
    current = client.get("/api/v1/admin/settings/security", headers=admin_headers).json()["data"]
    try:
        res = client.put("/api/v1/admin/settings/security", headers=admin_headers,
                         json={**current, "access_token_minutes": 45})
        assert res.status_code == 200, res.text
        login = client.post("/api/v1/admin/auth/login", headers=CSRF,
                            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "remember": False})
        data = login.json()["data"]
        assert data["expires_in"] == 45 * 60
        assert data["user"]["site"]["timezone"] and data["user"]["site"]["name"]
        assert data["user"]["last_login_at"].endswith("Z")
    finally:
        client.put("/api/v1/admin/settings/security", headers=admin_headers, json=current)
