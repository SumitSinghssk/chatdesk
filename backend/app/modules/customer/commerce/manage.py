"""What the team does with orders: checkout settings, coupons, making and editing orders, moving them along,
payments, notes, and the invoice."""
import html
from decimal import Decimal

from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import orders, service
from app.modules.customer.commerce.models import CommerceSettings, Coupon, Order, OrderItem, ProductVariant
from app.modules.customer.commerce.schemas import (
    CheckoutSchema, CouponSchema, OrderActionSchema, OrderNoteSchema, OrderSchema, OrderUpdateSchema,
    PaymentStatusSchema,
)
from app.modules.customer.inbox.models import WaContact, WaConversation
from app.shared.utils.datetime import iso, now


def _err(message: str, field: str = "order"):
    return HTTPException(422, detail={"message": message, "errors": {field: [message]}})


def actor_name(person: Customer) -> str:
    return person.name or person.email or "Team"


# checkout settings ----------------------------------------------------------------------------

def serialize_checkout(store: CommerceSettings, db: Session | None = None, owner: Customer | None = None) -> dict:
    from app.modules.customer.commerce import payments

    return {
        "order_prefix": store.order_prefix,
        "next_number": store.next_number,
        "shipping_fee": service.to_major(store.shipping_fee),
        "free_shipping_above": service.to_major(store.free_shipping_above),
        "tax_percent": store.tax_percent / 100,
        "tax_inclusive": store.tax_inclusive,
        "cod_enabled": store.cod_enabled,
        "cod_fee": service.to_major(store.cod_fee),
        "min_order": service.to_major(store.min_order),
        "ask_address": store.ask_address,
        "notifications": orders.notify_settings(store),
        "currency": store.currency,
        # for estimating totals: paying online can earn a discount
        "prepaid_kind": store.prepaid_kind,
        "prepaid_value": (store.prepaid_value if store.prepaid_kind == "percent"
                          else service.to_major(store.prepaid_value)) if store.prepaid_kind else 0,
        "online_ready": payments.online_ready(db, owner, store) if db is not None and owner is not None else None,
    }


def get_checkout(db: Session, owner: Customer) -> dict:
    store = service.settings_of(db, owner)
    data = serialize_checkout(store, db, owner)
    db.commit()
    return {"status": True, "data": data}


def update_checkout(db: Session, owner: Customer, payload: CheckoutSchema) -> dict:
    from app.modules.customer.templates.models import WaTemplate

    store = service.settings_of(db, owner)
    for step, rule in payload.notifications.items():
        if rule.template_id is not None:
            t = db.get(WaTemplate, rule.template_id)
            if t is None or t.customer_id != owner.id:
                raise _err("That template doesn't exist", f"notifications.{step}")
    store.order_prefix = payload.order_prefix
    store.shipping_fee = service.to_minor(payload.shipping_fee)
    store.free_shipping_above = service.to_minor(payload.free_shipping_above)
    store.tax_percent = int(payload.tax_percent * 100)
    store.tax_inclusive = payload.tax_inclusive
    store.cod_enabled = payload.cod_enabled
    store.cod_fee = service.to_minor(payload.cod_fee)
    store.min_order = service.to_minor(payload.min_order)
    store.ask_address = payload.ask_address
    current = orders.notify_settings(store)
    current.update({k: v.model_dump() for k, v in payload.notifications.items()})
    store.notifications = {**(store.notifications or {}), **current}  # keeps the payment message templates
    db.commit()
    return {"status": True, "message": "Checkout settings saved", "data": serialize_checkout(store, db, owner)}


# coupons ------------------------------------------------------------------------------------

def serialize_coupon(c: Coupon, currency: str) -> dict:
    value = c.value if c.kind == "percent" else service.to_major(c.value)
    label = {"percent": f"{c.value}% off", "fixed": f"{service.money(c.value, currency)} off",
             "free_shipping": "Free delivery"}[c.kind]
    current = now()
    state = ("inactive" if not c.active else "scheduled" if c.starts_at and c.starts_at > current
             else "expired" if c.ends_at and c.ends_at < current
             else "used_up" if c.usage_limit is not None and c.used >= c.usage_limit else "active")
    return {"id": c.id, "code": c.code, "kind": c.kind, "value": value, "label": label,
            "min_order": service.to_major(c.min_order), "max_discount": service.to_major(c.max_discount),
            "starts_at": iso(c.starts_at), "ends_at": iso(c.ends_at), "usage_limit": c.usage_limit,
            "per_customer": c.per_customer, "used": c.used, "active": c.active, "state": state,
            "description": c.description}


def list_coupons(db: Session, owner: Customer) -> dict:
    store = service.settings_of(db, owner)
    rows = db.query(Coupon).filter(Coupon.customer_id == owner.id).order_by(Coupon.id.desc()).all()
    db.commit()
    return {"status": True, "data": [serialize_coupon(c, store.currency) for c in rows]}


def save_coupon(db: Session, owner: Customer, payload: CouponSchema, coupon_id: int | None = None) -> dict:
    store = service.settings_of(db, owner)
    clash = db.query(Coupon.id).filter(Coupon.customer_id == owner.id, Coupon.code == payload.code,
                                       Coupon.id != (coupon_id or 0)).first()
    if clash:
        raise _err("You already have a coupon with this code", "code")
    row = db.query(Coupon).filter(Coupon.id == coupon_id, Coupon.customer_id == owner.id).first() \
        if coupon_id else Coupon(customer_id=owner.id)
    if row is None:
        raise HTTPException(404, detail="Coupon not found")
    row.code, row.kind = payload.code, payload.kind
    row.value = int(payload.value) if payload.kind == "percent" else service.to_minor(payload.value) or 0
    row.min_order = service.to_minor(payload.min_order)
    row.max_discount = service.to_minor(payload.max_discount)
    row.starts_at, row.ends_at = payload.starts_at, payload.ends_at
    row.usage_limit, row.per_customer = payload.usage_limit, payload.per_customer
    row.active, row.description = payload.active, payload.description
    db.add(row)
    db.commit()
    return {"status": True, "message": "Coupon saved", "data": serialize_coupon(row, store.currency)}


def delete_coupon(db: Session, owner: Customer, coupon_id: int) -> dict:
    row = db.query(Coupon).filter(Coupon.id == coupon_id, Coupon.customer_id == owner.id).first()
    if row is None:
        raise HTTPException(404, detail="Coupon not found")
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Coupon deleted", "data": None}


# making and editing orders ------------------------------------------------------------------

def _items(db: Session, owner: Customer, rows) -> list[OrderItem]:
    ids = [r.variant_id for r in rows if r.variant_id]
    variants = {v.id: v for v in db.query(ProductVariant).options(selectinload(ProductVariant.product))
                .filter(ProductVariant.customer_id == owner.id, ProductVariant.id.in_(ids)).all()} if ids else {}
    items = []
    for r in rows:
        price = service.to_minor(r.unit_price) if r.unit_price is not None else None
        if r.variant_id:
            v = variants.get(r.variant_id)
            if v is None or v.product.deleted_at is not None:
                raise _err("A product in the order doesn't exist any more", "items")
            items.append(orders.item_from_variant(v, r.quantity, price))
        else:
            items.append(OrderItem(name=r.name, unit_price=price or 0, quantity=r.quantity))
    return items


def _check_coupon(db: Session, owner: Customer, code: str | None, order: Order) -> str | None:
    if not code:
        return None
    coupon = orders.find_coupon(db, owner.id, code)
    subtotal = sum(i.unit_price * i.quantity for i in order.items)
    problem = orders.coupon_problem(db, owner.id, coupon, subtotal, order.contact_id, order.id)
    if problem:
        raise _err(problem, "coupon_code")
    return coupon.code


def create(db: Session, owner: Customer, person: Customer, payload: OrderSchema) -> dict:
    contact = None
    if payload.contact_id:
        contact = db.query(WaContact).filter(WaContact.id == payload.contact_id,
                                             WaContact.customer_id == owner.id).first()
        if contact is None:
            raise _err("That contact doesn't exist", "contact_id")
    if payload.mode == "checkout" and (contact is None or contact.conversation is None):
        raise _err("Choose a customer with a WhatsApp chat to send the order to", "contact_id")
    if payload.mode == "checkout":
        from app.modules.customer.inbox import service as inbox

        if not inbox.window_open(contact.conversation):
            raise _err("The customer's 24-hour reply window is closed, so the checkout can't be sent in the chat. "
                       "Create a confirmed order instead.", "mode")
    from app.modules.customer.commerce import payments

    if payload.mode == "link" and not payments.link_gateway(db, owner.id) and not payments.whatsapp_pay(db, owner.id):
        raise _err("Connect a payment gateway in Commerce → Payments to send payment links", "mode")
    actor = actor_name(person)
    status = "confirmed" if payload.mode == "confirmed" else "awaiting_payment" if payload.mode == "link" else (
        "awaiting_payment" if payload.address or not service.settings_of(db, owner).ask_address
        else "awaiting_address")
    order = orders.new_order(db, owner, contact, _items(db, owner, payload.items), "manual",
                             "awaiting_payment" if payload.mode == "confirmed" else status, actor,
                             note=payload.note)
    order.address = payload.address.model_dump(exclude_none=True) if payload.address else None
    order.internal_note = payload.internal_note
    order.payment_method = None if payload.mode == "link" else payload.payment_method
    order.coupon_code = _check_coupon(db, owner, payload.coupon_code, order)
    store = service.settings_of(db, owner)
    orders.reprice(db, order, store)
    if payload.mode == "confirmed":
        orders.confirm(db, owner, order, actor)
        if payload.paid:
            order.payment_status, order.paid_at = "paid", now()
            orders.log(db, order, "payment", "Marked paid", actor)
    else:
        order.status = status
    db.commit()
    from app.modules.customer.commerce import meta

    message = f"Order {orders.order_ref(order, store)} created"
    if payload.mode == "confirmed":
        meta.after_change(db, owner, orders._products_of(db, order))
        asked = False
        if store.cod_confirm and order.payment_method == "cod" and not payload.paid and order.conversation_id:
            try:
                asked = payments.ask_cod_confirmation(db, owner, order, actor).endswith("sent")
            except HTTPException:
                db.rollback()
        if not asked:
            orders.notify(db, owner, order, "confirmed")
    elif payload.mode == "link":
        try:
            _, result = payments.request_payment(db, owner, order, actor, send=bool(order.conversation_id))
            message += f" · {result[0].lower()}{result[1:]}" if order.conversation_id else " · payment link ready"
        except HTTPException as exc:
            db.rollback()
            detail = exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail)
            message += f", but the payment link failed: {detail}"
    else:
        send_to_customer(db, owner, person, order.id)
    fresh = orders.get(db, owner, order.id)
    return {"status": True, "message": message,
            "data": {**orders.serialize(fresh, store, full=True), **payments.order_info(db, owner, fresh, store)}}


def update(db: Session, owner: Customer, person: Customer, order_id: int, payload: OrderUpdateSchema) -> dict:
    order = orders.get(db, owner, order_id)
    store = service.settings_of(db, owner)
    actor = actor_name(person)
    data = payload.model_dump(exclude_unset=True)
    changes = []
    if "items" in data and payload.items is not None:
        if order.status not in (*orders.CHECKOUT, "confirmed"):
            raise _err("Items can't change once the order is packed")
        if order.confirmed_at:
            orders._move_stock(db, order, +1)
        order.items = _items(db, owner, payload.items)
        db.flush()
        if order.confirmed_at:
            orders._move_stock(db, order, -1)
        changes.append("items")
    if "coupon_code" in data:
        if payload.coupon_code and order.status not in (*orders.CHECKOUT, "confirmed"):
            raise _err("Coupons can't change once the order is packed", "coupon_code")
        order.coupon_code = _check_coupon(db, owner, payload.coupon_code, order)
        changes.append(f"coupon {order.coupon_code}" if order.coupon_code else "coupon removed")
    if "address" in data:
        order.address = payload.address.model_dump(exclude_none=True) if payload.address else None
        changes.append("address")
    for key in ("note", "internal_note", "courier", "tracking_number", "tracking_url"):
        if key in data:
            setattr(order, key, data[key])
            changes.append(key.replace("_", " "))
    orders.reprice(db, order, store)
    if changes:
        orders.log(db, order, "edit", f"Changed {', '.join(dict.fromkeys(changes))}", actor)
    db.commit()
    return {"status": True, "message": "Order saved",
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


def act(db: Session, owner: Customer, person: Customer, order_id: int, payload: OrderActionSchema) -> dict:
    order = orders.get(db, owner, order_id)
    orders.change_status(db, owner, order, payload.action, actor_name(person),
                         tracking={"courier": payload.courier, "tracking_number": payload.tracking_number,
                                   "tracking_url": payload.tracking_url},
                         reason=payload.reason, notify_customer=payload.notify)
    store = service.settings_of(db, owner)
    labels = {"confirm": "confirmed", "pack": "packed", "ship": "shipped", "deliver": "delivered",
              "cancel": "cancelled"}
    return {"status": True, "message": f"Order {orders.order_ref(order, store)} {labels[payload.action]}",
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


def set_payment(db: Session, owner: Customer, person: Customer, order_id: int, payload: PaymentStatusSchema):
    from app.modules.customer.commerce import payments

    order = orders.get(db, owner, order_id)
    if payload.payment_status == "unpaid" and any(p.status == "paid" for p in order.payments):
        raise _err("This order was paid online. Refund it instead of marking it unpaid.", "payment_status")
    order.payment_status = payload.payment_status
    if payload.payment_method:
        order.payment_method = payload.payment_method
    order.paid_at = now() if payload.payment_status == "paid" else None
    if payload.payment_status != "unpaid":
        payments.close_open(db, owner, order)  # paid another way: the links shouldn't take the money again
    label = {"paid": "Marked paid", "unpaid": "Marked unpaid", "refunded": "Marked refunded"}
    orders.log(db, order, "payment", label[payload.payment_status], actor_name(person))
    db.commit()
    store = service.settings_of(db, owner)
    return {"status": True, "message": label[payload.payment_status],
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


def add_note(db: Session, owner: Customer, person: Customer, order_id: int, payload: OrderNoteSchema) -> dict:
    order = orders.get(db, owner, order_id)
    orders.log(db, order, "note", payload.text, actor_name(person))
    db.commit()
    store = service.settings_of(db, owner)
    return {"status": True, "message": "Note added",
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


def send_to_customer(db: Session, owner: Customer, person: Customer, order_id: int) -> dict:
    """Sends the checkout message again (address request or the summary with how to pay)."""
    from app.modules.customer.commerce import flow
    from app.modules.customer.inbox import service as inbox

    order = orders.get(db, owner, order_id)
    if order.status not in orders.CHECKOUT:
        raise _err("Only orders waiting for the customer can be sent for checkout")
    conversation = db.get(WaConversation, order.conversation_id) if order.conversation_id else None
    if conversation is None:
        raise _err("This order has no WhatsApp chat")
    if not inbox.window_open(conversation):
        raise _err("The 24-hour reply window is closed. Send a template first, then try again.")
    flow.proceed(db, owner, flow.client_for(db, owner), conversation, order)
    orders.log(db, order, "message", "Checkout sent to the customer", actor_name(person))
    db.commit()
    store = service.settings_of(db, owner)
    return {"status": True, "message": "Sent to the customer",
            "data": orders.serialize(orders.get(db, owner, order.id), store, full=True)}


# invoice ----------------------------------------------------------------------------------

INVOICE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice {ref}</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f5f7;color:#0f172a;font:14px/1.5 system-ui,-apple-system,
Segoe UI,Roboto,sans-serif}}main{{max-width:820px;margin:24px auto;background:#fff;padding:40px;border-radius:16px;
box-shadow:0 1px 3px rgba(0,0,0,.08)}}header{{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}}
h1{{margin:0;font-size:26px}}.muted{{color:#64748b}}.right{{text-align:right}}table{{width:100%;border-collapse:collapse;
margin:28px 0 12px}}th{{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;
border-bottom:2px solid #e2e8f0;padding:8px 6px}}td{{border-bottom:1px solid #eef2f6;padding:10px 6px;vertical-align:top}}
.num{{text-align:right;white-space:nowrap}}.totals{{margin-left:auto;width:min(320px,100%)}}.totals div{{display:flex;
justify-content:space-between;padding:4px 0}}.grand{{border-top:2px solid #0f172a;margin-top:6px;padding-top:8px!important;
font-size:18px;font-weight:700}}.badge{{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;
background:#ecfdf5;color:#047857;font-weight:600}}.badge.due{{background:#fef3c7;color:#b45309}}
.print{{position:fixed;right:20px;bottom:20px;background:#0f766e;color:#fff;border:0;border-radius:12px;
padding:12px 18px;font-weight:600;cursor:pointer}}@media print{{body{{background:#fff}}main{{box-shadow:none;margin:0;
max-width:none}}.print{{display:none}}}}@media(max-width:600px){{main{{padding:22px;margin:0;border-radius:0}}}}
</style></head><body><main>
<header><div><h1>{store}</h1><p class="muted">Invoice for order {ref}</p></div>
<div class="right"><p><b>Date</b><br>{date}</p><p><span class="badge {paid_class}">{paid}</span></p></div></header>
<section style="display:flex;gap:40px;flex-wrap:wrap;margin-top:24px"><div><p class="muted">Bill to</p>
<p><b>{customer}</b><br>{phone}</p></div>{address}</section>
<table><thead><tr><th>Item</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
<tbody>{rows}</tbody></table>
<div class="totals">{totals}</div>
<p class="muted" style="margin-top:32px">Thank you for your order!</p>
</main><button class="print" onclick="window.print()">Print / Save as PDF</button></body></html>"""


def invoice(db: Session, key: str) -> HTMLResponse:
    order = (db.query(Order).options(selectinload(Order.items)).filter(Order.invoice_key == key).first()
             if key and len(key) >= 16 else None)
    if order is None:
        raise HTTPException(404, detail="Invoice not found")
    owner = db.get(Customer, order.customer_id)
    store = db.query(CommerceSettings).filter(CommerceSettings.customer_id == order.customer_id).first()
    e, m = html.escape, (lambda v: service.money(v, order.currency))
    rows = "".join(
        f"<tr><td>{e(i.name)}{f'<br><span class=muted>{e(i.variant_label)}</span>' if i.variant_label else ''}</td>"
        f"<td class=num>{m(i.unit_price)}</td><td class=num>{i.quantity}</td>"
        f"<td class=num>{m(i.unit_price * i.quantity)}</td></tr>" for i in order.items)
    lines = [("Subtotal", m(order.subtotal))]
    if order.discount:
        lines.append((f"Discount ({e(order.coupon_code or '')})", f"−{m(order.discount)}"))
    if order.prepaid_discount:
        lines.append(("Paying online", f"−{m(order.prepaid_discount)}"))
    lines.append(("Delivery", m(order.shipping) if order.shipping else "Free"))
    if order.cod_fee:
        lines.append(("Cash on delivery fee", m(order.cod_fee)))
    if order.tax:
        rate = Decimal(store.tax_percent) / 100 if store else 0
        lines.append((f"Tax {rate:g}%{' (included)' if store and store.tax_inclusive else ''}", m(order.tax)))
    totals = "".join(f"<div><span>{k}</span><span>{v}</span></div>" for k, v in lines)
    totals += f"<div class=grand><span>Total</span><span>{m(order.total)}</span></div>"
    address = orders.address_text(order.address)
    page = INVOICE.format(
        ref=e(orders.order_ref(order, store)),
        store=e((store.store_name if store else None) or owner.business_name or owner.name or "Store"),
        date=(order.confirmed_at or order.placed_at or order.created_at).strftime("%d %b %Y"),
        paid={"paid": "Paid", "partially_refunded": "Partly refunded", "refunded": "Refunded"}.get(
            order.payment_status) or ("Cash on delivery" if order.payment_method == "cod" else "Payment due"),
        paid_class="" if order.payment_status in orders.PAID else "due",
        customer=e(order.customer_name or "Customer"), phone=e(order.customer_phone or ""),
        address=f"<div><p class=muted>Deliver to</p><p>{e(address)}</p></div>" if address else "",
        rows=rows, totals=totals,
    )
    return HTMLResponse(page, headers={"X-Robots-Tag": "noindex"})


def contact_orders(db: Session, owner: Customer, contact_id: int) -> dict:
    exists = db.query(func.count(WaContact.id)).filter(WaContact.id == contact_id,
                                                       WaContact.customer_id == owner.id).scalar()
    if not exists:
        raise HTTPException(404, detail="Contact not found")
    return orders.contact_summary(db, owner, contact_id)
