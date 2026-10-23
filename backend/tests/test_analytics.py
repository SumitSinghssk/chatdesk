# ruff: noqa: F811  (fixtures are imported from other test modules and used as parameters)
from datetime import date, datetime, time, timedelta

from app.core.database import SessionLocal
from app.modules.customer.automation import engine as auto_engine
from app.modules.customer.campaigns import runner
from app.modules.customer.chatbots import engine as bot_engine
from app.modules.customer.inbox.models import WaMessage
from tests.test_campaigns import _campaign, shop  # noqa: F401
from tests.test_inbox import BASE, WEB, FakeMeta, business, first_conversation, inbound, post_webhook  # noqa: F401

A = f"{BASE}/analytics"


def test_report_counts_everything_in_the_period(shop, monkeypatch):
    monkeypatch.setattr(auto_engine, "WhatsAppClient", FakeMeta)
    monkeypatch.setattr(bot_engine, "WhatsAppClient", FakeMeta)
    empty = shop.get(A, params={"days": 7}).json()["data"]
    assert empty["period"]["days"] == 7 and len(empty["daily"]) == 7 and empty["kpis"]["received"] == 0
    assert empty["period"]["timezone"] == "Asia/Kolkata" and empty["now"]["contacts"] == 4

    # a campaign goes out, is delivered and read
    campaign = _campaign(shop).json()["data"]
    runner.run_due()
    chats = shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    asha = next(c for c in chats if c["contact"]["wa_id"] == "919800000001")
    wamid = shop.get(f"{BASE}/inbox/conversations/{asha['id']}/messages").json()["data"][-1]["wamid"]
    for state in ("delivered", "read"):
        post_webhook(shop, {"statuses": [{"id": wamid, "status": state, "timestamp": "1900000000"}]})

    # an automatic reply and a chatbot answer customers; the team replies and resolves a chat
    shop.post(f"{BASE}/automation/rules", headers=WEB, json={
        "name": "Prices", "keywords": ["price"], "reply": {"type": "text", "text": "Prices: ..."}})
    bot = shop.post(f"{BASE}/chatbots", headers=WEB, json={"name": "Feedback", "keywords": ["feedback"],
                                                           "starter": "feedback"}).json()["data"]
    assert shop.post(f"{BASE}/chatbots/{bot['id']}/publish", headers=WEB).status_code == 200
    inbound(shop, wa_id="919811100001", name="Kavya", text="price?")
    inbound(shop, wa_id="919811100002", name="Neha", text="feedback")
    inbound(shop, wa_id="919811100002", name="Neha", text="1")  # 😀 Great → ends
    inbound(shop, wa_id="919811100003", name="Ravi", text="Hello, is the shop open?")
    ravi = first_conversation(shop)
    assert shop.post(f"{BASE}/inbox/conversations/{ravi['id']}/messages", headers=WEB,
                     json={"text": "Yes, till 9 PM!"}).status_code == 200
    shop.put(f"{BASE}/inbox/conversations/{ravi['id']}/status", headers=WEB, json={"status": "resolved"})
    inbound(shop, wa_id="919811100004", name="Asha K", text="stop")

    data = shop.get(A, params={"days": 7}).json()["data"]
    k = data["kpis"]
    assert k["received"] == 5 and k["new_chats"] == 5 and k["resolved"] == 1 and k["opted_out"] == 1
    assert k["new_contacts"] == 8  # four saved before the campaign + four who wrote in
    assert k["campaign_messages"] == 1 and k["auto_replies"] == 1
    assert k["bot_chats"] == 1 and k["bot_completed"] == 1
    assert k["responses"] == 1 and k["avg_response_seconds"] is not None and k["within_5_min"] == 100
    assert k["delivered"] == 1 and k["read"] == 1 and k["failed"] == 0
    s = data["sources"]
    assert s["campaigns"] == 1 and s["automation"] == 2 and s["chatbots"] == 2 and s["team"] == 1  # opt-out reply too
    assert k["sent"] == sum(s.values())
    today = data["daily"][-1]
    assert today["date"] == data["period"]["end"] and today["received"] == 5 and today["sent"] == k["sent"]
    assert sum(sum(row) for row in data["heatmap"]) == 5
    owner = data["team"][0]
    assert owner["role"] == "owner" and owner["replies"] == 1 and owner["responses"] == 1
    assert data["campaigns"][0]["id"] == campaign["id"] and data["campaigns"][0]["read"] == 1
    assert data["campaigns"][0]["cost"] == 0.12  # one delivered Indian utility message
    assert data["chatbots"] == [{"id": bot["id"], "name": "Feedback", "active": True, "started": 1, "completed": 1,
                                 "handover": 0, "dropped": 0, "completion_rate": 100}]
    assert data["auto_replies"][0]["name"] == "Prices" and data["auto_replies"][0]["sent"] == 1
    assert data["previous"]["received"] == 0 and data["now"]["open"] >= 3


def test_periods_time_zone_and_permissions(shop):
    from tests.test_team import _join

    # a message that arrived at 23:00 UTC yesterday is "today" in India (04:30 IST)
    inbound(shop, wa_id="919811100009", text="late night")
    db = SessionLocal()
    try:
        message = db.query(WaMessage).filter(WaMessage.text == "late night").order_by(WaMessage.id.desc()).first()
        ist_today = date.today()
        message.created_at = datetime.combine(ist_today - timedelta(days=1), time(23, 0))
        db.commit()
    finally:
        db.close()
    data = shop.get(A, params={"start": (ist_today - timedelta(days=1)).isoformat(),
                               "end": ist_today.isoformat()}).json()["data"]
    assert [d["received"] for d in data["daily"]] == [0, 1]
    assert data["heatmap"][ist_today.weekday()][4] == 1  # 04:30 IST
    assert data["period"]["previous"] == {"start": (ist_today - timedelta(days=3)).isoformat(),
                                          "end": (ist_today - timedelta(days=2)).isoformat()}

    assert shop.get(A, params={"start": "2026-05-02", "end": "2026-05-01"}).status_code == 422
    assert shop.get(A, params={"start": "2024-01-01", "end": "2026-01-01"}).status_code == 422
    assert shop.get(A, params={"days": 0}).status_code == 422
    agent = _join(shop)
    try:
        assert agent.get(A).status_code == 403
    finally:
        agent.__exit__(None, None, None)
