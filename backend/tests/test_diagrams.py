# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from tests.test_inbox import BASE, WEB, business  # noqa: F401
from tests.test_ai_agent import fake_ai, shop  # noqa: F401
from tests.test_team import _join

D = f"{BASE}/diagrams"
S = f"{BASE}/shared-diagrams"


def _node(node_id, label, x=0, y=0):
    return {"id": node_id, "type": "shape", "position": {"x": x, "y": y}, "width": 160, "height": 60,
            "data": {"shape": "process", "label": label}}


START = {
    "nodes": {"a": _node("a", "Enquiry"), "b": _node("b", "Reply", 0, 120)},
    "edges": {"ab": {"id": "ab", "source": "a", "target": "b"},
              "ax": {"id": "ax", "source": "a", "target": "missing"}},  # a line to nothing is dropped
}


def _until(socket, kind, limit=40):
    """Reads messages until one of `kind` (others, like cursors, are skipped)."""
    for _ in range(limit):
        message = socket.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"no {kind} message")


def _create(client, **extra):
    res = client.post(D, headers=WEB, json={"name": "Enquiry flow", "content": START, **extra})
    assert res.status_code == 200, res.text
    return res.json()["data"]


def test_create_list_edit_live_and_versions(business):
    d = _create(business, folder="Sales")
    assert set(d["content"]["edges"]) == {"ab"} and d["level"] == "manage" and d["seq"] == 0
    listed = business.get(D).json()
    row = next(x for x in listed["data"] if x["id"] == d["id"])
    assert row["shapes"] == 2 and row["preview"]["edges"] == [["a", "b"]] and listed["folders"] == ["Sales"]

    # two tabs open the diagram; a change made in one shows up in the other
    with business.websocket_connect(f"{D}/{d['id']}/live?since=0") as one, \
            business.websocket_connect(f"{D}/{d['id']}/live?since=0") as two:
        hello = one.receive_json()
        assert hello["type"] == "hello" and hello["seq"] == 0 and hello["level"] == "manage"
        assert two.receive_json()["type"] == "hello"
        assert _until(one, "join")["peer"]["name"] == "Inbox Owner"  # tab two arrived
        two.send_json({"type": "presence", "cursor": {"x": 5, "y": 6}, "selection": ["a"]})
        moved = _until(one, "presence")
        while not moved.get("cursor"):  # tab two first says it's here, then where its cursor is
            moved = _until(one, "presence")
        assert moved["cursor"] == {"x": 5, "y": 6} and moved["selection"] == ["a"]

        one.send_json({"type": "ops", "ref": 1, "client_id": "tab-one",
                       "ops": [{"k": "n", "id": "c", "v": _node("c", "Quote", 0, 240)},
                               {"k": "e", "id": "bc", "v": {"source": "b", "target": "c"}}]})
        assert _until(one, "ack") == {"type": "ack", "ref": 1, "seq": 1}
        change = _until(two, "ops")
        assert change["seq"] == 1 and change["client"] == "tab-one" and len(change["ops"]) == 2

        # a tab without a live connection saves over HTTP; removing a shape removes its lines
        saved = business.post(f"{D}/{d['id']}/ops", headers=WEB,
                              json={"client_id": "tab-three", "ops": [{"k": "n", "id": "b", "v": None}]})
        assert saved.status_code == 200 and saved.json()["data"]["seq"] == 2
        gone = _until(two, "ops")
        assert {(o["k"], o["id"]) for o in gone["ops"]} == {("n", "b"), ("e", "ab"), ("e", "bc")}

        # someone who was away catches up from where they were
        missed = business.get(f"{D}/{d['id']}/ops", params={"since": 0}).json()["data"]
        assert [b["seq"] for b in missed["batches"]] == [1, 2]
        assert business.get(f"{D}/{d['id']}/ops", params={"since": 2}).json()["data"]["batches"] == []
        assert business.get(f"{D}/{d['id']}/ops", params={"since": 99}).json()["data"]["reload"] is True

        # versions: one saved automatically with the first change, one by name; restoring tells every tab
        assert business.post(f"{D}/{d['id']}/versions", headers=WEB, json={"name": "Before review"}).status_code == 200
        versions = business.get(f"{D}/{d['id']}/versions").json()["data"]
        assert [v["name"] for v in versions][:1] == ["Before review"] and len(versions) == 2
        first = versions[-1]  # the automatic one, with shapes a, b and c
        assert business.get(f"{D}/{d['id']}/versions/{first['id']}").json()["data"]["content"]["nodes"].keys() \
            == {"a", "b", "c"}
        restored = business.post(f"{D}/{d['id']}/versions/{first['id']}/restore", headers=WEB).json()["data"]
        assert set(restored["content"]["nodes"]) == {"a", "b", "c"} and restored["seq"] == 3
        reload = _until(one, "reload")
        assert reload["seq"] == 3 and set(reload["content"]["nodes"]) == {"a", "b", "c"}

    # rename, star, copy, activity
    business.put(f"{D}/{d['id']}", headers=WEB, json={"name": "Enquiry flow v2"})
    assert business.post(f"{D}/{d['id']}/star", headers=WEB).json()["data"]["starred"] is True
    assert [x["id"] for x in business.get(D, params={"starred": True}).json()["data"]] == [d["id"]]
    copy = business.post(f"{D}/{d['id']}/duplicate", headers=WEB).json()["data"]
    assert copy["name"] == "Enquiry flow v2 (copy)" and set(copy["content"]["nodes"]) == {"a", "b", "c"}
    assert business.get(f"{D}/{d['id']}").json()["data"]["name"] == "Enquiry flow v2"
    kinds = {a["kind"] for a in business.get(f"{D}/{d['id']}/activity").json()["data"]}
    assert {"created", "edited", "restored", "viewed"} <= kinds
    assert business.delete(f"{D}/{copy['id']}", headers=WEB).status_code == 200


def test_team_access_levels_reach_open_tabs(business):
    d = _create(business)
    agent = _join(business)
    try:
        assert agent.get(f"{D}/{d['id']}").json()["data"]["level"] == "edit"  # the team can edit by default
        with agent.websocket_connect(f"{D}/{d['id']}/live?since=0") as tab:
            assert tab.receive_json()["level"] == "edit"
            set_view = business.put(f"{D}/{d['id']}/access", headers=WEB, json={"team_access": "view"})
            assert set_view.status_code == 200
            assert _until(tab, "level")["level"] == "view"
            tab.send_json({"type": "ops", "ref": 7, "ops": [{"k": "n", "id": "z", "v": _node("z", "Nope")}]})
            assert _until(tab, "error")["ref"] == 7
            assert agent.post(f"{D}/{d['id']}/ops", headers=WEB,
                              json={"ops": [{"k": "n", "id": "z", "v": _node("z", "Nope")}]}).status_code == 403
            assert agent.post(f"{D}/{d['id']}/comments", headers=WEB,
                              json={"body": "Hi", "x": 1, "y": 2}).status_code == 403  # view can't comment

            # private, but this agent was added as a commenter
            business.put(f"{D}/{d['id']}/access", headers=WEB, json={
                "team_access": "private", "members": [{"member_id": agent.member_id, "role": "comment"}]})
            assert _until(tab, "level")["level"] == "comment"
            assert agent.post(f"{D}/{d['id']}/comments", headers=WEB,
                              json={"body": "Looks good", "x": 1, "y": 2}).status_code == 200

            # removed from it: the open tab is told and closed, and it disappears from their list
            business.put(f"{D}/{d['id']}/access", headers=WEB, json={"team_access": "private"})
            assert "removed" in _until(tab, "closed")["message"]
        assert agent.get(f"{D}/{d['id']}").status_code == 404
        assert d["id"] not in [x["id"] for x in agent.get(D).json()["data"]]
        assert agent.delete(f"{D}/{d['id']}", headers=WEB).status_code == 404

        # an agent's own diagram is theirs to manage
        own = _create(agent)
        assert own["level"] == "manage"
        assert business.get(f"{D}/{own['id']}").json()["data"]["level"] == "manage"  # owners see everything
    finally:
        agent.__exit__(None, None, None)


def test_share_link_view_comment_password_and_turning_it_off(business):
    d = _create(business)
    with TestClient(app, base_url="http://testserver") as guest:
        assert guest.get(f"{S}/nothing").status_code == 404

        # view-only link: guests see it and its changes, but can't comment or edit
        link = business.put(f"{D}/{d['id']}/link", headers=WEB, json={"enabled": True}).json()["data"]["link"]
        token = link["token"]
        seen = guest.get(f"{S}/{token}").json()["data"]
        assert seen["name"] == "Enquiry flow" and set(seen["content"]["nodes"]) == {"a", "b"}
        assert seen["access"] == "view" and seen["comments"] == []
        assert guest.post(f"{S}/{token}/comments", headers=WEB,
                          json={"name": "Priya", "body": "Hi", "x": 0, "y": 0}).status_code == 403
        with guest.websocket_connect(f"{S}/{token}/live?since=0&name=Priya") as tab:
            assert tab.receive_json()["level"] == "view"
            tab.send_json({"type": "ops", "ref": 1, "ops": [{"k": "n", "id": "z", "v": _node("z", "Hack")}]})
            assert _until(tab, "error")["ref"] == 1
            business.post(f"{D}/{d['id']}/ops", headers=WEB, json={"ops": [{"k": "n", "id": "a", "v": None}]})
            assert _until(tab, "ops")["seq"] == 1  # live changes reach guests too

            # the link now allows comments: the open tab can comment straight away
            business.put(f"{D}/{d['id']}/link", headers=WEB, json={"enabled": True, "access": "comment"})
            assert _until(tab, "level")["level"] == "comment"
            # a password is added: guests who came in without it are let go
            business.put(f"{D}/{d['id']}/link", headers=WEB, json={"enabled": True, "access": "comment",
                                                                  "password": "open-sesame"})
            assert _until(tab, "closed")["type"] == "closed"
        assert guest.get(f"{S}/{token}").status_code == 401
        assert guest.post(f"{S}/{token}/unlock", headers=WEB, json={"password": "nope"}).status_code == 422
        key = guest.post(f"{S}/{token}/unlock", headers=WEB, json={"password": "open-sesame"}).json()["data"]["pass"]
        pass_header = {**WEB, "X-Diagram-Pass": key}
        assert guest.get(f"{S}/{token}", headers=pass_header).json()["data"]["access"] == "comment"
        posted = guest.post(f"{S}/{token}/comments", headers=pass_header,
                            json={"name": "Priya", "body": "Can we add a WhatsApp step?", "x": 40, "y": 80})
        assert posted.status_code == 200 and posted.json()["data"]["guest"] is True

        # the owner is told, replies, and resolves it
        notes = business.get(f"{BASE}/account/notifications").json()["data"]["items"]
        assert any("Priya (guest) commented on “Enquiry flow”" in n["title"] for n in notes)
        thread = posted.json()["data"]["id"]
        reply = business.post(f"{D}/{d['id']}/comments", headers=WEB, json={"body": "Yes", "parent_id": thread})
        assert reply.json()["data"]["parent_id"] == thread
        assert business.put(f"{D}/{d['id']}/comments/{thread}", headers=WEB,
                            json={"resolved": True}).json()["data"]["resolved"] is True
        assert len(guest.get(f"{S}/{token}/comments", headers=pass_header).json()["data"]) == 2

        # expiry in the past is refused; a new link retires the old one; turning it off closes open tabs
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        assert business.put(f"{D}/{d['id']}/link", headers=WEB,
                            json={"enabled": True, "expires_at": past}).status_code == 422
        fresh = business.put(f"{D}/{d['id']}/link", headers=WEB,
                             json={"enabled": True, "new_link": True, "password": ""}).json()["data"]["link"]
        assert fresh["token"] != token and not fresh["has_password"]
        assert guest.get(f"{S}/{token}").status_code == 404
        with guest.websocket_connect(f"{S}/{fresh['token']}/live?since=0") as tab:
            assert tab.receive_json()["type"] == "hello"
            business.put(f"{D}/{d['id']}/link", headers=WEB, json={"enabled": False})
            assert _until(tab, "closed")["type"] == "closed"
        assert guest.get(f"{S}/{fresh['token']}").status_code == 404

        # other businesses can't see it
        assert guest.get(f"{D}/{d['id']}").status_code == 401


PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7V\xbd\xfa\x00\x00\x00\x00IEND\xaeB`\x82")


def test_pictures_mentions_timer_and_voting(business):
    d = _create(business)
    # a picture for an image shape; anything that isn't a real picture is refused
    up = business.post(f"{D}/{d['id']}/images", headers=WEB, files={"file": ("logo.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    assert up.json()["data"]["url"].startswith("/storage/uploads/diagrams-")
    assert business.get(up.json()["data"]["url"]).status_code == 200
    fake = business.post(f"{D}/{d['id']}/images", headers=WEB, files={"file": ("x.png", b"<svg>", "image/png")})
    svg = business.post(f"{D}/{d['id']}/images", headers=WEB, files={"file": ("x.svg", b"<svg/>", "image/svg+xml")})
    assert fake.status_code == 400 and svg.status_code == 400

    # @mentions: the person is told, by name, and the comment remembers who
    agent = _join(business)
    try:
        said = business.post(f"{D}/{d['id']}/comments", headers=WEB, json={
            "body": "@Ravi Agent can you check this?", "x": 0, "y": 0, "mentions": [agent.member_id, 999999]})
        assert said.json()["data"]["mentions"] == [{"id": agent.member_id, "name": "Ravi Agent"}]
        notes = agent.get(f"{BASE}/account/notifications").json()["data"]["items"]
        assert any("mentioned you in “Enquiry flow”" in n["title"] for n in notes)

        # a shared 5-minute timer and dot voting (3 votes each)
        timer = business.post(f"{D}/{d['id']}/timer", headers=WEB, json={"minutes": 5}).json()["data"]["session"]["timer"]
        assert timer["minutes"] == 5 and timer["by"] == "Inbox Owner"
        assert agent.post(f"{D}/{d['id']}/votes", headers=WEB, json={"node_id": "a"}).status_code == 422  # not open
        business.put(f"{D}/{d['id']}/voting", headers=WEB, json={"open": True, "per_person": 1})
        voted = agent.post(f"{D}/{d['id']}/votes", headers=WEB, json={"node_id": "a"}).json()["data"]
        assert voted["session"]["voting"]["votes"] == {"a": [f"m:{agent.member_id}"]}
        assert agent.post(f"{D}/{d['id']}/votes", headers=WEB, json={"node_id": "b"}).status_code == 422  # 1 each
        agent.post(f"{D}/{d['id']}/votes", headers=WEB, json={"node_id": "a", "on": False})
        assert agent.post(f"{D}/{d['id']}/votes", headers=WEB, json={"node_id": "b"}).status_code == 200
        state = business.get(f"{D}/{d['id']}").json()["data"]["session"]
        assert state["voting"]["votes"] == {"b": [f"m:{agent.member_id}"]} and state["timer"]["minutes"] == 5
        closed = business.put(f"{D}/{d['id']}/voting", headers=WEB, json={"open": False}).json()["data"]
        assert closed["session"]["voting"]["open"] is False and closed["session"]["voting"]["votes"]  # results stay
        assert business.post(f"{D}/{d['id']}/timer", headers=WEB, json={"minutes": 0}).json()["data"]["session"]["timer"] is None
    finally:
        agent.__exit__(None, None, None)


def test_approval_locks_until_unlocked_and_shows_what_changed(business):
    d = _create(business)
    agent = _join(business)
    try:
        assert agent.post(f"{D}/{d['id']}/approve", headers=WEB).status_code == 403  # only who manages it
        with agent.websocket_connect(f"{D}/{d['id']}/live?since=0") as tab:
            tab.receive_json()
            approved = business.post(f"{D}/{d['id']}/approve", headers=WEB).json()["data"]
            assert approved["locked"] and approved["approval"]["approved_by"] == "Inbox Owner"
            assert _until(tab, "state")["locked"] is True  # open tabs stop editing straight away

        # nobody changes it while it's locked, not even the owner
        change = {"ops": [{"k": "n", "id": "a", "v": None}]}
        assert business.post(f"{D}/{d['id']}/ops", headers=WEB, json=change).status_code == 423
        assert agent.post(f"{D}/{d['id']}/ops", headers=WEB, json=change).status_code == 423

        # the agent asks; the owner is told and unlocks it
        assert agent.post(f"{D}/{d['id']}/request-change", headers=WEB, json={"note": "Add a payment step"}).status_code == 200
        notes = business.get(f"{BASE}/account/notifications").json()["data"]["items"]
        assert any("asks to change “Enquiry flow”" in n["title"] for n in notes)
        assert business.post(f"{D}/{d['id']}/unlock", headers=WEB).json()["data"]["locked"] is False
        assert business.post(f"{D}/{d['id']}/request-change", headers=WEB, json={}).status_code == 422

        # changes after approval are listed
        agent.post(f"{D}/{d['id']}/ops", headers=WEB, json={"ops": [
            {"k": "n", "id": "b", "v": None},
            {"k": "n", "id": "c", "v": _node("c", "Payment", 0, 240)},
            {"k": "n", "id": "a", "v": _node("a", "Enquiry on WhatsApp")}]})
        since = business.get(f"{D}/{d['id']}/since-approval").json()["data"]
        assert since["added"] == ["Payment"] and since["removed"] == ["Reply"] and since["changed"] == ["Enquiry on WhatsApp"]
        assert since["lines_removed"] == 1 and since["approved_by"] == "Inbox Owner"
    finally:
        agent.__exit__(None, None, None)


def test_comments_become_tasks_with_due_dates_and_reminders(business):
    from app.core.database import SessionLocal
    from app.modules.customer.diagrams.service import task_reminders
    from app.shared.utils.datetime import now

    d = _create(business, name="Launch plan")
    c = business.post(f"{D}/{d['id']}/comments", headers=WEB, json={"body": "Write the welcome message",
                                                                    "x": 0, "y": 0}).json()["data"]
    assert c["task"] is None
    agent = _join(business)
    try:
        url = f"{D}/{d['id']}/comments/{c['id']}/task"
        assert business.put(url, headers=WEB, json={"assignee_id": 999999}).status_code == 422  # not in the team
        today = now().date()
        given = business.put(url, headers=WEB, json={"assignee_id": agent.member_id, "due_on": today.isoformat()})
        assert given.status_code == 200, given.text
        assert given.json()["data"]["task"] == {"assignee_id": agent.member_id, "assignee": "Ravi Agent",
                                                "due_on": today.isoformat(), "by": "Inbox Owner"}
        notes = agent.get(f"{BASE}/account/notifications").json()["data"]["items"]
        assert any(n["title"].startswith("Inbox Owner gave you a task in “Launch plan”") for n in notes)

        # it shows in their list (and nobody else's)
        mine = agent.get(f"{D}/tasks").json()["data"]
        assert [t["id"] for t in mine] == [c["id"]] and mine[0]["diagram"]["name"] == "Launch plan"
        assert business.get(f"{D}/tasks").json()["data"] == []

        # on the day it's due they're told, once
        db = SessionLocal()
        try:
            assert task_reminders(db) >= 1
            assert task_reminders(db) == 0
        finally:
            db.close()
        notes = agent.get(f"{BASE}/account/notifications").json()["data"]["items"]
        assert any(n["title"] == "A task in “Launch plan” is due today" for n in notes)

        # overdue, then done (resolving the thread)
        late = (today - timedelta(days=2)).isoformat()
        business.put(url, headers=WEB, json={"assignee_id": agent.member_id, "due_on": late})
        assert agent.get(f"{D}/tasks").json()["data"][0]["overdue"] is True
        agent.put(f"{D}/{d['id']}/comments/{c['id']}", headers=WEB, json={"resolved": True})
        assert agent.get(f"{D}/tasks").json()["data"] == []
        assert [t["id"] for t in agent.get(f"{D}/tasks?done=true").json()["data"]] == [c["id"]]

        # no one to do it: a plain comment again
        plain = business.put(url, headers=WEB, json={"assignee_id": None}).json()["data"]
        assert plain["task"] is None
    finally:
        agent.__exit__(None, None, None)


def test_pages_and_embedding_on_a_website(business):
    d = _create(business)
    pages = [{"id": "p1", "name": "Overview"}, {"id": "p2", "name": "Details"}]
    saved = business.put(f"{D}/{d['id']}", headers=WEB, json={"pages": pages})
    assert saved.status_code == 200 and saved.json()["data"]["pages"] == pages
    assert business.put(f"{D}/{d['id']}", headers=WEB, json={"pages": [pages[0], pages[0]]}).status_code == 422
    assert business.put(f"{D}/{d['id']}", headers=WEB, json={"pages": []}).status_code == 422

    # off until it's turned on; then view only, through its own address
    assert saved.json()["data"]["embed"] == {"enabled": False, "token": None}
    on = business.put(f"{D}/{d['id']}/embed", headers=WEB, json={"enabled": True}).json()["data"]["embed"]
    token = on["token"]
    assert on["enabled"] and token
    with TestClient(app) as anyone:
        view = anyone.get(f"{S}/embed/{token}").json()["data"]
        assert view["name"] == "Enquiry flow" and view["pages"] == pages and "a" in view["content"]["nodes"]
        assert "comments" not in view
        business.post(f"{D}/{d['id']}/ops", headers=WEB, json={"ops": [
            {"k": "n", "id": "c", "v": {**_node("c", "Order", 0, 240), "data": {"shape": "process", "label": "Order",
                                                                              "page": "p2"}}}]})
        later = anyone.get(f"{S}/embed/{token}/ops?since={view['seq']}").json()["data"]
        assert later["batches"][0]["ops"][0]["id"] == "c" and later["pages"] == pages
        # the share link's address doesn't work as an embed, and the embed can't be commented on
        assert anyone.get(f"{S}/{token}").status_code == 404
        # a new code: the old one stops; off: nothing shows
        new = business.put(f"{D}/{d['id']}/embed", headers=WEB, json={"enabled": True, "new_code": True})
        assert anyone.get(f"{S}/embed/{token}").status_code == 404
        token = new.json()["data"]["embed"]["token"]
        assert anyone.get(f"{S}/embed/{token}").status_code == 200
        business.put(f"{D}/{d['id']}/embed", headers=WEB, json={"enabled": False})
        assert anyone.get(f"{S}/embed/{token}").status_code == 404


def test_cards_show_live_chatdesk_records(business):
    contact = business.post(f"{BASE}/contacts", headers=WEB, json={
        "phone": "9800011122", "name": "Asha Verma", "tags": ["vip"]}).json()["data"]
    bot = business.post(f"{BASE}/chatbots", headers=WEB, json={"name": "Order bot", "keywords": ["order"]})
    assert bot.status_code == 200, bot.text
    bot = bot.json()["data"]

    # picking: search by name or number
    found = business.get(f"{D}/records/search?type=contact&q=Asha").json()["data"]
    assert [c["id"] for c in found] == [contact["id"]] and found[0]["subtitle"].endswith("122")
    assert "0011122" not in found[0]["subtitle"]  # the number is masked
    assert business.get(f"{D}/records/search?type=chatbot&q=order").json()["data"][0]["id"] == bot["id"]
    assert business.get(f"{D}/records/search?type=nope").status_code == 422

    card = lambda nid, kind, rid: {**_node(nid, ""), "data": {"shape": "record", "label": "",  # noqa: E731
                                                              "record": {"type": kind, "id": rid}}}
    d = _create(business, content={"nodes": {"c": card("c", "contact", contact["id"]),
                                             "b": card("b", "chatbot", bot["id"]),
                                             "x": card("x", "order", 999999)}, "edges": {}})
    cards = business.get(f"{D}/{d['id']}/records").json()["data"]
    assert cards[f"contact:{contact['id']}"]["title"] == "Asha Verma"
    assert cards[f"contact:{contact['id']}"]["tags"] == ["vip"] and "phone" in cards[f"contact:{contact['id']}"]
    assert cards[f"chatbot:{bot['id']}"]["status"] == "off" and cards[f"chatbot:{bot['id']}"]["chats_week"] == 0
    assert cards["order:999999"] == {"type": "order", "id": 999999, "missing": True}

    # through the share link: no private details
    link = business.put(f"{D}/{d['id']}/link", headers=WEB, json={"enabled": True, "access": "view"}).json()
    token = link["data"]["link"]["token"]
    with TestClient(app) as anyone:
        guest = anyone.get(f"{S}/{token}/records").json()["data"][f"contact:{contact['id']}"]
        assert guest["title"] == "Asha" and "phone" not in guest and "path" not in guest and guest["tags"] == []


def test_ai_draws_explains_and_suggests(shop):  # noqa: F811
    import json as _json

    from tests import ai_fake
    from tests.test_ai_agent import connect

    assert shop.post(f"{D}/ai/draw", headers=WEB, json={"prompt": "order flow"}).status_code == 409  # no AI yet
    connect(shop)
    options = shop.get(f"{D}/ai").json()["data"]
    assert len(options) == 1 and options[0]["model"]

    ai_fake.Fake.reply = "Here it is:\n```json\n" + _json.dumps({
        "title": "Order flow", "kind": "flowchart",
        "nodes": [{"id": "n1", "label": "Start", "shape": "terminal"},
                  {"id": "n2", "label": "Customer asks for price", "shape": "io"},
                  {"id": "n3", "label": "In stock?", "shape": "decision"},
                  {"id": "n4", "label": "Send payment link", "shape": "hexagon"},  # not a shape it may use
                  {"id": "n4", "label": "duplicate id"},
                  {"id": "n5", "label": "End", "shape": "terminal"}],
        "edges": [{"from": "n1", "to": "n2"}, {"from": "n2", "to": "n3"}, {"from": "n3", "to": "n4", "label": "Yes"},
                  {"from": "n3", "to": "nX"}, {"from": "n4", "to": "n5"}],
    }) + "\n```"
    drawn = shop.post(f"{D}/ai/draw", headers=WEB, json={"prompt": "order flow from enquiry to payment"})
    assert drawn.status_code == 200, drawn.text
    g = drawn.json()["data"]
    assert g["title"] == "Order flow" and [n["id"] for n in g["nodes"]] == ["n1", "n2", "n3", "n4", "n5"]
    assert g["nodes"][3]["shape"] == "process" and len(g["edges"]) == 4  # the line to nowhere is dropped

    ai_fake.Fake.reply = "not json at all"
    assert shop.post(f"{D}/ai/draw", headers=WEB, json={"prompt": "something"}).status_code == 502

    d = _create(shop)
    ai_fake.Fake.reply = "It shows how an enquiry gets a reply."
    said = shop.post(f"{D}/{d['id']}/ai/summary", headers=WEB).json()["data"]
    assert said["text"] == "It shows how an enquiry gets a reply."
    ai_fake.Fake.reply = _json.dumps({"suggestions": [{"label": "Follow up after a day", "after": "b", "why": "No reply"},
                                                      {"label": "Ghost step", "after": "zzz"}]})
    ideas = shop.post(f"{D}/{d['id']}/ai/suggest", headers=WEB).json()["data"]
    assert ideas[0] == {"label": "Follow up after a day", "after": "b", "why": "No reply"} and ideas[1]["after"] is None
