# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import http.server
import json
import threading
import uuid
from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.modules.customer.automation import engine as auto_engine
from app.modules.customer.chatbots import engine
from app.modules.customer.chatbots.models import WaChatbotSession
from app.modules.customer.chatbots.starters import _e, _n
from app.shared.utils.datetime import now
from tests.test_inbox import BASE, WEB, FakeMeta, business, first_conversation, inbound  # noqa: F401

C = f"{BASE}/chatbots"
A = f"{BASE}/automation"


@pytest.fixture()
def shop(business, monkeypatch):
    monkeypatch.setattr(auto_engine, "WhatsAppClient", FakeMeta)
    monkeypatch.setattr(engine, "WhatsAppClient", FakeMeta)
    return business


def sent_to(wa_id):
    return [s for s in FakeMeta.sent if s.get("to") == wa_id and "type" in s and "name" not in s]


def texts(wa_id):
    out = []
    for s in sent_to(wa_id):
        if s["type"] == "text":
            out.append(s["text"] if isinstance(s["text"], str) else s["text"]["body"])
        elif s["type"] == "interactive":
            out.append(s["interactive"]["body"]["text"])
        else:
            out.append(s["type"])
    return out


def make(client, graph=None, **body):
    payload = {"name": "Bot", "trigger": "keyword", "keywords": ["menu"]}
    payload.update(body)
    res = client.post(C, headers=WEB, json=payload)
    assert res.status_code == 200, res.text
    bot = res.json()["data"]
    if graph is not None:
        saved = client.put(f"{C}/{bot['id']}/graph", headers=WEB, json={"graph": graph})
        assert saved.status_code == 200, saved.text
    return bot


def publish(client, bot_id):
    res = client.post(f"{C}/{bot_id}/publish", headers=WEB)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def tap(client, wa_id, reply_id, title):
    inbound(client, wa_id=wa_id, type="interactive",
            interactive={"type": "button_reply", "button_reply": {"id": reply_id, "title": title}})


def session(conversation_id):
    db = SessionLocal()
    try:
        return db.query(WaChatbotSession).filter(WaChatbotSession.conversation_id == conversation_id) \
            .order_by(WaChatbotSession.id.desc()).first()
    finally:
        db.close()


def flow(*nodes, edges=()):
    return {"nodes": [_n("start", "start", 0, 0), *nodes], "edges": list(edges)}


def test_main_menu_starter_from_keyword_to_handover(shop):
    bot = make(shop, name="Main menu", keywords=["menu", "hi"], starter="main_menu")
    assert bot["blocks"] == 8 and bot["published"] is False and bot["active"] is False
    inbound(shop, wa_id="919700000001", name="Asha Verma", text="Hi")
    assert sent_to("919700000001") == []  # not published yet: nothing answers
    live = publish(shop, bot["id"])
    assert live["active"] and live["version"] == 1 and live["has_changes"] is False

    inbound(shop, wa_id="919700000001", text="hi")
    menu = sent_to("919700000001")[-1]["interactive"]
    assert menu["type"] == "button" and menu["body"]["text"].startswith("Hi Asha 👋")
    assert [b["reply"] for b in menu["action"]["buttons"]][1] == {"id": "menu|b2", "title": "Track my order"}
    conv = first_conversation(shop)
    assert conv["bot"] == "Main menu"
    detail = shop.get(f"{BASE}/inbox/conversations/{conv['id']}").json()["data"]
    assert detail["bot_session"]["name"] == "Main menu" and detail["bot_session"]["node"] == "Buttons"

    tap(shop, "919700000001", "menu|b2", "Track my order")
    assert texts("919700000001")[-1].startswith("Please send your order number")
    inbound(shop, wa_id="919700000001", text="A-1042")
    assert texts("919700000001")[-1] == "Thanks! We're checking order *A-1042*. Our team will update you here shortly."
    st = session(conv["id"])
    assert st.status == "ended" and st.end_reason == "handover" and st.variables == {"order_number": "A-1042"}

    data = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()
    bot_msgs = [m for m in data["data"] if m["sent_by"] == "Chatbot"]
    assert len(bot_msgs) == 3 and bot_msgs[0]["auto_reply"] == "Main menu"
    assert [b["text"] for b in bot_msgs[0]["template"]["buttons"]] == ["Browse products", "Track my order",
                                                                       "Talk to us"]
    assert [e["text"] for e in data["events"] if e["kind"] == "bot"] == [
        "Chatbot “Main menu” started", "Chatbot “Main menu” handed the chat to the team"]
    assert data["conversation"]["bot"] is None  # finished
    assert any(e["kind"] == "assigned" for e in data["events"])  # round-robin picked the owner

    report = shop.get(f"{C}/{bot['id']}/report").json()["data"]
    assert report["started"] == 1 and report["handover"] == 1 and report["completion_rate"] == 100
    assert report["nodes"]["order"]["reached"] == 1 and report["edges"]["menu|b:b2"] == 1
    assert report["recent"][0]["contact"]["phone"] == "+919700000001"
    assert shop.get(C).json()["data"][0]["stats"]["started"] == 1
    assert [s["key"] for s in shop.get(f"{C}/starters").json()["data"]] == [
        "main_menu", "lead_capture", "appointment", "feedback", "order_status"]


def test_typed_answers_list_choices_and_numbers(shop):
    bot = make(shop, keywords=["book"], starter="appointment")
    publish(shop, bot["id"])
    inbound(shop, wa_id="919700000002", name="Neha Singh", text="book")
    lst = sent_to("919700000002")[-1]["interactive"]
    assert lst["type"] == "list" and lst["action"]["button"] == "Services"
    assert [s["title"] for s in lst["action"]["sections"]] == ["Hair", "Skin"]
    assert lst["action"]["sections"][1]["rows"][0] == {"id": "service|r3", "title": "Facial",
                                                       "description": "60 min · ₹1,200"}
    inbound(shop, wa_id="919700000002", text="facial")  # typing the option works too
    assert texts("919700000002")[-1].startswith("Which date works")
    inbound(shop, wa_id="919700000002", text="31/12/2026")
    inbound(shop, wa_id="919700000002", text="2")  # the 2nd button: Afternoon
    assert texts("919700000002")[-1].startswith("You're booked: *Facial* on *31 Dec 2026*, Afternoon")
    conv = first_conversation(shop)
    assert "appointment" in conv["contact"]["tags"]
    contact = shop.get(f"{BASE}/contacts/{conv['contact']['id']}").json()["data"]
    assert contact["attributes"]["last_booking"] == "Facial on 31 Dec 2026 (Afternoon)"
    assert session(conv["id"]).end_reason == "completed"


def test_wrong_answers_retry_then_hand_over_or_invalid_branch(shop):
    graph = flow(
        _n("email", "question", 300, 0, text="Your email?", kind="email", variable="email", save_to="email"),
        _n("ok", "end", 600, 0, text="Saved {{email}}"),
        edges=[_e("start", "email"), _e("email", "ok")])
    bot = make(shop, graph, keywords=["join"], settings={"max_retries": 1, "on_fail": "handover"})
    publish(shop, bot["id"])
    inbound(shop, wa_id="919700000003", text="join")
    inbound(shop, wa_id="919700000003", text="not an email")
    assert texts("919700000003")[1:] == [
        "That doesn't look like an email address. Please type it again, e.g. name@example.com", "Your email?"]
    inbound(shop, wa_id="919700000003", text="still wrong")
    assert texts("919700000003")[-1] == "Connecting you to our team. Someone will reply shortly."
    assert session(first_conversation(shop)["id"]).end_reason == "handover"

    # with an "invalid" connection the flow goes there instead, and a good answer is saved on the contact
    graph["nodes"].append(_n("fallback", "end", 600, 200, text="No problem, we'll call you."))
    graph["edges"].append(_e("email", "fallback", "invalid"))
    shop.put(f"{C}/{bot['id']}/graph", headers=WEB, json={"graph": graph})
    publish(shop, bot["id"])
    inbound(shop, wa_id="919700000004", text="join")
    inbound(shop, wa_id="919700000004", text="nope")
    inbound(shop, wa_id="919700000004", text="nope again")
    assert texts("919700000004")[-1] == "No problem, we'll call you."
    inbound(shop, wa_id="919700000004", text="join")
    inbound(shop, wa_id="919700000004", text="Asha@Example.com")
    assert texts("919700000004")[-1] == "Saved asha@example.com"
    rows = shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    contact_id = next(r for r in rows if r["contact"]["phone"] == "+919700000004")["contact"]["id"]
    assert shop.get(f"{BASE}/contacts/{contact_id}").json()["data"]["email"] == "asha@example.com"


def test_conditions_actions_and_variables(shop):
    graph = flow(
        _n("city", "question", 300, 0, text="Which city?", kind="text", variable="city", save_to="attribute"),
        _n("check", "condition", 600, 0, match="any", rules=[{"field": "var:city", "op": "equals",
                                                              "value": "delhi, new delhi"}]),
        _n("vip", "action", 900, -100, actions=[{"type": "add_tags", "tags": ["delhi", "local"]},
                                                 {"type": "set_variable", "key": "zone", "value": "North"}]),
        _n("yes", "end", 1200, -100, text="Same-day delivery in {{city}} ({{zone}} zone)!"),
        _n("no", "end", 900, 100, text="We deliver to {{city}} in 3 days."),
        _n("tagged", "condition", 1200, 200, rules=[{"field": "tags", "op": "has", "value": "delhi"}]),
        edges=[_e("start", "city"), _e("city", "check"), _e("check", "vip", "yes"), _e("vip", "yes"),
               _e("check", "no", "no")])
    bot = make(shop, graph, keywords=["delivery"])
    problems = shop.get(f"{C}/{bot['id']}").json()["data"]["problems"]
    assert {"node_id": "tagged", "message": "Not connected: customers never reach this block"} in problems["warnings"]
    publish(shop, bot["id"])  # warnings don't stop publishing
    inbound(shop, wa_id="919700000005", text="Delivery")
    inbound(shop, wa_id="919700000005", text="New Delhi")
    assert texts("919700000005")[-1] == "Same-day delivery in New Delhi (North zone)!"
    contact = first_conversation(shop)["contact"]
    assert contact["tags"] == ["delhi", "local"]
    inbound(shop, wa_id="919700000006", text="delivery")
    inbound(shop, wa_id="919700000006", text="Pune")
    assert texts("919700000006")[-1] == "We deliver to Pune in 3 days."


def test_delay_and_timeout_are_run_by_the_ticker(shop):
    graph = flow(
        _n("a", "message", 300, 0, reply={"type": "text", "text": "One moment…"}),
        _n("wait", "delay", 600, 0, amount=5, unit="seconds"),
        _n("b", "buttons", 900, 0, text="Done! Anything else?", buttons=[{"id": "y", "title": "Yes"},
                                                                         {"id": "n", "title": "No"}]),
        edges=[_e("start", "a"), _e("a", "wait"), _e("wait", "b")])
    bot = make(shop, graph, keywords=["slow"], settings={"timeout_minutes": 10, "timeout_text": "Bye for now!"})
    publish(shop, bot["id"])
    phone = f"9197{uuid.uuid4().int % 10**8:08d}"  # the ticker serves every business: a number no other test uses
    inbound(shop, wa_id=phone, text="slow")
    conv = first_conversation(shop)
    assert texts(phone) == ["One moment…"]
    st = session(conv["id"])
    assert st.wait == "delay" and st.node_id == "b" and st.resume_at > now()
    inbound(shop, wa_id=phone, text="hello?")  # waits quietly; no auto-reply either
    assert texts(phone) == ["One moment…"]

    db = SessionLocal()
    try:
        engine.run_due(db)  # not due yet (other tests' chats may be, so only this one is checked)
        assert session(conv["id"]).wait == "delay" and texts(phone) == ["One moment…"]
        db.query(WaChatbotSession).filter(WaChatbotSession.id == st.id).update(
            {"resume_at": now() - timedelta(seconds=1)})
        db.commit()
        assert engine.run_due(db) >= 1
        assert texts(phone)[-1] == "Done! Anything else?"
        assert session(conv["id"]).wait == "reply"
        db.query(WaChatbotSession).filter(WaChatbotSession.id == st.id).update(
            {"last_activity_at": now() - timedelta(minutes=11)})
        db.commit()
        assert engine.run_due(db) >= 1
    finally:
        db.close()
    assert texts(phone)[-1] == "Bye for now!"
    st = session(conv["id"])
    assert st.status == "ended" and st.end_reason == "timeout"
    report = shop.get(f"{C}/{bot['id']}/report").json()["data"]
    assert report["dropped"] == 1 and report["nodes"]["b"]["dropped"] == 1


def test_people_take_over_exit_keywords_and_restarts(shop):
    bot = make(shop, name="Menu", starter="main_menu", keywords=["menu"])
    publish(shop, bot["id"])
    inbound(shop, wa_id="919700000008", text="menu")
    conv = first_conversation(shop)
    # an agent answers in the chat → the bot steps back
    res = shop.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Hi, I'm here!"})
    assert res.status_code == 200, res.text
    assert session(conv["id"]).end_reason == "agent"
    tap(shop, "919700000008", "menu|b3", "Talk to us")
    assert texts("919700000008")[-1] == "Hi, I'm here!"  # the bot stays quiet

    inbound(shop, wa_id="919700000008", text="menu")
    inbound(shop, wa_id="919700000008", text="menu")  # the keyword again restarts it
    assert session(conv["id"]).status == "active"
    inbound(shop, wa_id="919700000008", text="Agent")  # exit keyword
    assert texts("919700000008")[-1] == "Connecting you to our team. Someone will reply shortly."
    assert session(conv["id"]).end_reason == "handover"

    # a wrong answer to the menu: "Sorry…" and the menu again
    inbound(shop, wa_id="919700000008", text="menu")
    inbound(shop, wa_id="919700000008", text="banana")
    assert texts("919700000008")[-2:] == ["Sorry, I didn't get that. Please choose one of the options.",
                                          "Hi Asha 👋 Welcome! How can we help you today?"]


def test_bots_and_automatic_replies_together(shop):
    shop.post(f"{A}/rules", headers=WEB, json={"name": "Welcome", "trigger": "welcome",
                                                "reply": {"type": "text", "text": "Welcome to Inbox Co!"}})
    shop.post(f"{A}/rules", headers=WEB, json={"name": "Default", "trigger": "default",
                                                "reply": {"type": "text", "text": "We'll get back to you"}})
    shop.post(f"{A}/rules", headers=WEB, json={"name": "Price", "keywords": ["price"],
                                                "reply": {"type": "text", "text": "Prices: ..."}})
    shop.put(f"{A}/settings", headers=WEB, json={"hours": {d: {"open": True, "start": "00:00", "end": "23:59"}
                                                           for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}})
    menu = make(shop, name="Menu", starter="main_menu", keywords=["menu"])
    publish(shop, menu["id"])
    tried = shop.post(f"{A}/try", headers=WEB, json={"text": "Menu", "first_message": True}).json()["data"]
    assert [(m["kind"], m["reason"]) for m in tried["matches"]] == [
        ("rule", "First message from this person"), ("chatbot", "Chatbot “Menu” starts (a keyword)")]
    inbound(shop, wa_id="919700000009", text="menu")  # first message: the welcome, then the bot
    assert texts("919700000009") == ["Welcome to Inbox Co!", "Hi Asha 👋 Welcome! How can we help you today?"]

    graph = flow(_n("hey", "end", 300, 0, text="Hello from the any-message bot"), edges=[_e("start", "hey")])
    anybot = make(shop, graph, name="Catch-all", trigger="any")
    assert anybot["restart_minutes"] == 1440
    publish(shop, anybot["id"])
    inbound(shop, wa_id="919700000010", text="price?")  # keyword auto-reply still answers
    inbound(shop, wa_id="919700000010", text="random words")  # the any bot instead of the default reply
    inbound(shop, wa_id="919700000010", text="more words")  # once a day; the default reply stays quiet too
    assert texts("919700000010") == ["Welcome to Inbox Co!", "Prices: ...", "Hello from the any-message bot"]

    # STOP still opts out, and ends a running chatbot
    inbound(shop, wa_id="919700000009", text="stop")
    rows = shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    conv = next(r for r in rows if r["contact"]["phone"] == "+919700000009")
    assert conv["contact"]["opted_out"] is True and session(conv["id"]).end_reason == "opted_out"


def test_publish_checks_and_trigger_conflicts(shop):
    bot = make(shop, keywords=["menu"])
    res = shop.post(f"{C}/{bot['id']}/publish", headers=WEB)
    assert res.status_code == 422
    assert res.json()["message"] == "Fix 1 problem before publishing"
    assert res.json()["problems"]["errors"] == [{"node_id": "start", "message": "Connect Start to the first block"}]

    bad = flow(_n("btn", "buttons", 300, 0, text="", buttons=[{"id": "a", "title": "Same"}, {"id": "b", "title": "same"}]),
               _n("q", "question", 300, 200, text="Name?", variable="Full Name!"),
               _n("hook", "webhook", 300, 400, method="GET", url="ftp://x"),
               _n("loop", "goto", 300, 600, chatbot_id=bot["id"]),
               edges=[_e("start", "btn"), _e("btn", "q", "b:a"), _e("btn", "hook", "b:b"), _e("q", "loop")])
    saved = shop.put(f"{C}/{bot['id']}/graph", headers=WEB, json={"graph": bad}).json()["data"]
    errors = {e["node_id"]: e["message"] for e in saved["problems"]["errors"]}
    assert errors == {"btn": "Add the message", "q": "Name the answer with small letters, digits and _ (e.g. city)",
                      "hook": "Enter a full address starting with https://",
                      "loop": "A chatbot can't go to itself; connect back instead"}

    one = make(shop, flow(_n("x", "end", 300, 0, text="x"), edges=[_e("start", "x")]), keywords=["hello", "menu"])
    publish(shop, one["id"])
    two = make(shop, flow(_n("x", "end", 300, 0, text="x"), edges=[_e("start", "x")]), keywords=["Menu"])
    res = shop.post(f"{C}/{two['id']}/publish", headers=WEB)
    assert res.status_code == 422 and "“menu” already starts the chatbot “Bot”" in res.json()["message"]
    first = make(shop, flow(_n("x", "end", 300, 0, text="x"), edges=[_e("start", "x")]), name="A", trigger="new_chat")
    publish(shop, first["id"])
    second = make(shop, flow(_n("x", "end", 300, 0, text="x"), edges=[_e("start", "x")]), name="B", trigger="new_chat")
    assert shop.post(f"{C}/{second['id']}/publish", headers=WEB).status_code == 422
    assert shop.put(f"{C}/{first['id']}/active", headers=WEB, json={"active": False}).status_code == 200
    publish(shop, second["id"])
    assert shop.put(f"{C}/{first['id']}/active", headers=WEB, json={"active": True}).status_code == 422
    assert shop.put(f"{C}/{bot['id']}/active", headers=WEB, json={"active": True}).json()["message"] == \
        "Publish the chatbot first"
    assert shop.post(C, headers=WEB, json={"name": "x", "trigger": "keyword"}).status_code == 422


def test_new_chat_ad_and_goto_bots(shop):
    leads = make(shop, name="Leads", trigger="new_chat", starter="lead_capture")
    publish(shop, leads["id"])
    inbound(shop, wa_id="919700000011", name="Kavya Rao", text="hello")
    assert texts("919700000011") == ["Hi Kavya! 👋 Thanks for reaching out to us.", "May I have your full name?"]
    inbound(shop, wa_id="919700000011", text="Kavya Rao Sharma")
    inbound(shop, wa_id="919700000011", text="kavya@example.com")
    tap(shop, "919700000011", "interest|b2", "Product demo")
    assert texts("919700000011")[-1] == "Thank you, Kavya Rao Sharma! Our team will contact you at kavya@example.com " \
                                        "within 24 hours."
    contact = shop.get(f"{BASE}/contacts/{first_conversation(shop)['contact']['id']}").json()["data"]
    assert contact["name"] == "Kavya Rao Sharma" and contact["email"] == "kavya@example.com" and "lead" in contact["tags"]
    assert contact["attributes"]["interest"] == "Product demo"

    target = make(shop, flow(_n("hi", "end", 300, 0, text="Second bot says hi"), edges=[_e("start", "hi")]),
                  name="Second", trigger="manual")
    publish(shop, target["id"])
    ad = make(shop, flow(_n("m", "message", 300, 0, reply={"type": "text", "text": "Thanks for clicking our ad!"}),
                         _n("go", "goto", 600, 0, chatbot_id=target["id"]),
                         edges=[_e("start", "m"), _e("m", "go")]), name="Ad bot", trigger="ad")
    publish(shop, ad["id"])
    inbound(shop, wa_id="919700000012", text="Hi! I saw this on Instagram",
            referral={"source_url": "https://fb.me/x", "source_type": "ad", "source_id": "123"})
    assert texts("919700000012")[-2:] == ["Thanks for clicking our ad!", "Second bot says hi"]
    rows = shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]
    conv = next(r for r in rows if r["contact"]["phone"] == "+919700000012")
    events = [e["text"] for e in shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["events"]
              if e["kind"] == "bot"]
    assert events == ["Chatbot “Ad bot” started", "Chatbot “Ad bot” finished", "Chatbot “Second” started",
                      "Chatbot “Second” finished"]


def test_test_chat_simulates_without_sending(shop):
    bot = make(shop, name="Menu", starter="main_menu", keywords=["menu"])
    before = len(FakeMeta.sent)
    step = shop.post(f"{C}/{bot['id']}/simulate", headers=WEB, json={}).json()["data"]
    assert [e["kind"] for e in step["events"]] == ["message"]
    assert step["events"][0]["reply"]["choices"][0] == {"id": "menu|b1", "title": "Browse products"}
    assert step["waiting"] == {"node_id": "menu", "type": "buttons", "kind": None}
    step = shop.post(f"{C}/{bot['id']}/simulate", headers=WEB, json={
        "state": step["state"], "input": {"reply_id": "menu|b1"}}).json()["data"]
    assert step["events"][0]["reply"]["type"] == "list" and step["waiting"]["type"] == "list"
    step = shop.post(f"{C}/{bot['id']}/simulate", headers=WEB, json={
        "state": step["state"], "input": {"text": "Offers"}}).json()["data"]
    assert step["events"][0]["reply"]["text"].startswith("Great choice! Here are our *Offers*")
    assert step["events"][-1] == {"kind": "end", "node_id": None, "reason": "completed",
                                  "text": "The chatbot finished"}
    assert step["state"]["status"] == "ended" and step["state"]["variables"] == {"category": "Offers"}

    # the unsaved canvas can be tried too, with a sample contact; actions only change that sample
    graph = flow(_n("tag", "action", 300, 0, actions=[{"type": "add_tags", "tags": ["vip"]}]),
                 _n("wait", "delay", 600, 0, amount=2, unit="minutes"),
                 _n("bye", "end", 900, 0, text="Bye {{first_name}}"),
                 edges=[_e("start", "tag"), _e("tag", "wait"), _e("wait", "bye")])
    step = shop.post(f"{C}/{bot['id']}/simulate", headers=WEB, json={
        "graph": graph, "contact": {"name": "Ravi Kumar", "tags": ["new"]}}).json()["data"]
    assert [e["kind"] for e in step["events"]] == ["action", "delay", "message", "end"]
    assert step["events"][1]["seconds"] == 120 and step["events"][2]["reply"]["text"] == "Bye Ravi"
    assert step["contact"]["tags"] == ["new", "vip"]
    assert len(FakeMeta.sent) == before  # nothing went to WhatsApp
    assert shop.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"] == []


class _Api(http.server.BaseHTTPRequestHandler):
    seen: list = []

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        _Api.seen.append({"path": self.path, "body": body, "auth": self.headers.get("Authorization")})
        found = body.get("order") == "1042"
        self.send_response(200 if found else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"order": {"status": "Out for delivery", "items": [{"name": "Ladoo"}]}}
                                    if found else {"error": "not found"}).encode())

    def log_message(self, *args):
        pass


def test_api_request_block(shop, monkeypatch):
    server = http.server.HTTPServer(("127.0.0.1", 0), _Api)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/orders?name={{{{first_name}}}}"
    graph = flow(
        _n("ask", "question", 300, 0, text="Order number?", kind="number", variable="order_id"),
        _n("hook", "webhook", 600, 0, method="POST", url=url, body='{"order": "{{order_id}}", "who": "{{name}}"}',
           headers=[{"key": "Authorization", "value": "Bearer secret"}],
           save=[{"path": "order.status", "variable": "status"}, {"path": "order.items.0.name", "variable": "item"}]),
        _n("found", "end", 900, -100, text="{{item}}: {{status}}"),
        _n("missing", "end", 900, 100, text="Not found"),
        edges=[_e("start", "ask"), _e("ask", "hook"), _e("hook", "found", "ok"), _e("hook", "missing", "fail")])
    bot = make(shop, graph, keywords=["track"])
    publish(shop, bot["id"])
    say = lambda text: inbound(shop, wa_id="919700000013", name="Asha \"Q\" Verma", text=text)  # noqa: E731
    try:
        say("track")
        say("1042")
        # this server's own network is off limits unless allowed (here it isn't)
        assert texts("919700000013")[-1] == "Not found" and _Api.seen == []
        monkeypatch.setenv("CHATBOT_ALLOW_PRIVATE_URLS", "1")
        say("track")
        say("1042")
        assert texts("919700000013")[-1] == "Ladoo: Out for delivery"
        assert _Api.seen[-1] == {"path": "/orders?name=Asha", "auth": "Bearer secret",
                                 "body": {"order": "1042", "who": "Asha \"Q\" Verma"}}
        say("track")
        say("77")
        assert texts("919700000013")[-1] == "Not found"
    finally:
        server.shutdown()


def test_inbox_start_stop_permissions_and_housekeeping(shop):
    from tests.test_team import _join

    bot = make(shop, name="Feedback", starter="feedback", keywords=["feedback"])
    inbound(shop, wa_id="919700000014", text="hello")
    conv = first_conversation(shop)
    assert shop.post(f"{C}/{bot['id']}/start", headers=WEB, json={"conversation_id": conv["id"]}).json()["message"] == \
        "Publish the chatbot first"
    publish(shop, bot["id"])
    agent = _join(shop)
    try:
        assert agent.get(C).status_code == 403  # building bots is for owners and admins
        assert [b["name"] for b in agent.get(f"{C}/live").json()["data"]] == ["Feedback"]
        shop.post(f"{BASE}/inbox/conversations/{conv['id']}/assign", headers=WEB,
                  json={"assignee_id": agent.member_id})
        started = agent.post(f"{C}/{bot['id']}/start", headers=WEB, json={"conversation_id": conv["id"]})
        assert started.status_code == 200, started.text
        assert started.json()["data"]["name"] == "Feedback"
        assert texts("919700000014")[-1] == "How was your experience with us today?"
        assert agent.post(f"{C}/stop", headers=WEB, json={"conversation_id": conv["id"]}).status_code == 200
        assert session(conv["id"]).end_reason == "stopped"
        assert agent.post(f"{C}/stop", headers=WEB, json={"conversation_id": conv["id"]}).status_code == 404
    finally:
        agent.__exit__(None, None, None)

    copy = shop.post(f"{C}/{bot['id']}/duplicate", headers=WEB).json()["data"]
    assert copy["name"] == "Feedback (copy)" and not copy["active"] and not copy["published"]
    exported = shop.get(f"{C}/{bot['id']}/export").json()["data"]
    imported = shop.post(f"{C}/import", headers=WEB, json={**exported, "name": "Imported"}).json()["data"]
    assert imported["blocks"] == 6 and imported["trigger"] == "keyword"
    # edits stay a draft until published; Discard goes back
    graph = shop.get(f"{C}/{bot['id']}").json()["data"]["graph"]
    graph["nodes"] = [n for n in graph["nodes"] if n["id"] != "great"]
    edited = shop.put(f"{C}/{bot['id']}/graph", headers=WEB, json={"graph": graph}).json()["data"]
    assert edited["has_changes"] is True and edited["blocks"] == 5
    assert len(shop.get(f"{C}/{bot['id']}").json()["data"]["graph"]["edges"]) == 4  # its connection went too
    assert shop.post(f"{C}/{bot['id']}/discard", headers=WEB).json()["data"]["blocks"] == 6
    assert shop.put(f"{C}/{bot['id']}/active", headers=WEB, json={"active": False}).json()["data"]["active"] is False
    assert shop.delete(f"{C}/{copy['id']}", headers=WEB).status_code == 200
    assert shop.get(f"{C}/{copy['id']}").status_code == 404
