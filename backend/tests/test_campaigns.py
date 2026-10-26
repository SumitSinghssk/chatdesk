# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.customer.campaigns import runner
from tests.test_inbox import BASE, WEB, FakeMeta, business, post_webhook  # noqa: F401

C = f"{BASE}/campaigns"


@pytest.fixture()
def shop(business, monkeypatch):
    """The business with approved templates and a few contacts."""
    monkeypatch.setattr(runner, "SEND_GAP", 0)
    assert business.post(f"{BASE}/templates/sync", headers=WEB).status_code == 200
    templates = {t["name"]: t for t in business.get(f"{BASE}/templates", params={"page": 1}).json()["data"]}
    people = [
        {"phone": "9800000001", "name": "Asha Verma", "tags": ["VIP"], "attributes": {"order": "1042"}},
        {"phone": "9800000002", "name": "Ravi", "tags": ["VIP"], "opted_out": True},
        {"phone": "9800000003", "tags": ["VIP", "Wholesale"], "blocked": True},
        {"phone": "9800000004", "name": "Neha", "tags": ["Wholesale"]},
    ]
    ids = [business.post(f"{BASE}/contacts", headers=WEB, json=p).json()["data"]["id"] for p in people]
    business.templates, business.contact_ids = templates, ids
    return business


def _vars(**body):
    return {"body": body or {"1": {"source": "first_name", "fallback": "there"},
                             "2": {"source": "attribute", "value": "order", "fallback": "your order"}}}


def _campaign(shop, **extra):
    payload = {"name": "Diwali VIP", "template_id": shop.templates["order_update"]["id"],
               "audience": {"type": "tags", "tags": ["VIP"]}, "variables": _vars(), "action": "now"}
    payload.update(extra)
    return shop.post(C, headers=WEB, json=payload)


def test_preview_counts_cost_and_personalises(shop):
    res = shop.post(f"{C}/preview", headers=WEB, json={
        "template_id": shop.templates["order_update"]["id"], "audience": {"type": "tags", "tags": ["VIP"]},
        "variables": _vars()})
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert (data["matched"], data["eligible"], data["opted_out"], data["blocked"]) == (3, 1, 1, 1)
    assert data["cost"] == 0.12 and data["category"] == "utility" and data["daily_limit"] == 250
    assert data["samples"][0]["body"] == ["Asha", "1042"] and data["samples"][0]["missing"] == []

    both = shop.post(f"{C}/preview", headers=WEB, json={
        "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
        "audience": {"type": "tags", "tags": ["VIP", "Wholesale"], "tag_match": "all"}}).json()["data"]
    assert both["matched"] == 1  # only the blocked contact has both tags
    excluded = shop.post(f"{C}/preview", headers=WEB, json={
        "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
        "audience": {"type": "all", "exclude_tags": ["VIP"]}}).json()["data"]
    assert excluded["eligible"] == 1 and excluded["samples"][0]["body"] == ["Neha", "your order"]


def test_send_now_report_and_retarget(shop):
    created = _campaign(shop)
    assert created.status_code == 200, created.text
    campaign = created.json()["data"]
    assert campaign["status"] == "scheduled" and created.json()["message"] == "Sending started"

    assert runner.run_due() == [(campaign["id"], "completed")]
    sent = FakeMeta.sent[-1]
    assert sent["name"] == "order_update" and sent["to"] == "919800000001"
    assert sent["components"] == [{"type": "body", "parameters": [{"type": "text", "text": "Asha"},
                                                                  {"type": "text", "text": "1042"}]}]
    detail = shop.get(f"{C}/{campaign['id']}").json()["data"]
    assert detail["status"] == "completed" and detail["total"] == 1 and detail["skipped"] == 2
    assert detail["report"]["sent"] == 1 and detail["report"]["recipients"] == 3

    # the message is in Asha's chat, labelled with the campaign
    chats = shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    asha = next(c for c in chats if c["contact"]["wa_id"] == "919800000001")
    msg = shop.get(f"{BASE}/inbox/conversations/{asha['id']}/messages").json()["data"][-1]
    assert msg["template"]["campaign"] == {"id": campaign["id"], "name": "Diwali VIP"}
    assert msg["text"] == "Hi Asha, order 1042 has shipped.\n\nThanks"

    # Meta reports delivery and read; Asha taps a button and writes back
    for state in ("delivered", "read"):
        post_webhook(shop, {"statuses": [{"id": msg["wamid"], "status": state, "timestamp": "1900000000"}]})
    post_webhook(shop, {"contacts": [{"profile": {"name": "Asha"}, "wa_id": "919800000001"}],
                        "messages": [{"from": "919800000001", "id": f"wamid.CLICK{uuid.uuid4().hex}", "timestamp": "1900000001",
                                      "type": "button", "context": {"id": msg["wamid"]},
                                      "button": {"text": "Track", "payload": "Track"}}]})
    report = shop.get(f"{C}/{campaign['id']}").json()["data"]["report"]
    assert (report["delivered"], report["read"], report["replied"], report["clicked"]) == (1, 1, 1, 1)

    rows = shop.get(f"{C}/{campaign['id']}/recipients", params={"page": 1}).json()["data"]
    by_phone = {r["contact"]["phone"]: r for r in rows}
    assert by_phone["+919800000001"]["status"] == "read" and by_phone["+919800000001"]["replied"]
    assert by_phone["+919800000002"]["status"] == "skipped" and "Opted out" in by_phone["+919800000002"]["error"]
    only_read = shop.get(f"{C}/{campaign['id']}/recipients", params={"page": 1, "status": "read"}).json()
    assert only_read["meta"]["total"] == 1

    export = shop.get(f"{C}/{campaign['id']}/recipients/export")
    lines = list(csv.reader(io.StringIO(export.content.decode("utf-8-sig"))))
    assert lines[0][:3] == ["name", "phone", "status"] and len(lines) == 4

    # retarget: people who read it, and people who didn't reply
    def preview(segment):
        return shop.post(f"{C}/preview", headers=WEB, json={
            "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
            "audience": {"type": "campaign", "campaign_id": campaign["id"], "segment": segment}}).json()["data"]
    assert preview("read")["eligible"] == 1 and preview("clicked")["eligible"] == 1
    assert preview("not_replied")["matched"] == 0

    stats = shop.get(f"{C}/stats").json()["data"]
    assert stats["completed"] == 1 and stats["all_read"] == 1 and stats["sent_today"] >= 1


def test_schedule_validation_and_controls(shop):
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    assert _campaign(shop, action="schedule", scheduled_at=past).status_code == 422
    later = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    scheduled = _campaign(shop, action="schedule", scheduled_at=later)
    assert scheduled.status_code == 200 and scheduled.json()["message"].startswith("Scheduled for")
    cid = scheduled.json()["data"]["id"]
    assert runner.run_due() == []  # not due yet

    # still editable while scheduled; becomes a draft, then cancelled
    edit = shop.put(f"{C}/{cid}", headers=WEB, json={"name": "Renamed", "template_id": shop.templates["order_update"]["id"],
                                                     "variables": _vars(), "action": "draft"})
    assert edit.status_code == 200 and edit.json()["data"]["status"] == "draft"
    assert shop.post(f"{C}/{cid}/pause", headers=WEB).status_code == 422
    shop.put(f"{C}/{cid}", headers=WEB, json={"name": "Renamed", "template_id": shop.templates["order_update"]["id"],
                                              "variables": _vars(), "action": "schedule", "scheduled_at": later})
    assert shop.post(f"{C}/{cid}/cancel", headers=WEB).json()["data"]["status"] == "cancelled"
    assert shop.put(f"{C}/{cid}", headers=WEB, json={"name": "x", "template_id": shop.templates["order_update"]["id"],
                                                     "action": "draft"}).status_code == 422

    # sending needs every variable mapped and an approved template
    unmapped = _campaign(shop, variables={"body": {"1": {"source": "first_name"}}})
    assert unmapped.status_code == 422 and "variables.body.2" in unmapped.json()["errors"]
    pending = next(t for t in shop.get(f"{BASE}/templates", params={"page": 1}).json()["data"]
                   if t["status"] == "pending")
    assert _campaign(shop, template_id=pending["id"]).status_code == 422
    assert shop.delete(f"{C}/{cid}", headers=WEB).status_code == 200


def test_pause_resume_missing_values_and_media(shop):
    # a contact without the attribute and no fallback fails with a clear reason
    res = _campaign(shop, audience={"type": "all"}, variables={"body": {
        "1": {"source": "first_name", "fallback": "there"}, "2": {"source": "attribute", "value": "order"}}})
    cid = res.json()["data"]["id"]
    db_ids = runner.claim_due(runner.SessionLocal())
    assert db_ids == [cid]
    assert shop.post(f"{C}/{cid}/pause", headers=WEB).json()["data"]["status"] == "paused"
    assert runner.run(cid) == "paused"  # a paused campaign sends nothing
    assert shop.post(f"{C}/{cid}/resume", headers=WEB).json()["data"]["status"] == "sending"
    assert runner.run_due() == [(cid, "completed")]
    rows = {r["contact"]["phone"]: r for r in
            shop.get(f"{C}/{cid}/recipients", params={"page": 1}).json()["data"]}
    assert rows["+919800000001"]["status"] == "sent"
    assert rows["+919800000004"]["status"] == "failed" and "No value for {{2}}" in rows["+919800000004"]["error"]

    # image header + link and coupon buttons, the same file reused for everyone
    promo = shop.templates["promo_pic"]
    media = _campaign(shop, name="Promo", template_id=promo["id"], audience={"type": "tags", "tags": ["Wholesale"]},
                      variables={"buttons": {"0": {"source": "static", "value": "winter"},
                                             "1": {"source": "static", "value": "WIN20"}}})
    assert media.status_code == 200, media.text
    runner.run_due()
    sent = FakeMeta.sent[-1]["components"]
    assert sent[0]["parameters"][0] == {"type": "image", "image": {"id": "MEDIA123"}}
    assert sent[2]["parameters"] == [{"type": "coupon_code", "coupon_code": "WIN20"}]


def test_test_send_and_privacy(shop):
    test = shop.post(f"{C}/test", headers=WEB, json={
        "template_id": shop.templates["order_update"]["id"], "variables": _vars(), "phone": "74568 78881"})
    assert test.status_code == 200, test.text
    assert FakeMeta.sent[-1]["to"] == "917456878881" and test.json()["message"] == "Test sent to +917456878881"
    assert FakeMeta.sent[-1]["components"][0]["parameters"][0]["text"] == "there"  # unknown name -> fallback

    cid = _campaign(shop, action="draft").json()["data"]["id"]
    with TestClient(app, base_url="http://testserver") as other:
        other.post(f"{BASE}/auth/register", headers=WEB, json={
            "name": "Other", "business_name": "Other Co", "email": f"camp-other-{cid}@example.com",
            "password": "Secret@123", "password_confirmation": "Secret@123"})
        assert other.get(C, params={"page": 1}).json()["meta"]["total"] == 0
        assert other.get(f"{C}/{cid}").status_code == 404
        assert other.post(f"{C}/preview", headers=WEB, json={
            "template_id": shop.templates["order_update"]["id"]}).status_code == 422
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(C).status_code == 401


def test_expired_token_pauses_and_resume_retries(shop, monkeypatch):
    from app.services.whatsapp import WhatsAppError

    calls = {"n": 0}
    original = FakeMeta.send_template

    def expired_once(self, to, name, language, components=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise WhatsAppError("Error validating access token: Session has expired", 401, 190)
        return original(self, to, name, language, components)

    monkeypatch.setattr(FakeMeta, "send_template", expired_once)
    cid = _campaign(shop, audience={"type": "tags", "tags": ["Wholesale"]},
                    variables={"body": {"1": {"source": "first_name", "fallback": "there"},
                                        "2": {"source": "static", "value": "soon"}}}).json()["data"]["id"]
    assert runner.run_due() == [(cid, "paused")]
    paused = shop.get(f"{C}/{cid}").json()["data"]
    assert paused["status"] == "paused" and "expired" in paused["error"]
    assert paused["report"]["pending"] == 1 and paused["report"]["failed"] == 0  # back in the queue

    resumed = shop.post(f"{C}/{cid}/resume", headers=WEB).json()["data"]
    assert resumed["status"] == "sending" and resumed["error"] is None
    assert runner.run_due() == [(cid, "completed")]
    assert shop.get(f"{C}/{cid}").json()["data"]["report"]["sent"] == 1


def _follow_up(shop, source_id, segment="read_not_replied", hours=48, **extra):
    payload = {"name": "Nudge", "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
               "audience": {"type": "campaign", "campaign_id": source_id, "segment": segment},
               "action": "follow_up", "follow_up_hours": hours}
    payload.update(extra)
    return shop.post(C, headers=WEB, json=payload)


def _shift(campaign_id, **times):
    """Moves a campaign's times, as if the clock had moved on."""
    from app.modules.customer.campaigns.models import WaCampaign

    db = runner.SessionLocal()
    try:
        db.query(WaCampaign).filter(WaCampaign.id == campaign_id).update(times)
        db.commit()
    finally:
        db.close()


def test_follow_up_waits_then_sends_to_people_who_read_but_did_not_reply(shop):
    later = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    first = _campaign(shop, action="schedule", scheduled_at=later).json()["data"]

    # rules: a follow-up needs a wait, a retarget audience, and a first campaign that will be sent
    assert "follow_up_hours" in _follow_up(shop, first["id"], hours=None).json()["errors"]
    assert "audience.type" in _follow_up(shop, first["id"], audience={"type": "all"}).json()["errors"]
    draft = _campaign(shop, action="draft").json()["data"]
    assert "Send or schedule" in _follow_up(shop, draft["id"]).json()["errors"]["audience.campaign_id"][0]

    res = _follow_up(shop, first["id"])
    assert res.status_code == 200, res.text
    nudge = res.json()["data"]
    assert nudge["status"] == "waiting" and nudge["follow_up_of"] == first["id"]
    assert res.json()["message"].startswith("Follow-up saved. It goes out 2 days after")
    assert runner.run_due() == []  # neither is due

    # the first campaign can't be changed to follow up on its own follow-up
    loop = shop.put(f"{C}/{first['id']}", headers=WEB, json={
        "name": "Loop", "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
        "audience": {"type": "campaign", "campaign_id": nudge["id"], "segment": "read"},
        "action": "follow_up", "follow_up_hours": 1})
    assert loop.status_code == 422 and "itself" in loop.json()["errors"]["audience.campaign_id"][0]

    # the first campaign goes out; its follow-up gets a send time 48 hours after it finished
    shop.put(f"{C}/{first['id']}", headers=WEB, json={
        "name": "Diwali VIP", "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
        "audience": {"type": "tags", "tags": ["VIP"]}, "action": "now"})
    assert runner.run_due() == [(first["id"], "completed")]
    detail = shop.get(f"{C}/{first['id']}").json()["data"]
    waiting = shop.get(f"{C}/{nudge['id']}").json()["data"]
    assert waiting["status"] == "scheduled" and waiting["follows"]["id"] == first["id"]
    gap = datetime.fromisoformat(waiting["scheduled_at"]) - datetime.fromisoformat(detail["completed_at"])
    assert abs(gap - timedelta(hours=48)) < timedelta(seconds=5)
    assert [f["id"] for f in detail["follow_ups"]] == [nudge["id"]]
    assert detail["follow_ups"][0]["segment"] == "read_not_replied"

    # Asha read it and hasn't replied: she is in "read but didn't reply" and "didn't tap a button"
    rows = shop.get(f"{C}/{first['id']}/recipients", params={"page": 1}).json()["data"]
    asha = next(r for r in rows if r["contact"]["phone"] == "+919800000001")
    chat = shop.get(f"{BASE}/inbox/conversations/{asha['conversation_id']}/messages").json()["data"][-1]
    for state in ("delivered", "read"):
        post_webhook(shop, {"statuses": [{"id": chat["wamid"], "status": state, "timestamp": "1900000000"}]})
    counts = shop.get(f"{C}/{first['id']}/segments").json()["data"]
    assert (counts["read_not_replied"], counts["not_clicked"], counts["read"], counts["replied"]) == (1, 1, 1, 0)
    assert counts["not_read"] == 0 and counts["sent"] == 1  # opted-out and blocked people are never counted

    # two days pass: the follow-up goes to Asha
    _shift(nudge["id"], scheduled_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1))
    assert runner.run_due() == [(nudge["id"], "completed")]
    assert FakeMeta.sent[-1]["to"] == "919800000001"
    assert shop.get(f"{C}/{nudge['id']}").json()["data"]["report"]["sent"] == 1

    # once she writes back she leaves the group, and a new follow-up made now finds nobody
    post_webhook(shop, {"contacts": [{"profile": {"name": "Asha"}, "wa_id": "919800000001"}],
                        "messages": [{"from": "919800000001", "id": f"wamid.R{uuid.uuid4().hex}",
                                      "timestamp": "1900000002", "type": "text", "text": {"body": "Thanks!"}}]})
    counts = shop.get(f"{C}/{first['id']}/segments").json()["data"]
    assert counts["read_not_replied"] == 0 and counts["replied"] == 1
    late = _follow_up(shop, first["id"], hours=1).json()["data"]
    assert late["status"] == "scheduled"  # the first campaign is done, so it gets its time straight away


def test_follow_up_is_cancelled_with_its_first_campaign(shop):
    later = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    first = _campaign(shop, action="schedule", scheduled_at=later).json()["data"]
    nudge = _follow_up(shop, first["id"], segment="not_read", hours=6).json()["data"]
    assert shop.post(f"{C}/{first['id']}/cancel", headers=WEB).status_code == 200
    cancelled = shop.get(f"{C}/{nudge['id']}").json()["data"]
    assert cancelled["status"] == "cancelled" and "was cancelled" in cancelled["error"]
    assert "was cancelled" in _follow_up(shop, first["id"]).json()["errors"]["audience.campaign_id"][0]

    # deleting the first campaign cancels its waiting follow-ups too
    second = _campaign(shop, action="schedule", scheduled_at=later).json()["data"]
    other = _follow_up(shop, second["id"]).json()["data"]
    assert shop.post(f"{C}/{other['id']}/cancel", headers=WEB).status_code == 200  # a waiting one can be cancelled
    third = _follow_up(shop, second["id"]).json()["data"]
    edited = shop.put(f"{C}/{third['id']}", headers=WEB, json={
        "name": "Nudge again", "template_id": shop.templates["order_update"]["id"], "variables": _vars(),
        "audience": {"type": "campaign", "campaign_id": second["id"], "segment": "not_replied"},
        "action": "follow_up", "follow_up_hours": 24})
    assert edited.status_code == 200 and edited.json()["data"]["follow_up_hours"] == 24
    assert shop.delete(f"{C}/{second['id']}", headers=WEB).status_code == 200
    gone = shop.get(f"{C}/{third['id']}").json()["data"]
    assert gone["status"] == "cancelled" and "was deleted" in gone["error"] and gone["follows"] is None
