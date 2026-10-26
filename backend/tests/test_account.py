# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import io
import json
import zipfile
from datetime import timedelta

import pyotp
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.modules.customer.account import notify
from app.modules.customer.inbox.models import WaConversation
from app.shared.utils.datetime import now
from tests.test_inbox import BASE, WEB, business, first_conversation, inbound  # noqa: F401
from tests.test_team import _join

A = f"{BASE}/account"
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")


def _browser():
    c = TestClient(app, base_url="http://testserver")
    c.__enter__()
    return c


def _turn_on_2fa(web):
    setup = web.post(f"{A}/two-factor/setup", headers=WEB).json()["data"]
    assert setup["qr_svg"].startswith("<?xml") or "<svg" in setup["qr_svg"]
    assert setup["uri"].startswith("otpauth://totp/ChatDesk")
    wrong = web.post(f"{A}/two-factor/confirm", headers=WEB, json={"code": "000000"})
    assert wrong.status_code == 422
    done = web.post(f"{A}/two-factor/confirm", headers=WEB, json={"code": pyotp.TOTP(setup["secret"]).now()})
    assert done.status_code == 200, done.text
    return setup["secret"], done.json()["data"]["recovery_codes"]


def test_two_step_sign_in_with_app_code_and_recovery_code(business):
    email = business.get(f"{A}/me").json()["data"]["email"]
    secret, codes = _turn_on_2fa(business)
    assert len(codes) == 8
    me = business.get(f"{A}/me").json()["data"]
    assert me["two_factor_enabled"] is True
    assert business.get(f"{A}/security").json()["data"]["two_factor"]["recovery_left"] == 8

    # signing in now stops at the code
    phone = _browser()
    res = phone.post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "Secret@123"})
    assert res.status_code == 200 and res.json()["data"]["two_factor_required"] is True
    assert phone.get(f"{A}/me").status_code == 401  # no session yet
    token = res.json()["data"]["two_factor_token"]
    bad = phone.post(f"{BASE}/auth/two-factor", headers=WEB, json={"two_factor_token": token, "code": "123456"})
    assert bad.status_code == 422 and "code" in bad.json()["errors"]
    # the code the owner's phone shows now was already used to turn it on: wait for a fresh one is not
    # practical in a test, so use a recovery code (works once)
    ok = phone.post(f"{BASE}/auth/two-factor", headers=WEB, json={"two_factor_token": token,
                                                                  "recovery_code": codes[0]})
    assert ok.status_code == 200 and ok.json()["data"]["recovery_left"] == 7
    assert phone.get(f"{A}/me").status_code == 200
    again = _browser().post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "Secret@123"})
    reused = _browser().post(f"{BASE}/auth/two-factor", headers=WEB, json={
        "two_factor_token": again.json()["data"]["two_factor_token"], "recovery_code": codes[0]})
    assert reused.status_code == 422
    forged = _browser().post(f"{BASE}/auth/two-factor", headers=WEB, json={"two_factor_token": "x.y.z", "code": "1"})
    assert forged.status_code == 401

    # history shows the failures and the successes
    history = business.get(f"{A}/login-history").json()["data"]
    reasons = [h["reason"] for h in history]
    assert "wrong two-step code" in reasons and "wrong recovery code" in reasons
    assert any(h["method"] == "Two-step code" and h["success"] for h in history)

    # new recovery codes and turning it off need the password
    assert business.post(f"{A}/two-factor/recovery-codes", headers=WEB, json={"password": "nope"}).status_code == 422
    fresh = business.post(f"{A}/two-factor/recovery-codes", headers=WEB, json={"password": "Secret@123"})
    assert len(fresh.json()["data"]["recovery_codes"]) == 8
    assert business.post(f"{A}/two-factor/disable", headers=WEB, json={"password": "x"}).status_code == 422
    off = business.post(f"{A}/two-factor/disable", headers=WEB, json={"password": "Secret@123"})
    assert off.status_code == 200 and off.json()["data"]["enabled"] is False
    plain = _browser().post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "Secret@123"})
    assert "customer" in plain.json()["data"]


def test_wrong_password_is_in_history_and_other_devices_can_be_signed_out(business):
    email = business.get(f"{A}/me").json()["data"]["email"]
    other = _browser()
    assert other.post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "wrong"}).status_code == 401
    assert other.post(f"{BASE}/auth/login", headers=WEB, json={"login": email, "password": "Secret@123"}) \
        .status_code == 200
    history = business.get(f"{A}/login-history").json()["data"]
    assert history[0]["success"] and history[1]["reason"] == "wrong password"
    out = business.delete(f"{A}/sessions", headers=WEB).json()
    assert out["data"]["count"] >= 1
    assert other.get(f"{A}/me").status_code == 401 and business.get(f"{A}/me").status_code == 200


def test_photo_job_title_and_email_change_with_code(business):
    me = business.get(f"{A}/me").json()["data"]
    up = business.post(f"{A}/avatar", headers=WEB, files={"file": ("me.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    assert "/storage/uploads/avatars/" in up.json()["data"]["avatar"]
    assert business.delete(f"{A}/avatar", headers=WEB).json()["data"]["avatar"] is None
    bad = business.post(f"{A}/avatar", headers=WEB, files={"file": ("x.png", b"not an image", "image/png")})
    assert bad.status_code in (400, 422)

    saved = business.put(f"{A}/profile", headers=WEB, json={"name": "Inbox Owner", "business_name": "Inbox Co",
                                                            "email": me["email"], "job_title": "Founder"})
    assert saved.json()["data"]["job_title"] == "Founder"
    direct = business.put(f"{A}/profile", headers=WEB, json={"name": "Inbox Owner", "email": "new@example.com"})
    assert direct.status_code == 422 and "Change email" in direct.json()["errors"]["email"][0]

    new = f"new-{me['id']}@example.com"
    assert business.post(f"{A}/email", headers=WEB, json={"email": new, "password": "x"}).status_code == 422
    sent = business.post(f"{A}/email", headers=WEB, json={"email": new, "password": "Secret@123"})
    assert sent.status_code == 200, sent.text
    code = sent.json()["data"]["dev_code"]  # no email server in tests
    assert business.get(f"{A}/me").json()["data"]["pending_email"] == new
    assert business.post(f"{A}/email/verify", headers=WEB, json={"code": "000000"}).status_code == 422
    done = business.post(f"{A}/email/verify", headers=WEB, json={"code": code}).json()["data"]
    assert done["email"] == new and done["email_verified"] and done["pending_email"] is None


def test_preferences_and_notification_settings(business):
    prefs = business.put(f"{A}/preferences", headers=WEB, json={"timezone": "Asia/Dubai", "theme": "dark",
                                                                "sound": False, "date_format": "month_first"})
    assert prefs.status_code == 200 and business.get(f"{A}/me").json()["data"]["preferences"]["theme"] == "dark"
    assert business.put(f"{A}/preferences", headers=WEB, json={"timezone": "Mars/Base"}).status_code == 422

    settings = business.get(f"{A}/notification-settings").json()["data"]
    assert set(settings["events"]) == {"chat_assigned", "customer_waiting", "ai_handover", "campaign_finished",
                                       "whatsapp_problem", "new_order", "payment_received"}
    events = {k: {c: v[c] for c in ("in_app", "email", "browser")} for k, v in settings["events"].items()}
    events["campaign_finished"] = {"in_app": False, "email": False, "browser": False}
    saved = business.put(f"{A}/notification-settings", headers=WEB, json={"events": events, "waiting_minutes": 5})
    assert saved.json()["data"]["waiting_minutes"] == 5
    assert saved.json()["data"]["events"]["campaign_finished"]["in_app"] is False

    agent = _join(business)
    mine = agent.get(f"{A}/notification-settings").json()["data"]["events"]
    assert "campaign_finished" not in mine and "chat_assigned" in mine  # managers-only events hidden


def test_notifications_for_assignment_and_waiting_customers(business):
    agent = _join(business)
    inbound(business, wa_id="919800011111", text="Hello, anyone there?")
    conv = first_conversation(business)
    res = business.put(f"{BASE}/inbox/conversations/{conv['id']}/assign", headers=WEB,
                       json={"assignee_id": agent.member_id})
    assert res.status_code == 200, res.text
    feed = agent.get(f"{A}/notifications").json()["data"]
    assert feed["unread"] == 1 and feed["items"][0]["event"] == "chat_assigned"
    assert feed["items"][0]["url"] == f"/dashboard/inbox?c={conv['id']}" and feed["items"][0]["browser"] is True
    assert business.get(f"{A}/notifications").json()["data"]["unread"] == 0  # the owner assigned it

    # the customer waits longer than the agent's limit: one alert, not one a minute
    db = SessionLocal()
    try:
        db.query(WaConversation).filter(WaConversation.id == conv["id"]).update(
            {WaConversation.waiting_since: now() - timedelta(minutes=20)})
        db.commit()
        assert notify.waiting_alerts(db) >= 1
        assert notify.waiting_alerts(db) == 0
    finally:
        db.close()
    feed = agent.get(f"{A}/notifications").json()["data"]
    assert feed["unread"] == 2 and feed["items"][0]["event"] == "customer_waiting"
    assert "waiting 20 min" in feed["items"][0]["title"]
    assert agent.post(f"{A}/notifications/read", headers=WEB, json={"all": True}).json()["data"]["marked"] == 2
    assert agent.get(f"{A}/notifications").json()["data"]["unread"] == 0


def test_export_has_the_workspace_and_no_secrets(business):
    inbound(business, wa_id="919800022222", text="Export me")
    res = business.get(f"{A}/export")
    assert res.status_code == 200 and res.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    names = set(zf.namelist())
    assert {"account.json", "contacts.json", "messages.json", "templates.json", "README.txt"} <= names
    messages = json.loads(zf.read("messages.json"))
    assert any(m["text"] == "Export me" for m in messages)
    everything = b"".join(zf.read(n) for n in names).decode()
    assert "Secret@123" not in everything and "password" not in json.loads(zf.read("account.json"))


def test_member_leaves_and_owner_deletes_the_account(business):
    agent = _join(business)
    assert agent.post(f"{A}/delete", headers=WEB, json={"confirm": "DELETE", "password": "Secret@123"}) \
        .status_code == 422  # members type LEAVE
    left = agent.post(f"{A}/delete", headers=WEB, json={"confirm": "LEAVE", "password": "Secret@123"})
    assert left.status_code == 200 and agent.get(f"{A}/me").status_code == 401
    emails = [m["email"] for m in business.get(f"{BASE}/team/members").json()["data"]]
    assert agent.email not in emails

    assert business.post(f"{A}/delete", headers=WEB, json={"confirm": "DELETE", "password": "nope"}).status_code == 422
    gone = business.post(f"{A}/delete", headers=WEB, json={"confirm": "delete", "password": "Secret@123"})
    assert gone.status_code == 200
    assert business.get(f"{A}/me").status_code == 401
