"""The chatbot's Shop block, and the shop facts chatbot conditions can check.

A Shop block shows the catalog or some products, asks for payment (the customer's unpaid order, or a fixed
amount), or tells the customer how their latest order is doing. In the builder's test chat nothing is sent,
created or charged: each step is described instead.
"""
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.modules.customer.commerce import orders, service
from app.modules.customer.commerce.models import Order, OrderItem
from app.modules.customer.inbox.models import WaContact

UNPAID_DAYS = 14  # how far back "your unpaid order" looks


def _detail(exc: HTTPException) -> str:
    return exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail)


def contact_id(rt) -> int | None:
    """The real contact (the test chat matches the tester's phone to a contact, if there is one)."""
    if getattr(rt.contact, "id", None):
        return rt.contact.id
    if not rt.contact.wa_id:
        return None
    digits = "".join(ch for ch in rt.contact.wa_id if ch.isdigit())
    row = (rt.db.query(WaContact.id).filter(WaContact.customer_id == rt.owner.id, WaContact.wa_id == digits)
           .first())
    return row[0] if row else None


def _orders(db: Session, owner_id: int, cid: int | None):
    return (db.query(Order).options(selectinload(Order.items))
            .filter(Order.customer_id == owner_id, Order.contact_id == cid) if cid else None)


def latest(db: Session, owner_id: int, cid: int | None) -> Order | None:
    q = _orders(db, owner_id, cid)
    return q.order_by(Order.id.desc()).first() if q is not None else None


def unpaid(db: Session, owner_id: int, cid: int | None) -> Order | None:
    from datetime import timedelta

    from app.shared.utils.datetime import now

    q = _orders(db, owner_id, cid)
    if q is None:
        return None
    return (q.filter(Order.payment_status == "unpaid", Order.status.notin_(("cancelled", "delivered")),
                     Order.created_at >= now() - timedelta(days=UNPAID_DAYS))
            .order_by(Order.id.desc()).first())


def field(rt, name: str):
    """shop:orders · shop:spent · shop:last_status · shop:unpaid, for conditions."""
    cid = contact_id(rt)
    if cid is None:
        return {"shop:orders": 0, "shop:spent": 0, "shop:unpaid": "no"}.get(name)
    live = (rt.db.query(Order).filter(Order.customer_id == rt.owner.id, Order.contact_id == cid,
                                      Order.status != "cancelled", Order.confirmed_at.isnot(None)))
    if name == "shop:orders":
        return live.count()
    if name == "shop:spent":
        total = live.with_entities(func.coalesce(func.sum(Order.total), 0)).scalar() or 0
        return float(service.to_major(int(total)))
    if name == "shop:last_status":
        last = latest(rt.db, rt.owner.id, cid)
        return last.status if last else None
    if name == "shop:unpaid":
        return "yes" if unpaid(rt.db, rt.owner.id, cid) else "no"
    return None


def _remember(rt, order: Order) -> None:
    store = service.settings_of(rt.db, rt.owner)
    rt.st.variables.update({"order_ref": orders.order_ref(order, store), "order_total": orders.total_text(order),
                            "order_status": orders.STATUS_LABELS.get(order.status, order.status)})


def run(rt, node_id: str, data: dict) -> str:
    """Runs a Shop block; returns the output to follow."""
    action = data.get("action") or "products"
    if action in ("catalog", "products"):
        return _products(rt, node_id, data, action)
    if action == "payment":
        return _payment(rt, node_id, data)
    return _order_status(rt, node_id, data)


def _products(rt, node_id: str, data: dict, action: str) -> str:
    from app.modules.customer.commerce import messages
    from app.modules.customer.commerce.schemas import SendProductsSchema

    store = service.settings_of(rt.db, rt.owner)
    ids = [int(i) for i in data.get("product_ids") or []]
    header, body, footer = rt.fill(data.get("header")) or None, rt.fill(data.get("text")) or None, \
        rt.fill(data.get("footer")) or None
    try:
        if action == "catalog":
            payloads = [SendProductsSchema(kind="catalog", body=body, footer=footer)]
        elif data.get("style") == "cards":
            payloads = [SendProductsSchema(kind="card", product_ids=[i], body=body if n == 0 else None,
                                           footer=footer) for n, i in enumerate(ids[:5])]
        elif not store.catalog_id:
            raise HTTPException(422, detail="Connect a Meta catalog in Commerce → Settings to send a product "
                                            "list, or choose photo cards")
        else:
            payloads = [SendProductsSchema(kind="product" if len(ids) == 1 else "products", product_ids=ids,
                                           header=header, body=body, footer=footer)]
        built = [messages.build(rt.db, rt.owner, p) for p in payloads]
    except (HTTPException, ValueError) as exc:
        reason = _detail(exc) if isinstance(exc, HTTPException) else str(exc)
        rt.note(node_id, f"Couldn't show the products: {reason}", "error")
        return "fail"
    for request, preview, shown in built:
        rt.send_built(node_id, request, preview, shown)
    return "out"


def _payment(rt, node_id: str, data: dict) -> str:
    from app.modules.customer.commerce import payments

    db, owner = rt.db, rt.owner
    store = service.settings_of(db, owner)
    cid = contact_id(rt)
    order = unpaid(db, owner.id, cid)
    amount = data.get("amount")
    if order is None and not amount:
        rt.note(node_id, "No unpaid order to collect payment for", "note")
        return "none"
    if not payments.online_ready(db, owner, store, getattr(rt, "conversation", None)):
        rt.note(node_id, "No payment gateway is connected (Commerce → Payments)", "error")
        return "none"
    if rt.simulated:
        what = (f"order {orders.order_ref(order, store)} ({orders.total_text(order)})" if order else
                f"{data.get('item_name') or 'a payment'} of {service.money(service.to_minor(Decimal(str(amount))), store.currency)}")
        rt.note(node_id, f"In a real chat: sends a payment link for {what}", "action")
        if order is not None:
            _remember(rt, order)
        return "sent"
    if order is None:
        item = OrderItem(name=(data.get("item_name") or "Payment")[:200],
                         unit_price=service.to_minor(Decimal(str(amount))), quantity=1)
        order = orders.new_order(db, owner, rt.contact, [item], "chatbot", "awaiting_payment",
                                 actor=f"Chatbot “{rt.bot.name}”")
        db.flush()
    try:
        payments.request_payment(db, owner, order, f"Chatbot “{rt.bot.name}”")
    except HTTPException as exc:
        rt.note(node_id, f"Couldn't send the payment link: {_detail(exc)}", "error")
        return "none"
    _remember(rt, order)
    return "sent"


def status_text(order: Order, store) -> str:
    ref = orders.order_ref(order, store)
    lines = [f"📦 *Order {ref}* · {orders.total_text(order)}",
             f"Status: *{orders.STATUS_LABELS.get(order.status, order.status)}*"]
    if order.status == "shipped":
        if order.courier:
            lines.append(f"Courier: {order.courier}")
        if order.tracking_number:
            lines.append(f"Tracking number: {order.tracking_number}")
        if order.tracking_url:
            lines.append(f"Track it: {order.tracking_url}")
    pay = {"paid": "Paid", "partially_refunded": "Partly refunded", "refunded": "Refunded"}.get(order.payment_status)
    if not pay:
        pay = "Cash on delivery" if order.payment_method == "cod" else "Not paid yet"
    lines.append(f"Payment: {pay}")
    if order.items:
        lines += ["", orders.items_text(order)]
    return "\n".join(lines)


def _order_status(rt, node_id: str, data: dict) -> str:
    store = service.settings_of(rt.db, rt.owner)
    order = latest(rt.db, rt.owner.id, contact_id(rt))
    if order is None:
        if rt.simulated:
            rt.note(node_id, "This tester has no orders: the “No orders” path follows", "note")
        return "none"
    _remember(rt, order)
    lead = rt.fill(data.get("text"))
    text = status_text(order, store)
    rt.send(node_id, {"type": "text", "text": f"{lead}\n\n{text}" if lead else text})
    return "found"
