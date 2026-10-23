"""The agent outside the dashboard: the website chat widget (any site the business allows) and the
server-to-server API. No sign-in: the widget is found by its public key, the API by its secret key."""

import hmac
import re
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.modules.customer.ai_agent import engine, providers
from app.modules.customer.ai_agent.models import AiAgent, AiMessage, AiThread
from app.modules.customer.ai_agent.schemas import (
    ApiMessageSchema,
    PublicChatSchema,
    PublicFeedbackSchema,
    PublicLeadSchema,
    WidgetChannel,
)
from app.modules.customer.inbox.models import WaContact
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.shared.utils.datetime import iso, now

PER_THREAD_HOUR = 60  # messages a visitor can send in an hour
UNAVAILABLE = "This chat isn't available right now."


def _agent(db: Session, key: str) -> AiAgent:
    agent = db.query(AiAgent).filter(AiAgent.public_key == key).first()
    if agent is None:
        raise HTTPException(status_code=404, detail=UNAVAILABLE)
    return agent


def host_allowed(widget: WidgetChannel, host: str | None) -> bool:
    if not widget.allowed_domains:
        return True
    host = re.sub(r"^https?://", "", (host or "").lower()).split("/")[0]
    if not host:
        return False
    bare = host.split(":")[0]
    for rule in widget.allowed_domains:
        if rule.startswith("*."):
            root = rule[2:].split(":")[0]
            if bare == root or bare.endswith("." + root):
                return True
        elif host == rule or bare == rule:
            return True
    return False


def _widget_agent(db: Session, key: str, host: str | None) -> tuple[AiAgent, WidgetChannel]:
    agent = _agent(db, key)
    widget = WidgetChannel(**(agent.widget or {}))
    if not agent.widget_enabled:
        raise HTTPException(status_code=404, detail=UNAVAILABLE)
    if not host_allowed(widget, host):
        raise HTTPException(status_code=403, detail="This chat isn't turned on for this website.")
    return agent, widget


def _thread(db: Session, agent: AiAgent, token: str | None, channel: str = "web") -> AiThread | None:
    if not token:
        return None
    return db.query(AiThread).filter(AiThread.token == token, AiThread.agent_id == agent.id,
                                     AiThread.channel == channel).first()


def config(db: Session, key: str, host: str | None) -> dict:
    agent, widget = _widget_agent(db, key, host)
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == agent.customer_id).first()
    number = re.sub(r"\D", "", account.display_phone_number or "") if account and account.status == "connected" \
        else ""
    data = widget.model_dump(exclude={"allowed_domains"})
    data |= {"name": agent.name, "business_name": engine.behaviour(agent).business_name,
             "whatsapp_url": f"https://wa.me/{number}" if widget.whatsapp_button and number else None,
             "online": engine.ready(db, agent) is None and not engine.over_budget(db, agent)}
    return {"status": True, "data": data}


def history(db: Session, key: str, token: str, host: str | None) -> dict:
    agent, _ = _widget_agent(db, key, host)
    thread = _thread(db, agent, token)
    if thread is None:
        return {"status": True, "data": {"items": [], "visitor": {}}}
    items = (db.query(AiMessage).filter(AiMessage.thread_id == thread.id, AiMessage.role.in_(("user", "assistant")))
             .order_by(AiMessage.id.desc()).limit(60).all())
    return {"status": True, "data": {
        "visitor": {k: v for k, v in (thread.visitor or {}).items() if k in ("name", "phone", "email")},
        "handover": thread.status == "handover",
        "items": [{"id": m.id, "role": m.role, "text": m.text, "outcome": m.outcome, "feedback": m.feedback,
                   "created_at": iso(m.created_at)} for m in reversed(items) if m.text]}}


def _visitor(payload, thread: AiThread | None) -> dict:
    visitor = dict(thread.visitor or {}) if thread else {}
    for field in ("name", "phone", "email"):
        value = getattr(payload, field, None)
        if value:
            visitor[field] = value
    return visitor


def _save_contact(db: Session, agent: AiAgent, visitor: dict) -> int | None:
    """A visitor who left a phone number becomes a contact (tagged "Website chat")."""
    from app.modules.customer.contacts.service import to_wa_id

    wa_id = to_wa_id(db, visitor.get("phone")) if visitor.get("phone") else None
    if not wa_id:
        return None
    contact = db.query(WaContact).filter(WaContact.customer_id == agent.customer_id, WaContact.wa_id == wa_id).first()
    if contact is None:
        contact = WaContact(customer_id=agent.customer_id, wa_id=wa_id, name=visitor.get("name"),
                            email=visitor.get("email"), tags=["Website chat"], source="website")
        db.add(contact)
    else:
        contact.name = contact.name or visitor.get("name")
        contact.email = contact.email or visitor.get("email")
        if "Website chat" not in (contact.tags or []):
            contact.tags = [*(contact.tags or []), "Website chat"]
    db.flush()
    return contact.id


def lead(db: Session, key: str, payload: PublicLeadSchema) -> dict:
    agent, widget = _widget_agent(db, key, payload.host)
    if payload.email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", payload.email):
        raise HTTPException(status_code=422, detail={"message": "Enter a valid email address",
                                                     "errors": {"email": ["Enter a valid email address"]}})
    thread = _thread(db, agent, payload.token)
    if thread is None:
        thread = engine.new_thread(db, agent, "web", visitor={"host": payload.host})
    thread.visitor = _visitor(payload, thread)
    if payload.phone:
        from app.modules.customer.contacts.service import to_wa_id

        if not to_wa_id(db, payload.phone):
            raise HTTPException(status_code=422, detail={"message": "Enter a valid phone number",
                                                         "errors": {"phone": ["Enter a valid phone number"]}})
        thread.contact_id = _save_contact(db, agent, thread.visitor)
    db.commit()
    return {"status": True, "data": {"token": thread.token}}


def start_chat(db: Session, key: str, payload: PublicChatSchema) -> tuple[AiAgent, AiThread]:
    agent, widget = _widget_agent(db, key, payload.host)
    thread = _thread(db, agent, payload.token)
    if widget.lead == "required" and (thread is None or not any((thread.visitor or {}).get(f)
                                                                for f in widget.lead_fields)):
        raise HTTPException(status_code=422, detail={"message": "Please share your details first.",
                                                     "errors": {"lead": ["required"]}})
    if thread is None:
        thread = engine.new_thread(db, agent, "web", visitor={"host": payload.host, "page": payload.page})
    else:
        recent = db.query(AiMessage.id).filter(AiMessage.thread_id == thread.id, AiMessage.role == "user",
                                               AiMessage.created_at >= now() - timedelta(hours=1)).count()
        if recent >= PER_THREAD_HOUR:
            raise HTTPException(status_code=429, detail="You're sending messages too fast. Please wait a little.")
        if payload.page:
            thread.visitor = {**(thread.visitor or {}), "page": payload.page}
    db.commit()
    return agent, thread


def feedback(db: Session, key: str, payload: PublicFeedbackSchema) -> dict:
    agent = _agent(db, key)
    thread = _thread(db, agent, payload.token)
    msg = db.query(AiMessage).filter(AiMessage.id == payload.message_id, AiMessage.thread_id == (thread.id if thread
                                                                                                 else -1),
                                     AiMessage.role == "assistant").first() if thread else None
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.feedback = payload.value
    db.commit()
    return {"status": True, "message": "Thanks!", "data": None}


# Server-to-server API ------------------------------------------------------------------------

def api_message(db: Session, key: str, authorization: str | None, payload: ApiMessageSchema, tz: str) -> dict:
    agent = _agent(db, key)
    secret = decrypt_secret(agent.secret_key) if agent.secret_key else None
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not agent.api_enabled or not secret or not hmac.compare_digest(given.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Invalid API key, or the API is turned off for this agent.")
    thread = _thread(db, agent, payload.thread, "api")
    if thread is None:
        visitor = {k: str(v)[:200] for k, v in (payload.user or {}).items() if k in ("name", "phone", "email") and v}
        thread = engine.new_thread(db, agent, "api", visitor=visitor)
    user = engine.user_says(db, agent, thread, payload.message)
    db.commit()
    try:
        msg = engine.answer(db, agent, thread, payload.message, tz=tz, user_message=user)
    except engine.AgentUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except providers.ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    try:
        engine.remember(db, agent, thread)
    except Exception:  # noqa: BLE001
        pass
    return {"status": True, "data": {"reply": msg.text, "thread": thread.token, "outcome": msg.outcome,
                                     "handover": msg.outcome == "handover", "sources": msg.sources,
                                     "message_id": msg.id}}
