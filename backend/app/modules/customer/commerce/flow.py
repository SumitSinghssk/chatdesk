"""Checkout inside WhatsApp.

A cart the customer sends from the catalog, or a Buy now tap on a photo card, becomes an order. Then:
address (WhatsApp's address form for Indian numbers, otherwise a typed reply, or the last address used),
an order summary with the total and how to pay (online, through the business's payment gateway or WhatsApp
Pay, or cash on delivery), and coupon codes typed into the chat. Cash-on-delivery buyers can be asked to
confirm, and offered a discount to pay now. Each step is a message from "Shop" in the chat.
"""
import json
import logging
import re
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session, selectinload

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import orders, service
from app.modules.customer.commerce.messages import BUY, INFO
from app.modules.customer.commerce.models import Order, Product, ProductVariant
from app.modules.customer.inbox.models import WaConversation, WaMessage
from app.services.whatsapp import WhatsAppClient
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)

SENDER = "Shop"
VARIANT = "shop:var:"
PAY_COD = "shop:cod:"
CANCEL = "shop:cancel:"
SAME_ADDRESS = "shop:addr:same:"
NEW_ADDRESS = "shop:addr:new:"
PAY_ONLINE = "shop:pay:"
NEW_LINK = "shop:link:"  # after a link expired
PREPAY = "shop:prepay:"  # a cash-on-delivery order paid now instead
COD_YES = "shop:codok:"
COD_NO = "shop:codno:"
RESUME = "shop:resume:"  # "Complete order" on an abandoned-cart reminder
RESUME_WORDS = re.compile(r"^\W*(complete|finish|continue|order|buy|yes)\b", re.I)
YES_WORDS = re.compile(r"^\W*(yes|confirm|confirmed|ok|okay|haan|ha|done)\b", re.I)
NO_WORDS = re.compile(r"^\W*(no|cancel|don'?t|nahi|nahin)\b", re.I)
PENDING_DAYS = 3  # how long an unfinished checkout waits for the customer
COUPON_RE = re.compile(r"^[A-Za-z0-9_-]{3,30}$")


# sending ----------------------------------------------------------------------------------

def _send(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation, payload: dict,
          text: str, order: Order | None = None) -> WaMessage:
    from app.modules.customer.inbox import service as inbox

    raw = {"request": payload, "auto_reply": {"id": None, "name": "Shop"}}
    if order is not None:
        raw["order"] = {"id": order.id, "ref": orders.order_ref(order)}
    action = (payload.get("interactive") or {}).get("action") or {}
    if action.get("buttons"):
        raw["template"] = {"header_format": None,
                           "buttons": [{"type": "quick_reply", "text": b["reply"]["title"]} for b in action["buttons"]]}
    elif action.get("name") == "cta_url":
        cta = action.get("parameters") or {}
        raw["template"] = {"header_format": None,
                           "buttons": [{"type": "url", "text": cta.get("display_text"), "url": cta.get("url")}]}
    message = inbox._outbound(db, owner, conversation, sent_by=SENDER, type=payload["type"], text=text, payload=raw)
    message.member_id = None  # automatic: not a team reply
    wa_id = conversation.contact.wa_id
    inbox._attempt(db, conversation, message, lambda: client.send({"to": wa_id, **payload}), reopen=False)
    return message


def _text(db, owner, client, conversation, text: str, order: Order | None = None) -> WaMessage:
    return _send(db, owner, client, conversation, {"type": "text", "text": {"body": text[:4096]}}, text, order)


def _buttons(db, owner, client, conversation, body: str, buttons: list[tuple[str, str]],
             order: Order | None = None, footer: str | None = None) -> WaMessage:
    interactive = {"type": "button", "body": {"text": body[:1024]},
                   "action": {"buttons": [{"type": "reply", "reply": {"id": i, "title": t[:20]}}
                                          for i, t in buttons[:3]]}}
    if footer:
        interactive["footer"] = {"text": footer[:60]}
    return _send(db, owner, client, conversation, {"type": "interactive", "interactive": interactive}, body, order)


def client_for(db: Session, owner: Customer) -> WhatsAppClient:
    from app.modules.customer.inbox import service as inbox

    return inbox._client(db, owner)[1]


def tell(db: Session, owner: Customer, conversation: WaConversation, order: Order, text: str,
         template_id: int | None = None, step: str | None = None, interactive: dict | None = None,
         detail: str | None = None, button_value: str | None = None) -> str:
    """An order update for the customer: `interactive` (or `text`) inside the 24-hour window, otherwise the
    template, filled with [first name, order number, detail] and `button_value` for a link button.
    Returns what happened, for the order's timeline."""
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.templates.models import WaTemplate

    client = client_for(db, owner)
    if inbox.window_open(conversation):
        if interactive:
            message = _send(db, owner, client, conversation, {"type": "interactive", "interactive": interactive},
                            text, order)
        else:
            message = _text(db, owner, client, conversation, text, order)
        return "WhatsApp update sent" if message.status == "sent" else f"WhatsApp update failed: {message.error_message}"
    template = db.get(WaTemplate, template_id) if template_id else None
    if template is None or template.customer_id != owner.id or template.status != "approved":
        return "Not messaged: the 24-hour window is closed. Choose a template for this step in Commerce settings."
    contact = conversation.contact
    first = (contact.name or contact.profile_name or "there").split()[0]
    if detail is None:
        detail = {"shipped": order.tracking_url or order.tracking_number or order.courier or "",
                  "confirmed": orders.total_text(order)}.get(step or "", orders.total_text(order))
    from app.modules.customer.templates import builder
    from app.modules.customer.templates import service as templates_service

    needs = builder.send_params(templates_service.form_of(template))
    values = ([first, orders.order_ref(order), detail or "-"] + ["-"] * 10)[:len(needs["body"])]
    buttons = {b["index"]: button_value or orders.order_ref(order) for b in needs["buttons"]}
    prepared = inbox.prepare_template(db, owner, client, template, header=[], body=values, buttons=buttons)
    message, _ = inbox.send_prepared(db, owner, conversation, template, prepared, client, sent_by=SENDER)
    return (f"Template “{template.name}” sent" if message.status == "sent"
            else f"Template “{template.name}” failed: {message.error_message}")


# the steps --------------------------------------------------------------------------------

def _ask_address(db, owner, client, conversation, order: Order) -> None:
    contact = conversation.contact
    ref = orders.order_ref(order, service.settings_of(db, owner))
    saved = orders.last_address(db, owner.id, contact.id)
    if saved:
        _buttons(db, owner, client, conversation,
                 f"📍 Where should we deliver order {ref}?\n\nLast time: {orders.address_text(saved)}",
                 [(f"{SAME_ADDRESS}{order.id}", "Same address"), (f"{NEW_ADDRESS}{order.id}", "New address")],
                 order)
        return
    _address_form(db, owner, client, conversation, order)


def _address_form(db, owner, client, conversation, order: Order) -> None:
    contact = conversation.contact
    ref = orders.order_ref(order, service.settings_of(db, owner))
    if contact.wa_id.startswith("91"):
        # WhatsApp's own address form (India)
        values = {"name": (contact.name or contact.profile_name or "")[:100], "phone_number": contact.wa_id[-10:]}
        interactive = {"type": "address_message",
                       "body": {"text": f"📍 Please share the delivery address for order {ref}."},
                       "action": {"name": "address_message",
                                  "parameters": {"country": "IN", "values": values}}}
        _send(db, owner, client, conversation, {"type": "interactive", "interactive": interactive},
              f"📍 Asked for the delivery address ({ref})", order)
        return
    _text(db, owner, client, conversation,
          f"📍 Please reply with the delivery address for order {ref}: house and street, city and postcode.",
          order)


def _summary(db, owner, client, conversation, order: Order) -> None:
    """The total and how to pay. Shown again after a coupon is applied."""
    store = service.settings_of(db, owner)
    orders.reprice(db, order, store)
    ref = orders.order_ref(order, store)
    lines = [f"🧾 *Order {ref}*", "", orders.items_text(order), "", orders.totals_text(order, store)]
    if order.address:
        lines += ["", f"📍 {orders.address_text(order.address)}"]
    if store.min_order and order.subtotal < store.min_order:
        lines += ["", f"The minimum order is {service.money(store.min_order, order.currency)}. "
                      "Add a few more items to your cart and send it again."]
        _text(db, owner, client, conversation, "\n".join(lines), order)
        db.commit()
        return
    from app.modules.customer.commerce import payments

    options = []
    if payments.online_ready(db, owner, store, conversation):
        online, saving = payments.quote(db, order, store)
        options.append((f"{PAY_ONLINE}{order.id}", "Pay online"))
        if saving:
            lines += ["", f"💳 Pay online: *{service.money(online, order.currency)}* "
                          f"(you save {service.money(saving, order.currency)})"]
    if store.cod_enabled:
        options.append((f"{PAY_COD}{order.id}", "Cash on delivery"))
        if store.cod_fee:
            lines += ["", f"Cash on delivery adds a fee of {service.money(store.cod_fee, order.currency)}."]
    if not options:
        lines += ["", "We'll send you the payment details shortly."]
        _text(db, owner, client, conversation, "\n".join(lines), order)
        db.commit()
        return
    options.append((f"{CANCEL}{order.id}", "Cancel order"))
    lines += ["", "How would you like to pay?"]
    _buttons(db, owner, client, conversation, "\n".join(lines), options, order,
             footer="Have a coupon? Reply with the code")
    db.commit()


def proceed(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation,
            order: Order) -> None:
    """The next checkout message for the order's current step."""
    if order.status == "awaiting_address":
        _ask_address(db, owner, client, conversation, order)
    elif order.status == "awaiting_payment":
        _summary(db, owner, client, conversation, order)
    db.commit()


def _start(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation,
           items, source: str, message: WaMessage, note: str | None = None) -> Order:
    from app.modules.customer.account import notify
    from app.modules.customer.team.assign import event

    store = service.settings_of(db, owner)
    contact = conversation.contact
    status = "awaiting_address" if store.ask_address else "awaiting_payment"
    order = orders.new_order(db, owner, contact, items, source, status, actor=contact.name or contact.profile_name,
                             message_id=message.id, note=note)
    ref = orders.order_ref(order, store)
    event(db, conversation, "order", f"Order {ref} placed ({orders.total_text(order)})",
          contact.name or contact.profile_name)
    notify.new_order(db, order, contact.name or contact.profile_name or f"+{contact.wa_id}")
    db.commit()
    proceed(db, owner, client, conversation, order)
    return order


def _cart_items(db: Session, owner: Customer, raw_items: list[dict]) -> list:
    """OrderItems for a WhatsApp cart: products matched by SKU (unknown ones keep Meta's name and price)."""
    skus = [str(i.get("product_retailer_id") or "") for i in raw_items]
    variants = {v.retailer_id: v for v in (
        db.query(ProductVariant).options(selectinload(ProductVariant.product))
        .filter(ProductVariant.customer_id == owner.id, ProductVariant.retailer_id.in_(skus)).all())}
    from app.modules.customer.commerce.models import OrderItem

    items = []
    for i in raw_items:
        sku = str(i.get("product_retailer_id") or "")
        qty = max(1, int(i.get("quantity") or 1))
        try:
            price = int((Decimal(str(i.get("item_price") or 0)) * 100).quantize(Decimal("1")))
        except (InvalidOperation, ValueError):
            price = 0
        variant = variants.get(sku)
        if variant is not None and variant.product.deleted_at is None:
            items.append(orders.item_from_variant(variant, qty, price or None))
        else:
            items.append(OrderItem(retailer_id=sku, name=sku or "Item", unit_price=price, quantity=qty))
    return items


def _pending(db: Session, owner: Customer, conversation: WaConversation, *statuses: str) -> Order | None:
    from datetime import timedelta

    return (db.query(Order).options(selectinload(Order.items))
            .filter(Order.customer_id == owner.id, Order.conversation_id == conversation.id,
                    Order.status.in_(statuses or orders.CHECKOUT), Order.external_id.is_(None),
                    Order.created_at >= now() - timedelta(days=PENDING_DAYS))
            .order_by(Order.id.desc()).first())


def _order_of(db: Session, owner: Customer, conversation: WaConversation, order_id: str) -> Order | None:
    if not order_id.isdigit():
        return None
    return (db.query(Order).options(selectinload(Order.items))
            .filter(Order.id == int(order_id), Order.customer_id == owner.id,
                    Order.conversation_id == conversation.id).first())


def _parse_address(response: dict) -> dict:
    v = response.get("values") or response
    pick = lambda *keys: next((str(v[k]).strip() for k in keys if v.get(k)), None)  # noqa: E731
    return {k: val for k, val in {
        "name": pick("name"), "phone": pick("phone_number", "phone"),
        "line1": pick("house_number", "address", "address_line1"),
        "line2": pick("floor_number", "building_name", "address_line2", "tower_number"),
        "landmark": pick("landmark_area", "landmark"), "city": pick("city"), "state": pick("state"),
        "pincode": pick("in_pin_code", "pin_code", "postal_code", "pincode"), "country": pick("country") or "IN",
    }.items() if val}


def _set_address(db, owner, client, conversation, order: Order, address: dict, how: str) -> None:
    order.address = address
    order.status = "awaiting_payment"
    orders.log(db, order, "address", f"Address {how}: {orders.address_text(address)}",
               conversation.contact.name or conversation.contact.profile_name)
    db.commit()
    proceed(db, owner, client, conversation, order)


def _variant_list(db, owner, client, conversation, product: Product) -> None:
    store = service.settings_of(db, owner)
    rows = [v for v in product.variants if v.stock != 0][:10]
    if not rows:
        _text(db, owner, client, conversation, f"Sorry, {product.name} is out of stock right now.")
        return
    interactive = {"type": "list", "body": {"text": f"Which {product.name} would you like?"},
                   "action": {"button": "Choose",
                              "sections": [{"title": product.name[:24], "rows": [
                                  {"id": f"{VARIANT}{v.id}", "title": (service.variant_label(v) or v.retailer_id)[:24],
                                   "description": service.money(v.sale_price if v.sale_price is not None else v.price,
                                                                store.currency)}
                                  for v in rows]}]}}
    _send(db, owner, client, conversation, {"type": "interactive", "interactive": interactive},
          f"Asked which {product.name}")


def _details(db, owner, client, conversation, product: Product) -> None:
    store = service.settings_of(db, owner)
    prices = [v.sale_price if v.sale_price is not None else v.price for v in product.variants]
    low = service.money(min(prices), store.currency) if prices else ""
    lines = [f"*{product.name}*", (f"From *{low}*" if len(set(prices)) > 1 else f"*{low}*")]
    lines += [f"{o['name']}: {', '.join(o['values'])}" for o in product.options or []]
    if all(v.stock == 0 for v in product.variants):
        lines.append("_Out of stock right now_")
    if product.description:
        lines += ["", product.description[:900]]
    if product.url:
        lines += ["", product.url]
    _buttons(db, owner, client, conversation, "\n".join(lines), [(f"{BUY}{product.id}", "Buy now")])


def _product(db: Session, owner: Customer, product_id: str) -> Product | None:
    if not product_id.isdigit():
        return None
    return (db.query(Product).options(selectinload(Product.variants))
            .filter(Product.id == int(product_id), Product.customer_id == owner.id, Product.not_deleted()).first())


def _already(db, owner, client, conversation, order: Order) -> None:
    state = orders.STATUS_LABELS[order.status].lower()
    paid = " and paid" if order.payment_status in orders.PAID and order.status != "cancelled" else ""
    _text(db, owner, client, conversation, f"Order {orders.order_ref(order)} is {state}{paid}.", order)


def _pay_online(db, owner, client, conversation, order: Order, actor: str | None, prepaid: bool = False) -> None:
    """The customer chose to pay online: a payment link (or WhatsApp Pay) for the order."""
    from fastapi import HTTPException

    from app.modules.customer.commerce import payments

    waiting = order.status == "awaiting_payment" if not prepaid else (
        order.status in ("confirmed", "packed", "shipped") and order.payment_method == "cod")
    if not waiting or order.payment_status != "unpaid":
        _already(db, owner, client, conversation, order)
        return
    try:
        payments.request_payment(db, owner, order, actor or "Customer", purpose="prepaid" if prepaid else "checkout")
    except HTTPException as exc:
        logger.warning("Order %s: no payment link: %s", order.id, exc.detail)
        db.rollback()
        store = service.settings_of(db, owner)
        cod = " You can still choose cash on delivery." if store.cod_enabled and not prepaid else ""
        _text(db, owner, client, conversation, f"Sorry, online payment isn't working right now.{cod}", order)
        if order.status == "awaiting_payment" and store.cod_enabled:
            _summary(db, owner, client, conversation, order)


def _cod_waiting(db: Session, owner: Customer, conversation: WaConversation) -> Order | None:
    from datetime import timedelta

    return (db.query(Order).options(selectinload(Order.items))
            .filter(Order.customer_id == owner.id, Order.conversation_id == conversation.id,
                    Order.cod_check == "pending", Order.status.in_(("confirmed", "packed")),
                    Order.confirmed_at >= now() - timedelta(days=3))
            .order_by(Order.id.desc()).first())


def _cod_answer(db, owner, client, conversation, order: Order, yes: bool, actor: str | None) -> None:
    if order.cod_check != "pending" or order.status not in ("confirmed", "packed"):
        _already(db, owner, client, conversation, order)
        return
    order.cod_checked_at = now()
    ref = orders.order_ref(order, service.settings_of(db, owner))
    if yes:
        order.cod_check = "confirmed"
        orders.log(db, order, "status", "The customer confirmed the cash-on-delivery order", actor)
        db.commit()
        _text(db, owner, client, conversation,
              f"👍 Thank you! Order {ref} is confirmed. We'll message you when it ships.", order)
        return
    order.cod_check = "declined"
    db.commit()
    orders.change_status(db, owner, order, "cancel", actor, reason="The customer declined the order")


def _reply_id(message: WaMessage) -> str:
    raw = message.payload or {}
    inter = raw.get("interactive") or {}
    reply = inter.get("button_reply") or inter.get("list_reply") or {}
    return str(reply.get("id") or (raw.get("button") or {}).get("payload") or "")


def takes(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation,
          message: WaMessage) -> bool:
    """Handles the message if it's part of shopping. True: it was (nothing else should answer it)."""
    raw = message.payload or {}
    actor = conversation.contact.name or conversation.contact.profile_name

    if message.type == "order":
        cart = raw.get("order") or {}
        items = _cart_items(db, owner, cart.get("product_items") or [])
        if items:
            _start(db, owner, client, conversation, items, "whatsapp_cart", message, cart.get("text"))
        return True

    reply = _reply_id(message)
    if reply.startswith("shop:"):
        kind, _, rest = reply.rpartition(":")
        prefix = kind + ":"
        if prefix == BUY:
            product = _product(db, owner, rest)
            if product is None:
                _text(db, owner, client, conversation, "Sorry, that product isn't available any more.")
            elif len([v for v in product.variants]) > 1:
                _variant_list(db, owner, client, conversation, product)
            elif product.variants and product.variants[0].stock != 0:
                _start(db, owner, client, conversation, [orders.item_from_variant(product.variants[0], 1)],
                       "buy_button", message)
            else:
                _text(db, owner, client, conversation, f"Sorry, {product.name} is out of stock right now.")
        elif prefix == INFO:
            product = _product(db, owner, rest)
            if product is not None:
                _details(db, owner, client, conversation, product)
        elif prefix == VARIANT and rest.isdigit():
            variant = (db.query(ProductVariant).options(selectinload(ProductVariant.product))
                       .filter(ProductVariant.id == int(rest), ProductVariant.customer_id == owner.id).first())
            if variant is None or variant.product.deleted_at is not None or variant.stock == 0:
                _text(db, owner, client, conversation, "Sorry, that one isn't available right now.")
            else:
                _start(db, owner, client, conversation, [orders.item_from_variant(variant, 1)], "buy_button",
                       message)
        elif prefix == PAY_COD:
            order = _order_of(db, owner, conversation, rest)
            if order is not None and order.status == "awaiting_payment":
                from app.modules.customer.commerce import meta, payments

                payments.close_open(db, owner, order)
                orders.confirm(db, owner, order, actor, method="cod")
                order.cod_check = "confirmed"  # they chose it themselves just now
                db.commit()
                meta.after_change(db, owner, orders._products_of(db, order))
                orders.notify(db, owner, order, "confirmed")
                payments.offer_prepaid(db, owner, order)
            elif order is not None:
                _already(db, owner, client, conversation, order)
        elif prefix in (PAY_ONLINE, NEW_LINK, PREPAY):
            order = _order_of(db, owner, conversation, rest)
            if order is not None:
                _pay_online(db, owner, client, conversation, order, actor, prepaid=prefix == PREPAY)
        elif prefix == RESUME:
            order = _order_of(db, owner, conversation, rest)
            if order is not None and order.status in orders.CHECKOUT:
                orders.log(db, order, "status", "The customer came back to finish the order", actor)
                db.commit()
                proceed(db, owner, client, conversation, order)
            elif order is not None:
                _already(db, owner, client, conversation, order)
        elif prefix in (COD_YES, COD_NO):
            order = _order_of(db, owner, conversation, rest)
            if order is not None:
                _cod_answer(db, owner, client, conversation, order, prefix == COD_YES, actor)
        elif prefix == CANCEL:
            order = _order_of(db, owner, conversation, rest)
            if order is not None and order.status in orders.CHECKOUT:
                orders.change_status(db, owner, order, "cancel", actor, reason="Cancelled by the customer")
        elif prefix in (SAME_ADDRESS, NEW_ADDRESS):
            order = _order_of(db, owner, conversation, rest)
            if order is not None and order.status == "awaiting_address":
                saved = orders.last_address(db, owner.id, conversation.contact.id)
                if prefix == SAME_ADDRESS and saved:
                    _set_address(db, owner, client, conversation, order, saved, "same as last time")
                else:
                    _address_form(db, owner, client, conversation, order)
        return True

    # WhatsApp's address form
    inter = raw.get("interactive") or {}
    nfm = inter.get("nfm_reply") or {}
    if inter.get("type") == "nfm_reply" and (nfm.get("name") in (None, "address_message")):
        order = _pending(db, owner, conversation, "awaiting_address")
        if order is not None:
            try:
                response = json.loads(nfm.get("response_json") or "{}")
            except ValueError:
                response = {}
            address = _parse_address(response)
            if address:
                _set_address(db, owner, client, conversation, order, address, "shared")
                return True

    # a template's quick reply (Confirm / Cancel) while a cash-on-delivery order waits for an answer
    if message.type == "button":
        word = str((raw.get("button") or {}).get("text") or message.text or "")
        order = _cod_waiting(db, owner, conversation)
        if order is not None and (YES_WORDS.match(word) or NO_WORDS.match(word)):
            _cod_answer(db, owner, client, conversation, order, bool(YES_WORDS.match(word)), actor)
            return True
        # a cart reminder's template: "Complete order"
        cart = _pending(db, owner, conversation)
        if cart is not None and cart.recovery_sent and RESUME_WORDS.match(word):
            orders.log(db, cart, "status", "The customer came back to finish the order", actor)
            db.commit()
            proceed(db, owner, client, conversation, cart)
            return True
        return False

    if message.type != "text" or not message.text:
        return False
    text = message.text.strip()

    # a typed yes / no to a cash-on-delivery confirmation
    asking = _cod_waiting(db, owner, conversation)
    if asking is not None and len(text) <= 30 and (YES_WORDS.match(text) or NO_WORDS.match(text)):
        _cod_answer(db, owner, client, conversation, asking, bool(YES_WORDS.match(text)), actor)
        return True

    # a typed address while one is expected (it should have a number: house or postcode)
    waiting = _pending(db, owner, conversation, "awaiting_address")
    if waiting is not None and len(text) >= 15 and re.search(r"\d", text):
        _set_address(db, owner, client, conversation, waiting, {"line1": text[:500]}, "typed")
        return True

    # a coupon code while the customer is choosing how to pay
    paying = _pending(db, owner, conversation, "awaiting_payment")
    if paying is not None and COUPON_RE.match(text):
        coupon = orders.find_coupon(db, owner.id, text)
        if coupon is not None:
            problem = orders.coupon_problem(db, owner.id, coupon, paying.subtotal, paying.contact_id, paying.id)
            if problem:
                _text(db, owner, client, conversation, f"{problem}.", paying)
            else:
                paying.coupon_code = coupon.code
                orders.log(db, paying, "edit", f"Coupon {coupon.code} applied", actor)
                db.commit()
                _text(db, owner, client, conversation, f"🎉 Coupon *{coupon.code}* applied!", paying)
                _summary(db, owner, client, conversation, paying)
            return True
    return False
