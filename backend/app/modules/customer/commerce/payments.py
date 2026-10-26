"""Getting paid for orders.

A business connects its own gateway (Razorpay, Cashfree, PayU, Stripe) or WhatsApp Pay. A customer who
chooses "Pay online" gets a payment link (or WhatsApp's Review and pay); the gateway's webhook (or asking it,
in case a webhook is missed) marks the order paid and confirms it. Unpaid links get reminders and expire.
The team can send links for any unpaid order, refund through the gateway, and record refunds made by hand.
Cash-on-delivery buyers can be asked to confirm, and offered a discount to pay now instead.
"""
import json
import logging
import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings as app_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import gateways, orders, service
from app.modules.customer.commerce.gateways import Event, GatewayError
from app.modules.customer.commerce.models import CommerceSettings, Order, OrderPayment, PaymentGateway, OrderRefund
from app.modules.customer.commerce.schemas import GatewaySchema, PaymentOptionsSchema, RefundSchema
from app.modules.customer.inbox.models import WaConversation
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.search import search_clause

logger = logging.getLogger(__name__)

WHATSAPP_PAY = "whatsapp_pay"
LABELS = {"razorpay": "Razorpay", "cashfree": "Cashfree", "payu": "PayU", "stripe": "Stripe",
          WHATSAPP_PAY: "WhatsApp Pay", "manual": "Recorded by the team"}
METHODS = {"upi": "UPI", "card": "Card", "netbanking": "Net banking", "nb": "Net banking", "wallet": "Wallet",
           "emi": "EMI", "cc": "Credit card", "dc": "Debit card", "paylater": "Pay later", "bank_transfer": "Bank"}
STATUS_LABELS = {"created": "Waiting", "paid": "Paid", "failed": "Failed", "expired": "Expired",
                 "cancelled": "Cancelled"}
# what to switch on in each gateway's dashboard so ChatDesk hears about payments straight away
WEBHOOK_EVENTS = {
    "razorpay": ["payment_link.paid", "payment_link.expired", "payment_link.cancelled", "payment.failed",
                 "refund.processed", "refund.failed"],
    "cashfree": ["Payment link events (sent automatically with each link)", "Refund status"],
    "payu": ["Successful payment", "Failed payment"],
    "stripe": ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded",
               "checkout.session.async_payment_failed", "refund.updated"],
}
CHECK_EVERY = timedelta(minutes=15)  # ask the gateway about open links, in case a webhook was missed
TEMPLATE_KEYS = ("payment_link", "payment_reminder", "cod_confirm")


def _err(message: str, field: str = "payment"):
    return HTTPException(422, detail={"message": message, "errors": {field: [message]}})


def money(amount: int, currency: str) -> str:
    return service.money(amount, currency)


# gateway connections ---------------------------------------------------------------------------

def credentials(gw: PaymentGateway) -> dict:
    try:
        return json.loads(decrypt_secret(gw.credentials) or "{}")
    except ValueError:
        return {}


def provider_of(gw: PaymentGateway) -> gateways.Provider:
    return gateways.provider(gw.provider, credentials(gw), gw.mode, decrypt_secret(gw.webhook_secret))


def webhook_url(gw: PaymentGateway) -> str:
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/shop/pay/{gw.provider}/{gw.webhook_key}"


def pay_url(p: OrderPayment) -> str:
    """The link the customer gets: ours, so it can say "already paid" or "expired" instead of an error."""
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/shop/pay/go/{p.reference}"


def return_url(p: OrderPayment) -> str:
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/shop/pay/r/{p.reference}"


def _gateways(db: Session, owner_id: int) -> list[PaymentGateway]:
    return (db.query(PaymentGateway).filter(PaymentGateway.customer_id == owner_id)
            .order_by(PaymentGateway.id).all())


def link_gateway(db: Session, owner_id: int) -> PaymentGateway | None:
    """The gateway payment links are made with: the default one, else the first active."""
    rows = [g for g in _gateways(db, owner_id) if g.active and g.provider != WHATSAPP_PAY]
    return next((g for g in rows if g.is_default), rows[0] if rows else None)


def whatsapp_pay(db: Session, owner_id: int) -> PaymentGateway | None:
    return next((g for g in _gateways(db, owner_id) if g.active and g.provider == WHATSAPP_PAY), None)


def _wa_pay_for(db: Session, owner: Customer, store: CommerceSettings,
                conversation: WaConversation | None) -> PaymentGateway | None:
    """WhatsApp Pay works for Indian numbers, in rupees, inside the 24-hour window."""
    from app.modules.customer.inbox import service as inbox

    gw = whatsapp_pay(db, owner.id)
    if gw is None or store.currency != "INR" or conversation is None:
        return None
    if not conversation.contact.wa_id.startswith("91") or not inbox.window_open(conversation):
        return None
    return gw


def online_ready(db: Session, owner: Customer, store: CommerceSettings,
                 conversation: WaConversation | None = None) -> bool:
    if not store.online_enabled:
        return False
    return link_gateway(db, owner.id) is not None or _wa_pay_for(db, owner, store, conversation) is not None


def serialize_gateway(gw: PaymentGateway) -> dict:
    data = {
        "id": gw.id, "provider": gw.provider, "label": LABELS[gw.provider], "mode": gw.mode, "hint": gw.hint,
        "active": gw.active, "is_default": gw.is_default, "verified_at": iso(gw.verified_at),
        "last_event_at": iso(gw.last_event_at), "last_error": gw.last_error,
        "webhook_url": None if gw.provider == WHATSAPP_PAY else webhook_url(gw),
        "has_webhook_secret": bool(gw.webhook_secret),
        "saved_fields": sorted(credentials(gw).keys()),
    }
    if gw.provider == WHATSAPP_PAY:
        c = credentials(gw)
        data.update(configuration_name=c.get("configuration_name"), wa_gateway=c.get("gateway"))
    return data


def _providers() -> list[dict]:
    rows = [{"provider": p.name, "label": p.label,
             "fields": [{"key": k, "label": label, "secret": secret} for k, label, secret in p.fields],
             "needs_mode": p.needs_mode, "max_expiry_minutes": p.max_expiry_minutes,
             "webhook_secret": p.name in ("razorpay", "stripe"), "webhook_events": WEBHOOK_EVENTS[p.name]}
            for p in gateways.PROVIDERS.values()]
    rows.append({"provider": WHATSAPP_PAY, "label": LABELS[WHATSAPP_PAY], "fields": [], "needs_mode": False,
                 "max_expiry_minutes": 60 * 24 * 30, "webhook_secret": False, "webhook_events": []})
    return rows


def list_gateways(db: Session, owner: Customer) -> dict:
    rows = {g.provider: g for g in _gateways(db, owner.id)}
    store = service.settings_of(db, owner)
    db.commit()
    return {"status": True, "data": {
        "providers": [{**p, "gateway": serialize_gateway(rows[p["provider"]]) if p["provider"] in rows else None}
                      for p in _providers()],
        "options": serialize_options(store),
        "ready": online_ready(db, owner, store),
    }}


def save_gateway(db: Session, owner: Customer, name: str, payload: GatewaySchema) -> dict:
    if name not in gateways.PROVIDERS and name != WHATSAPP_PAY:
        raise HTTPException(404, detail="Unknown payment gateway")
    gw = db.query(PaymentGateway).filter(PaymentGateway.customer_id == owner.id,
                                         PaymentGateway.provider == name).first()
    is_new = gw is None
    if is_new:
        gw = PaymentGateway(customer_id=owner.id, provider=name, webhook_key=secrets.token_urlsafe(24)[:32])
    saved = credentials(gw) if not is_new else {}
    if name == WHATSAPP_PAY:
        if not payload.configuration_name:
            raise _err("Enter the payment configuration name from WhatsApp Manager", "configuration_name")
        creds = {"configuration_name": payload.configuration_name, "gateway": payload.wa_gateway or "razorpay"}
        mode, hint = "live", payload.configuration_name
    else:
        cls = gateways.PROVIDERS[name]
        creds = {k: payload.credentials.get(k) or saved.get(k) for k, _, _ in cls.fields}
        missing = [label for k, label, _ in cls.fields if not creds.get(k)]
        if missing:
            key = next(k for k, label, _ in cls.fields if label == missing[0])
            raise _err(f"Enter the {missing[0]}", f"credentials.{key}")
        mode = payload.mode or gw.mode or "test"
        secret = payload.webhook_secret or decrypt_secret(gw.webhook_secret)
        p = cls(creds, mode, secret)
        mode = p.detect_mode() if not cls.needs_mode else mode
        p.mode = mode
        try:
            p.check()
        except GatewayError as exc:
            raise _err(str(exc), "credentials") from exc
        hint = p.hint()
        if payload.webhook_secret:
            gw.webhook_secret = encrypt_secret(payload.webhook_secret)
    gw.credentials = encrypt_secret(json.dumps(creds))
    gw.mode, gw.hint, gw.active = mode, hint, payload.active
    gw.verified_at, gw.last_error = now(), None
    db.add(gw)
    db.flush()
    if name != WHATSAPP_PAY:
        others = [g for g in _gateways(db, owner.id) if g.provider not in (WHATSAPP_PAY, name)]
        if payload.make_default or not any(g.is_default and g.active for g in others):
            for g in others:
                g.is_default = False
            gw.is_default = True
    db.commit()
    label = LABELS[name]
    return {"status": True, "message": f"{label} connected" if is_new else f"{label} saved",
            "data": serialize_gateway(gw)}


def make_default(db: Session, owner: Customer, name: str) -> dict:
    rows = [g for g in _gateways(db, owner.id) if g.provider != WHATSAPP_PAY]
    target = next((g for g in rows if g.provider == name), None)
    if target is None:
        raise HTTPException(404, detail="That gateway isn't connected")
    for g in rows:
        g.is_default = g is target
    target.active = True
    db.commit()
    return {"status": True, "message": f"Payment links now use {LABELS[name]}", "data": serialize_gateway(target)}


def check_gateway(db: Session, owner: Customer, name: str) -> dict:
    gw = db.query(PaymentGateway).filter(PaymentGateway.customer_id == owner.id,
                                         PaymentGateway.provider == name).first()
    if gw is None:
        raise HTTPException(404, detail="That gateway isn't connected")
    if name != WHATSAPP_PAY:
        try:
            provider_of(gw).check()
        except GatewayError as exc:
            gw.last_error = str(exc)[:500]
            db.commit()
            raise _err(str(exc), "credentials") from exc
    gw.verified_at, gw.last_error = now(), None
    db.commit()
    return {"status": True, "message": f"{LABELS[name]} is working", "data": serialize_gateway(gw)}


def remove_gateway(db: Session, owner: Customer, name: str) -> dict:
    gw = db.query(PaymentGateway).filter(PaymentGateway.customer_id == owner.id,
                                         PaymentGateway.provider == name).first()
    if gw is None:
        raise HTTPException(404, detail="That gateway isn't connected")
    was_default = gw.is_default
    db.query(OrderPayment).filter(OrderPayment.gateway_id == gw.id).update({OrderPayment.gateway_id: None})
    db.delete(gw)
    db.flush()
    if was_default:
        nxt = link_gateway(db, owner.id)
        if nxt is not None:
            nxt.is_default = True
    db.commit()
    return {"status": True, "message": f"{LABELS[name]} disconnected", "data": None}


# options ---------------------------------------------------------------------------------------

def message_templates(store: CommerceSettings) -> dict:
    saved = store.notifications or {}
    return {k: (saved.get(k) or {}).get("template_id") for k in TEMPLATE_KEYS}


def serialize_options(store: CommerceSettings) -> dict:
    return {
        "online_enabled": store.online_enabled,
        "link_expiry_minutes": store.link_expiry_minutes,
        "reminders": list(store.reminders or []),
        "cancel_unpaid": store.cancel_unpaid,
        "prepaid_kind": store.prepaid_kind,
        "prepaid_value": (store.prepaid_value if store.prepaid_kind == "percent"
                          else service.to_major(store.prepaid_value)) if store.prepaid_kind else 0,
        "cod_confirm": store.cod_confirm,
        "cod_to_prepaid": store.cod_to_prepaid,
        "templates": message_templates(store),
        "currency": store.currency,
    }


def update_options(db: Session, owner: Customer, payload: PaymentOptionsSchema) -> dict:
    from app.modules.customer.templates.models import WaTemplate

    store = service.settings_of(db, owner)
    for key, template_id in payload.templates.items():
        if template_id is not None:
            t = db.get(WaTemplate, template_id)
            if t is None or t.customer_id != owner.id:
                raise _err("That template doesn't exist", f"templates.{key}")
    store.online_enabled = payload.online_enabled
    store.link_expiry_minutes = payload.link_expiry_minutes
    store.reminders = payload.reminders
    store.cancel_unpaid = payload.cancel_unpaid
    store.prepaid_kind = payload.prepaid_kind
    store.prepaid_value = (int(payload.prepaid_value) if payload.prepaid_kind == "percent"
                           else service.to_minor(payload.prepaid_value) or 0)
    store.cod_confirm, store.cod_to_prepaid = payload.cod_confirm, payload.cod_to_prepaid
    saved = dict(store.notifications or {})
    for key, template_id in payload.templates.items():
        saved[key] = {"on": True, "template_id": template_id}
    store.notifications = saved
    db.commit()
    return {"status": True, "message": "Payment settings saved", "data": serialize_options(store)}


# amounts ---------------------------------------------------------------------------------------

def quote(db: Session, order: Order, store: CommerceSettings) -> tuple[int, int]:
    """What the order costs paid online (no cash-on-delivery fee; the prepaid discount), and the saving
    compared with cash on delivery. The order itself doesn't change."""
    saved = order.payment_method
    order.payment_method = "cod"
    orders.reprice(db, order, store)
    cod_total = order.total
    order.payment_method = "online"
    orders.reprice(db, order, store)
    total, prepaid = order.total, order.prepaid_discount
    order.payment_method = saved
    orders.reprice(db, order, store)
    return total, (max(0, cod_total - total) if store.cod_enabled else prepaid)


def _reference(order: Order) -> str:
    return f"CD{order.number}{secrets.token_hex(5).upper()}"


def _minutes_text(minutes: int) -> str:
    if minutes % 1440 == 0:
        days = minutes // 1440
        return f"{days} day{'s' if days > 1 else ''}" if days > 1 else "24 hours"
    if minutes % 60 == 0:
        return f"{minutes // 60} hour{'s' if minutes > 60 else ''}"
    return f"{minutes} minutes"


def _expiry_minutes(store: CommerceSettings, provider: str) -> int:
    cap = gateways.PROVIDERS[provider].max_expiry_minutes if provider in gateways.PROVIDERS else 60 * 24 * 30
    floor = 30 if provider == "stripe" else 15
    return max(floor, min(store.link_expiry_minutes, cap))


def open_payment(order: Order) -> OrderPayment | None:
    current = now()
    return next((p for p in reversed(order.payments)
                 if p.status == "created" and (p.expires_at is None or p.expires_at > current)), None)


def close_open(db: Session, owner: Customer, order: Order, keep: OrderPayment | None = None) -> None:
    """Cancels the order's other open links (the total changed, or it's paid another way)."""
    for p in order.payments:
        if p.status != "created" or p is keep:
            continue
        p.status = "cancelled"
        gw = db.get(PaymentGateway, p.gateway_id) if p.gateway_id else None
        if gw is not None and gw.provider != WHATSAPP_PAY and p.provider_ref:
            try:
                provider_of(gw).cancel(p.provider_ref, p.reference)
            except GatewayError as exc:
                logger.info("Couldn't cancel payment %s at %s: %s", p.id, gw.provider, exc)


def _customer(order: Order) -> gateways.Customer:
    digits = "".join(ch for ch in (order.customer_phone or "") if ch.isdigit())
    return gateways.Customer(name=order.customer_name or "Customer", phone=digits)


def create_link(db: Session, owner: Customer, order: Order, actor: str | None, purpose: str = "checkout") -> OrderPayment:
    store = service.settings_of(db, owner)
    gw = link_gateway(db, owner.id)
    if gw is None:
        raise _err("Connect a payment gateway in Commerce → Payments first")
    if order.status == "cancelled" or order.payment_status != "unpaid":
        raise _err("This order doesn't need a payment")
    amount, _ = quote(db, order, store)
    if amount <= 0:
        raise _err("The order total is zero, so there's nothing to pay")
    close_open(db, owner, order)
    minutes = _expiry_minutes(store, gw.provider)
    p = OrderPayment(customer_id=owner.id, order_id=order.id, gateway_id=gw.id, provider=gw.provider,
                reference=_reference(order), amount=amount, currency=order.currency, purpose=purpose,
                expires_at=now() + timedelta(minutes=minutes), created_by=actor)
    order.payments.append(p)
    db.flush()
    ref = orders.order_ref(order, store)
    shop = store.store_name or owner.business_name or "our store"
    request = gateways.LinkRequest(reference=p.reference, amount=amount, currency=order.currency,
                                   description=f"Order {ref} · {shop}", customer=_customer(order),
                                   expires_at=p.expires_at, return_url=return_url(p), notify_url=webhook_url(gw))
    try:
        link = provider_of(gw).create_link(request)
    except GatewayError as exc:
        p.status, p.error = "failed", str(exc)[:500]
        gw.last_error = str(exc)[:500]
        orders.log(db, order, "payment", f"Couldn't make a payment link: {exc}", actor)
        db.commit()
        raise _err(str(exc)) from exc
    p.provider_ref, p.url = link.ref, link.url
    gw.last_error = None
    orders.log(db, order, "payment", f"Payment link for {money(amount, order.currency)} made with "
                                     f"{LABELS[gw.provider]} (works for {_minutes_text(minutes)})", actor)
    db.commit()
    return p


def link_message(db: Session, owner: Customer, order: Order, p: OrderPayment, reminder: bool = False) -> tuple[str, dict]:
    """The text and the WhatsApp "Pay" button message for a link."""
    store = service.settings_of(db, owner)
    ref = orders.order_ref(order, store)
    amount = money(p.amount, p.currency)
    first = f"⏰ A reminder: order {ref} is waiting for payment." if reminder else f"💳 *Pay for order {ref}*"
    lines = [first, "", f"Amount: *{amount}*"]
    if p.purpose == "prepaid":
        lines.append("Pay now instead of cash on delivery.")
    lines += ["", "Tap the button to pay securely by UPI, card or net banking."]
    left = int(((p.expires_at or now()) - now()).total_seconds() // 60) if p.expires_at else None
    footer = f"Secured by {LABELS.get(p.provider, 'the gateway')}"
    if left and left > 0:
        footer += f" · works for {_minutes_text(max(15, round(left / 15) * 15))}"
    body = "\n".join(lines)
    interactive = {"type": "cta_url", "body": {"text": body[:1024]}, "footer": {"text": footer[:60]},
                   "action": {"name": "cta_url",
                              "parameters": {"display_text": f"Pay {amount}"[:20], "url": pay_url(p)}}}
    return body, interactive


def send_link(db: Session, owner: Customer, order: Order, p: OrderPayment, reminder: bool = False) -> str:
    """Messages the link: a Pay button inside the 24-hour window, else the chosen template. Returns what
    happened, for the timeline."""
    from app.modules.customer.commerce import flow

    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None or conversation.contact.blocked:
        return "Not messaged: the order has no WhatsApp chat. Copy the link and share it."
    store = service.settings_of(db, owner)
    text, interactive = link_message(db, owner, order, p, reminder)
    template_id = message_templates(store)["payment_reminder" if reminder else "payment_link"] or (
        message_templates(store)["payment_link"] if reminder else None)
    try:
        result = flow.tell(db, owner, conversation, order, text, template_id=template_id, interactive=interactive,
                           detail=pay_url(p), button_value=p.reference)
    except Exception as exc:  # noqa: BLE001 - a message problem never loses the link
        logger.warning("Payment %s link message failed: %s", p.id, exc)
        return f"Couldn't message the customer: {exc}"
    if result.startswith("Not messaged"):
        result = ("Not messaged: the 24-hour window is closed. Choose a payment-link template in Commerce → "
                  "Payments, or copy the link and share it.")
    what = "Payment reminder" if reminder else "Payment link"
    if result == "WhatsApp update sent":
        return f"{what} sent on WhatsApp"
    if result.startswith("WhatsApp update failed"):
        return f"{what} failed{result[len('WhatsApp update failed'):]}"
    return f"{what}: {result}"


def send_whatsapp_pay(db: Session, owner: Customer, order: Order, conversation: WaConversation,
                      gw: PaymentGateway, actor: str | None, purpose: str) -> OrderPayment:
    """WhatsApp's own Review and pay message (India): the customer pays without leaving the chat."""
    from app.modules.customer.commerce import flow

    store = service.settings_of(db, owner)
    amount, _ = quote(db, order, store)
    if amount <= 0:
        raise _err("The order total is zero, so there's nothing to pay")
    close_open(db, owner, order)
    c = credentials(gw)
    minutes = _expiry_minutes(store, WHATSAPP_PAY)
    p = OrderPayment(customer_id=owner.id, order_id=order.id, gateway_id=gw.id, provider=WHATSAPP_PAY,
                reference=_reference(order), amount=amount, currency="INR", purpose=purpose,
                expires_at=now() + timedelta(minutes=minutes), created_by=actor)
    order.payments.append(p)
    db.flush()
    # the breakdown, priced as paid online
    saved = order.payment_method
    order.payment_method = "online"
    orders.reprice(db, order, store)
    value = lambda v: {"value": int(v), "offset": 100}  # noqa: E731
    items = [{"retailer_id": i.retailer_id or f"item-{i.id}", "name": i.name[:60], "amount": value(i.unit_price),
              "quantity": i.quantity} for i in order.items]
    detail = {"status": "pending", "items": items, "subtotal": value(order.subtotal),
              "shipping": value(order.shipping), "tax": value(0 if store.tax_inclusive else order.tax),
              "expiration": {"timestamp": str(gateways._unix(p.expires_at)),
                             "description": f"Pay within {_minutes_text(minutes)}"}}
    if store.catalog_id and all(i.retailer_id for i in order.items):
        detail["catalog_id"] = store.catalog_id
    discount = order.discount + order.prepaid_discount
    if discount:
        detail["discount"] = {**value(discount), "description": order.coupon_code or "Paying online"}
    order.payment_method = saved
    orders.reprice(db, order, store)
    ref = orders.order_ref(order, store)
    interactive = {
        "type": "order_details",
        "body": {"text": f"🧾 Order {ref}: please review and pay {money(amount, 'INR')}."},
        "footer": {"text": (store.store_name or owner.business_name or "Thank you")[:60]},
        "action": {"name": "review_and_pay", "parameters": {
            "reference_id": p.reference, "type": "physical-goods", "currency": "INR",
            "total_amount": value(amount), "order": detail,
            "payment_settings": [{"type": "payment_gateway", "payment_gateway": {
                "type": c.get("gateway") or "razorpay", "configuration_name": c.get("configuration_name")}}],
        }},
    }
    message = flow._send(db, owner, flow.client_for(db, owner), conversation,
                         {"type": "interactive", "interactive": interactive},
                         f"💳 Review and pay {money(amount, 'INR')} (order {ref})", order)
    if message.status != "sent":
        p.status, p.error = "failed", (message.error_message or "WhatsApp couldn't send it")[:500]
        orders.log(db, order, "payment", f"WhatsApp Pay request failed: {p.error}", actor)
        db.commit()
        raise _err(f"WhatsApp Pay request failed: {p.error}")
    orders.log(db, order, "payment", f"WhatsApp Pay request for {money(amount, 'INR')} sent", actor)
    db.commit()
    return p


def request_payment(db: Session, owner: Customer, order: Order, actor: str | None, purpose: str = "checkout",
                    send: bool = True) -> tuple[OrderPayment, str]:
    """Asks the customer to pay online: WhatsApp Pay when it can, else a payment link (messaged to them,
    unless `send` is off). Returns the payment and what happened."""
    store = service.settings_of(db, owner)
    if not store.online_enabled:
        raise _err("Online payment is switched off in Commerce → Payments")
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    wa = _wa_pay_for(db, owner, store, conversation) if send else None
    if wa is not None:  # paying inside the chat beats a link
        p = send_whatsapp_pay(db, owner, order, conversation, wa, actor, purpose)
        return p, "WhatsApp Pay request sent"
    p = create_link(db, owner, order, actor, purpose)
    result = send_link(db, owner, order, p) if send else "Link made, to share with the customer"
    orders.log(db, order, "message", result, "ChatDesk")
    db.commit()
    return p, result


def offer_prepaid(db: Session, owner: Customer, order: Order) -> None:
    """After a cash-on-delivery order is confirmed: "pay now and save" (when switched on)."""
    from app.modules.customer.commerce import flow
    from app.modules.customer.inbox import service as inbox

    store = service.settings_of(db, owner)
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if not store.cod_to_prepaid or conversation is None or not inbox.window_open(conversation) \
            or order.payment_method != "cod" or not online_ready(db, owner, store, conversation):
        return
    amount, saving = quote(db, order, store)
    pitch = f"💳 Prefer to pay now? Pay *{money(amount, order.currency)}* online"
    pitch += f" and save {money(saving, order.currency)}." if saving else " and skip the cash at the door."
    flow._buttons(db, owner, flow.client_for(db, owner), conversation, pitch,
                  [(f"{flow.PREPAY}{order.id}", "Pay now")], order)
    orders.log(db, order, "message", "Offered to pay online instead of cash on delivery", "ChatDesk")
    db.commit()


def ask_cod_confirmation(db: Session, owner: Customer, order: Order, actor: str | None = None) -> str:
    """Asks a cash-on-delivery buyer to confirm the order (and offers paying now, when switched on)."""
    from app.modules.customer.commerce import flow

    store = service.settings_of(db, owner)
    if order.payment_method != "cod" or order.status not in ("confirmed", "packed"):
        raise _err("Only cash-on-delivery orders that haven't shipped can be confirmed with the customer")
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None:
        raise _err("This order has no WhatsApp chat")
    ref = orders.order_ref(order, store)
    lines = [f"🛍️ *Please confirm your order {ref}*", "", orders.items_text(order), "",
             f"*Total: {orders.total_text(order)}* (cash on delivery)"]
    if order.address:
        lines += ["", f"📍 {orders.address_text(order.address)}"]
    buttons = [(f"{flow.COD_YES}{order.id}", "Confirm order")]
    if store.cod_to_prepaid and online_ready(db, owner, store, conversation):
        amount, saving = quote(db, order, store)
        if saving:
            lines += ["", f"💳 Or pay {money(amount, order.currency)} now and save {money(saving, order.currency)}."]
        buttons.append((f"{flow.PREPAY}{order.id}", "Pay now"))
    buttons.append((f"{flow.COD_NO}{order.id}", "Cancel order"))
    text = "\n".join(lines)
    interactive = {"type": "button", "body": {"text": text[:1024]},
                   "action": {"buttons": [{"type": "reply", "reply": {"id": i, "title": t}} for i, t in buttons]}}
    result = flow.tell(db, owner, conversation, order, text, template_id=message_templates(store)["cod_confirm"],
                       interactive=interactive, detail=orders.total_text(order))
    if result.endswith("sent"):
        order.cod_check = "pending"
    orders.log(db, order, "message", f"Asked to confirm the cash-on-delivery order: {result[0].lower()}{result[1:]}",
               actor or "ChatDesk")
    db.commit()
    return result


# what happened to a payment ----------------------------------------------------------------------

def _find(db: Session, provider: str, event: Event, owner_id: int | None = None) -> OrderPayment | None:
    q = db.query(OrderPayment).filter(OrderPayment.provider == provider)
    if owner_id is not None:
        q = q.filter(OrderPayment.customer_id == owner_id)
    if event.reference:
        p = q.filter(OrderPayment.reference == event.reference).first()
        if p is not None:
            return p
    if event.ref:
        p = q.filter(OrderPayment.provider_ref == event.ref).order_by(OrderPayment.id.desc()).first()
        if p is not None:
            return p
    if event.payment_id:
        return q.filter(OrderPayment.provider_payment_id == event.payment_id).order_by(OrderPayment.id.desc()).first()
    return None


def apply(db: Session, owner: Customer, p: OrderPayment, event: Event) -> bool:
    """Applies one event to a payment. True if anything changed."""
    if event.kind == "paid":
        return mark_paid(db, owner, p, event)
    order = db.get(Order, p.order_id)
    if event.kind == "failed":
        p.error = (event.error or "The payment didn't go through")[:500]
        if p.provider == WHATSAPP_PAY and p.status == "created":
            p.status = "failed"
        orders.log(db, order, "payment", f"A payment attempt failed{f': {event.error}' if event.error else ''}",
                   "Customer")
        db.commit()
        return True
    if event.kind in ("expired", "cancelled"):
        if p.status != "created":
            return False
        p.status = event.kind
        db.commit()
        if event.kind == "expired":
            expired(db, owner, p)
        return True
    if event.kind in ("refund_processed", "refund_failed"):
        return _refund_update(db, owner, p, event)
    return False


def mark_paid(db: Session, owner: Customer, p: OrderPayment, event: Event) -> bool:
    from app.modules.customer.account import notify
    from app.modules.customer.commerce import meta

    if p.status == "paid":
        return False
    current = now()
    p.status, p.paid_at = "paid", current
    p.provider_payment_id = event.payment_id or p.provider_payment_id
    p.method = (event.method or p.method or "")[:30] or None
    order = (db.query(Order).options(selectinload(Order.items), selectinload(Order.payments))
             .filter(Order.id == p.order_id).first())
    store = service.settings_of(db, owner)
    paid = event.amount or p.amount
    method = METHODS.get((p.method or "").lower(), p.method)
    text = f"Paid {money(paid, p.currency)} online{f' by {method}' if method else ''} · {LABELS[p.provider]}"
    if p.provider_payment_id:
        text += f" {p.provider_payment_id}"
    if order.payment_status != "unpaid":
        orders.log(db, order, "payment", f"{text}. The order was already paid: refund one of the payments.",
                   "Customer")
        db.commit()
        return True
    confirming = order.status in orders.CHECKOUT
    if order.status == "cancelled":
        text += ". The order was cancelled: refund it or reopen it as a new order."
    if confirming:
        orders.confirm(db, owner, order, "Customer", method="online")
    else:
        order.payment_method = "online"
        orders.reprice(db, order, store)  # no cash-on-delivery fee; the prepaid discount
    order.payment_status, order.paid_at = "paid", current
    if order.cod_check == "pending":
        order.cod_check = "confirmed"
    if paid != order.total and order.status != "cancelled":
        text += f" (the order total is {orders.total_text(order)})"
    orders.log(db, order, "payment", text, "Customer")
    close_open(db, owner, order, keep=p)
    db.commit()
    notify.payment_received(db, order, money(paid, p.currency))
    db.commit()
    if confirming:
        meta.after_change(db, owner, orders._products_of(db, order))
        orders.notify(db, owner, order, "confirmed")
    elif order.status != "cancelled":
        orders.notify(db, owner, order, "paid")
    if p.provider == WHATSAPP_PAY:
        _order_status(db, owner, order, p, "processing", "Payment received. We're preparing your order.")
    return True


def _order_status(db: Session, owner: Customer, order: Order, p: OrderPayment, status: str, description: str) -> None:
    """Updates the WhatsApp Pay order card in the customer's chat."""
    from app.modules.customer.commerce import flow
    from app.modules.customer.inbox import service as inbox

    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None or not inbox.window_open(conversation):
        return
    interactive = {"type": "order_status", "body": {"text": description[:1024]},
                   "action": {"name": "review_order", "parameters": {
                       "reference_id": p.reference, "order": {"status": status, "description": description[:120]}}}}
    try:
        flow._send(db, owner, flow.client_for(db, owner), conversation,
                   {"type": "interactive", "interactive": interactive}, description, order)
    except Exception as exc:  # noqa: BLE001
        logger.info("WhatsApp Pay order status for %s failed: %s", order.id, exc)


def expired(db: Session, owner: Customer, p: OrderPayment) -> None:
    """A link ran out unpaid: cancel the order (if set), or offer a new link."""
    from app.modules.customer.commerce import flow
    from app.modules.customer.inbox import service as inbox

    order = (db.query(Order).options(selectinload(Order.items), selectinload(Order.payments))
             .filter(Order.id == p.order_id).first())
    if order is None or order.payment_status != "unpaid" or order.status == "cancelled" or open_payment(order):
        return
    store = service.settings_of(db, owner)
    orders.log(db, order, "payment", f"The payment link for {money(p.amount, p.currency)} expired", "ChatDesk")
    db.commit()
    if store.cancel_unpaid and order.status in orders.CHECKOUT:
        orders.change_status(db, owner, order, "cancel", "ChatDesk", reason="The payment link expired")
        return
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None or not inbox.window_open(conversation) or order.status not in orders.CHECKOUT:
        return
    ref = orders.order_ref(order, store)
    options = [(f"{flow.NEW_LINK}{order.id}", "New payment link")]
    if store.cod_enabled:
        options.append((f"{flow.PAY_COD}{order.id}", "Cash on delivery"))
    options.append((f"{flow.CANCEL}{order.id}", "Cancel order"))
    flow._buttons(db, owner, flow.client_for(db, owner), conversation,
                  f"⌛ The payment link for order {ref} has expired. Would you like a new one?", options, order)
    db.commit()


def check(db: Session, p: OrderPayment) -> Event | None:
    """Asks the gateway what happened to the payment."""
    p.checked_at = now()
    gw = db.get(PaymentGateway, p.gateway_id) if p.gateway_id else None
    if gw is None:
        return None
    if p.provider == WHATSAPP_PAY:
        from app.modules.customer.commerce import flow

        owner = db.get(Customer, p.customer_id)
        try:
            data = flow.client_for(db, owner).payment_lookup(credentials(gw).get("configuration_name") or "",
                                                              p.reference)
        except Exception as exc:  # noqa: BLE001
            logger.info("WhatsApp Pay lookup for %s failed: %s", p.id, exc)
            return None
        row = (data.get("payments") or [{}])[0]
        tx = (row.get("transactions") or [{}])[0]
        if row.get("status") == "captured" or tx.get("status") == "success":
            return Event("paid", p.reference, None, tx.get("id"), (tx.get("method") or {}).get("type") or tx.get("type"),
                         (row.get("amount") or {}).get("value"))
        return None
    try:
        return provider_of(gw).fetch(p.provider_ref or p.reference, p.reference)
    except GatewayError as exc:
        logger.info("Checking payment %s at %s failed: %s", p.id, p.provider, exc)
        return None


def refresh(db: Session, owner: Customer, payment_id: int) -> dict:
    p = db.query(OrderPayment).filter(OrderPayment.id == payment_id, OrderPayment.customer_id == owner.id).first()
    if p is None:
        raise HTTPException(404, detail="Payment not found")
    event = check(db, p) if p.status == "created" else None
    changed = apply(db, owner, p, event) if event else False
    db.commit()
    message = {"paid": "Paid", "expired": "The link has expired", "cancelled": "The link was cancelled",
               "failed": "The payment failed"}.get(p.status, "Not paid yet")
    return {"status": True, "message": message, "data": serialize_payment(p), "changed": changed}


def webhook(db: Session, provider: str, webhook_key: str, body: bytes, headers: dict) -> tuple[int, str]:
    gw = db.query(PaymentGateway).filter(PaymentGateway.webhook_key == webhook_key,
                                         PaymentGateway.provider == provider).first()
    if gw is None or provider not in gateways.PROVIDERS:
        return 404, "Unknown webhook"
    try:
        events = provider_of(gw).parse_webhook(body, {k.lower(): v for k, v in headers.items()})
    except GatewayError as exc:
        gw.last_error = f"Webhook refused: {exc}"[:500]
        db.commit()
        return 401, str(exc)
    except ValueError:
        return 400, "Invalid body"
    gw.last_event_at = now()
    db.commit()
    owner = db.get(Customer, gw.customer_id)
    for event in events:
        p = _find(db, provider, event, gw.customer_id)
        if p is None:
            continue
        try:
            apply(db, owner, p, event)
        except Exception:  # noqa: BLE001 - the gateway retries on errors; one bad event shouldn't block others
            db.rollback()
            logger.exception("Payment webhook event failed (%s, payment %s)", provider, p.id)
    return 200, "ok"


def whatsapp_status(db: Session, owner_id: int, raw: dict) -> bool:
    """A WhatsApp Pay status from Meta's webhook ({"type": "payment", "payment": {...}})."""
    payment = raw.get("payment") or {}
    p = (db.query(OrderPayment).filter(OrderPayment.customer_id == owner_id, OrderPayment.provider == WHATSAPP_PAY,
                                  OrderPayment.reference == payment.get("reference_id")).first()
         if payment.get("reference_id") else None)
    if p is None:
        return False
    tx = payment.get("transaction") or {}
    state, tx_state = raw.get("status"), tx.get("status")
    owner = db.get(Customer, owner_id)
    method = (tx.get("method") or {}).get("type") if isinstance(tx.get("method"), dict) else tx.get("type")
    if state == "captured" or tx_state == "success":
        return apply(db, owner, p, Event("paid", p.reference, None, tx.get("id"), method,
                                         (payment.get("amount") or {}).get("value")))
    if state == "failed" or tx_state == "failed":
        reason = (tx.get("error") or {}).get("reason") if isinstance(tx.get("error"), dict) else None
        return apply(db, owner, p, Event("failed", p.reference, None, tx.get("id"), method, error=reason))
    return False


# refunds ---------------------------------------------------------------------------------------

def _paid_total(order: Order) -> int:
    paid = sum(p.amount for p in order.payments if p.status == "paid")
    return paid or (order.total if order.payment_status in orders.PAID else 0)


def _refunded_total(db: Session, order: Order) -> int:
    return int(db.query(func.coalesce(func.sum(OrderRefund.amount), 0))
               .filter(OrderRefund.order_id == order.id, OrderRefund.status != "failed").scalar() or 0)


def _set_refund_status(db: Session, order: Order) -> None:
    refunded, paid = _refunded_total(db, order), _paid_total(order)
    if refunded <= 0:
        order.payment_status = "paid" if paid else order.payment_status
    else:
        order.payment_status = "refunded" if refunded >= paid else "partially_refunded"


def refund(db: Session, owner: Customer, person: Customer, order_id: int, payload: RefundSchema) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    order = orders.get(db, owner, order_id)
    store = service.settings_of(db, owner)
    actor = actor_name(person)
    amount = service.to_minor(payload.amount)
    if order.payment_status not in orders.PAID:
        raise _err("This order hasn't been paid, so there's nothing to refund", "amount")
    left = _paid_total(order) - _refunded_total(db, order)
    if amount > left:
        raise _err(f"You can refund up to {money(max(left, 0), order.currency)}", "amount")
    paid = [p for p in order.payments if p.status == "paid" and p.amount - p.refunded >= amount]
    row = OrderRefund(customer_id=owner.id, order_id=order.id, amount=amount, reason=payload.reason, created_by=actor,
                 created_at=now())
    if payload.method == "manual" or not [p for p in order.payments if p.status == "paid"]:
        row.provider, row.status, row.processed_at = "manual", "processed", now()
        how = "recorded"
    else:
        if not paid:
            biggest = max(p.amount - p.refunded for p in order.payments if p.status == "paid")
            raise _err(f"Refund up to {money(biggest, order.currency)} at a time", "amount")
        p = paid[-1]
        gw = db.get(PaymentGateway, p.gateway_id) if p.gateway_id else None
        if gw is None:
            raise _err(f"Reconnect {LABELS[p.provider]} to refund through it, or record a refund you made "
                       "yourself.", "method")
        try:
            if p.provider == WHATSAPP_PAY:
                from app.modules.customer.commerce import flow

                result = flow.client_for(db, owner).payment_refund(credentials(gw).get("configuration_name") or "",
                                                                    p.reference, amount)
                ref, state = str(result.get("id") or p.reference), "pending"
            else:
                if not p.provider_payment_id:
                    raise GatewayError(f"{LABELS[p.provider]} didn't say which payment this was; refund it from "
                                       f"the {LABELS[p.provider]} dashboard and record it here")
                ref, state = provider_of(gw).refund(p.provider_payment_id, amount, p.reference, payload.reason)
        except GatewayError as exc:
            raise _err(str(exc), "method") from exc
        except Exception as exc:  # noqa: BLE001 - WhatsApp errors
            raise _err(f"The refund didn't go through: {exc}", "method") from exc
        p.refunded += amount
        row.payment_id, row.provider, row.provider_ref, row.status = p.id, p.provider, ref, state
        row.processed_at = now() if state == "processed" else None
        how = f"started through {LABELS[p.provider]}" if state == "pending" else f"made through {LABELS[p.provider]}"
    db.add(row)
    db.flush()
    _set_refund_status(db, order)
    orders.log(db, order, "payment", f"Refund of {money(amount, order.currency)} {how}"
                                     f"{f': {payload.reason}' if payload.reason else ''}", actor)
    db.commit()
    if row.status == "processed" and payload.notify:
        _tell_refunded(db, owner, order, row)
    if payload.cancel_order and order.status not in ("delivered", "cancelled"):
        orders.change_status(db, owner, order, "cancel", actor, reason=payload.reason or "Refunded",
                             notify_customer=payload.notify)
    message = f"Refund of {money(amount, order.currency)} {how}"
    return {"status": True, "message": message,
            "data": {**orders.serialize(orders.get(db, owner, order.id), store, full=True),
                     **order_info(db, owner, orders.get(db, owner, order.id), store)}}


def _tell_refunded(db: Session, owner: Customer, order: Order, row: OrderRefund) -> None:
    store = service.settings_of(db, owner)
    ref = orders.order_ref(order, store)
    text = (f"💸 We've refunded {money(row.amount, order.currency)} for order {ref}."
            + ("" if row.provider == "manual" else " It usually reaches your account in 5–7 working days."))
    orders.notify(db, owner, order, "refunded", text)


def _refund_update(db: Session, owner: Customer, p: OrderPayment, event: Event) -> bool:
    q = db.query(OrderRefund).filter(OrderRefund.payment_id == p.id)
    row = (q.filter(OrderRefund.provider_ref == event.refund_ref).first() if event.refund_ref else None) or \
        q.filter(OrderRefund.status == "pending").order_by(OrderRefund.id).first()
    if row is None or row.status != "pending":
        return False
    order = (db.query(Order).options(selectinload(Order.items), selectinload(Order.payments))
             .filter(Order.id == p.order_id).first())
    if event.kind == "refund_processed":
        row.status, row.processed_at = "processed", now()
        orders.log(db, order, "payment", f"Refund of {money(row.amount, order.currency)} reached the customer's "
                                         "bank", "ChatDesk")
        db.commit()
        _tell_refunded(db, owner, order, row)
        return True
    row.status, row.error = "failed", (event.error or "The gateway couldn't refund it")[:500]
    p.refunded = max(0, p.refunded - row.amount)
    _set_refund_status(db, order)
    orders.log(db, order, "payment", f"Refund of {money(row.amount, order.currency)} failed: {row.error}",
               "ChatDesk")
    db.commit()
    return True


# reading ---------------------------------------------------------------------------------------

def serialize_payment(p: OrderPayment, order: Order | None = None, store: CommerceSettings | None = None) -> dict:
    data = {
        "id": p.id, "reference": p.reference, "provider": p.provider, "provider_label": LABELS[p.provider],
        "status": p.status, "status_label": STATUS_LABELS.get(p.status, p.status),
        "amount": service.to_major(p.amount), "amount_text": money(p.amount, p.currency),
        "refunded": service.to_major(p.refunded), "refunded_text": money(p.refunded, p.currency) if p.refunded else None,
        "method": p.method, "method_label": METHODS.get((p.method or "").lower(), p.method),
        "purpose": p.purpose, "url": pay_url(p) if p.provider != WHATSAPP_PAY else None,
        "provider_payment_id": p.provider_payment_id, "error": p.error, "reminders_sent": p.reminders_sent,
        "expires_at": iso(p.expires_at), "paid_at": iso(p.paid_at), "created_at": iso(p.created_at),
        "created_by": p.created_by,
    }
    if order is not None:
        data["order"] = {"id": order.id, "ref": orders.order_ref(order, store), "status": order.status,
                         "customer": order.customer_name or order.customer_phone}
    return data


def serialize_refund(r: OrderRefund, currency: str) -> dict:
    return {"id": r.id, "amount": service.to_major(r.amount), "amount_text": money(r.amount, currency),
            "status": r.status, "provider": r.provider, "provider_label": LABELS.get(r.provider, r.provider),
            "provider_ref": r.provider_ref, "reason": r.reason, "error": r.error, "created_by": r.created_by,
            "created_at": iso(r.created_at), "processed_at": iso(r.processed_at)}


def order_info(db: Session, owner: Customer, order: Order, store: CommerceSettings) -> dict:
    """The payment part of an order's page."""
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    refunds = db.query(OrderRefund).filter(OrderRefund.order_id == order.id).order_by(OrderRefund.id).all()
    paid, refunded = _paid_total(order), _refunded_total(db, order)
    ready = online_ready(db, owner, store, conversation)
    can_link = ready and order.payment_status == "unpaid" and order.status not in ("cancelled", "delivered")
    online = saving = None
    gw = link_gateway(db, owner.id)
    if can_link:
        total, save = quote(db, order, store)
        online, saving = money(total, order.currency), money(save, order.currency) if save else None
    return {
        "payments": [serialize_payment(p) for p in reversed(order.payments)],
        "refunds": [serialize_refund(r, order.currency) for r in reversed(refunds)],
        "paid_text": money(paid, order.currency) if paid else None,
        "refunded_text": money(refunded, order.currency) if refunded else None,
        "refundable": service.to_major(max(0, paid - refunded)) if order.payment_status in orders.PAID else 0,
        "refundable_text": money(max(0, paid - refunded), order.currency),
        "can_refund_online": any(p.status == "paid" and p.gateway_id for p in order.payments),
        "online": {"ready": ready, "can_link": can_link, "amount_text": online, "saving_text": saving,
                   "gateway": LABELS[gw.provider] if gw else ("WhatsApp Pay" if ready else None)},
        "can_ask_cod": order.payment_method == "cod" and order.payment_status == "unpaid"
        and order.status in ("confirmed", "packed") and conversation is not None,
    }


def list_payments(db: Session, owner: Customer, page=None, per_page=None, search=None, status=None,
                  provider=None) -> dict:
    store = service.settings_of(db, owner)
    q = (db.query(OrderPayment, Order).join(Order, Order.id == OrderPayment.order_id)
         .filter(OrderPayment.customer_id == owner.id))
    if status:
        q = q.filter(OrderPayment.status.in_(status.split(",")))
    if provider:
        q = q.filter(OrderPayment.provider == provider)
    if search:
        text = search.strip().lstrip(store.order_prefix or "#").strip()
        clause = search_clause([Order.customer_name, Order.customer_phone, OrderPayment.reference,
                                OrderPayment.provider_payment_id], search)
        if text.isdigit():
            from sqlalchemy import or_

            clause = Order.number == int(text) if clause is None else or_(clause, Order.number == int(text))
        if clause is not None:
            q = q.filter(clause)
    q = q.order_by(OrderPayment.id.desc())
    result = list_response(q, lambda row: serialize_payment(row[0], row[1], store), page, per_page, search)
    db.commit()
    return result


def stats(db: Session, owner: Customer) -> dict:
    from app.shared.utils.datetime import days_ago_start

    store = service.settings_of(db, owner)
    since = days_ago_start(29)
    base = db.query(OrderPayment).filter(OrderPayment.customer_id == owner.id)
    collected = int(base.filter(OrderPayment.status == "paid", OrderPayment.paid_at >= since)
                    .with_entities(func.coalesce(func.sum(OrderPayment.amount), 0)).scalar() or 0)
    paid_count = base.filter(OrderPayment.status == "paid", OrderPayment.paid_at >= since).count()
    made = base.filter(OrderPayment.created_at >= since, OrderPayment.status != "failed").count()
    waiting = (base.filter(OrderPayment.status == "created", OrderPayment.expires_at > now())
               .with_entities(func.count(OrderPayment.id), func.coalesce(func.sum(OrderPayment.amount), 0)).first())
    refunded = int(db.query(func.coalesce(func.sum(OrderRefund.amount), 0))
                   .filter(OrderRefund.customer_id == owner.id, OrderRefund.status != "failed", OrderRefund.created_at >= since)
                   .scalar() or 0)
    db.commit()
    return {"status": True, "data": {
        "collected_text": money(collected, store.currency), "paid_count": paid_count,
        "conversion": round(paid_count * 100 / made) if made else None,
        "waiting": waiting[0] if waiting else 0, "waiting_text": money(int(waiting[1] or 0), store.currency),
        "refunded_text": money(refunded, store.currency), "ready": online_ready(db, owner, store),
    }}


def _payment(db: Session, owner: Customer, payment_id: int) -> OrderPayment:
    p = db.query(OrderPayment).filter(OrderPayment.id == payment_id, OrderPayment.customer_id == owner.id).first()
    if p is None:
        raise HTTPException(404, detail="Payment not found")
    return p


def resend(db: Session, owner: Customer, person: Customer, payment_id: int) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    p = _payment(db, owner, payment_id)
    if p.status != "created" or (p.expires_at and p.expires_at <= now()) or p.provider == WHATSAPP_PAY:
        raise _err("Only a waiting payment link can be sent again")
    order = db.get(Order, p.order_id)
    result = send_link(db, owner, order, p)
    orders.log(db, order, "message", result, actor_name(person))
    db.commit()
    return {"status": True, "message": result.split(": ", 1)[-1][:1].upper() + result.split(": ", 1)[-1][1:],
            "data": serialize_payment(p)}


def cancel(db: Session, owner: Customer, person: Customer, payment_id: int) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    p = _payment(db, owner, payment_id)
    if p.status != "created":
        raise _err("Only a waiting payment link can be cancelled")
    order = (db.query(Order).options(selectinload(Order.payments)).filter(Order.id == p.order_id).first())
    close_open(db, owner, order)
    orders.log(db, order, "payment", "Payment link cancelled", actor_name(person))
    db.commit()
    return {"status": True, "message": "Payment link cancelled", "data": serialize_payment(p)}


def send_for_order(db: Session, owner: Customer, person: Customer, order_id: int, send: bool) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    order = orders.get(db, owner, order_id)
    if order.payment_status != "unpaid" or order.status in ("cancelled", "delivered"):
        raise _err("This order doesn't need a payment")
    purpose = "prepaid" if order.payment_method == "cod" and order.status not in orders.CHECKOUT else "checkout"
    p, result = request_payment(db, owner, order, actor_name(person), purpose, send)
    store = service.settings_of(db, owner)
    fresh = orders.get(db, owner, order.id)
    return {"status": True, "message": result if send else "Payment link ready",
            "data": {**orders.serialize(fresh, store, full=True), **order_info(db, owner, fresh, store),
                     "payment": serialize_payment(p)}}


def ask_cod(db: Session, owner: Customer, person: Customer, order_id: int) -> dict:
    from app.modules.customer.commerce.manage import actor_name

    order = orders.get(db, owner, order_id)
    result = ask_cod_confirmation(db, owner, order, actor_name(person))
    store = service.settings_of(db, owner)
    fresh = orders.get(db, owner, order.id)
    return {"status": True, "message": result,
            "data": {**orders.serialize(fresh, store, full=True), **order_info(db, owner, fresh, store)}}


# the scheduler ---------------------------------------------------------------------------------

def run_due(db: Session) -> tuple[int, int, int]:
    """Reminders for unpaid links, expiry, and asking gateways about links a webhook may have missed.
    Returns (reminded, expired, paid)."""
    current = now()
    reminded = gone = paid = 0
    rows = (db.query(OrderPayment).filter(OrderPayment.status == "created").order_by(OrderPayment.id).limit(500).all())
    for p in rows:
        try:
            owner = db.get(Customer, p.customer_id)
            if owner is None:
                continue
            ended = p.expires_at is not None and p.expires_at <= current
            due = ended or ((p.checked_at or p.created_at) <= current - CHECK_EVERY)
            if due and p.created_at <= current - timedelta(minutes=2):
                event = check(db, p)
                db.commit()
                if event is not None and apply(db, owner, p, event):
                    paid += event.kind == "paid"
                    gone += event.kind == "expired"
                if p.status != "created":
                    continue
            if ended:
                p.status = "expired"
                db.commit()
                expired(db, owner, p)
                gone += 1
                continue
            store = service.settings_of(db, owner)
            rules = sorted(store.reminders or [])
            due_count = sum(1 for m in rules if p.created_at + timedelta(minutes=m) <= current)
            order = db.get(Order, p.order_id)
            if p.provider != WHATSAPP_PAY and due_count > p.reminders_sent and order.payment_status == "unpaid" \
                    and order.status != "cancelled" and (p.expires_at is None or
                                                         p.expires_at > current + timedelta(minutes=5)):
                p.reminders_sent = due_count
                result = send_link(db, owner, order, p, reminder=True)
                orders.log(db, order, "message", result, "ChatDesk")
                db.commit()
                reminded += 1
        except Exception:  # noqa: BLE001 - one payment's problem never stops the others
            db.rollback()
            logger.exception("Payment %s: scheduled work failed", p.id)
    return reminded, gone, paid
