"""ChatDesk records shown live on a diagram: a contact, an order, a campaign or a chatbot.

A diagram only keeps which record a card shows ({"type", "id"}); what's on the card is looked up for each
person when they look, so it's always current, and only shows what they may see: team members get the
records of the numbers they work on; people with the share link (and websites showing the diagram) get a
card without private details.
"""

from datetime import timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.diagrams.models import Diagram
from app.shared.utils.datetime import iso, now

TYPES = ("contact", "order", "campaign", "chatbot")
MAX_REFS = 200


def refs_in(content: dict | None) -> list[tuple[str, int]]:
    """The records a diagram's cards point at."""
    out = []
    for n in (content or {}).get("nodes", {}).values():
        rec = (n.get("data") or {}).get("record") or {}
        if rec.get("type") in TYPES and isinstance(rec.get("id"), int):
            out.append((rec["type"], rec["id"]))
    return list(dict.fromkeys(out))[:MAX_REFS]


def _numbers(db: Session, workspace_id: int) -> dict[int, Customer]:
    rows = db.query(Customer).filter(or_(Customer.id == workspace_id, Customer.parent_id == workspace_id),
                                     Customer.not_deleted()).all()
    return {c.id: c for c in rows}


def _mask(wa_id: str | None) -> str:
    digits = wa_id or ""
    if len(digits) < 7:
        return "•••"
    return f"+{digits[:-10] or ''} {digits[-10:-8]}{'•' * 5}{digits[-3:]}".replace("+ ", "+")


def _money(paise: int, currency: str) -> str:
    symbol = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency, f"{currency} ")
    value = paise / 100
    return f"{symbol}{value:,.0f}" if value == int(value) else f"{symbol}{value:,.2f}"


def _link(path: str, number_id: int, several: bool) -> str:
    return f"{path}{'&' if '?' in path else '?'}number={number_id}" if several else path


def _load(db: Session, kind: str, ids: list[int], numbers: list[int]):
    from app.modules.customer.campaigns.models import WaCampaign
    from app.modules.customer.chatbots.models import WaChatbot
    from app.modules.customer.commerce.models import Order
    from app.modules.customer.inbox.models import WaContact

    model = {"contact": WaContact, "order": Order, "campaign": WaCampaign, "chatbot": WaChatbot}[kind]
    if not ids or not numbers:
        return []
    return db.query(model).filter(model.id.in_(ids), model.customer_id.in_(numbers)).all()


def _contact(db: Session, c, full: bool) -> dict:
    from app.modules.customer.inbox.models import WaConversation

    name = c.name or c.profile_name
    card = {"title": name or "Customer", "tags": list(c.tags or [])[:6] if full else [],
            "last_message_at": iso(c.last_message_at)}
    if not full:
        return {**card, "title": (name or "Customer").split(" ")[0]}
    chat = db.query(WaConversation).filter(WaConversation.contact_id == c.id).first()
    return {**card, "phone": _mask(c.wa_id), "status": chat.status if chat else None,
            "preview": chat.last_message_preview if chat else None,
            "path": f"/dashboard/inbox?c={chat.id}" if chat else "/dashboard/contacts"}


def _order(db: Session, o, full: bool) -> dict:
    from app.modules.customer.commerce.models import CommerceSettings

    prefix = (db.query(CommerceSettings.order_prefix).filter(CommerceSettings.customer_id == o.customer_id)
              .scalar() or "#")
    card = {"title": f"Order {prefix}{o.number}", "status": o.status, "payment_status": o.payment_status}
    if not full:
        return card
    items = len(o.items)
    return {**card, "total": _money(o.total, o.currency), "items": items, "customer": o.customer_name,
            "placed_at": iso(o.placed_at or o.created_at), "path": f"/dashboard/commerce/orders/{o.id}"}


def _campaign(db: Session, c, full: bool) -> dict:
    card = {"title": c.name, "status": c.status}
    if not full:
        return card
    from app.modules.customer.campaigns.service import EMPTY_REPORT, _report

    report = _report(db, [c.id]).get(c.id, EMPTY_REPORT)
    return {**card, "report": {k: report[k] for k in ("recipients", "sent", "delivered", "read", "replied",
                                                      "failed")},
            "scheduled_at": iso(c.scheduled_at), "completed_at": iso(c.completed_at),
            "path": f"/dashboard/campaigns/{c.id}"}


def _chatbot(db: Session, b, full: bool) -> dict:
    card = {"title": b.name, "status": "live" if b.active and b.published_at else "off"}
    if not full:
        return card
    from app.modules.customer.chatbots.models import WaChatbotSession

    week = (db.query(func.count(WaChatbotSession.id))
            .filter(WaChatbotSession.chatbot_id == b.id, WaChatbotSession.started_at >= now() - timedelta(days=7))
            .scalar() or 0)
    return {**card, "trigger": b.trigger, "keywords": list(b.keywords or [])[:4], "chats_week": int(week),
            "path": f"/dashboard/chatbots/{b.id}"}


SUMMARY = {"contact": _contact, "order": _order, "campaign": _campaign, "chatbot": _chatbot}


def cards(db: Session, d: Diagram, refs: list[tuple[str, int]], allowed: list[int] | None) -> dict:
    """What each card shows, by "type:id". `allowed`: the numbers the person works on (None: a guest, who
    gets cards without private details). Records gone or out of reach come back as {"missing": True}."""
    numbers = _numbers(db, d.workspace_id)
    full = allowed is not None
    reach = [n for n in numbers if allowed is None or n in allowed]
    several = len(numbers) > 1
    out: dict[str, dict] = {}
    for kind in TYPES:
        ids = [i for t, i in refs if t == kind]
        for row in _load(db, kind, ids, reach):
            card = {"type": kind, "id": row.id, **SUMMARY[kind](db, row, full)}
            if full:
                card["path"] = _link(card["path"], row.customer_id, several)
                if several:
                    from app.modules.customer.numbers.service import label_of

                    card["number"] = label_of(numbers[row.customer_id])
            out[f"{kind}:{row.id}"] = card
        for i in ids:
            out.setdefault(f"{kind}:{i}", {"type": kind, "id": i, "missing": True})
    return out


def search(db: Session, allowed: list[int], kind: str, q: str | None, workspace_id: int) -> list[dict]:
    """Records to put on a diagram, newest first."""
    from app.modules.customer.campaigns.models import WaCampaign
    from app.modules.customer.chatbots.models import WaChatbot
    from app.modules.customer.commerce.models import Order
    from app.modules.customer.inbox.models import WaContact

    numbers = [n for n in _numbers(db, workspace_id) if n in allowed]
    text = (q or "").strip()
    like = f"%{text}%"
    if kind == "contact":
        query = db.query(WaContact).filter(WaContact.customer_id.in_(numbers))
        if text:
            digits = "".join(ch for ch in text if ch.isdigit())
            query = query.filter(or_(WaContact.name.ilike(like), WaContact.profile_name.ilike(like),
                                     *([WaContact.wa_id.like(f"%{digits}%")] if len(digits) >= 3 else [])))
        rows = query.order_by(WaContact.last_message_at.desc().nullslast(), WaContact.id.desc()).limit(20).all()
        return [{"id": c.id, "title": c.name or c.profile_name or "Customer", "subtitle": _mask(c.wa_id)}
                for c in rows]
    if kind == "order":
        query = db.query(Order).filter(Order.customer_id.in_(numbers))
        if text:
            number = text.lstrip("#")
            query = query.filter(or_(Order.customer_name.ilike(like),
                                     *([Order.number == int(number)] if number.isdigit() else [])))
        rows = query.order_by(Order.id.desc()).limit(20).all()
        return [{"id": o.id, "title": f"#{o.number}", "subtitle": f"{o.customer_name or 'Customer'} · {o.status}"}
                for o in rows]
    model = WaCampaign if kind == "campaign" else WaChatbot
    query = db.query(model).filter(model.customer_id.in_(numbers))
    if text:
        query = query.filter(model.name.ilike(like))
    rows = query.order_by(model.id.desc()).limit(20).all()
    return [{"id": r.id, "title": r.name,
             "subtitle": r.status if kind == "campaign" else ("Live" if r.active else "Off")} for r in rows]
