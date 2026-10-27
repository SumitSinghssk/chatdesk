# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from tests.test_inbox import BASE, WEB, business  # noqa: F401
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
