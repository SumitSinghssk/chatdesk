# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import hashlib
import hmac
import json
import threading
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.modules.customer.integrations import api as public_api
from app.modules.customer.integrations import webhooks
from app.modules.customer.integrations.models import WebhookDelivery
from app.shared.utils.datetime import now
from tests.test_inbox import BASE, WEB, FakeMeta, business, inbound, post_webhook  # noqa: F401
from tests.test_team import _join

I = f"{BASE}/integrations"
P = "/api/v1/public"
ASHA = "919000000001"


class Receiver(BaseHTTPRequestHandler):
    """The business's server: records every webhook call and answers with `status`."""

    calls: list[dict] = []
    status = 200

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        Receiver.calls.append({"headers": self.headers, "body": body, "json": json.loads(body)})
        self.send_response(Receiver.status)
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def log_message(self, *args):
        pass


@pytest.fixture()
def receiver(monkeypatch):
    monkeypatch.setenv("WEBHOOKS_INLINE", "1")
    Receiver.calls, Receiver.status = [], 200
    server = HTTPServer(("127.0.0.1", 0), Receiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/hooks/chatdesk"
    server.shutdown()


def _key(web, name="Website"):
    res = web.post(f"{I}/keys", headers=WEB, json={"name": name})
    assert res.status_code == 200, res.text
    return res.json()["data"]["key"]


def _api(key):
    client = TestClient(app, base_url="http://testserver")
    client.headers["Authorization"] = f"Bearer {key}"
    return client


def test_api_keys_and_auth(business):
    key = _key(business)
    assert key.startswith("cdk_") and len(key) > 40
    listed = business.get(f"{I}/keys").json()["data"]
    assert listed[0]["name"] == "Website" and "key" not in listed[0] and listed[0]["hint"] == f"{key[:12]}…"
    agent = _join(business)
    assert agent.get(f"{I}/keys").status_code == 403  # owners and admins only

    anon = TestClient(app, base_url="http://testserver")
    res = anon.get(f"{P}/me")
    assert res.status_code == 401 and "Add your API key" in res.json()["message"]
    assert anon.get(f"{P}/me", headers={"Authorization": "Bearer cdk_wrong"}).status_code == 401
    me = anon.get(f"{P}/me", headers={"X-API-Key": key}).json()["data"]  # the other header works too
    assert me["phone"] == "+1 555 000 0000" and me["connected"] is True and me["business"] == "Inbox Co"
    assert business.get(f"{I}/keys").json()["data"][0]["last_used_at"]

    business.delete(f"{I}/keys/{listed[0]['id']}", headers=WEB)
    assert _api(key).get(f"{P}/me").status_code == 401  # deleted keys stop at once
    agent.__exit__(None, None, None)


def test_send_messages(business, monkeypatch):
    api = _api(_key(business))
    # no chat in the last 24 hours: only a template
    closed = api.post(f"{P}/messages", json={"to": "+91 90000 00001", "text": "Hi"})
    assert closed.status_code == 422 and "24-hour window is closed" in closed.json()["message"]
    business.get(f"{BASE}/inbox/templates", params={"fresh": True})
    bad = api.post(f"{P}/messages", json={"to": ASHA, "type": "template",
                                         "template": {"name": "order_update", "language": "en", "body": ["Asha"]}})
    assert bad.status_code == 422 and "Fill in every variable" in bad.text
    missing = api.post(f"{P}/messages", json={"to": ASHA, "type": "template", "template": {"name": "nope"}})
    assert missing.status_code == 422 and "No approved template" in missing.text
    res = api.post(f"{P}/messages", json={"to": "+919000000001", "type": "template", "name": "Asha K",
                                         "template": {"name": "order_update", "language": "en",
                                                      "body": ["Asha", "#1042"]}})
    assert res.status_code == 201, res.text
    sent = res.json()["data"]
    assert sent["status"] == "sent" and sent["to"] == "+919000000001" and sent["sent_by"] == "API (Website)"
    assert sent["text"].startswith("Hi Asha, order #1042 has shipped.")
    assert FakeMeta.sent[-1]["name"] == "order_update"
    contact = api.get(f"{P}/contacts/919000000001").json()["data"]
    assert contact["name"] == "Asha K" and contact["source"] == "api"

    inbound(business, text="Thanks! When will it arrive?")  # the window opens
    text = api.post(f"{P}/messages", json={"to": ASHA, "text": "Tomorrow by 6 pm"})
    assert text.status_code == 201 and FakeMeta.sent[-1]["text"] == "Tomorrow by 6 pm"
    got = api.get(f"{P}/messages/{text.json()['data']['id']}").json()["data"]
    assert got["direction"] == "outbound" and got["status"] == "sent" and got["wamid"].startswith("wamid.OUT")

    # files come from a link
    monkeypatch.setattr(public_api, "_download", lambda url, field: (b"%PDF-1.4 fake", "application/pdf", "bill.pdf"))
    wrong = api.post(f"{P}/messages", json={"to": ASHA, "type": "image", "media": {"url": "https://x.test/bill.pdf"}})
    assert wrong.status_code == 422 and "send it as \\\"type\\\": \\\"document\\\"" in wrong.text
    doc = api.post(f"{P}/messages", json={"to": ASHA, "type": "document",
                                         "media": {"url": "https://x.test/bill.pdf", "caption": "Your bill"}})
    assert doc.status_code == 201 and doc.json()["data"]["media"]["filename"] == "bill.pdf"
    assert FakeMeta.sent[-1]["type"] == "document" and FakeMeta.sent[-1]["caption"] == "Your bill"

    # Meta refusing a message is a 422 that still returns the message
    FakeMeta.fail_next = True
    refused = api.post(f"{P}/messages", json={"to": ASHA, "text": "One more"})
    assert refused.status_code == 422 and refused.json()["data"]["status"] == "failed"
    assert refused.json()["data"]["error"]["code"] == 131047

    chat = api.get(f"{P}/conversations/{ASHA}/messages", params={"limit": 3}).json()
    assert [m["direction"] for m in chat["data"]] == ["inbound", "outbound", "outbound"] or chat["meta"]["has_more"]
    convs = api.get(f"{P}/conversations").json()
    assert convs["data"][0]["contact"]["phone"] == "+919000000001" and convs["data"][0]["window_open"] is True
    templates = api.get(f"{P}/templates").json()["data"]
    assert {t["name"] for t in templates} == {"order_update", "promo_pic"}
    assert next(t for t in templates if t["name"] == "order_update")["variables"]["body"] == ["1", "2"]


def test_contacts(business):
    api = _api(_key(business))
    made = api.post(f"{P}/contacts", json={"phone": "+91 98111 22233", "name": "Ravi", "tags": ["vip"],
                                           "attributes": {"City": "Pune", "plan": "gold"}})
    assert made.status_code == 201 and made.json()["data"]["attributes"] == {"city": "Pune", "plan": "gold"}
    again = api.post(f"{P}/contacts", json={"phone": "919811122233", "email": "ravi@example.com"})
    assert again.status_code == 200 and again.json()["data"]["name"] == "Ravi"  # kept: only sent fields change
    api.post(f"{P}/contacts", json={"phone": "+919811100000", "name": "Meera"})
    patched = api.patch(f"{P}/contacts/+919811122233", json={"add_tags": ["repeat"], "remove_tags": ["vip"],
                                                              "attributes": {"plan": None, "pincode": 411001}})
    data = patched.json()["data"]
    assert data["tags"] == ["repeat"] and data["attributes"] == {"city": "Pune", "pincode": "411001"}
    assert api.get(f"{P}/contacts", params={"tag": "repeat"}).json()["data"][0]["name"] == "Ravi"
    page = api.get(f"{P}/contacts", params={"per_page": 1}).json()
    assert len(page["data"]) == 1 and page["meta"]["total"] == 2 and page["meta"]["has_more"] is True
    assert api.get(f"{P}/contacts", params={"search": "meer"}).json()["data"][0]["phone"] == "+919811100000"
    assert api.delete(f"{P}/contacts/919811122233").status_code == 200
    assert api.get(f"{P}/contacts/919811122233").status_code == 404
    assert api.post(f"{P}/contacts", json={"phone": "12"}).status_code == 422


def _verify(call, secret):
    t, v1 = (p.split("=", 1)[1] for p in call["headers"]["X-ChatDesk-Signature"].split(","))
    expected = hmac.new(secret.encode(), f"{t}.".encode() + call["body"], hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


def test_webhooks(business, receiver):
    assert business.post(f"{I}/webhooks", headers=WEB, json={"url": receiver, "events": ["bogus"]}).status_code == 422
    res = business.post(f"{I}/webhooks", headers=WEB, json={
        "url": receiver, "description": "CRM", "events": ["message.received", "contact.created", "message.delivered"]})
    assert res.status_code == 200, res.text
    hook = res.json()["data"]
    secret = hook["secret"]
    assert secret.startswith("whsec_") and "secret" not in business.get(f"{I}/webhooks").json()["data"][0]

    wamid = inbound(business, wa_id="919822200011", name="Neha", text="Do you deliver to Pune?")
    assert [c["json"]["event"] for c in Receiver.calls] == ["contact.created", "message.received"]
    created, received = (c["json"] for c in Receiver.calls)
    assert created["data"]["phone"] == "+919822200011" and created["data"]["profile_name"] == "Neha"
    assert received["data"]["text"] == "Do you deliver to Pune?" and received["data"]["from"] == "+919822200011"
    assert received["number"]["phone"] == "+1 555 000 0000" and received["id"].startswith("evt_")
    call = Receiver.calls[-1]
    assert _verify(call, secret) and call["headers"]["X-ChatDesk-Event"] == "message.received"

    # a status from Meta becomes message.delivered (sent isn't subscribed)
    api = _api(_key(business))
    out = api.post(f"{P}/messages", json={"to": "919822200011", "text": "Yes, we do!"}).json()["data"]
    for state in ("sent", "delivered", "delivered"):
        post_webhook(business, {"statuses": [{"id": out["wamid"], "status": state, "timestamp": "1790000000",
                                              "recipient_id": "919822200011"}]})
    assert [c["json"]["event"] for c in Receiver.calls][2:] == ["message.delivered"]  # once, not twice
    assert Receiver.calls[-1]["json"]["data"]["status"] == "delivered"

    # their server is down: the call waits for a retry, then goes through
    Receiver.status = 500
    inbound(business, wa_id="919822200011", text="Hello?", wamid=wamid + "2")
    with SessionLocal() as db:
        failing = db.query(WebhookDelivery).order_by(WebhookDelivery.id.desc()).first()
        assert failing.status == "pending" and failing.attempts == 1 and failing.response_status == 500
        assert failing.next_attempt_at > now()
        failing.next_attempt_at = now() - timedelta(seconds=1)
        db.commit()
        Receiver.status = 200
        webhooks.deliver(failing.id)  # what the retry ticker does once it is due
    listed = business.get(f"{I}/webhooks/{hook['id']}/deliveries").json()
    assert listed["data"][0]["status"] == "success" and listed["data"][0]["attempts"] == 2
    detail = business.get(f"{I}/webhooks/{hook['id']}/deliveries/{listed['data'][0]['id']}").json()["data"]
    assert detail["payload"]["data"]["text"] == "Hello?" and detail["response_body"] == '{"ok": true}'
    resent = business.post(f"{I}/webhooks/{hook['id']}/deliveries/{detail['id']}/resend", headers=WEB).json()
    assert resent["message"] == "Delivered" and Receiver.calls[-1]["json"]["id"] == detail["event_id"]

    # test events, a new secret, turning it off
    test = business.post(f"{I}/webhooks/{hook['id']}/test", headers=WEB, json={"event": "contact.created"}).json()
    assert test["message"] == "Your server answered 200" and Receiver.calls[-1]["json"]["test"] is True
    rolled = business.post(f"{I}/webhooks/{hook['id']}/secret", headers=WEB).json()["data"]["secret"]
    business.post(f"{I}/webhooks/{hook['id']}/test", headers=WEB, json={"event": "message.received"})
    assert rolled != secret and _verify(Receiver.calls[-1], rolled) and not _verify(Receiver.calls[-1], secret)
    business.put(f"{I}/webhooks/{hook['id']}", headers=WEB, json={"url": receiver, "events": ["*"], "enabled": False})
    before = len(Receiver.calls)
    inbound(business, wa_id="919822200011", text="Anyone?")
    assert len(Receiver.calls) == before
    assert business.get(f"{I}/events").json()["data"][0]["event"] == "message.received"
