"""WhatsApp calls end to end on an in-memory SQLite database with a fake WhatsApp client (no Postgres, no network):
incoming call → ring → claim → answer → customer hangs up; an unanswered call → missed + follow-up; an outgoing
call using the 7-day call-back permission. Run with: pytest --noconftest tests/test_wa_calls_flow_unit.py"""
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.database import Base
from app.modules.customer.account.models import Customer, CustomerNotification
from app.modules.customer.inbox.models import (WaContact, WaConversation, WaConversationEvent, WaConversationPin,
                                               WaMessage, WaMessageStar, WaNote, WaPresence, WaResponse)
from app.modules.customer.team.models import WaNumberAccess, WaTeam, WaTeamMember
from app.modules.customer.wa_calls.models import WaCall, WaCallPermission, WaCallSettings
from app.modules.customer.whatsapp.models import WhatsAppAccount, WhatsAppWebhookEvent

TABLES = (Customer, CustomerNotification, WaContact, WaConversation, WaConversationEvent, WaMessage, WaNote, WaPresence,
          WaConversationPin, WaMessageStar, WaResponse, WaTeam, WaTeamMember, WaNumberAccess, WaCall, WaCallPermission,
          WaCallSettings, WhatsAppAccount, WhatsAppWebhookEvent)


class FakeClient:
    sent: list = []

    def __init__(self, *a, **k):
        pass

    def call_action(self, call_id, action, sdp=None):
        self.sent.append(("call", action, call_id))
        return {"success": True}

    def answer_call(self, call_id, sdp):
        self.sent.append(("answer", call_id))
        return {"success": True}

    def start_call(self, to, sdp, opaque=None):
        self.sent.append(("start", to))
        return {"calls": [{"id": "wacid.OUT1"}]}

    def send_text(self, to, text, reply_to=None):
        self.sent.append(("text", to, text))
        return {"messages": [{"id": "wamid.T"}]}

    def send(self, payload):
        self.sent.append(("send", payload.get("type")))
        return {"messages": [{"id": "wamid.S"}]}

    def set_calling(self, calling):
        self.sent.append(("settings", calling["status"]))
        return {"success": True}


@pytest.fixture()
def world(monkeypatch):
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[t.__table__ for t in TABLES])
    db = sessionmaker(bind=engine)()
    from app.modules.customer.account import notify
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.integrations import hooks, webhooks
    from app.modules.customer.wa_calls import service as calls

    FakeClient.sent = []
    monkeypatch.setattr(calls, "WhatsAppClient", FakeClient)
    monkeypatch.setattr(inbox, "WhatsAppClient", FakeClient)
    monkeypatch.setattr(notify, "notify", lambda *a, **k: 0)
    monkeypatch.setattr(hooks, "safe_emit", lambda *a, **k: None)
    monkeypatch.setattr(webhooks, "safe_emit", lambda *a, **k: None)

    owner = Customer(email="o@x.test", name="Owner", status="active", role="owner")
    db.add(owner)
    db.flush()
    agent = Customer(email="a@x.test", name="Asha", status="active", role="agent", workspace_id=owner.id,
                     all_numbers=True, availability="available")
    db.add_all([agent, WhatsAppAccount(customer_id=owner.id, webhook_key="k", waba_id="1", phone_number_id="P1",
                                       access_token="t", verify_token="v", status="connected")])
    db.commit()
    owner.actor, owner.member_role, owner.numbers = owner, "owner", [owner]

    class On:
        enabled, followup_on, followup_text, permission_text = True, True, None, None

    calls.save_settings(db, owner, On())
    yield db, owner, agent, calls
    db.close()


def _webhook(db, value):
    from app.modules.customer.inbox.processor import process_payload

    account = db.query(WhatsAppAccount).first()
    return process_payload(db, account, {"entry": [{"changes": [{"field": "calls", "value": value}]}]})


def _incoming(db, wacid):
    _webhook(db, {"contacts": [{"wa_id": "919800000001", "profile": {"name": "Ravi"}}],
                  "calls": [{"id": wacid, "from": "919800000001", "event": "connect", "direction": "USER_INITIATED",
                             "session": {"sdp": "v=0 offer"}}]})
    return db.query(WaCall).filter_by(wacid=wacid).first()


def test_turning_calling_on_tells_meta(world):
    assert ("settings", "ENABLED") in FakeClient.sent


def test_incoming_call_answered_and_ended(world):
    db, owner, agent, calls = world
    call = _incoming(db, "wacid.IN1")
    assert call.status == "ringing" and set(call.ringing_ids) == {owner.id, agent.id}
    assert calls.claim(db, owner, call.id)["data"]["offer_sdp"] == "v=0 offer"

    other = db.get(Customer, owner.id)
    other.actor, other.member_role, other.numbers = db.get(Customer, agent.id), "agent", [other]
    with pytest.raises(Exception) as exc:
        calls.claim(db, other, call.id)
    assert "Someone else answered" in str(getattr(exc.value, "detail", exc.value))

    owner.actor, owner.member_role = owner, "owner"
    assert calls.answer(db, owner, call.id, "v=0 answer")["data"]["status"] == "answered"
    assert ("answer", "wacid.IN1") in FakeClient.sent
    assert db.get(WaConversation, call.conversation_id).assignee_id == owner.id

    _webhook(db, {"calls": [{"id": "wacid.IN1", "event": "terminate", "status": "COMPLETED", "duration": 65}]})
    db.refresh(call)
    assert (call.status, call.duration, call.ended_by) == ("ended", 65, "customer")


def test_unanswered_call_becomes_missed_with_follow_up(world):
    db, owner, agent, calls = world
    call = _incoming(db, "wacid.IN2")
    call.created_at -= timedelta(minutes=5)
    db.commit()
    assert calls.expire_due(db) == 1
    assert db.get(WaCall, call.id).status == "missed"
    assert any(s[0] == "text" and "missed your call" in s[2] for s in FakeClient.sent)
    texts = [e.text for e in db.query(WaConversationEvent).order_by(WaConversationEvent.id)]
    assert texts[-1] == "Missed call"


def test_outgoing_call_after_the_customer_called(world):
    db, owner, agent, calls = world
    call = _incoming(db, "wacid.IN3")
    _webhook(db, {"calls": [{"id": "wacid.IN3", "event": "terminate", "status": "COMPLETED"}]})  # they hang up
    conv = db.get(WaConversation, call.conversation_id)
    with pytest.raises(Exception):  # one call at a time with a customer
        _incoming(db, "wacid.IN4")
        calls.start(db, owner, conv, "v=0 offer out")
    _webhook(db, {"calls": [{"id": "wacid.IN4", "event": "terminate", "status": "COMPLETED"}]})
    state = calls.permission_state(db, owner, conv)
    assert state["status"] == "temporary" and state["can_call"]  # Meta's 7-day call-back permission

    out = calls.start(db, owner, conv, "v=0 offer out")["data"]
    assert out["status"] == "dialing" and ("start", "919800000001") in FakeClient.sent
    _webhook(db, {"calls": [{"id": "wacid.OUT1", "event": "connect", "direction": "BUSINESS_INITIATED",
                             "session": {"sdp": "v=0 their answer"}}]})
    assert calls.get_call(db, owner, out["id"])["data"]["answer_sdp"] == "v=0 their answer"
    _webhook(db, {"statuses": [{"id": "wacid.OUT1", "type": "call", "status": "ACCEPTED"}]})
    assert db.get(WaCall, out["id"]).status == "answered"
    assert calls.hangup(db, owner, out["id"])["data"]["status"] == "ended"
    assert ("call", "terminate", "wacid.OUT1") in FakeClient.sent


def test_no_calls_to_customers_who_never_allowed_it(world):
    db, owner, agent, calls = world
    from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation

    contact = get_or_create_contact(db, owner.id, "919811111111")
    conv = get_or_create_conversation(db, contact)
    db.commit()
    state = calls.permission_state(db, owner, conv)
    assert not state["can_call"] and "hasn't allowed calls" in state["reason"]
