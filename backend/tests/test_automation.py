# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import pytest

from app.modules.customer.automation import engine
from tests.test_inbox import BASE, WEB, FakeMeta, business, first_conversation, inbound  # noqa: F401

A = f"{BASE}/automation"
CLOSED = {d: {"open": False, "start": "09:00", "end": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
OPEN = {d: {"open": True, "start": "00:00", "end": "23:59"} for d in CLOSED}


@pytest.fixture()
def shop(business, monkeypatch):
    monkeypatch.setattr(engine, "WhatsAppClient", FakeMeta)
    # open all day by default, so the away reply only fires where a test closes the shop
    assert business.put(f"{A}/settings", headers=WEB, json={"hours": OPEN}).status_code == 200
    return business


def rule(client, **body):
    payload = {"name": "Rule", "trigger": "keyword", "keywords": [], "reply": {"type": "text", "text": "Hi"}}
    payload.update(body)
    res = client.post(f"{A}/rules", headers=WEB, json=payload)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def sent_to(wa_id):
    return [s for s in FakeMeta.sent if s.get("to") == wa_id and "type" in s and "name" not in s]


def test_keyword_reply_is_personalised_and_recorded_in_chat(shop):
    rule(shop, name="Prices", keywords=["price", "Rate list"],
         reply={"type": "text", "text": "Hi {{first_name}}, here are our prices: https://example.com/prices"})
    inbound(shop, wa_id="919811100001", name="Asha Verma", text="What is the PRICE of ladoo?")
    out = sent_to("919811100001")
    assert out[-1]["type"] == "text" and out[-1]["text"]["body"].startswith("Hi Asha, here are our prices")
    conv = first_conversation(shop)
    msg = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"][-1]
    assert msg["direction"] == "out" and msg["sent_by"] == "Auto-reply" and msg["auto_reply"] == "Prices"
    assert conv["waiting_since"] is not None  # an automatic reply doesn't count as the team answering
    rules = shop.get(f"{A}/rules").json()["data"]
    assert rules[0]["hits"] == 1 and rules[0]["last_hit_at"]

    # "contains" needs the whole word: "pricey" isn't "price"
    inbound(shop, wa_id="919811100001", text="too pricey")
    assert len(sent_to("919811100001")) == 1


def test_match_types_order_and_inactive(shop):
    exact = rule(shop, name="Exact hi", match="exact", keywords=["hi"], reply={"type": "text", "text": "EXACT"})
    rule(shop, name="Starts", match="starts_with", keywords=["order"], reply={"type": "text", "text": "STARTS"})
    rule(shop, name="Also hi", match="contains", keywords=["hi"], reply={"type": "text", "text": "CONTAINS"})
    inbound(shop, wa_id="919811100002", text="Hi")
    assert sent_to("919811100002")[-1]["text"]["body"] == "EXACT"  # first in order wins
    inbound(shop, wa_id="919811100002", text="hi there")
    assert sent_to("919811100002")[-1]["text"]["body"] == "CONTAINS"
    inbound(shop, wa_id="919811100002", text="order 1042 status?")
    assert sent_to("919811100002")[-1]["text"]["body"] == "STARTS"

    ids = [r["id"] for r in shop.get(f"{A}/rules").json()["data"]]
    shop.put(f"{A}/rules/order", headers=WEB, json={"ids": [ids[2], ids[0], ids[1]]})
    inbound(shop, wa_id="919811100002", text="Hi")
    assert sent_to("919811100002")[-1]["text"]["body"] == "CONTAINS"  # reordered
    shop.put(f"{A}/rules/{ids[2]}/active", headers=WEB, json={"active": False})
    inbound(shop, wa_id="919811100002", text="Hi")
    assert sent_to("919811100002")[-1]["text"]["body"] == "EXACT"  # turned off → skipped
    assert exact["id"] == ids[0]


def test_welcome_away_default_and_cooldowns(shop):
    rule(shop, name="Welcome", trigger="welcome", reply={"type": "text", "text": "Welcome to Inbox Co!"})
    away = rule(shop, name="Away", trigger="away", reply={"type": "text", "text": "We're closed"})
    fallback = rule(shop, name="Default", trigger="default", reply={"type": "text", "text": "We'll get back to you"})
    assert away["cooldown_minutes"] == 240 and fallback["cooldown_minutes"] == 1440  # sensible defaults

    inbound(shop, wa_id="919811100003", text="hello")  # first message, open hours
    assert [s["text"]["body"] for s in sent_to("919811100003")] == ["Welcome to Inbox Co!"]
    inbound(shop, wa_id="919811100003", text="anything")  # nothing matches → default, once a day
    inbound(shop, wa_id="919811100003", text="again")
    assert [s["text"]["body"] for s in sent_to("919811100003")][1:] == ["We'll get back to you"]

    shop.put(f"{A}/settings", headers=WEB, json={"hours": CLOSED})
    inbound(shop, wa_id="919811100004", text="hi")  # first message at night: welcome + away
    assert [s["text"]["body"] for s in sent_to("919811100004")] == ["Welcome to Inbox Co!", "We're closed"]
    inbound(shop, wa_id="919811100004", text="hello?")  # away is on cooldown; default already... not yet sent
    assert [s["text"]["body"] for s in sent_to("919811100004")][2:] == ["We'll get back to you"]
    inbound(shop, wa_id="919811100004", text="still there?")
    assert len(sent_to("919811100004")) == 3


def test_opt_out_and_back_in(shop):
    inbound(shop, wa_id="919811100005", text="hello")
    inbound(shop, wa_id="919811100005", text="STOP")
    conv = first_conversation(shop)
    assert conv["contact"]["opted_out"] is True
    assert "won't get promotional messages" in sent_to("919811100005")[-1]["text"]["body"]
    events = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["events"]
    assert events[-1]["text"] == "Opted out of marketing"
    inbound(shop, wa_id="919811100005", text=" Start ")
    assert first_conversation(shop)["contact"]["opted_out"] is False
    assert sent_to("919811100005")[-1]["text"]["body"].startswith("Welcome back")


def test_buttons_list_location_and_media_replies(shop):
    rule(shop, name="Menu", keywords=["menu"], reply={
        "type": "buttons", "text": "How can we help, {{name}}?", "header": "Inbox Co", "footer": "Tap one",
        "buttons": ["Track order", "Price list", "Talk to us"]})
    rule(shop, name="Catalogue", keywords=["catalogue"], reply={
        "type": "list", "text": "Pick a category", "list_button": "Categories",
        "rows": [{"title": "Sweets", "description": "Ladoo, barfi"}, {"title": "Namkeen"}]})
    rule(shop, name="Where", keywords=["location"], reply={
        "type": "location", "latitude": 28.6139, "longitude": 77.209, "place": "Inbox Co", "address": "CP, Delhi"})
    up = shop.post(f"{BASE}/templates/media", headers=WEB, data={"kind": "document"},
                   files={"file": ("menu.pdf", b"%PDF-1.4 menu", "application/pdf")}).json()["data"]
    rule(shop, name="PDF", keywords=["pdf"], reply={
        "type": "media", "media_kind": "document", "media_key": up["key"], "media_filename": "menu.pdf",
        "text": "Our menu"})

    inbound(shop, wa_id="919811100006", name="Neha Singh", text="menu")
    button = sent_to("919811100006")[-1]
    assert button["type"] == "interactive" and button["interactive"]["type"] == "button"
    assert button["interactive"]["body"]["text"] == "How can we help, Neha Singh?"
    assert [b["reply"]["title"] for b in button["interactive"]["action"]["buttons"]] == \
        ["Track order", "Price list", "Talk to us"]
    conv = first_conversation(shop)
    last = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"][-1]
    assert last["type"] == "interactive" and [b["text"] for b in last["template"]["buttons"]][0] == "Track order"

    inbound(shop, wa_id="919811100006", text="show catalogue")
    lst = sent_to("919811100006")[-1]["interactive"]
    assert lst["type"] == "list" and lst["action"]["button"] == "Categories"
    assert lst["action"]["sections"][0]["rows"][0] == {"id": "r1", "title": "Sweets", "description": "Ladoo, barfi"}

    inbound(shop, wa_id="919811100006", text="location please")
    assert sent_to("919811100006")[-1]["location"]["name"] == "Inbox Co"

    inbound(shop, wa_id="919811100006", text="pdf")
    doc = sent_to("919811100006")[-1]
    assert doc["type"] == "document" and doc["document"] == {"caption": "Our menu", "id": "MEDIA123",
                                                             "filename": "menu.pdf"}


def test_try_validation_blocked_and_permissions(shop):
    rule(shop, name="Hours", keywords=["timing", "hours"], reply={"type": "text", "text": "Open 9 to 6, {{first_name}}"})
    tried = shop.post(f"{A}/try", headers=WEB, json={"text": "what are your timings", "first_message": False})
    assert tried.json()["data"]["matches"] == []  # "timings" isn't the word "timing"
    tried = shop.post(f"{A}/try", headers=WEB, json={"text": "Shop timing?"}).json()["data"]
    assert tried["matches"][0]["rule"]["name"] == "Hours" and tried["matches"][0]["reply"]["text"] == "Open 9 to 6, Asha"
    assert shop.post(f"{A}/try", headers=WEB, json={"text": "stop"}).json()["data"]["matches"][0]["kind"] == "opt_out"
    assert not any(s.get("to") for s in FakeMeta.sent[-1:] if "Open 9" in str(s))  # trying sends nothing

    bad = shop.post(f"{A}/rules", headers=WEB, json={"name": "x", "keywords": ["a"], "reply": {
        "type": "buttons", "text": "Pick", "buttons": ["This button text is far too long"]}})
    assert bad.status_code == 422
    assert shop.post(f"{A}/rules", headers=WEB, json={"name": "x", "reply": {"type": "text", "text": "hi"}}
                     ).status_code == 422  # keyword rule without keywords
    assert shop.put(f"{A}/settings", headers=WEB, json={"timezone": "Mars/Base"}).status_code == 422

    # blocked people get no automatic replies
    inbound(shop, wa_id="919811100007", text="hello")
    conv = first_conversation(shop)
    shop.put(f"{BASE}/inbox/conversations/{conv['id']}/contact", headers=WEB, json={"blocked": True})
    before = len(sent_to("919811100007"))
    inbound(shop, wa_id="919811100007", text="timing")
    assert len(sent_to("919811100007")) == before

    from tests.test_team import _join

    agent = _join(shop)
    assert agent.get(f"{A}/rules").status_code == 403
    agent.__exit__(None, None, None)


def test_first_message_with_a_keyword_gets_welcome_then_answer(shop):
    rule(shop, name="Welcome", trigger="welcome", reply={"type": "text", "text": "Welcome!"})
    rule(shop, name="Prices", keywords=["price"], reply={"type": "text", "text": "Prices: ..."})
    inbound(shop, wa_id="919811100009", text="price please")
    assert [s["text"]["body"] for s in sent_to("919811100009")] == ["Welcome!", "Prices: ..."]
    inbound(shop, wa_id="919811100009", text="price again")
    assert [s["text"]["body"] for s in sent_to("919811100009")][2:] == ["Prices: ..."]
