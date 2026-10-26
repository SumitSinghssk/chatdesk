"""Abandoned carts: customers who started checkout on WhatsApp (sent a cart, tapped Buy now) and stopped.

Up to three reminders go out at the times the business picks, each optionally adding a coupon to win the
order back. The reminder has "Complete order" (the checkout carries on where it stopped) and "No thanks".
Outside the 24-hour window the step's template goes instead. Reminders skip customers who have an open
payment link (those get payment reminders), and customers who opted out. An order confirmed after a
reminder counts as recovered, with the reminder that brought it back.
"""
import logging
from datetime import timedelta

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import orders, service
from app.modules.customer.commerce.models import CommerceSettings, Coupon, Order
from app.modules.customer.inbox.models import WaConversation
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.search import search_clause

logger = logging.getLogger(__name__)

RESUME = "shop:resume:"
MAX_STEPS = 3
GIVE_UP_DAYS = 7  # carts older than this get no more reminders (and count as lost)
DEFAULT_STEPS = [{"after": 60, "coupon_id": None, "template_id": None},
                 {"after": 1440, "coupon_id": None, "template_id": None}]
SOURCES = ("whatsapp_cart", "buy_button")


def is_cart():
    """Carts started in WhatsApp, and abandoned checkouts from a connected store (they have its link)."""
    return or_(Order.source.in_(SOURCES), Order.external_url.isnot(None))


class StepSchema(BaseModel):
    after: int = Field(..., ge=15, le=60 * 24 * 7)  # minutes after the cart
    coupon_id: int | None = None
    template_id: int | None = None


class RecoverySchema(BaseModel):
    on: bool = False
    steps: list[StepSchema] = Field(default_factory=list, max_length=MAX_STEPS)

    @field_validator("steps")
    @classmethod
    def _order(cls, v):
        times = [s.after for s in v]
        if len(set(times)) != len(times):
            raise ValueError("Each reminder needs a different time")
        return sorted(v, key=lambda s: s.after)


def _err(message: str, field: str = "recovery"):
    return HTTPException(422, detail={"message": message, "errors": {field: [message]}})


def settings(store: CommerceSettings) -> dict:
    saved = store.recovery or {}
    return {"on": bool(saved.get("on")), "steps": list(saved.get("steps") or DEFAULT_STEPS)}


def get_settings(db: Session, owner: Customer) -> dict:
    store = service.settings_of(db, owner)
    db.commit()
    return {"status": True, "data": settings(store)}


def save_settings(db: Session, owner: Customer, payload: RecoverySchema) -> dict:
    from app.modules.customer.templates.models import WaTemplate

    store = service.settings_of(db, owner)
    for i, step in enumerate(payload.steps):
        if step.coupon_id and not db.query(Coupon.id).filter(Coupon.id == step.coupon_id,
                                                             Coupon.customer_id == owner.id).first():
            raise _err("That coupon doesn't exist", f"steps.{i}.coupon_id")
        if step.template_id:
            t = db.get(WaTemplate, step.template_id)
            if t is None or t.customer_id != owner.id:
                raise _err("That template doesn't exist", f"steps.{i}.template_id")
    if payload.on and not payload.steps:
        raise _err("Add at least one reminder", "steps")
    store.recovery = payload.model_dump()
    db.commit()
    return {"status": True, "message": "Cart reminders saved" if payload.on else "Cart reminders turned off",
            "data": settings(store)}


# sending ----------------------------------------------------------------------------------------

def _apply_coupon(db: Session, owner: Customer, order: Order, coupon_id: int | None, store) -> Coupon | None:
    """Adds the step's coupon when it's valid and gives a bigger discount than the order has."""
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id, Coupon.customer_id == owner.id).first() \
        if coupon_id else None
    if coupon is None or order.coupon_code == coupon.code:
        return None
    if orders.coupon_problem(db, owner.id, coupon, sum(i.unit_price * i.quantity for i in order.items),
                             order.contact_id, order.id):
        return None
    before, old = order.discount, order.coupon_code
    order.coupon_code = coupon.code
    orders.reprice(db, order, store)
    if order.discount <= before and coupon.kind != "free_shipping":
        order.coupon_code = old
        orders.reprice(db, order, store)
        return None
    orders.log(db, order, "edit", f"Coupon {coupon.code} added by the cart reminder", "ChatDesk")
    return coupon


def send_reminder(db: Session, owner: Customer, order: Order, index: int, actor: str = "ChatDesk") -> str:
    """Sends reminder number `index` (0-based) for the order. Returns what happened."""
    from app.modules.customer.commerce import flow

    store = service.settings_of(db, owner)
    steps = settings(store)["steps"]
    step = steps[min(index, len(steps) - 1)] if steps else {}
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None:
        raise _err("This order has no WhatsApp chat", "order")
    if order.external_url:  # a store checkout: back to the store to finish
        return _store_reminder(db, owner, order, index, conversation, step, actor)
    coupon = _apply_coupon(db, owner, order, step.get("coupon_id"), store)
    ref = orders.order_ref(order, store)
    lines = ["🛒 *You left something in your cart!*", "", f"Order {ref}:", orders.items_text(order), "",
             f"*Total: {orders.total_text(order)}*"]
    if coupon is not None:
        lines += ["", f"🎁 We've added code *{coupon.code}* for you: you save "
                      f"{service.money(order.discount, order.currency)}."]
    lines += ["", "Tap below to finish your order. It only takes a moment."]
    text = "\n".join(lines)
    interactive = {"type": "button", "body": {"text": text[:1024]},
                   "action": {"buttons": [
                       {"type": "reply", "reply": {"id": f"{RESUME}{order.id}", "title": "Complete order"}},
                       {"type": "reply", "reply": {"id": f"{flow.CANCEL}{order.id}", "title": "No thanks"}}]}}
    result = flow.tell(db, owner, conversation, order, text, template_id=step.get("template_id"),
                       interactive=interactive, detail=coupon.code if coupon else orders.total_text(order))
    if result.startswith("Not messaged"):
        result = "Not messaged: the 24-hour window is closed. Choose a template for this reminder."
    order.recovery_sent = max(order.recovery_sent, index + 1)
    order.last_recovery_at = now()
    shown = "sent on WhatsApp" if result == "WhatsApp update sent" else result[0].lower() + result[1:]
    orders.log(db, order, "message", f"Cart reminder {index + 1}: {shown}", actor)
    db.commit()
    return result


def _store_reminder(db: Session, owner: Customer, order: Order, index: int, conversation, step: dict,
                    actor: str) -> str:
    from app.modules.customer.commerce import flow

    shop = service.settings_of(db, owner).store_name or owner.business_name or "our store"
    lines = ["🛒 *You left something in your cart!*", "", orders.items_text(order), "",
             f"*Total: {orders.total_text(order)}*", "", f"Tap below to finish your order at {shop}."]
    text = "\n".join(lines)
    interactive = {"type": "cta_url", "body": {"text": text[:1024]},
                   "action": {"name": "cta_url", "parameters": {"display_text": "Complete order",
                                                                 "url": order.external_url}}}
    result = flow.tell(db, owner, conversation, order, text, template_id=step.get("template_id"),
                       interactive=interactive, detail=order.external_url)
    if result.startswith("Not messaged"):
        result = "Not messaged: the 24-hour window is closed. Choose a template for this reminder."
    order.recovery_sent = max(order.recovery_sent, index + 1)
    order.last_recovery_at = now()
    shown = "sent on WhatsApp" if result == "WhatsApp update sent" else result[0].lower() + result[1:]
    orders.log(db, order, "message", f"Cart reminder {index + 1}: {shown}", actor)
    db.commit()
    return result


def remind_now(db: Session, owner: Customer, person: Customer, order_id: int) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    order = orders.get(db, owner, order_id)
    if order.status not in orders.CHECKOUT:
        raise _err("Only orders still in checkout can get a cart reminder", "order")
    steps = settings(service.settings_of(db, owner))["steps"]
    if not steps:
        raise _err("Set up cart reminders first", "order")
    result = send_reminder(db, owner, order, min(order.recovery_sent, len(steps) - 1), actor_name(person))
    store = service.settings_of(db, owner)
    message = "Reminder sent" if result.endswith("sent") else result
    return {"status": True, "message": message,
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


def run_due(db: Session) -> tuple[int, int]:
    """Sends the cart reminders that are due. Returns (sent, failed)."""
    from app.modules.customer.commerce import payments

    current = now()
    sent = failed = 0
    stores = db.query(CommerceSettings).all()
    for store in stores:
        rule = settings(store)
        if not rule["on"] or not rule["steps"]:
            continue
        steps = rule["steps"]
        rows = (db.query(Order).options(selectinload(Order.items), selectinload(Order.payments))
                .filter(Order.customer_id == store.customer_id, Order.status.in_(orders.CHECKOUT), is_cart(),
                        Order.recovery_sent < len(steps), Order.conversation_id.isnot(None),
                        Order.placed_at >= current - timedelta(days=GIVE_UP_DAYS))
                .order_by(Order.id).limit(200).all())
        owner = None
        for order in rows:
            step = steps[order.recovery_sent]
            if (order.placed_at or order.created_at) + timedelta(minutes=int(step["after"])) > current:
                continue
            if payments.open_payment(order) is not None:
                continue  # payment reminders cover it
            conversation = db.get(WaConversation, order.conversation_id)
            if conversation is None or conversation.contact.blocked or conversation.contact.opted_out:
                order.recovery_sent = len(steps)  # never remind them
                db.commit()
                continue
            owner = owner or db.get(Customer, store.customer_id)
            try:
                result = send_reminder(db, owner, order, order.recovery_sent)
                sent += result.endswith("sent")
                failed += not result.endswith("sent")
            except Exception:  # noqa: BLE001 - one cart's problem never stops the others
                db.rollback()
                failed += 1
                logger.exception("Cart reminder for order %s failed", order.id)
    return sent, failed


# reading ----------------------------------------------------------------------------------------

def _base(db: Session, owner: Customer):
    return db.query(Order).filter(Order.customer_id == owner.id, is_cart())


def stats(db: Session, owner: Customer) -> dict:
    from app.shared.utils.datetime import days_ago_start

    store = service.settings_of(db, owner)
    rule = settings(store)
    since = days_ago_start(29)
    recent = _base(db, owner).filter(Order.placed_at >= since)
    started = recent.count()
    reminded = recent.filter(Order.recovery_sent > 0).count()
    recovered = recent.filter(Order.recovered_at.isnot(None), Order.status != "cancelled")
    revenue = int(recovered.with_entities(func.coalesce(func.sum(Order.total), 0)).scalar() or 0)
    recovered_n = recovered.count()
    waiting = _base(db, owner).filter(Order.status.in_(orders.CHECKOUT),
                                      Order.placed_at >= now() - timedelta(days=GIVE_UP_DAYS)).count()
    steps = []
    for i, step in enumerate(rule["steps"]):
        got = recent.filter(Order.recovery_sent >= i + 1).count()
        won = recovered.filter(Order.recovered_step == i + 1)
        won_revenue = int(won.with_entities(func.coalesce(func.sum(Order.total), 0)).scalar() or 0)
        steps.append({"after": step["after"], "sent": got, "recovered": won.count(),
                      "revenue_text": service.money(won_revenue, store.currency)})
    db.commit()
    return {"status": True, "data": {
        "started": started, "waiting": waiting, "reminded": reminded, "recovered": recovered_n,
        "rate": round(recovered_n * 100 / reminded) if reminded else None,
        "revenue_text": service.money(revenue, store.currency), "on": rule["on"], "steps": steps,
    }}


def list_carts(db: Session, owner: Customer, state: str = "open", page=None, per_page=None, search=None) -> dict:
    store = service.settings_of(db, owner)
    rule = settings(store)
    cutoff = now() - timedelta(days=GIVE_UP_DAYS)
    q = _base(db, owner).options(selectinload(Order.items))
    if state == "recovered":
        q = q.filter(Order.recovered_at.isnot(None))
    elif state == "lost":
        q = q.filter(Order.recovered_at.is_(None), Order.confirmed_at.is_(None),
                     (Order.status == "cancelled") | (Order.placed_at < cutoff))
    else:
        q = q.filter(Order.status.in_(orders.CHECKOUT), Order.placed_at >= cutoff)
    if search:
        clause = search_clause([Order.customer_name, Order.customer_phone], search)
        text = search.strip().lstrip(store.order_prefix or "#").strip()
        if text.isdigit():
            from sqlalchemy import or_

            clause = Order.number == int(text) if clause is None else or_(clause, Order.number == int(text))
        if clause is not None:
            q = q.filter(clause)
    q = q.order_by(Order.id.desc())

    def row(o: Order) -> dict:
        data = orders.serialize(o, store)
        nxt = None
        if rule["on"] and o.status in orders.CHECKOUT and o.recovery_sent < len(rule["steps"]):
            nxt = iso((o.placed_at or o.created_at) + timedelta(minutes=int(rule["steps"][o.recovery_sent]["after"])))
        data.update(recovery_steps=len(rule["steps"]), next_reminder_at=nxt,
                    recovered_step=o.recovered_step)
        return data

    result = list_response(q, row, page, per_page, search)
    db.commit()
    return result
