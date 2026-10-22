import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.customer.auth import otp as otp_module
from app.services.sms import GATEWAYS, SmsError

WEB = {"X-Requested-With": "sk-web"}
BASE = "/api/v1/customer"


@pytest.fixture()
def web():
    with TestClient(app, base_url="http://testserver") as c:
        yield c


@pytest.fixture()
def auth_settings(client, admin_headers):
    original = client.get("/api/v1/admin/settings/customer_auth", headers=admin_headers).json()["data"]

    def apply(**values):
        res = client.put("/api/v1/admin/settings/customer_auth", json={**original, **values}, headers=admin_headers)
        assert res.status_code == 200, res.text

    yield apply
    client.put("/api/v1/admin/settings/customer_auth", json=original, headers=admin_headers)


def _phone() -> str:
    return "9" + str(uuid.uuid4().int)[:9]


def test_register_login_logout(web, auth_settings):
    auth_settings(password_enabled=True, allow_registration=True)
    email = f"cust-{uuid.uuid4().hex[:8]}@example.com"
    res = web.post(f"{BASE}/auth/register", headers=WEB, json={
        "name": "Test Customer", "email": email, "password": "Secret@123", "password_confirmation": "Secret@123",
    })
    assert res.status_code == 200, res.text
    assert web.cookies.get("sk_customer") and web.cookies.get("sk_member") == "1"
    me = web.get(f"{BASE}/account/me")
    assert me.status_code == 200 and me.json()["data"]["email"] == email

    assert web.post(f"{BASE}/auth/logout", headers=WEB).status_code == 200
    assert web.get(f"{BASE}/account/me").status_code == 401

    bad = web.post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "wrong-pass"})
    assert bad.status_code == 401
    good = web.post(f"{BASE}/auth/login", headers=WEB, json={"login": email.upper(), "password": "Secret@123"})
    assert good.status_code == 200, good.text


def test_csrf_header_required(web):
    res = web.post(f"{BASE}/auth/login", json={"login": "a@b.co", "password": "x"})
    assert res.status_code == 403


def test_password_login_can_be_turned_off(web, auth_settings):
    auth_settings(password_enabled=False, otp_enabled=True)
    res = web.post(f"{BASE}/auth/login", headers=WEB, json={"login": "a@b.co", "password": "whatever"})
    assert res.status_code == 403
    options = web.get(f"{BASE}/auth/options").json()["data"]
    assert options["password"] is False and options["otp"] is True


def test_at_least_one_method_required(client, admin_headers, auth_settings):
    current = client.get("/api/v1/admin/settings/customer_auth", headers=admin_headers).json()["data"]
    res = client.put("/api/v1/admin/settings/customer_auth", headers=admin_headers, json={
        **current, "password_enabled": False, "otp_enabled": False, "google_enabled": False,
    })
    assert res.status_code == 422


def test_otp_login_creates_customer(web, auth_settings, monkeypatch):
    auth_settings(otp_enabled=True, allow_registration=True, otp_length=6, otp_max_attempts=3)
    monkeypatch.setattr(otp_module.secrets, "randbelow", lambda n: 123456)
    phone = _phone()
    sent = web.post(f"{BASE}/auth/otp/send", headers=WEB, json={"phone": phone})
    assert sent.status_code == 200, sent.text
    assert sent.json()["data"]["is_new"] is True

    again = web.post(f"{BASE}/auth/otp/send", headers=WEB, json={"phone": phone})
    assert again.status_code == 429

    wrong = web.post(f"{BASE}/auth/otp/verify", headers=WEB, json={"phone": phone, "code": "000000"})
    assert wrong.status_code == 422
    ok = web.post(f"{BASE}/auth/otp/verify", headers=WEB, json={"phone": phone, "code": "123456", "name": "Otp User"})
    assert ok.status_code == 200, ok.text
    customer = ok.json()["data"]["customer"]
    assert customer["phone"] == f"+91{phone}" and customer["phone_verified"] and customer["name"] == "Otp User"

    reused = web.post(f"{BASE}/auth/otp/verify", headers=WEB, json={"phone": phone, "code": "123456"})
    assert reused.status_code == 422


def test_sms_failover_uses_next_gateway(client, admin_headers, monkeypatch):
    original = client.get("/api/v1/admin/sms/", headers=admin_headers).json()["data"]["settings"]
    calls = []

    def failing(cfg, message):
        calls.append("msg91")
        raise SmsError("HTTP 401: bad key")

    def working(cfg, message):
        calls.append("twilio")
        return "SM123"

    monkeypatch.setattr(GATEWAYS["msg91"], "send", failing)
    monkeypatch.setattr(GATEWAYS["twilio"], "send", working)
    payload = {
        "default_country_code": "91",
        "order": ["msg91", "twilio", "fast2sms", "exotel", "gupshup"],
        "gateways": {
            "msg91": {"enabled": True, "auth_key": "k", "sender_id": ""},
            "twilio": {"enabled": True, "account_sid": "AC1", "auth_token": "t", "from_number": "+15550001111"},
        },
        "templates": {"login_otp": {"body": "{code} is your code", "template_ids": {"msg91": "tpl"}}},
    }
    try:
        res = client.put("/api/v1/admin/sms/", json=payload, headers=admin_headers)
        assert res.status_code == 200, res.text
        saved = res.json()["data"]["settings"]["gateways"]
        assert saved["msg91"]["has_auth_key"] and "auth_key" not in saved["msg91"]

        test = client.post("/api/v1/admin/sms/test", json={"phone": _phone()}, headers=admin_headers)
        assert test.status_code == 200, test.text
        assert test.json()["data"]["gateway"] == "twilio"
        assert calls == ["msg91", "twilio"]

        logs = client.get("/api/v1/admin/sms/logs", headers=admin_headers).json()["data"]
        assert logs[0]["gateway"] == "twilio" and "123456" not in (logs[0]["message"] or "")
    finally:
        restore = {**original, "gateways": {k: {**v, "enabled": original["gateways"][k]["enabled"]}
                                            for k, v in original["gateways"].items()}}
        for values in restore["gateways"].values():
            for key in [k for k in values if k.startswith("has_")]:
                values.pop(key)
                values[f"clear_{key[4:]}"] = True
        client.put("/api/v1/admin/sms/", json=restore, headers=admin_headers)


def test_admin_customers_crud(client, admin_headers):
    phone = _phone()
    res = client.post("/api/v1/admin/customers/", headers=admin_headers,
                      json={"name": "Admin Made", "phone": phone, "status": "active"})
    assert res.status_code == 200, res.text
    customer = res.json()["data"]
    assert customer["phone"] == f"+91{phone}" and customer["signup_method"] == "admin"

    dup = client.post("/api/v1/admin/customers/", headers=admin_headers, json={"name": "Dup", "phone": phone})
    assert dup.status_code == 409

    listed = client.get("/api/v1/admin/customers/", params={"search": phone[-6:], "page": 1, "per_page": 5},
                        headers=admin_headers)
    assert any(c["id"] == customer["id"] for c in listed.json()["data"])
    assert client.get("/api/v1/admin/customers/stats", headers=admin_headers).json()["data"]["total"] >= 1
    assert client.delete(f"/api/v1/admin/customers/{customer['id']}", headers=admin_headers).status_code == 200


def test_sms_templates_save_separately(client, admin_headers):
    before = client.get("/api/v1/admin/sms/", headers=admin_headers).json()["data"]["settings"]
    original = before["templates"]["login_otp"]
    try:
        res = client.put("/api/v1/admin/sms/templates", headers=admin_headers, json={
            "templates": {"login_otp": {"body": "{code} is your test code", "template_ids": {"msg91": "T1"}}},
        })
        assert res.status_code == 200, res.text
        after = res.json()["data"]["settings"]
        assert after["templates"]["login_otp"]["body"] == "{code} is your test code"
        assert after["templates"]["login_otp"]["template_ids"] == {"msg91": "T1"}
        assert after["order"] == before["order"] and after["gateways"] == before["gateways"]

        kept = client.put("/api/v1/admin/sms/", headers=admin_headers, json={
            "default_country_code": before["default_country_code"], "order": before["order"], "gateways": {},
        })
        assert kept.status_code == 200, kept.text
        assert kept.json()["data"]["settings"]["templates"]["login_otp"]["body"] == "{code} is your test code"

        empty = client.put("/api/v1/admin/sms/templates", headers=admin_headers,
                           json={"templates": {"login_otp": {"body": "  "}}})
        assert empty.status_code == 422
    finally:
        client.put("/api/v1/admin/sms/templates", headers=admin_headers, json={"templates": {"login_otp": original}})


def test_business_name_and_whatsapp_filter(web, auth_settings, client, admin_headers):
    auth_settings(password_enabled=True, allow_registration=True)
    tag = uuid.uuid4().hex[:8]
    email = f"biz-{tag}@example.com"
    res = web.post(f"{BASE}/auth/register", headers=WEB, json={
        "name": "Biz Owner", "business_name": "Aanya Fashion", "email": email,
        "password": "Secret@123", "password_confirmation": "Secret@123",
    })
    assert res.status_code == 200, res.text
    me = web.get(f"{BASE}/account/me").json()["data"]
    assert me["business_name"] == "Aanya Fashion" and "roles" not in me

    saved = web.put(f"{BASE}/account/profile", headers=WEB,
                    json={"name": "Biz Owner", "business_name": f"  Aanya Studio {tag} ", "email": email})
    assert saved.status_code == 200 and saved.json()["data"]["business_name"] == f"Aanya Studio {tag}"
    assert web.put(f"{BASE}/account/roles", headers=WEB, json={"roles": ["client"]}).status_code in (404, 405)

    params = {"search": f"Aanya Studio {tag}", "page": 1, "per_page": 5}
    listed = client.get("/api/v1/admin/customers/", params={**params, "whatsapp": "not_connected"},
                        headers=admin_headers).json()["data"]
    assert [c["email"] for c in listed] == [email]
    assert listed[0]["whatsapp"]["status"] == "not_connected" and listed[0]["business_name"] == f"Aanya Studio {tag}"
    connected = client.get("/api/v1/admin/customers/", params={**params, "whatsapp": "connected"},
                           headers=admin_headers).json()["data"]
    assert connected == []
    stats = client.get("/api/v1/admin/customers/stats", headers=admin_headers).json()["data"]
    assert stats["whatsapp"]["not_connected"] >= 1 and "roles" not in stats
