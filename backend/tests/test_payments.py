import hashlib
import hmac
import json
import uuid

import pytest

from app.services.payments.gateways.razorpay import RazorpayGateway

SECRET = "test_key_secret"
WEBHOOK_SECRET = "whsec_test"
BASE = "/api/v1/admin/payments"


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@pytest.fixture()
def razorpay(client, admin_headers, monkeypatch):
    original = client.get(f"{BASE}/settings", headers=admin_headers).json()["data"]["settings"]
    calls = []

    def fake_http(url, *, method="GET", body=None, basic=None):
        calls.append((method, url, body))
        if basic != ("rzp_test_abc", SECRET):
            return 401, {"error": {"description": "Authentication failed"}}, ""
        if url.endswith("/orders") and method == "POST":
            return 200, {"id": f"order_{uuid.uuid4().hex[:10]}", "amount": body["amount"],
                         "currency": body["currency"]}, ""
        if "/payments/" in url:
            return 200, {"status": "captured", "method": "upi"}, ""
        return 200, {"items": []}, ""

    monkeypatch.setattr(RazorpayGateway, "http", staticmethod(fake_http))
    res = client.put(f"{BASE}/settings", headers=admin_headers, json={
        "currency": "INR",
        "default_gateway": "razorpay",
        "gateways": {"razorpay": {"enabled": True, "key_id": "rzp_test_abc", "key_secret": SECRET,
                                  "webhook_secret": WEBHOOK_SECRET, "checkout_name": "", "theme_color": "#4f46e5"}},
    })
    assert res.status_code == 200, res.text
    yield calls
    client.put(f"{BASE}/settings", headers=admin_headers, json={
        "currency": original["currency"], "default_gateway": original["default_gateway"],
        "gateways": {"razorpay": {"enabled": False, "key_id": "", "clear_key_secret": True,
                                  "clear_webhook_secret": True}},
    })


def test_settings_hide_secrets_and_detect_test_mode(client, admin_headers, razorpay):
    data = client.get(f"{BASE}/settings", headers=admin_headers).json()["data"]
    rp = data["settings"]["gateways"]["razorpay"]
    assert rp["has_key_secret"] and "key_secret" not in rp and rp["test_mode"] is True
    assert data["gateways"][0]["webhook_url"].endswith("/api/v1/website/payments/webhook/razorpay")


def test_enabling_requires_keys(client, admin_headers):
    res = client.put(f"{BASE}/settings", headers=admin_headers, json={
        "currency": "INR", "gateways": {"razorpay": {"enabled": True, "key_id": ""}},
    })
    assert res.status_code == 422
    assert "gateways.razorpay.key_id" in res.json()["errors"]


def test_connection_checkout_confirm_and_webhook(client, admin_headers, razorpay):
    ok = client.post(f"{BASE}/test-connection", headers=admin_headers, json={"gateway": "razorpay"})
    assert ok.status_code == 200, ok.text
    assert "test mode" in ok.json()["message"]

    started = client.post(f"{BASE}/test-checkout", headers=admin_headers, json={"amount": 1})
    assert started.status_code == 200, started.text
    checkout = started.json()["data"]["checkout"]
    assert checkout["key"] == "rzp_test_abc" and checkout["amount"] == 100 and checkout["order_id"]

    order_id = checkout["order_id"]
    bad = client.post(f"{BASE}/confirm", headers=admin_headers, json={"gateway": "razorpay", "data": {
        "razorpay_order_id": order_id, "razorpay_payment_id": "pay_1", "razorpay_signature": "nope"}})
    assert bad.status_code == 400

    started = client.post(f"{BASE}/test-checkout", headers=admin_headers, json={"amount": 2.5})
    order_id = started.json()["data"]["checkout"]["order_id"]
    signature = _sign(SECRET, f"{order_id}|pay_2".encode())
    good = client.post(f"{BASE}/confirm", headers=admin_headers, json={"gateway": "razorpay", "data": {
        "razorpay_order_id": order_id, "razorpay_payment_id": "pay_2", "razorpay_signature": signature}})
    assert good.status_code == 200, good.text
    assert good.json()["data"]["status"] == "paid" and good.json()["data"]["method"] == "upi"

    body = json.dumps({"event": "refund.processed", "payload": {
        "refund": {"entity": {"payment_id": "pay_2"}},
        "payment": {"entity": {"id": "pay_2", "order_id": order_id, "amount": 250, "method": "upi"}},
    }}).encode()
    event_id = f"evt_{uuid.uuid4().hex[:10]}"
    headers = {"X-Razorpay-Signature": _sign(WEBHOOK_SECRET, body), "X-Razorpay-Event-Id": event_id,
               "Content-Type": "application/json"}
    hook = client.post("/api/v1/website/payments/webhook/razorpay", content=body, headers=headers)
    assert hook.status_code == 200, hook.text
    again = client.post("/api/v1/website/payments/webhook/razorpay", content=body, headers=headers)
    assert again.json()["message"] == "Already processed"
    forged = client.post("/api/v1/website/payments/webhook/razorpay", content=body,
                         headers={**headers, "X-Razorpay-Signature": "forged"})
    assert forged.status_code == 400

    payments = client.get(f"{BASE}/transactions", headers=admin_headers).json()["data"]
    assert next(p for p in payments if p["gateway_order_id"] == order_id)["status"] == "refunded"
    hooks = client.get(f"{BASE}/webhooks", headers=admin_headers).json()["data"]
    assert {h["status"] for h in hooks[:2]} == {"processed", "rejected"}
