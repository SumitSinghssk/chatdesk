"""Phase 8 end to end on in-memory SQLite with a fake WhatsApp client: feedback after resolving, the rating answer
(handled before any auto-reply), the spend meter, the chat transcript. Run: pytest --noconftest <this file>"""
from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.database import Base
from app.modules.customer.account.models import Customer, CustomerNotification
from app.modules.customer.automation.models import WaAutoReply, WaAutoReplyHit
from app.modules.customer.feedback.models import WaFeedback, WaFeedbackSettings
from app.modules.customer.inbox.models import (WaContact, WaConversation, WaConversationEvent, WaConversationPin,
                                               WaMessage, WaMessageStar, WaNote, WaPresence, WaResponse)
from app.modules.customer.spend.models import WaSpendSettings
from app.modules.customer.team.models import WaNumberAccess, WaTeam, WaTeamMember
from app.modules.customer.whatsapp.models import WhatsAppAccount, WhatsAppWebhookEvent
from app.shared.utils.datetime import now

TABLES = (Customer, CustomerNotification, WaContact, WaConversation, WaConversationEvent, WaMessage, WaNote,
          WaPresence, WaConversationPin, WaMessageStar, WaResponse, WaTeam, WaTeamMember, WaNumberAccess,
          WhatsAppAccount, WhatsAppWebhookEvent, WaFeedback, WaFeedbackSettings, WaSpendSettings, WaAutoReply,
          WaAutoReplyHit)


class FakeClient:
    sent: list = []

    def __init__(self, *a, **k):
        pass

    def send(self, payload):
        self.sent.append(payload)
        return {"messages": [{"id": f"wamid.S{len(self.sent)}"}]}

    def send_text(self, to, text, reply_to=None):
        self.sent.append({"type": "text", "text": text})
        return {"messages": [{"id": f"wamid.T{len(self.sent)}"}]}


@pytest.fixture()
def world(monkeypatch):
    engine = create_engine("sqlite://")

    # foreign keys stay off: the commerce tables these point at aren't part of this test
    Base.metadata.create_all(engine, tables=[t.__table__ for t in TABLES])
    db = sessionmaker(bind=engine)()
    from app.modules.customer.account import notify
    from app.modules.customer.automation import engine as automation
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.integrations import hooks, webhooks

    FakeClient.sent = []
    told = []
    monkeypatch.setattr(inbox, "WhatsAppClient", FakeClient)
    monkeypatch.setattr(automation, "WhatsAppClient", FakeClient)
    monkeypatch.setattr(notify, "notify", lambda db, people, event, *a, **k: told.append(event) or 1)
    monkeypatch.setattr(hooks, "safe_emit", lambda *a, **k: None)
    monkeypatch.setattr(webhooks, "safe_emit", lambda *a, **k: None)
    from app.modules.customer.ai_agent import engine as ai

    monkeypatch.setattr(ai, "on_resolved", lambda *a, **k: None)  # the AI agent isn't under test here

    owner = Customer(email="o@x.test", name="Owner", business_name="Acme", status="active", role="owner")
    db.add(owner)
    db.flush()
    db.add(WhatsAppAccount(customer_id=owner.id, webhook_key="k", waba_id="1", phone_number_id="P1",
                           access_token="t", verify_token="v", status="connected"))
    contact = WaContact(customer_id=owner.id, wa_id="919800000001", name="Ravi Kumar", tags=[])
    db.add(contact)
    db.flush()
    conv = WaConversation(customer_id=owner.id, contact_id=contact.id, status="open", unread_count=0,
                          last_inbound_at=now() - timedelta(minutes=5))
    db.add(conv)
    db.add(WaFeedbackSettings(customer_id=owner.id, enabled=True, on_resolve=True, on_delivered=True,
                              review_url="https://g.page/r/acme", gap_days=7))
    db.commit()
    owner.actor, owner.member_role, owner.numbers = owner, "owner", [owner]
    yield db, owner, conv, told
    db.close()


def _tap(db, conv, reply_id):
    """The customer taps a row of the rating list (as the webhook would store it), then automation runs."""
    from app.modules.customer.automation import engine as automation

    m = WaMessage(customer_id=conv.customer_id, conversation_id=conv.id, wamid=f"wamid.in.{reply_id}",
                  direction="in", type="interactive", text="⭐", status="received", created_at=now(),
                  payload={"type": "interactive", "interactive": {"type": "list_reply",
                                                                   "list_reply": {"id": reply_id, "title": "⭐"}}})
    db.add(m)
    db.commit()
    return automation.handle(db, db.query(WhatsAppAccount).first(), [m.id])


def test_resolving_asks_once_and_a_good_rating_thanks_with_the_review_link(world):
    db, owner, conv, told = world
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.inbox.schemas import StatusSchema

    inbox.set_status(db, owner, conv.id, StatusSchema(status="resolved"))
    fb = db.query(WaFeedback).one()
    assert fb.source == "resolve" and FakeClient.sent[-1]["interactive"]["type"] == "list"
    rows = FakeClient.sent[-1]["interactive"]["action"]["sections"][0]["rows"]
    assert [r["id"] for r in rows][0] == f"csat:{fb.id}:5"

    inbox.set_status(db, owner, conv.id, StatusSchema(status="open"))
    inbox.set_status(db, owner, conv.id, StatusSchema(status="resolved"))
    assert db.query(WaFeedback).count() == 1  # not asked again within gap_days

    assert _tap(db, conv, f"csat:{fb.id}:5") == 1
    db.refresh(fb)
    assert fb.score == 5 and "g.page/r/acme" in FakeClient.sent[-1]["text"]
    before = len(FakeClient.sent)
    _tap(db, conv, f"csat:{fb.id}:1")  # a second tap changes nothing and says nothing
    assert db.get(WaFeedback, fb.id).score == 5 and len(FakeClient.sent) == before


def test_a_low_rating_reopens_the_chat_and_tells_the_team(world):
    db, owner, conv, told = world
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.inbox.schemas import StatusSchema

    inbox.set_status(db, owner, conv.id, StatusSchema(status="resolved"))
    fb = db.query(WaFeedback).one()
    _tap(db, conv, f"csat:{fb.id}:1")
    assert db.get(WaConversation, conv.id).status == "open"
    assert "unhappy_customer" in told


def test_no_question_when_the_window_is_closed(world):
    db, owner, conv, told = world
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.inbox.schemas import StatusSchema

    conv.last_inbound_at = now() - timedelta(days=2)
    db.commit()
    inbox.set_status(db, owner, conv.id, StatusSchema(status="resolved"))
    assert db.query(WaFeedback).count() == 0


def test_spend_meter_counts_billed_messages(world):
    db, owner, conv, told = world
    from app.modules.customer.spend import service as spend

    for i, category in enumerate(["marketing", "marketing", "utility", "service"]):
        m = WaMessage(customer_id=owner.id, conversation_id=conv.id, wamid=f"wamid.b{i}", direction="out",
                      type="template", status="sent", created_at=now())
        spend.record(m, {"pricing": {"billable": category != "service", "category": category}})
        db.add(m)
    db.add(WaSpendSettings(customer_id=owner.id, currency="INR", rates={"marketing": 1.0, "utility": 0.5},
                           monthly_budget=2.0))
    db.commit()
    month = spend.summary(db, owner.id)["month"]
    assert month["by_category"]["marketing"]["messages"] == 2 and month["by_category"]["service"]["messages"] == 0
    assert month["spent"] == 2.5 and month["used_percent"] == 125
    assert spend.alert_due(db) >= 1 and "spend_alert" in told


def test_transcript_lists_messages_notes_and_events(world):
    db, owner, conv, told = world
    from app.modules.customer.inbox import service as inbox

    db.add(WaMessage(customer_id=owner.id, conversation_id=conv.id, wamid="wamid.x", direction="in", type="text",
                     text="Where is my parcel?", status="received", created_at=now()))
    db.add(WaNote(customer_id=owner.id, conversation_id=conv.id, body="Checked with courier", author="Asha",
                  created_at=now()))
    db.commit()
    body = inbox.transcript(db, owner, conv.id, "txt").body.decode()
    assert "Ravi Kumar: Where is my parcel?" in body and "[Internal note] Asha: Checked with courier" in body
    xlsx = inbox.transcript(db, owner, conv.id, "xlsx")
    assert xlsx.body[:2] == b"PK"  # a zip, i.e. an .xlsx file
