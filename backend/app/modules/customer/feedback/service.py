"""Feedback (CSAT): "How did we do?" with WhatsApp's list (1 to 5 stars) after a chat is resolved or an order is
delivered. A 4-5 gets a thank-you (and the review link); a 1-2 gets an apology and the team is told.

Asked only while the 24-hour window is open (free-form interactive messages), and at most once per customer
every `gap_days`. The customer's tap is handled first by the automation engine (`takes`), so no auto-reply,
chatbot or AI agent answers it.
"""
import logging
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.feedback.models import WaFeedback, WaFeedbackSettings
from app.modules.customer.inbox.models import WaConversation, WaMessage
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

SENDER = "Feedback"
PREFIX = "csat:"
DEFAULT_QUESTION = "How did we do? Please rate your experience with us."
DEFAULT_THANKS = "Thank you for the great rating! 🙏"
DEFAULT_SORRY = "We're sorry it wasn't better. Someone from our team will get back to you."
ROWS = [(5, "⭐⭐⭐⭐⭐ Excellent"), (4, "⭐⭐⭐⭐ Good"), (3, "⭐⭐⭐ Okay"), (2, "⭐⭐ Poor"), (1, "⭐ Very poor")]
PENDING = timedelta(hours=24)  # an unanswered question stops counting after this


def _settings(db: Session, customer_id: int) -> WaFeedbackSettings | None:
    return db.query(WaFeedbackSettings).filter(WaFeedbackSettings.customer_id == customer_id).first()


def serialize_settings(st: WaFeedbackSettings | None) -> dict:
    return {"enabled": bool(st and st.enabled), "on_resolve": st.on_resolve if st else True,
            "on_delivered": st.on_delivered if st else True,
            "question": (st.question if st else None) or DEFAULT_QUESTION,
            "thanks_text": (st.thanks_text if st else None) or DEFAULT_THANKS,
            "sorry_text": (st.sorry_text if st else None) or DEFAULT_SORRY,
            "review_url": st.review_url if st else None, "gap_days": st.gap_days if st else 7}


def get_settings(db: Session, ws: Customer) -> dict:
    return {"status": True, "data": serialize_settings(_settings(db, ws.id))}


def save_settings(db: Session, ws: Customer, payload) -> dict:
    url = (payload.review_url or "").strip() or None
    if url and not url.startswith(("https://", "http://")):
        raise HTTPException(422, detail={"errors": {"review_url": ["Paste the full link, starting with https://"]}})
    st = _settings(db, ws.id)
    if st is None:
        st = WaFeedbackSettings(customer_id=ws.id)
        db.add(st)
    st.enabled, st.on_resolve, st.on_delivered = payload.enabled, payload.on_resolve, payload.on_delivered
    st.question = (payload.question or "").strip()[:1000] or None
    st.thanks_text = (payload.thanks_text or "").strip()[:1000] or None
    st.sorry_text = (payload.sorry_text or "").strip()[:1000] or None
    st.review_url, st.gap_days = url, payload.gap_days
    db.commit()
    return {"status": True, "message": "Feedback settings saved", "data": serialize_settings(st)}


# asking -----------------------------------------------------------------------------------------

def ask(db: Session, owner: Customer, conversation: WaConversation, source: str, order_id: int | None = None) -> bool:
    """Asks for a rating if feedback is on for this trigger. Never raises. True when it was sent."""
    try:
        return _ask(db, owner, conversation, source, order_id)
    except Exception:  # feedback must never break resolving a chat or delivering an order
        db.rollback()
        logger.exception("Asking for feedback failed in chat %s", conversation.id)
        return False


def _ask(db: Session, owner: Customer, conversation: WaConversation, source: str, order_id: int | None) -> bool:
    from app.modules.customer.inbox import service as inbox

    st = _settings(db, conversation.customer_id)
    if st is None or not st.enabled or not (st.on_resolve if source == "resolve" else st.on_delivered):
        return False
    contact = conversation.contact
    if contact.blocked or contact.opted_out or not inbox.window_open(conversation):
        return False
    moment = now()
    recent = (db.query(WaFeedback.id).filter(WaFeedback.contact_id == contact.id,
                                             WaFeedback.asked_at >= moment - timedelta(days=st.gap_days or 1)).first())
    if recent:
        return False
    number = db.get(Customer, conversation.customer_id)
    _, client = inbox._client(db, number)
    fb = WaFeedback(customer_id=conversation.customer_id, conversation_id=conversation.id, contact_id=contact.id,
                    member_id=conversation.assignee_id, source=source, order_id=order_id, asked_at=moment)
    db.add(fb)
    db.flush()
    text = (st.question or DEFAULT_QUESTION)[:1024]
    interactive = {"type": "list", "body": {"text": text}, "action": {"button": "Rate us", "sections": [
        {"title": "Your rating", "rows": [{"id": f"{PREFIX}{fb.id}:{score}", "title": title} for score, title in ROWS]}]}}
    request = {"type": "interactive", "interactive": interactive}
    message = inbox._outbound(db, number, conversation, sent_by=SENDER, type="interactive", text=text,
                              payload={"request": request, "feedback_id": fb.id})
    inbox._attempt(db, conversation, message, lambda: client.send({"to": contact.wa_id, **request}), reopen=False)
    fb.message_id = message.id
    db.commit()
    return message.status == "sent"


# the answer -------------------------------------------------------------------------------------

def _reply_id(message: WaMessage) -> str:
    inter = (message.payload or {}).get("interactive") or {}
    reply = inter.get("list_reply") or inter.get("button_reply") or {}
    return str(reply.get("id") or "")


def takes(db: Session, owner: Customer, client, conversation: WaConversation, message: WaMessage) -> bool:
    """The customer tapped a rating: record it and answer. True when it was a rating (nothing else replies)."""
    from app.modules.customer.inbox import service as inbox

    rid = _reply_id(message)
    if message.type != "interactive" or not rid.startswith(PREFIX):
        return False
    try:
        fb_id, score = (int(x) for x in rid[len(PREFIX):].split(":", 1))
    except ValueError:
        return True
    fb = db.query(WaFeedback).filter(WaFeedback.id == fb_id, WaFeedback.conversation_id == conversation.id).first()
    if fb is None or fb.score is not None or not 1 <= score <= 5:
        return True  # already answered: say nothing more
    fb.score, fb.answered_at = score, now()
    st = _settings(db, conversation.customer_id)
    from app.modules.customer.team import assign as assigning

    assigning.event(db, conversation, "status", f"Rated {score}/5", None)
    db.commit()
    text = None
    if score >= 4:
        text = (st.thanks_text if st else None) or DEFAULT_THANKS
        if st and st.review_url:
            text += f"\n\nWould you share it in a review? {st.review_url}"
    elif score <= 2:
        text = (st.sorry_text if st else None) or DEFAULT_SORRY
        _tell_team(db, conversation, fb)
        if conversation.status == "resolved":  # it needs someone again
            conversation.status, conversation.resolved_at = "open", None
            db.commit()
    if text:
        number = db.get(Customer, conversation.customer_id)
        reply = inbox._outbound(db, number, conversation, sent_by=SENDER, type="text", text=text,
                                payload={"request": {"type": "text", "text": {"body": text}}, "feedback_id": fb.id})
        inbox._attempt(db, conversation, reply, lambda: client.send_text(conversation.contact.wa_id, text),
                       reopen=False)
    return True


def _tell_team(db: Session, conversation: WaConversation, fb: WaFeedback) -> None:
    from app.modules.customer.account import notify
    from app.shared.constants import customer_urls

    contact = conversation.contact
    who = contact.name or contact.profile_name or f"+{contact.wa_id}"
    people = notify.for_chat(db, conversation.customer_id, fb.member_id)
    notify.notify(db, people, "unhappy_customer", f"{who} rated you {fb.score}/5",
                  "Have a look and follow up.", customer_urls.conversation(conversation.id),
                  {"conversation_id": conversation.id}, once_key=f"csat:{fb.id}", number_id=conversation.customer_id)
    db.commit()


# reports ----------------------------------------------------------------------------------------

def stats(db: Session, owner_id: int, start, end) -> dict:
    """Ratings in a period: how many asked and answered, the average, and per team member."""
    base = db.query(WaFeedback).filter(WaFeedback.customer_id == owner_id, WaFeedback.asked_at >= start,
                                       WaFeedback.asked_at < end)
    asked = base.count()
    row = base.filter(WaFeedback.score.isnot(None)).with_entities(
        func.count(WaFeedback.id), func.avg(WaFeedback.score),
        func.sum(case((WaFeedback.score >= 4, 1), else_=0)), func.sum(case((WaFeedback.score <= 2, 1), else_=0))).one()
    answered, avg, happy, unhappy = int(row[0] or 0), row[1], int(row[2] or 0), int(row[3] or 0)
    per = (base.filter(WaFeedback.score.isnot(None), WaFeedback.member_id.isnot(None))
           .join(Customer, Customer.id == WaFeedback.member_id)
           .with_entities(Customer.id, Customer.name, Customer.email, func.count(WaFeedback.id), func.avg(WaFeedback.score))
           .group_by(Customer.id, Customer.name, Customer.email).all())
    recent = (base.filter(WaFeedback.score.isnot(None)).order_by(WaFeedback.answered_at.desc()).limit(10).all())
    return {
        "asked": asked, "answered": answered,
        "response_rate": round(100 * answered / asked) if asked else None,
        "average": round(float(avg), 2) if avg is not None else None,
        "csat": round(100 * happy / answered) if answered else None,  # % rating 4-5
        "unhappy": unhappy,
        "by_member": [{"id": i, "name": n or e, "ratings": int(c), "average": round(float(a), 2)}
                      for i, n, e, c, a in per],
        "recent": [{"conversation_id": f.conversation_id, "score": f.score, "source": f.source,
                    "answered_at": iso(f.answered_at)} for f in recent],
    }
