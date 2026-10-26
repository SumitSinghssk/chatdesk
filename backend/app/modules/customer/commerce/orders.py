"""Orders: prices and totals, coupons, the order's life (confirmed -> packed -> shipped -> delivered), stock,
and the WhatsApp message the customer gets at each step."""
import logging
import secrets
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session, selectinload

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import service
from app.modules.customer.commerce.models import (
    CommerceSettings, Coupon, Order, OrderEvent, OrderItem, Product, ProductVariant,
)
from app.modules.customer.inbox.models import WaContact, WaConversation
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

logger = logging.getLogger(__name__)

CHECKOUT = ("awaiting_address", "awaiting_payment")  # still talking to the customer
OPEN = ("confirmed", "packed", "shipped")
STATUS_LABELS = {
    "awaiting_address": "Waiting for address", "awaiting_payment": "Waiting for payment choice",
    "confirmed": "Confirmed", "packed": "Packed", "shipped": "Shipped", "delivered": "Delivered",
    "cancelled": "Cancelled",
}
# what the team can do from each status
NEXT = {
    "awaiting_address": ("confirm", "cancel"),
    "awaiting_payment": ("confirm", "cancel"),
    "confirmed": ("pack", "ship", "cancel"),
    "packed": ("ship", "cancel"),
    "shipped": ("deliver", "cancel"),
    "delivered": (),
    "cancelled": (),
}
NOTIFY_STEPS = ("confirmed", "packed", "shipped", "delivered", "cancelled", "paid", "refunded")
NOTIFY_DEFAULTS = {"confirmed": True, "packed": False, "shipped": True, "delivered": True, "cancelled": True,
                   "paid": True, "refunded": True}
PAID = ("paid", "partially_refunded", "refunded")
STORE_SOURCES = ("shopify", "woocommerce")
PAY_LABELS = {"cod": "Cash on delivery", "online": "Pay online"}
GRID_FIELDS = {
    "number": GridField(Order.number, "number"),
    "status": GridField(Order.status, "enum"),
    "payment_status": GridField(Order.payment_status, "enum"),
    "source": GridField(Order.source, "enum"),
    "total": GridField(Order.total, "number"),
    "placed_at": GridField(Order.placed_at, "date"),
    "created_at": GridField(Order.created_at, "date"),
}


def _error(message: str, field: str = "order"):
    return HTTPException(422, detail={"message": message, "errors": {field: [message]}})


def order_ref(order: Order, store: CommerceSettings | None = None) -> str:
    prefix = store.order_prefix if store else "#"
    return f"{prefix}{order.number}"


def total_text(order: Order) -> str:
    return service.money(order.total, order.currency)


# pricing -----------------------------------------------------------------------------------

def coupon_problem(db: Session, owner_id: int, coupon: Coupon | None, subtotal: int,
                   contact_id: int | None, order_id: int | None = None) -> str | None:
    """Why a coupon can't be used on this order (None when it can)."""
    if coupon is None or not coupon.active:
        return "That coupon code isn't valid"
    current = now()
    if coupon.starts_at and coupon.starts_at > current:
        return "That coupon isn't active yet"
    if coupon.ends_at and coupon.ends_at < current:
        return "That coupon has expired"
    if coupon.usage_limit is not None and coupon.used >= coupon.usage_limit:
        return "That coupon has been used up"
    if coupon.min_order and subtotal < coupon.min_order:
        return f"That coupon needs an order of at least {service.money(coupon.min_order, _currency(db, owner_id))}"
    if coupon.per_customer and contact_id:
        used = (db.query(func.count(Order.id))
                .filter(Order.customer_id == owner_id, Order.contact_id == contact_id,
                        func.upper(Order.coupon_code) == coupon.code, Order.status != "cancelled",
                        Order.id != (order_id or 0), Order.confirmed_at.isnot(None)).scalar() or 0)
        if used >= coupon.per_customer:
            return "You've already used that coupon"
    return None


def _currency(db: Session, owner_id: int) -> str:
    row = db.query(CommerceSettings.currency).filter(CommerceSettings.customer_id == owner_id).first()
    return row[0] if row else "INR"


def find_coupon(db: Session, owner_id: int, code: str | None) -> Coupon | None:
    if not code:
        return None
    return db.query(Coupon).filter(Coupon.customer_id == owner_id,
                                   Coupon.code == code.strip().upper()).first()


def reprice(db: Session, order: Order, store: CommerceSettings) -> None:
    """Works out subtotal, discount, shipping, COD fee, tax and total from the items and settings.
    Orders from a connected store keep the store's own amounts."""
    if order.external_id and not order.external_id.startswith("checkout:"):
        return
    subtotal = sum(i.unit_price * i.quantity for i in order.items)
    coupon = find_coupon(db, order.customer_id, order.coupon_code)
    if order.coupon_code and coupon_problem(db, order.customer_id, coupon, subtotal, order.contact_id, order.id):
        coupon = None
    discount, free_ship = 0, False
    if coupon:
        if coupon.kind == "percent":
            discount = subtotal * coupon.value // 100
            if coupon.max_discount:
                discount = min(discount, coupon.max_discount)
        elif coupon.kind == "fixed":
            discount = min(coupon.value, subtotal)
        elif coupon.kind == "free_shipping":
            free_ship = True
    after = subtotal - discount
    # a chatbot's payment request is just an amount: no delivery charge
    shipping = 0 if free_ship or not order.items or order.source == "chatbot" else store.shipping_fee
    if store.free_shipping_above is not None and after >= store.free_shipping_above:
        shipping = 0
    # paying online can earn a discount: while the order is unpaid, or once it was given
    prepaid = 0
    if order.payment_method == "online" and store.prepaid_kind and store.prepaid_value and \
            (order.payment_status == "unpaid" or order.prepaid_discount):
        prepaid = after * store.prepaid_value // 100 if store.prepaid_kind == "percent" \
            else min(store.prepaid_value, after)
    after -= prepaid
    order.prepaid_discount = prepaid
    cod_fee = store.cod_fee if order.payment_method == "cod" else 0
    rate = Decimal(store.tax_percent) / Decimal(10000)
    if store.tax_inclusive:
        tax = int(round(Decimal(after) - Decimal(after) / (1 + rate))) if rate else 0
        total = after + shipping + cod_fee
    else:
        tax = int(round(Decimal(after) * rate))
        total = after + shipping + cod_fee + tax
    order.subtotal, order.discount, order.shipping, order.cod_fee, order.tax = subtotal, discount, shipping, \
        cod_fee, tax
    order.total = max(total, 0)


def next_number(db: Session, owner_id: int) -> int:
    """The next order number (atomic, so two orders never share one)."""
    row = db.execute(update(CommerceSettings).where(CommerceSettings.customer_id == owner_id)
                     .values(next_number=CommerceSettings.next_number + 1)
                     .returning(CommerceSettings.next_number)).first()
    return int(row[0]) - 1


# building orders --------------------------------------------------------------------------

def log(db: Session, order: Order, kind: str, text: str, actor: str | None = None) -> None:
    db.add(OrderEvent(order_id=order.id, kind=kind, text=text[:1000], actor=actor, created_at=now()))


def item_from_variant(variant: ProductVariant, quantity: int, unit_price: int | None = None) -> OrderItem:
    product = variant.product
    return OrderItem(product_id=product.id, variant_id=variant.id, retailer_id=variant.retailer_id,
                     name=product.name, variant_label=service.variant_label(variant) or None,
                     image=variant.image or (product.images or [None])[0],
                     unit_price=unit_price if unit_price is not None else
                     (variant.sale_price if variant.sale_price is not None else variant.price),
                     quantity=max(1, quantity))


def new_order(db: Session, owner: Customer, contact: WaContact | None, items: list[OrderItem], source: str,
              status: str, actor: str | None = None, message_id: int | None = None,
              note: str | None = None) -> Order:
    store = service.settings_of(db, owner)
    db.flush()
    order = Order(customer_id=owner.id, number=next_number(db, owner.id), source=source, status=status,
                  currency=store.currency, contact_id=contact.id if contact else None,
                  conversation_id=contact.conversation.id if contact and contact.conversation else None,
                  customer_name=(contact.name or contact.profile_name) if contact else None,
                  customer_phone=f"+{contact.wa_id}" if contact else None, message_id=message_id,
                  note=note, created_by=actor, placed_at=now(), invoice_key=secrets.token_urlsafe(18))
    order.items = items
    db.add(order)
    db.flush()
    reprice(db, order, store)
    where = {"whatsapp_cart": "from a WhatsApp cart", "buy_button": "from a Buy now button",
             "manual": "by the team", "chatbot": "by a chatbot", "shopify": "on Shopify",
             "woocommerce": "on WooCommerce"}.get(source, "")
    log(db, order, "placed", f"Order placed {where}".strip(), actor)
    return order


def last_address(db: Session, owner_id: int, contact_id: int | None) -> dict | None:
    if not contact_id:
        return None
    row = (db.query(Order.address).filter(Order.customer_id == owner_id, Order.contact_id == contact_id,
                                          Order.address.isnot(None))
           .order_by(Order.id.desc()).first())
    return row[0] if row else None


def address_text(address: dict | None) -> str:
    if not address:
        return ""
    parts = [address.get(k) for k in ("line1", "line2", "landmark", "city", "state")]
    pin = address.get("pincode")
    text = ", ".join(str(p).strip() for p in parts if p and str(p).strip())
    return f"{text} {pin}".strip() if pin else text


# status changes ---------------------------------------------------------------------------

def _move_stock(db: Session, order: Order, sign: int) -> None:
    for item in order.items:
        if item.variant_id:
            variant = db.get(ProductVariant, item.variant_id)
            if variant is not None and variant.stock is not None:
                variant.stock = max(0, variant.stock + sign * item.quantity)
                variant.sync_state = "pending"


def confirm(db: Session, owner: Customer, order: Order, actor: str | None, method: str | None = None) -> None:
    if order.status not in CHECKOUT:
        raise _error("This order is already confirmed")
    store = service.settings_of(db, owner)
    if method:
        order.payment_method = method
    reprice(db, order, store)
    order.status, order.confirmed_at = "confirmed", now()
    if order.recovery_sent and order.recovered_at is None:
        order.recovered_at, order.recovered_step = order.confirmed_at, order.recovery_sent
        log(db, order, "status", f"Recovered after cart reminder {order.recovery_sent}", "ChatDesk")
    pay = PAY_LABELS.get(order.payment_method or "", "")
    if order.source in STORE_SOURCES:  # the store keeps its own stock and coupons
        log(db, order, "status", f"Confirmed{f' · {pay}' if pay else ''}", actor)
        return
    _move_stock(db, order, -1)
    coupon = find_coupon(db, owner.id, order.coupon_code)
    if coupon is not None:
        coupon.used += 1
    log(db, order, "status", f"Confirmed{f' · {pay}' if pay else ''}", actor)


def change_status(db: Session, owner: Customer, order: Order, action: str, actor: str | None,
                  tracking: dict | None = None, reason: str | None = None, notify_customer: bool = True) -> None:
    from app.modules.customer.commerce import meta

    if action not in NEXT.get(order.status, ()):
        raise _error(f"A {STATUS_LABELS[order.status].lower()} order can't be {action}ed")
    stamp = now()
    if action == "confirm":
        confirm(db, owner, order, actor)
    elif action == "pack":
        order.status, order.packed_at = "packed", stamp
        log(db, order, "status", "Packed", actor)
    elif action == "ship":
        tracking = tracking or {}
        order.courier = tracking.get("courier") or order.courier
        order.tracking_number = tracking.get("tracking_number") or order.tracking_number
        order.tracking_url = tracking.get("tracking_url") or order.tracking_url
        order.status, order.shipped_at = "shipped", stamp
        via = f" via {order.courier}" if order.courier else ""
        log(db, order, "status", f"Shipped{via}{f' · {order.tracking_number}' if order.tracking_number else ''}",
            actor)
    elif action == "deliver":
        order.status, order.delivered_at = "delivered", stamp
        if order.payment_method == "cod" and order.payment_status == "unpaid":
            order.payment_status, order.paid_at = "paid", stamp  # cash collected on delivery
            log(db, order, "payment", "Cash collected on delivery", actor)
        log(db, order, "status", "Delivered", actor)
    elif action == "cancel":
        from app.modules.customer.commerce import payments

        payments.close_open(db, owner, order)  # nobody should pay for a cancelled order
        if order.confirmed_at and order.source not in STORE_SOURCES:
            _move_stock(db, order, +1)
            coupon = find_coupon(db, owner.id, order.coupon_code)
            if coupon is not None and coupon.used:
                coupon.used -= 1
        order.status, order.cancelled_at, order.cancel_reason = "cancelled", stamp, (reason or "")[:300] or None
        log(db, order, "status", f"Cancelled{f': {reason}' if reason else ''}", actor)
    db.commit()
    if action in ("confirm", "cancel"):
        meta.after_change(db, owner, _products_of(db, order))  # stock changed
    if notify_customer:
        notify(db, owner, order, order.status)


def _products_of(db: Session, order: Order) -> list[Product]:
    ids = {i.product_id for i in order.items if i.product_id}
    if not ids:
        return []
    return (db.query(Product).options(selectinload(Product.variants), selectinload(Product.collection))
            .filter(Product.id.in_(ids)).all())


# WhatsApp messages ------------------------------------------------------------------------

def items_text(order: Order) -> str:
    lines = []
    for i in order.items:
        label = f"{i.name}{f' ({i.variant_label})' if i.variant_label else ''}"
        lines.append(f"• {label} × {i.quantity} = {service.money(i.unit_price * i.quantity, order.currency)}")
    return "\n".join(lines)


def totals_text(order: Order, store: CommerceSettings) -> str:
    m = lambda v: service.money(v, order.currency)  # noqa: E731
    lines = [f"Subtotal: {m(order.subtotal)}"]
    if order.discount:
        lines.append(f"Discount ({order.coupon_code}): −{m(order.discount)}")
    if order.prepaid_discount:
        lines.append(f"Paying online: −{m(order.prepaid_discount)}")
    lines.append(f"Delivery: {m(order.shipping) if order.shipping else 'Free'}")
    if order.cod_fee:
        lines.append(f"Cash on delivery fee: {m(order.cod_fee)}")
    if order.tax and not store.tax_inclusive:
        lines.append(f"Tax: {m(order.tax)}")
    lines.append(f"*Total: {m(order.total)}*")
    if order.tax and store.tax_inclusive:
        lines.append(f"_Includes {m(order.tax)} tax_")
    return "\n".join(lines)


def status_message(order: Order, step: str, store: CommerceSettings, owner: Customer) -> str:
    ref = order_ref(order, store)
    shop = store.store_name or owner.business_name or "us"
    if step == "confirmed":
        pay = "Cash on delivery" if order.payment_method == "cod" else \
            ("Paid online" if order.payment_status == "paid" else None)
        return "\n".join(filter(None, [
            f"✅ *Order {ref} confirmed!*", "", items_text(order), "", totals_text(order, store),
            f"Payment: {pay}" if pay else None,
            f"\nDeliver to: {address_text(order.address)}" if order.address else None,
            "\nWe'll message you when it ships.",
        ]))
    if step == "packed":
        return f"📦 Your order {ref} is packed and will ship soon."
    if step == "shipped":
        via = f" via {order.courier}" if order.courier else ""
        lines = [f"🚚 *Order {ref} has shipped{via}!*"]
        if order.tracking_number:
            lines.append(f"Tracking number: {order.tracking_number}")
        if order.tracking_url:
            lines.append(f"Track it here: {order.tracking_url}")
        if order.payment_method == "cod" and order.payment_status == "unpaid":
            lines.append(f"Please keep {total_text(order)} ready for cash on delivery.")
        return "\n".join(lines)
    if step == "delivered":
        return f"🎉 Your order {ref} was delivered. Thank you for shopping with {shop}! Reply anytime to tell us how it was."
    if step == "cancelled":
        why = f"\nReason: {order.cancel_reason}" if order.cancel_reason else ""
        return f"Your order {ref} was cancelled.{why}\nReply if you have any questions."
    if step == "paid":
        return f"✅ We've received your payment of {total_text(order)} for order {ref}. Thank you!"
    return ""


def notify_settings(store: CommerceSettings) -> dict:
    saved = store.notifications or {}
    return {step: {"on": bool((saved.get(step) or {}).get("on", NOTIFY_DEFAULTS[step])),
                   "template_id": (saved.get(step) or {}).get("template_id")} for step in NOTIFY_STEPS}


def notify(db: Session, owner: Customer, order: Order, step: str, text: str | None = None) -> None:
    """Tells the customer about the step on WhatsApp: a message inside the 24-hour window, else the
    template chosen for the step (if any). The result goes on the order's timeline."""
    from app.modules.customer.commerce import flow

    store = service.settings_of(db, owner)
    rule = notify_settings(store).get(step)
    if not rule or not rule["on"] or not order.conversation_id:
        return
    conversation = db.get(WaConversation, order.conversation_id)
    if conversation is None or conversation.contact.blocked:
        return
    try:
        result = flow.tell(db, owner, conversation, order, text or status_message(order, step, store, owner),
                           template_id=rule["template_id"], step=step)
    except Exception as exc:  # noqa: BLE001 - a message problem never undoes the status change
        logger.warning("Order %s %s message failed: %s", order.id, step, exc)
        result = f"Couldn't message the customer: {exc}"
    log(db, order, "message", result, "ChatDesk")
    db.commit()


# reading ----------------------------------------------------------------------------------

def serialize_item(i: OrderItem, currency: str) -> dict:
    return {"id": i.id, "product_id": i.product_id, "variant_id": i.variant_id, "retailer_id": i.retailer_id,
            "name": i.name, "variant_label": i.variant_label, "image_url": service.image_url(i.image),
            "unit_price": service.to_major(i.unit_price), "quantity": i.quantity,
            "total": service.to_major(i.unit_price * i.quantity),
            "unit_text": service.money(i.unit_price, currency),
            "total_text": service.money(i.unit_price * i.quantity, currency)}


def serialize(order: Order, store: CommerceSettings, full: bool = False) -> dict:
    m = lambda v: service.money(v, order.currency)  # noqa: E731
    data = {
        "id": order.id,
        "number": order.number,
        "ref": order_ref(order, store),
        "status": order.status,
        "status_label": STATUS_LABELS.get(order.status, order.status),
        "actions": list(NEXT.get(order.status, ())),
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "source": order.source,
        "currency": order.currency,
        "subtotal": service.to_major(order.subtotal),
        "discount": service.to_major(order.discount),
        "shipping": service.to_major(order.shipping),
        "cod_fee": service.to_major(order.cod_fee),
        "prepaid_discount": service.to_major(order.prepaid_discount),
        "tax": service.to_major(order.tax),
        "tax_inclusive": store.tax_inclusive,
        "total": service.to_major(order.total),
        "total_text": m(order.total),
        "coupon_code": order.coupon_code,
        "cod_check": order.cod_check,
        "external_ref": order.external_ref,
        "recovery_sent": order.recovery_sent,
        "recovered_at": iso(order.recovered_at),
        "last_recovery_at": iso(order.last_recovery_at),
        "items_count": sum(i.quantity for i in order.items),
        "items_preview": ", ".join(f"{i.name}{f' ({i.variant_label})' if i.variant_label else ''} ×{i.quantity}"
                                   for i in order.items[:3]) + ("…" if len(order.items) > 3 else ""),
        "contact": {"id": order.contact_id, "name": order.customer_name, "phone": order.customer_phone,
                    "conversation_id": order.conversation_id},
        "address": order.address,
        "address_text": address_text(order.address),
        "placed_at": iso(order.placed_at),
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    }
    if full:
        data.update({
            "items": [serialize_item(i, order.currency) for i in order.items],
            "note": order.note,
            "internal_note": order.internal_note,
            "courier": order.courier,
            "tracking_number": order.tracking_number,
            "tracking_url": order.tracking_url,
            "cancel_reason": order.cancel_reason,
            "created_by": order.created_by,
            "invoice_key": order.invoice_key,
            "times": {k: iso(getattr(order, f"{k}_at")) for k in
                      ("placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "paid")},
            "events": [{"id": e.id, "kind": e.kind, "text": e.text, "actor": e.actor, "created_at": iso(e.created_at)}
                       for e in order.events],
            "totals": {"subtotal": m(order.subtotal), "discount": m(order.discount), "shipping": m(order.shipping),
                       "cod_fee": m(order.cod_fee), "prepaid_discount": m(order.prepaid_discount),
                       "tax": m(order.tax), "total": m(order.total)},
        })
    return data


def _query(db: Session, owner: Customer):
    return db.query(Order).options(selectinload(Order.items)).filter(Order.customer_id == owner.id)


def get(db: Session, owner: Customer, order_id: int) -> Order:
    order = (_query(db, owner).options(selectinload(Order.events)).filter(Order.id == order_id).first())
    if order is None:
        raise HTTPException(404, detail="Order not found")
    return order


def list_orders(db: Session, owner: Customer, page=None, per_page=None, search=None, status=None,
                payment=None, contact_id=None, filters=None, match="and", sort=None) -> dict:
    store = service.settings_of(db, owner)
    q = _query(db, owner)
    if search:
        text = search.strip().lstrip(store.order_prefix or "#").strip()
        clause = search_clause([Order.customer_name, Order.customer_phone, Order.tracking_number], search)
        if text.isdigit():
            clause = Order.number == int(text) if clause is None else or_(clause, Order.number == int(text))
        if clause is not None:
            q = q.filter(clause)
    groups = {"checkout": CHECKOUT, "open": OPEN, "to_ship": ("confirmed", "packed")}
    if status in groups:
        q = q.filter(Order.status.in_(groups[status]))
    elif status:
        q = q.filter(Order.status.in_(status.split(",")))
    if payment == "cod_due":
        q = q.filter(Order.payment_method == "cod", Order.payment_status == "unpaid", Order.status != "cancelled")
    elif payment == "cod_check":
        q = q.filter(Order.cod_check == "pending", Order.status != "cancelled")
    elif payment:
        q = q.filter(Order.payment_status == payment)
    if contact_id:
        q = q.filter(Order.contact_id == contact_id)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Order.id.desc()])
    result = list_response(q, lambda o: serialize(o, store), page, per_page, search)
    db.commit()
    return result


def show(db: Session, owner: Customer, order_id: int) -> dict:
    from app.modules.customer.commerce import payments

    store = service.settings_of(db, owner)
    order = get(db, owner, order_id)
    data = serialize(order, store, full=True)
    data.update(payments.order_info(db, owner, order, store))
    db.commit()
    return {"status": True, "data": data}


def stats(db: Session, owner: Customer) -> dict:
    from app.shared.utils.datetime import days_ago_start

    store = service.settings_of(db, owner)
    base = db.query(Order).filter(Order.customer_id == owner.id)
    by_status = dict(base.with_entities(Order.status, func.count(Order.id)).group_by(Order.status).all())
    since = days_ago_start(29)
    live = base.filter(Order.status != "cancelled", Order.confirmed_at.isnot(None))
    revenue_30d = live.filter(Order.confirmed_at >= since).with_entities(func.coalesce(func.sum(Order.total), 0))
    revenue_30d = int(revenue_30d.scalar() or 0)
    orders_30d = live.filter(Order.confirmed_at >= since).count()
    cod_due = (base.filter(Order.payment_method == "cod", Order.payment_status == "unpaid",
                           Order.status.notin_(("cancelled",)))
               .with_entities(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).first())
    db.commit()
    return {"status": True, "data": {
        "total": sum(by_status.values()),
        "checkout": sum(by_status.get(s, 0) for s in CHECKOUT),
        "to_ship": by_status.get("confirmed", 0) + by_status.get("packed", 0),
        "shipped": by_status.get("shipped", 0),
        "delivered": by_status.get("delivered", 0),
        "cancelled": by_status.get("cancelled", 0),
        "revenue_30d": service.to_major(revenue_30d),
        "revenue_30d_text": service.money(revenue_30d, store.currency),
        "orders_30d": orders_30d,
        "average_text": service.money(revenue_30d // orders_30d, store.currency) if orders_30d else None,
        "cod_due": cod_due[0] if cod_due else 0,
        "cod_due_text": service.money(int(cod_due[1] or 0), store.currency) if cod_due else None,
        "currency": store.currency,
    }}


def contact_summary(db: Session, owner: Customer, contact_id: int) -> dict:
    """For the inbox's contact panel: the person's orders and what they've spent."""
    store = service.settings_of(db, owner)
    orders = _query(db, owner).filter(Order.contact_id == contact_id).order_by(Order.id.desc()).limit(20).all()
    spent = sum(o.total for o in orders if o.status != "cancelled" and o.confirmed_at)
    count = sum(1 for o in orders if o.status != "cancelled" and o.confirmed_at)
    db.commit()
    return {"status": True, "data": {
        "orders": [serialize(o, store) for o in orders],
        "count": count,
        "spent": service.to_major(spent),
        "spent_text": service.money(spent, store.currency),
    }}
