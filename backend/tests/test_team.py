# ruff: noqa: F811  (the `business` fixture is imported from test_inbox and used as a parameter)
import uuid

from fastapi.testclient import TestClient

from app.core import rate_limiter
from app.main import app
from tests.test_inbox import BASE, WEB, business, inbound  # noqa: F401

T = f"{BASE}/team"


def _join(business, role="agent", name="Ravi Agent"):
    """Owner invites someone; they open the link in their own browser and set a password."""
    email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
    res = business.post(f"{T}/members", headers=WEB, json={"email": email, "role": role})
    assert res.status_code == 200, res.text
    member = res.json()["data"]
    token = member["invite_url"].rsplit("/", 1)[1]
    person = TestClient(app, base_url="http://testserver")
    person.__enter__()
    info = person.get(f"{T}/invites/{token}").json()["data"]
    assert info["email"] == email and info["workspace"] == "Inbox Co" and info["role"] == role
    accepted = person.post(f"{T}/invites/{token}/accept", headers=WEB,
                           json={"name": name, "password": "Secret@123", "password_confirmation": "Secret@123"})
    assert accepted.status_code == 200, accepted.text
    person.member_id, person.email, person.token = member["id"], email, token
    return person


def _chats(client, **params):
    return client.get(f"{BASE}/inbox/conversations", params={"status": "all", **params}).json()["data"]


def test_invite_join_and_role_permissions(business):
    agent = _join(business)
    me = agent.get(f"{BASE}/account/me").json()["data"]
    assert me["role"] == "agent" and me["workspace"]["name"] == "Inbox Co"
    # the link works once
    assert agent.get(f"{T}/invites/{agent.token}").status_code == 404

    # agents work the inbox and contacts...
    assert agent.get(f"{BASE}/inbox/conversations").status_code == 200
    assert agent.post(f"{BASE}/contacts", headers=WEB, json={"phone": "9811122233"}).status_code == 200
    assert agent.get(f"{T}/members").status_code == 200
    # ...but can't manage templates, campaigns, WhatsApp setup, the team, or bulk-delete contacts
    for method, path in (("get", f"{BASE}/templates"), ("get", f"{BASE}/campaigns"),
                         ("delete", f"{BASE}/whatsapp/connection"), ("post", f"{T}/members"),
                         ("get", f"{BASE}/contacts/export"), ("get", f"{T}/performance")):
        kwargs = {"headers": WEB} if method != "get" else {}
        if method == "post":
            kwargs["json"] = {"email": "x@example.com"}
        assert getattr(agent, method)(path, **kwargs).status_code == 403, path

    members = {m["email"]: m for m in business.get(f"{T}/members").json()["data"]}
    assert members[agent.email]["role"] == "agent" and members[agent.email]["status"] == "active"
    owner = next(m for m in members.values() if m["role"] == "owner")
    assert owner["is_you"]
    # the owner can't be removed or demoted; you can't change your own role
    assert business.delete(f"{T}/members/{owner['id']}", headers=WEB).status_code == 422
    admin = _join(business, role="admin", name="Asha Admin")
    assert admin.put(f"{T}/members/{admin.member_id}", headers=WEB, json={"role": "agent"}).status_code == 422
    assert admin.post(f"{T}/members", headers=WEB, json={"email": f"x{uuid.uuid4().hex[:6]}@example.com"}
                      ).status_code == 200  # admins invite too

    # same email twice, or someone who has their own account
    assert business.post(f"{T}/members", headers=WEB, json={"email": agent.email}).status_code == 409
    for client in (agent, admin):
        client.__exit__(None, None, None)


def test_reinvite_replaces_the_link(business):
    res = business.post(f"{T}/members", headers=WEB, json={"email": f"late-{uuid.uuid4().hex[:6]}@example.com"})
    member = res.json()["data"]
    old = member["invite_url"].rsplit("/", 1)[1]
    new = business.post(f"{T}/members/{member['id']}/invite", headers=WEB).json()["data"]["invite_url"]
    with TestClient(app, base_url="http://testserver") as anon:
        assert anon.get(f"{T}/invites/{old}").status_code == 404
        assert anon.get(f"{T}/invites/{new.rsplit('/', 1)[1]}").status_code == 200
    # removing an invited person deletes the invite
    assert business.delete(f"{T}/members/{member['id']}", headers=WEB).status_code == 200


def test_round_robin_visibility_assignment_and_response_time(business):
    rate_limiter._history.clear()
    agent = _join(business, name="Ravi Agent")
    admin = _join(business, role="admin", name="Asha Admin")
    owner_id = next(m["id"] for m in business.get(f"{T}/members").json()["data"] if m["role"] == "owner")

    # round-robin among available members; the owner sets themself away
    rules = business.put(f"{T}/settings", headers=WEB, json={"auto_assign": "round_robin", "only_available": True})
    assert rules.status_code == 200
    assert business.put(f"{T}/availability", headers=WEB, json={"availability": "away"}).status_code == 200
    for i in range(4):
        inbound(business, wa_id=f"91900000110{i}", name=f"Customer {i}")
    owners = [c["assignee"]["id"] for c in _chats(business)]
    assert owner_id not in owners and sorted(owners) == sorted([agent.member_id, admin.member_id] * 2)

    # a chat with the agent: timeline shows the auto-assignment
    mine = _chats(agent, assignee="me")
    assert len(mine) == 2
    conv = mine[0]
    timeline = agent.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["events"]
    assert timeline[-1]["text"] == "Auto-assigned to Ravi Agent" and timeline[-1]["actor"] is None
    summary = agent.get(f"{BASE}/inbox/summary").json()["data"]
    assert summary["mine"] == 2 and summary["role"] == "agent"

    # the agent answers: the customer's wait is recorded against them
    reply = agent.post(f"{BASE}/inbox/conversations/{conv['id']}/messages", headers=WEB, json={"text": "Hi!"})
    assert reply.status_code == 200 and reply.json()["data"]["sent_by"] == "Ravi Agent"
    perf = business.get(f"{T}/performance", params={"days": 7}).json()
    assert "data" in perf, perf
    perf = perf["data"]
    ravi = next(r for r in perf["members"] if r["member"]["id"] == agent.member_id)
    assert ravi["replies"] == 1 and ravi["responses"] == 1 and ravi["within_5_min"] == 100
    assert ravi["open_chats"] == 2 and perf["totals"]["waiting_now"] == 3

    # agents limited to their own chats
    business.put(f"{T}/settings", headers=WEB, json={"auto_assign": "off", "agent_visibility": "own"})
    inbound(business, wa_id="919000001199", name="Unassigned person")
    assert {c["assignee"]["id"] for c in _chats(agent)} == {agent.member_id}
    other = next(c for c in _chats(business) if c["assignee"] and c["assignee"]["id"] == admin.member_id)
    assert agent.get(f"{BASE}/inbox/conversations/{other['id']}").status_code == 404
    # "assigned": theirs plus the unassigned queue (and their teams' queue)
    business.put(f"{T}/settings", headers=WEB, json={"agent_visibility": "assigned"})
    visible = _chats(agent)
    assert any(c["assignee"] is None for c in visible) and all(
        c["assignee"] is None or c["assignee"]["id"] == agent.member_id for c in visible)

    # hand a chat over to another person and a team, by hand
    team = business.post(f"{T}/teams", headers=WEB, json={"name": "Sales", "member_ids": [agent.member_id]})
    team_id = team.json()["data"]["id"]
    moved = business.put(f"{BASE}/inbox/conversations/{other['id']}/assign", headers=WEB,
                         json={"assignee_id": None, "team_id": team_id})
    assert moved.status_code == 200 and moved.json()["message"] == "Chat unassigned"
    assert agent.get(f"{BASE}/inbox/conversations/{other['id']}").status_code == 200  # Sales queue
    taken = agent.put(f"{BASE}/inbox/conversations/{other['id']}/assign", headers=WEB,
                      json={"assignee_id": agent.member_id, "team_id": team_id})
    assert taken.json()["message"] == "Assigned to you"
    events = [e["text"] for e in agent.get(f"{BASE}/inbox/conversations/{other['id']}/messages").json()["events"]]
    assert events[-3:] == ["Moved to team Sales", "Unassigned", "Assigned to Ravi Agent"]
    assert business.get(f"{T}/teams").json()["data"][0]["open_chats"] == 1

    # removing the agent hands their chats back and signs them out
    removed = business.delete(f"{T}/members/{agent.member_id}", headers=WEB)
    assert removed.status_code == 200 and "now unassigned" in removed.json()["message"]
    assert agent.get(f"{BASE}/inbox/conversations").status_code == 401
    assert not any(c["assignee"] and c["assignee"]["id"] == agent.member_id for c in _chats(business))
    for client in (agent, admin):
        client.__exit__(None, None, None)


def test_admin_panel_lists_businesses_not_members(business, client, admin_headers):
    agent = _join(business)
    rows = client.get("/api/v1/admin/customers", params={"search": agent.email, "page": 1},
                      headers=admin_headers).json()["data"]
    assert rows == []
    owner = client.get("/api/v1/admin/customers", params={"search": "Inbox Co", "page": 1, "per_page": 100},
                       headers=admin_headers).json()["data"]
    assert any(r["team_members"] >= 1 for r in owner)
    agent.__exit__(None, None, None)
