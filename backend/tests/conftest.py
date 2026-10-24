import os
from urllib.parse import urlparse

import pytest
from dotenv import load_dotenv

load_dotenv()

if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("RATE_LIMIT_BACKEND", "memory")
os.environ["WEBSITE_REVALIDATE"] = "off"
os.environ["CAMPAIGN_WORKER"] = "off"  # tests run campaigns explicitly
os.environ["CHATBOT_WORKER"] = "off"  # and chatbot delays / timeouts
os.environ["AI_WORKER"] = "off"  # AI agent replies run inline, so tests see them at once
os.environ["NOTIFY_WORKER"] = "off"  # waiting-customer alerts run when a test calls them
os.environ["NOTIFY_EMAIL_INLINE"] = "1"  # notification emails are sent before the request returns
os.environ.pop("SENTRY_DSN", None)

_db_name = urlparse(os.getenv("DATABASE_URL", "")).path.lstrip("/")
if "test" not in _db_name and os.getenv("ALLOW_ANY_TEST_DB") != "1":
    pytest.exit(
        f"Refusing to run tests against database '{_db_name}'. Point TEST_DATABASE_URL at a database whose "
        "name contains 'test' (it gets migrated and seeded), or set ALLOW_ANY_TEST_DB=1.",
        returncode=2,
    )

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "superadmin@gmail.com")
ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "Password@123")
CSRF = {"X-Requested-With": "sk-admin"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app, base_url="http://testserver") as c:
        yield c


@pytest.fixture(scope="session")
def admin_headers(client):
    res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "remember": False},
        headers=CSRF,
    )
    assert res.status_code == 200, res.text
    token = res.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}", **CSRF}
