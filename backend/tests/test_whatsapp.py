import hashlib
import hmac
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.customer.whatsapp import service as wa_service
from app.services.whatsapp import WhatsAppError

WEB = {"X-Requested-With": "sk-web"}
BASE = "/api/v1/customer"
APP_SECRET = "test-app-secret"


class FakeClient:
    fail = False

    def __init__(self, phone_number_id, access_token, timeout=15):
        self.access_token = access_token

    def phone_number(self):
        if FakeClient.fail or self.access_token != "good-token":
            raise WhatsAppError("Invalid OAuth access token", 401, 190)
        return {"display_phone_number": "+91 98765 43210", "verified_name": "Test Shop",
                "quality_rating": "GREEN", "messaging_limit_tier": "TIER_1K"}

    def send_text(self, to, text):
        return {"messages": [{"id": "wamid.TEST"}]}


@pytest.fixture()
def customer(client, admin_headers, monkeypatch):
    original = client.get("/api/v1/admin/settings/customer_auth", headers=admin_headers).json()["data"]
    client.put("/api/v1/admin/settings/customer_auth", headers=admin_headers,
               json={**original, "password_enabled": True, "allow_registration": True})
    monkeypatch.setattr(wa_service, "WhatsAppClient", FakeClient)
    with TestClient(app, base_url="http://testserver") as web:
        res = web.post(f"{BASE}/auth/register", headers=WEB, json={
            "name": "WA Customer", "email": f"wa-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Secret@123", "password_confirmation": "Secret@123",
        })
        assert res.status_code == 200, res.text
        yield web
    client.put("/api/v1/admin/settings/customer_auth", json=original, headers=admin_headers)


def _connect(web, token="good-token"):
    return web.put(f"{BASE}/whatsapp/connection", headers=WEB, json={
        "waba_id": "1234567890", "phone_number_id": "9876543210", "access_token": token, "app_secret": APP_SECRET,
    })


def test_requires_sign_in():
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(f"{BASE}/whatsapp/connection").status_code == 401


def test_connect_refresh_and_disconnect(customer):
    assert customer.get(f"{BASE}/whatsapp/connection").json()["data"] is None

    missing = customer.put(f"{BASE}/whatsapp/connection", headers=WEB,
                           json={"waba_id": "1234567890", "phone_number_id": "9876543210"})
    assert missing.status_code == 422 and "access_token" in missing.json()["errors"]

    bad = _connect(customer, token="bad-token")
    assert bad.status_code == 200 and bad.json()["data"]["status"] == "error"

    res = _connect(customer)
    data = res.json()["data"]
    assert res.status_code == 200 and data["status"] == "connected"
    assert data["display_phone_number"] == "+91 98765 43210" and data["quality_rating"] == "GREEN"
    assert data["has_access_token"] and "access_token" not in data
    assert data["webhook_url"].endswith(f"/api/v1/website/whatsapp/webhook/{data['webhook_url'].rsplit('/', 1)[1]}")

    sent = customer.post(f"{BASE}/whatsapp/connection/test-message", headers=WEB,
                         json={"to": "+91 98765 43210", "text": "Hi"})
    assert sent.status_code == 200 and sent.json()["data"]["message_id"] == "wamid.TEST"

    assert customer.delete(f"{BASE}/whatsapp/connection", headers=WEB).status_code == 200
    assert customer.get(f"{BASE}/whatsapp/connection").json()["data"] is None


def test_webhook_verify_and_receive(customer):
    data = _connect(customer).json()["data"]
    key = data["webhook_url"].rsplit("/", 1)[1]
    url = f"/api/v1/website/whatsapp/webhook/{key}"

    with TestClient(app, base_url="http://testserver") as meta:
        wrong = meta.get(url, params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42"})
        assert wrong.status_code == 403
        ok = meta.get(url, params={"hub.mode": "subscribe", "hub.verify_token": data["verify_token"],
                                   "hub.challenge": "1158201444"})
        assert ok.status_code == 200 and ok.text == "1158201444"

        body = json.dumps({"object": "whatsapp_business_account", "entry": [{"changes": [{
            "field": "messages",
            "value": {"messages": [{"from": "919876543210", "id": f"wamid.IN{uuid.uuid4().hex}", "type": "text",
                                    "text": {"body": "Hello"}}]},
        }]}]}).encode()
        sig = "sha256=" + hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()

        assert meta.post(url, content=body, headers={"X-Hub-Signature-256": "sha256=bad"}).status_code == 401
        res = meta.post(url, content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})
        assert res.status_code == 200, res.text
        assert meta.post("/api/v1/website/whatsapp/webhook/unknown", content=body).status_code == 404

    overview = customer.get(f"{BASE}/whatsapp/overview").json()["data"]
    assert overview["counts"]["messages"] == 1
    assert overview["connection"]["webhook_verified_at"] and overview["connection"]["last_event_at"]
