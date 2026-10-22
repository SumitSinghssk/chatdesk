import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core import rate_limiter
from app.main import app
from app.modules.customer.inbox import service as inbox_service
from app.modules.customer.whatsapp import service as wa_service
from app.services.whatsapp import WhatsAppError

WEB = {"X-Requested-With": "sk-web"}
BASE = "/api/v1/customer"
SECRET = "inbox-app-secret"


class FakeMeta:
    """Stands in for WhatsAppClient; records what would have been sent to Meta."""

    sent: list[dict] = []
    fail_next = False
    templates_data: list[dict] = []

    def __init__(self, phone_number_id, access_token, timeout=20):
        pass

    def phone_number(self):
        return {"display_phone_number": "+1 555 000 0000", "verified_name": "Inbox Test", "quality_rating": "GREEN",
                "messaging_limit_tier": "TIER_250"}

    def _ok(self, payload):
        if FakeMeta.fail_next:
            FakeMeta.fail_next = False
            raise WhatsAppError("(#131047) Re-engagement message", 400, 131047, "More than 24 hours have passed")
        FakeMeta.sent.append(payload)
        return {"messages": [{"id": f"wamid.OUT{uuid.uuid4().hex}"}]}

    def send_text(self, to, text, reply_to=None):
        return self._ok({"to": to, "type": "text", "text": text, "reply_to": reply_to})

    def send_media(self, to, kind, media_id, caption=None, filename=None):
        return self._ok({"to": to, "type": kind, "media_id": media_id, "caption": caption})

    def send_template(self, to, name, language, components=None):
        return self._ok({"to": to, "type": "template", "name": name, "components": components})

    def upload_media(self, content, mime, filename):
        return "MEDIA123"

    def download_media(self, media_id):
        return b"\x89PNG fake image bytes", "image/png"

    def mark_read(self, message_id):
        FakeMeta.sent.append({"read": message_id})
        return {"success": True}

    def typing(self, message_id):
        FakeMeta.sent.append({"typing": message_id})
        return {"success": True}

    def send(self, payload):
        return self._ok(payload)

    def templates(self, waba_id, limit=200):
        return FakeMeta.templates_data


@pytest.fixture()
def business(client, admin_headers, monkeypatch):
    """A signed-in business with a connected (fake) WhatsApp number and its webhook URL."""
    rate_limiter._history.clear()  # every test signs up a new business from the same test IP
    monkeypatch.setattr(wa_service, "WhatsAppClient", FakeMeta)
    monkeypatch.setattr(inbox_service, "WhatsAppClient", FakeMeta)
    inbox_service._template_cache.clear()
    FakeMeta.sent, FakeMeta.fail_next = [], False
    FakeMeta.templates_data = [
        {"name": "order_update", "language": "en", "status": "APPROVED", "category": "UTILITY",
         "components": [{"type": "BODY", "text": "Hi {{1}}, order {{2}} has shipped."},
                        {"type": "FOOTER", "text": "Thanks"}]},
        {"name": "promo_pic", "language": "en", "status": "APPROVED", "category": "MARKETING",
         "components": [{"type": "HEADER", "format": "IMAGE"}, {"type": "BODY", "text": "New arrivals"}]},
        {"name": "draft_one", "language": "en", "status": "PENDING", "components": []},
    ]
    original = client.get("/api/v1/admin/settings/customer_auth", headers=admin_headers).json()["data"]
    client.put("/api/v1/admin/settings/customer_auth", headers=admin_headers,
               json={**original, "password_enabled": True, "allow_registration": True})
    with TestClient(app, base_url="http://testserver") as web:
        assert web.post(f"{BASE}/auth/register", headers=WEB, json={
            "name": "Inbox Owner", "business_name": "Inbox Co", "email": f"inbox-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Secret@123", "password_confirmation": "Secret@123",
        }).status_code == 200
        data = web.put(f"{BASE}/whatsapp/connection", headers=WEB, json={
            "waba_id": "1111111111", "phone_number_id": "2222222222", "access_token": "tok", "app_secret": SECRET,
        }).json()["data"]
        assert data["status"] == "connected"
        web.hook = "/api/v1/website/whatsapp/webhook/" + data["webhook_url"].rsplit("/", 1)[1]
        yield web
    client.put("/api/v1/admin/settings/customer_auth", json=original, headers=admin_headers)


def post_webhook(web, value: dict, field: str = "messages"):
    body = json.dumps({"object": "whatsapp_business_account",
                       "entry": [{"id": "1", "changes": [{"field": field, "value": value}]}]}).encode()
    sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    res = web.post(web.hook, content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})
    assert res.status_code == 200, res.text


def inbound(web, wa_id="919000000001", text="Hello there", name="Asha", wamid=None, ts=None, **extra):
    wamid = wamid or f"wamid.IN{uuid.uuid4().hex}"
    message = {"from": wa_id, "id": wamid, "timestamp": str(ts or int(time.time())), "type": "text",
               "text": {"body": text}}
    message.update(extra)
    post_webhook(web, {"messaging_product": "whatsapp", "contacts": [{"profile": {"name": name}, "wa_id": wa_id}],
                       "messages": [message]})
    return wamid


def first_conversation(web):
    rows = web.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    assert rows, "expected a conversation"
    return rows[0]


def test_inbound_message_creates_contact_conversation_and_message(business):
    wamid = inbound(business, text="Is the blue kurta in stock?")
    inbound(business, text="Is the blue kurta in stock?", wamid=wamid)  # Meta retry: must not duplicate

    conv = first_conversation(business)
    assert conv["contact"]["profile_name"] == "Asha" and conv["contact"]["phone"] == "+919000000001"
    assert conv["unread_count"] == 1 and conv["status"] == "open" and conv["window_open"] is True
    assert conv["last_message_preview"] == "Is the blue kurta in stock?"

    msgs = business.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()
    assert [m["text"] for m in msgs["data"]] == ["Is the blue kurta in stock?"]
    assert msgs["data"][0]["direction"] == "in" and msgs["meta"]["has_more"] is False

    summary = business.get(f"{BASE}/inbox/summary").json()["data"]
    assert summary["open"] == 1 and summary["unread"] == 1
    overview = business.get(f"{BASE}/whatsapp/overview").json()["data"]["counts"]
    assert overview["messages"] == 1 and overview["contacts"] == 1


def test_media_location_interactive_and_reaction_messages(business):
    inbound(business, type="image", text=None, image={"id": "IMG1", "mime_type": "image/jpeg", "caption": "this one"})
    inbound(business, type="location", text=None,
            location={"latitude": 28.6, "longitude": 77.2, "name": "Shop", "address": "Delhi"})
    inbound(business, type="interactive", text=None,
            interactive={"type": "button_reply", "button_reply": {"id": "yes", "title": "Yes please"}})
    target = inbound(business, text="Thanks!")
    inbound(business, type="reaction", text=None, reaction={"message_id": target, "emoji": "👍"})

    conv = first_conversation(business)
    msgs = business.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"]
    by_type = {m["type"]: m for m in msgs}
    assert by_type["image"]["media"]["mime"] == "image/jpeg" and by_type["image"]["text"] == "this one"
    assert by_type["location"]["location"]["name"] == "Shop"
    assert by_type["interactive"]["text"] == "Yes please"
    assert by_type["reaction"]["text"] == "👍" and by_type["reaction"]["reaction_to"] == target
    assert conv["unread_count"] == 4  # reactions don't count as unread

    media = business.get(f"/api/v1{by_type['image']['media']['path']}")
    assert media.status_code == 200 and media.content.startswith(b"\x89PNG")


def test_reply_statuses_and_failed_delivery(business):
    inbound(business)
    conv = first_conversation(business)
    sent = business.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Yes, size M?"})
    assert sent.status_code == 200, sent.text
    msg = sent.json()["data"]
    assert msg["status"] == "sent" and msg["direction"] == "out" and msg["sent_by"] == "Inbox Owner"
    assert FakeMeta.sent[-1]["text"] == "Yes, size M?"

    ts = int(time.time())
    post_webhook(business, {"statuses": [{"id": msg["wamid"], "status": "read", "timestamp": str(ts)}]})
    post_webhook(business, {"statuses": [{"id": msg["wamid"], "status": "delivered", "timestamp": str(ts)}]})
    latest = business.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"][-1]
    assert latest["status"] == "read" and latest["read_at"]  # statuses never move backwards

    FakeMeta.fail_next = True
    failed = business.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Hi"})
    assert failed.status_code == 200 and failed.json()["data"]["status"] == "failed"
    assert "24 hours" in failed.json()["data"]["error"]

    later = business.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Again"})
    wamid = later.json()["data"]["wamid"]
    post_webhook(business, {"statuses": [{"id": wamid, "status": "failed", "timestamp": str(ts),
                                          "errors": [{"code": 131026, "title": "Message undeliverable"}]}]})
    last = business.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"][-1]
    assert last["status"] == "failed" and last["error_code"] == 131026


def test_window_closed_requires_template(business):
    inbound(business, ts=int(time.time()) - 25 * 3600)
    conv = first_conversation(business)
    assert conv["window_open"] is False
    blocked = business.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Hi"})
    assert blocked.status_code == 422 and "template" in blocked.json()["message"]

    templates = business.get(f"{BASE}/inbox/templates").json()["data"]
    assert [t["name"] for t in templates] == ["order_update", "promo_pic"]  # only approved
    assert templates[0]["body_params"] == ["1", "2"] and templates[1]["supported"] is False

    missing = business.post(f"{BASE}/inbox/conversations/{conv['id']}/template", headers=WEB,
                            json={"name": "order_update", "language": "en", "body_params": [{"text": "Asha"}]})
    assert missing.status_code == 422
    ok = business.post(f"{BASE}/inbox/conversations/{conv['id']}/template", headers=WEB, json={
        "name": "order_update", "language": "en", "body_params": [{"text": "Asha"}, {"text": "#1042"}]})
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["text"] == "Hi Asha, order #1042 has shipped.\n\nThanks"
    assert FakeMeta.sent[-1]["components"][0]["parameters"][1] == {"type": "text", "text": "#1042"}


def test_status_read_contact_notes_and_tags(business):
    inbound(business)
    conv = first_conversation(business)
    cid = conv["id"]

    read = business.post(f"{BASE}/inbox/conversations/{cid}/read", headers=WEB).json()["data"]
    assert read["unread_count"] == 0 and "read" in FakeMeta.sent[-1]

    resolved = business.put(f"{BASE}/inbox/conversations/{cid}/status", headers=WEB, json={"status": "resolved"})
    assert resolved.json()["data"]["status"] == "resolved"
    assert business.get(f"{BASE}/inbox/conversations", params={"status": "open"}).json()["data"] == []
    inbound(business, text="One more question")
    assert first_conversation(business)["status"] == "open"  # a new message reopens it

    contact = business.put(f"{BASE}/inbox/conversations/{cid}/contact", headers=WEB,
                           json={"name": "Asha Verma", "tags": ["VIP", " lead ", "VIP"]}).json()["data"]["contact"]
    assert contact["display_name"] == "Asha Verma" and contact["tags"] == ["VIP", "lead"]
    assert business.get(f"{BASE}/inbox/tags").json()["data"] == ["lead", "VIP"]
    found = business.get(f"{BASE}/inbox/conversations", params={"search": "asha verma", "status": "all"}).json()
    assert len(found["data"]) == 1

    note = business.post(f"{BASE}/inbox/conversations/{cid}/notes", headers=WEB, json={"body": "Prefers COD"})
    nid = note.json()["data"]["id"]
    assert business.get(f"{BASE}/inbox/conversations/{cid}/notes").json()["data"][0]["body"] == "Prefers COD"
    assert business.delete(f"{BASE}/inbox/conversations/{cid}/notes/{nid}", headers=WEB).status_code == 200

    business.put(f"{BASE}/inbox/conversations/{cid}/contact", headers=WEB, json={"blocked": True})
    assert business.post(f"{BASE}/inbox/conversations/{cid}/messages", headers=WEB,
                         json={"text": "hi"}).status_code == 422


def test_send_media_and_start_conversation(business):
    started = business.post(f"{BASE}/inbox/conversations", headers=WEB, json={"phone": "+91 90000 00009", "name": "Ravi"})
    conv = started.json()["data"]
    assert conv["contact"]["wa_id"] == "919000000009" and conv["window_open"] is False
    again = business.post(f"{BASE}/inbox/conversations", headers=WEB, json={"phone": "919000000009"}).json()["data"]
    assert again["id"] == conv["id"]

    inbound(business, wa_id="919000000009", name="Ravi K")
    upload = business.post(f"{BASE}/inbox/conversations/{conv['id']}/media", headers=WEB,
                           files={"file": ("menu.pdf", b"%PDF-1.4 fake", "application/pdf")}, data={"caption": "Menu"})
    assert upload.status_code == 200, upload.text
    data = upload.json()["data"]
    assert data["type"] == "document" and data["media"]["filename"] == "menu.pdf" and data["status"] == "sent"
    assert business.get(f"/api/v1{data['media']['path']}").content == b"%PDF-1.4 fake"


def test_businesses_cannot_see_each_other(business, client, admin_headers, monkeypatch):
    inbound(business)
    conv = first_conversation(business)
    with TestClient(app, base_url="http://testserver") as other:
        other.post(f"{BASE}/auth/register", headers=WEB, json={
            "name": "Other Biz", "email": f"other-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Secret@123", "password_confirmation": "Secret@123"})
        assert other.get(f"{BASE}/inbox/conversations").json()["data"] == []
        assert other.get(f"{BASE}/inbox/conversations/{conv['id']}").status_code == 404
        assert other.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").status_code == 404
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(f"{BASE}/inbox/conversations").status_code == 401


def test_retry_failed_message(business):
    inbound(business)
    conv = first_conversation(business)
    FakeMeta.fail_next = True
    failed = business.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB,
                           json={"text": "Your order ships today"}).json()["data"]
    assert failed["status"] == "failed"
    retried = business.post(f"{BASE}/inbox/messages/{failed['id']}/retry", headers=WEB)
    assert retried.status_code == 200, retried.text
    data = retried.json()["data"]
    assert data["id"] == failed["id"] and data["status"] == "sent" and data["error"] is None
    assert FakeMeta.sent[-1] == {"to": "919000000001", "type": "text",
                                 "text": {"body": "Your order ships today", "preview_url": True}}
    again = business.post(f"{BASE}/inbox/messages/{failed['id']}/retry", headers=WEB)
    assert again.status_code == 422  # only failed messages can be retried


def test_quick_replies_crud(business):
    created = business.post(f"{BASE}/inbox/quick-replies", headers=WEB,
                            json={"shortcut": "/Thanks ", "text": "Thank you for shopping with us!"})
    assert created.status_code == 200, created.text
    qid = created.json()["data"]["id"]
    assert created.json()["data"]["shortcut"] == "thanks"
    dup = business.post(f"{BASE}/inbox/quick-replies", headers=WEB, json={"shortcut": "thanks", "text": "x"})
    assert dup.status_code == 409
    business.put(f"{BASE}/inbox/quick-replies/{qid}", headers=WEB, json={"shortcut": "ty", "text": "Thanks!"})
    rows = business.get(f"{BASE}/inbox/quick-replies").json()["data"]
    assert [(r["shortcut"], r["text"]) for r in rows] == [("ty", "Thanks!")]
    assert business.delete(f"{BASE}/inbox/quick-replies/{qid}", headers=WEB).status_code == 200
    assert business.get(f"{BASE}/inbox/quick-replies").json()["data"] == []


def test_typing_indicator_and_media_size(business):
    wamid = inbound(business)
    conv = first_conversation(business)
    assert business.post(f"{BASE}/inbox/conversations/{conv['id']}/typing", headers=WEB).status_code == 200
    assert FakeMeta.sent[-1] == {"typing": wamid}

    sent = business.post(f"{BASE}/inbox/conversations/{conv['id']}/media", headers=WEB,
                         files={"file": ("photo.png", b"P" * 2052, "image/png")}).json()["data"]
    assert sent["type"] == "image" and sent["media"]["size"] == 2052
    inline = business.get(f"/api/v1{sent['media']['path']}")
    assert inline.headers["content-disposition"].startswith("inline")
    download = business.get(f"/api/v1{sent['media']['path']}", params={"download": 1})
    assert download.headers["content-disposition"].startswith("attachment")
