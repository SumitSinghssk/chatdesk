# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import hashlib
import hmac
import json
import time
import uuid

from app.core.database import SessionLocal
from app.modules.customer.account.models import Customer, CustomerNotification
from app.modules.customer.inbox.models import WaConversation
from tests.test_inbox import BASE, SECRET, WEB, business, inbound  # noqa: F401
from tests.test_team import _join

N = f"{BASE}/numbers"


def _to(web, phone_number_id, wa_id="919000000009", text="Hi support", name="Meera"):
    """A customer writes to one of the numbers; Meta posts it to the URL set in the Meta app."""
    value = {"messaging_product": "whatsapp", "metadata": {"phone_number_id": phone_number_id},
             "contacts": [{"profile": {"name": name}, "wa_id": wa_id}],
             "messages": [{"from": wa_id, "id": f"wamid.IN{uuid.uuid4().hex}", "timestamp": str(int(time.time())),
                           "type": "text", "text": {"body": text}}]}
    body = json.dumps({"object": "whatsapp_business_account",
                       "entry": [{"id": "1111111111", "changes": [{"field": "messages", "value": value}]}]}).encode()
    sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    res = web.post(web.hook, content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})
    assert res.status_code == 200, res.text


def _numbers(web):
    return web.get(N).json()["data"]


def _chats(web):
    return web.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"]


def _add_support(web):
    res = web.post(N, headers=WEB, json={"label": "  Support   desk "})
    assert res.status_code == 200, res.text
    support = res.json()["data"]
    assert support["label"] == "Support desk" and support["status"] == "not_connected" and not support["main"]
    connected = web.put(f"{BASE}/whatsapp/connection", headers=WEB, json={
        "waba_id": "1111111111", "phone_number_id": "3333333333", "access_token": "tok2", "app_secret": SECRET})
    assert connected.status_code == 200 and connected.json()["data"]["status"] == "connected"
    return support


def test_numbers_keep_their_own_chats_and_share_one_webhook(business):
    first = _numbers(business)
    assert len(first) == 1 and first[0]["main"] and first[0]["current"] and first[0]["label"] == "Inbox Test"  # the verified name until renamed
    main_id = first[0]["id"]
    inbound(business, text="Hello main")  # no metadata: the number whose URL it came to

    support = _add_support(business)  # adding a number switches to it
    rows = _numbers(business)
    assert [r["current"] for r in rows] == [False, True]
    assert business.get(f"{BASE}/whatsapp/connection").json()["data"]["phone_number_id"] == "3333333333"
    assert _chats(business) == []  # a new number starts empty
    assert business.post(N, headers=WEB, json={"label": "support DESK"}).status_code == 409  # names are unique
    # the same Meta number can't be connected twice
    business.post(f"{N}/{main_id}/switch", headers=WEB)
    taken = business.put(f"{BASE}/whatsapp/connection", headers=WEB, json={
        "waba_id": "1111111111", "phone_number_id": "3333333333"})
    assert taken.status_code == 409 and "already connected" in taken.text

    # one Meta app, one webhook URL: messages to the second number still reach it
    _to(business, "3333333333", text="Hi support")
    _to(business, "2222222222", wa_id="919000000001", text="Hi main again")
    assert [c["last_message_preview"] for c in _chats(business)] == ["Hi main again"]
    counts = {r["id"]: r["unread"] for r in _numbers(business)}
    assert counts == {main_id: 1, support["id"]: 1}

    res = business.post(f"{N}/{support['id']}/switch", headers=WEB)
    assert res.status_code == 200 and res.json()["message"] == "Switched to Support desk"
    chats = _chats(business)
    assert len(chats) == 1 and chats[0]["contact"]["profile_name"] == "Meera"
    assert business.get(f"{BASE}/inbox/summary").json()["data"]["unread"] == 1
    contacts = business.get(f"{BASE}/contacts", params={"page": 1}).json()["data"]
    assert [c["name"] or c["profile_name"] for c in contacts] == ["Meera"]
    # a chat of the other number can't be opened from here
    business.post(f"{N}/{main_id}/switch", headers=WEB)
    main_chat = _chats(business)[0]["id"]
    business.post(f"{N}/{support['id']}/switch", headers=WEB)
    assert business.get(f"{BASE}/inbox/conversations/{main_chat}/messages").status_code == 404

    renamed = business.put(f"{N}/{support['id']}", headers=WEB, json={"label": "Helpdesk"})
    assert renamed.status_code == 200 and renamed.json()["data"]["label"] == "Helpdesk"
    assert business.put(f"{N}/{main_id}", headers=WEB, json={"label": "Sales"}).json()["data"]["label"] == "Sales"
    assert business.post(f"{N}/999999/switch", headers=WEB).status_code == 404


def test_members_work_only_on_their_numbers(business):
    main_id = _numbers(business)[0]["id"]
    support = _add_support(business)
    _to(business, "3333333333", text="Need help")
    bad = business.post(f"{BASE}/team/members", headers=WEB, json={
        "email": "x@example.com", "role": "agent", "all_numbers": False, "number_ids": []})
    assert bad.status_code == 422 and "at least one number" in bad.text

    agent = _join(business)
    res = business.put(f"{BASE}/team/members/{agent.member_id}", headers=WEB,
                       json={"role": "agent", "all_numbers": False, "number_ids": [support["id"], 424242]})
    assert res.status_code == 200, res.text
    assert res.json()["data"]["all_numbers"] is False and res.json()["data"]["number_ids"] == [support["id"]]

    # the agent only sees the number they were given, and can't switch to the other
    mine = _numbers(agent)
    assert [n["id"] for n in mine] == [support["id"]] and mine[0]["current"]
    assert agent.post(f"{N}/{main_id}/switch", headers=WEB).status_code == 404
    assert [c["last_message_preview"] for c in _chats(agent)] == ["Need help"]
    agent.cookies.set("cd_number", str(main_id))  # a stale or forged cookie falls back to an allowed number
    assert _numbers(agent)[0]["current"] and len(_chats(agent)) == 1

    # on the main number the agent isn't someone chats can go to
    business.post(f"{N}/{main_id}/switch", headers=WEB)
    team = {m["id"]: m for m in business.get(f"{BASE}/team/members").json()["data"]}
    assert team[agent.member_id]["works_here"] is False
    inbound(business, text="Main question")
    main_chat = _chats(business)[0]
    refused = business.put(f"{BASE}/inbox/conversations/{main_chat['id']}/assign", headers=WEB,
                           json={"assignee_id": agent.member_id})
    assert refused.status_code == 422

    # on their number they are, and the notification names the number and switches to it
    business.post(f"{N}/{support['id']}/switch", headers=WEB)
    assert {m["id"]: m for m in business.get(f"{BASE}/team/members").json()["data"]}[agent.member_id]["works_here"]
    chat = _chats(business)[0]
    ok = business.put(f"{BASE}/inbox/conversations/{chat['id']}/assign", headers=WEB,
                      json={"assignee_id": agent.member_id})
    assert ok.status_code == 200, ok.text
    with SessionLocal() as db:
        note = (db.query(CustomerNotification).filter(CustomerNotification.customer_id == agent.member_id)
                .order_by(CustomerNotification.id.desc()).first())
        assert note.title.startswith("Support desk · New chat assigned to you")
        assert note.url == f"/dashboard/inbox?c={chat['id']}&number={support['id']}"
    # teams and assignment rules are shared by every number
    team_res = business.post(f"{BASE}/team/teams", headers=WEB, json={"name": "Sales", "member_ids": []})
    assert team_res.status_code == 200
    business.post(f"{N}/{main_id}/switch", headers=WEB)
    assert [t["name"] for t in business.get(f"{BASE}/team/teams").json()["data"]] == ["Sales"]
    agent.__exit__(None, None, None)


def test_deleting_a_number_removes_its_data(business):
    main_id = _numbers(business)[0]["id"]
    support = _add_support(business)
    _to(business, "3333333333")
    admin = _join(business, role="admin", name="Asha Admin")
    assert admin.post(f"{N}/{support['id']}/delete", headers=WEB, json={"confirm": "DELETE"}).status_code == 403
    assert business.post(f"{N}/{main_id}/delete", headers=WEB, json={"confirm": "DELETE"}).status_code == 422
    assert business.post(f"{N}/{support['id']}/delete", headers=WEB, json={"confirm": "nope"}).status_code == 422
    res = business.post(f"{N}/{support['id']}/delete", headers=WEB, json={"confirm": "delete"})
    assert res.status_code == 200 and res.json()["message"] == "Support desk and everything in it were deleted"
    with SessionLocal() as db:
        assert db.get(Customer, support["id"]) is None
        assert db.query(WaConversation).filter(WaConversation.customer_id == support["id"]).count() == 0
    rows = _numbers(business)  # the browser was on the deleted number: back to the main one
    assert len(rows) == 1 and rows[0]["id"] == main_id and rows[0]["current"]
    admin.__exit__(None, None, None)
