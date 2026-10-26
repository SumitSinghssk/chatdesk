"""Products sent into a chat: catalog product cards, product lists, the whole catalog, or a photo card.

The first three are WhatsApp's native shopping messages (the customer can open the product and add it to a
cart); they need a connected Meta catalog with the products synced. The photo card works without a catalog:
the product photo, name, price and "Buy now" / "More details" buttons.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import service
from app.modules.customer.commerce.models import Product
from app.modules.customer.commerce.schemas import SendProductsSchema
from app.modules.customer.inbox import service as inbox

MAX_SECTIONS = 10
BUY, INFO = "shop:buy:", "shop:info:"  # button ids a customer's tap comes back with


def _error(message: str, field: str = "product_ids"):
    return HTTPException(422, detail={"message": message, "errors": {field: [message]}})


def _products(db: Session, customer: Customer, ids: list[int]) -> list[Product]:
    rows = (db.query(Product).options(selectinload(Product.variants), selectinload(Product.collection))
            .filter(Product.customer_id == customer.id, Product.id.in_(ids), Product.not_deleted()).all())
    by_id = {p.id: p for p in rows}
    products = [by_id[i] for i in dict.fromkeys(ids) if i in by_id]
    if len(products) != len(set(ids)):
        raise _error("Some of those products don't exist any more")
    return products


def _ready_for_catalog(products: list[Product]) -> None:
    for p in products:
        if p.status != "active":
            raise _error(f"“{p.name}” is {p.status}. Only products shown in the catalog can be sent.")
        if not any(v.sync_state == "synced" for v in p.variants):
            raise _error(f"“{p.name}” isn't in your Meta catalog yet. Wait for the sync, or send it as a photo "
                         "card.")


def _price_line(p: Product, currency: str) -> str:
    v = p.variants[0]
    if v.sale_price is not None:
        return f"*{service.money(v.sale_price, currency)}*  ~{service.money(v.price, currency)}~"
    prices = {x.price for x in p.variants}
    low = service.money(min(prices), currency)
    return f"*{low}*" if len(prices) == 1 else f"From *{low}*"


def build(db: Session, customer: Customer, payload: SendProductsSchema) -> tuple[dict, str, dict]:
    """The Graph API message body, the chat preview text, and what the inbox shows for it."""
    store = service.settings_of(db, customer)
    currency = store.currency
    store_name = store.store_name or customer.business_name or "our store"

    if payload.kind == "catalog":
        if not store.catalog_id:
            raise _error("Connect a Meta catalog in Commerce → Settings to send your catalog", "kind")
        q = (db.query(Product).options(selectinload(Product.variants))
             .filter(Product.customer_id == customer.id, Product.not_deleted(), Product.status == "active"))
        thumb = next((p for p in q.order_by(Product.updated_at.desc()).limit(50)
                      if any(v.sync_state == "synced" for v in p.variants)), None)
        if thumb is None:
            raise _error("No products are in your Meta catalog yet", "kind")
        interactive = {"type": "catalog_message",
                       "body": {"text": payload.body or f"Browse {store_name} and order right here on WhatsApp."},
                       "action": {"name": "catalog_message",
                                  "parameters": {"thumbnail_product_retailer_id": thumb.variants[0].retailer_id}}}
        if payload.footer:
            interactive["footer"] = {"text": payload.footer}
        shown = {"kind": "catalog", "body": interactive["body"]["text"], "products": []}
        return {"type": "interactive", "interactive": interactive}, "🛍️ Catalog", shown

    products = _products(db, customer, payload.product_ids)
    shown = {"kind": payload.kind, "header": payload.header, "body": payload.body, "footer": payload.footer,
             "products": [{"id": p.id, "name": p.name,
                           "price_text": service.serialize_product(p, store)["price_text"],
                           "image_url": service.image_url((p.images or [None])[0])} for p in products]}

    if payload.kind == "card":
        p = products[0]
        if p.status == "draft":
            raise _error(f"“{p.name}” is a draft. Publish it first.")
        lines = [f"*{p.name}*", _price_line(p, currency)]
        if all(v.stock == 0 for v in p.variants):
            lines.append("_Out of stock right now_")
        if p.description:
            lines += ["", p.description[:700]]
        if p.url:
            lines += ["", p.url]
        interactive = {"type": "button", "body": {"text": (payload.body + "\n\n" if payload.body else "")
                                                  + "\n".join(lines)},
                       "action": {"buttons": [{"type": "reply", "reply": {"id": f"{BUY}{p.id}", "title": "Buy now"}},
                                              {"type": "reply", "reply": {"id": f"{INFO}{p.id}",
                                                                          "title": "More details"}}]}}
        image = service.image_url((p.images or [None])[0], absolute=True)
        interactive["header"] = {"type": "image", "image": {"link": image}} if image else \
            {"type": "text", "text": p.name[:60]}
        if payload.footer:
            interactive["footer"] = {"text": payload.footer}
        interactive["body"]["text"] = interactive["body"]["text"][:1024]
        shown["body"] = interactive["body"]["text"]
        return {"type": "interactive", "interactive": interactive}, f"🛍️ {p.name}", shown

    if not store.catalog_id:
        raise _error("Connect a Meta catalog in Commerce → Settings, or send a photo card instead", "kind")
    _ready_for_catalog(products)

    if payload.kind == "product":
        p = products[0]
        interactive = {"type": "product",
                       "action": {"catalog_id": store.catalog_id,
                                  "product_retailer_id": next(v.retailer_id for v in p.variants
                                                              if v.sync_state == "synced")}}
        if payload.body:
            interactive["body"] = {"text": payload.body}
        if payload.footer:
            interactive["footer"] = {"text": payload.footer}
        return {"type": "interactive", "interactive": interactive}, f"🛍️ {p.name}", shown

    # a list, in sections by collection (WhatsApp allows 10 sections and 30 items)
    sections: dict[str, list[dict]] = {}
    for p in products:
        title = (p.collection.name if p.collection else "More")[:24]
        sku = next(v.retailer_id for v in p.variants if v.sync_state == "synced")
        sections.setdefault(title, []).append({"product_retailer_id": sku})
    if len(sections) > MAX_SECTIONS:
        raise _error(f"Products from up to {MAX_SECTIONS} collections can go in one list")
    header = payload.header or f"{store_name}"[:60]
    body = payload.body or "Tap a product to see the details and add it to your cart."
    interactive = {"type": "product_list", "header": {"type": "text", "text": header},
                   "body": {"text": body},
                   "action": {"catalog_id": store.catalog_id,
                              "sections": [{"title": t, "product_items": items} for t, items in sections.items()]}}
    if payload.footer:
        interactive["footer"] = {"text": payload.footer}
    shown.update(header=header, body=body)
    count = len(products)
    return {"type": "interactive", "interactive": interactive}, f"🛍️ {count} product{'' if count == 1 else 's'}", \
        shown


def send(db: Session, customer: Customer, conversation_id: int, payload: SendProductsSchema) -> dict:
    conversation = inbox._conversation(db, customer, conversation_id)
    inbox._guard_contact(conversation)
    if not inbox.window_open(conversation):
        raise HTTPException(422, detail="The 24-hour reply window is closed. Products can be sent once the "
                                        "customer writes again, or use a template.")
    owner = db.get(Customer, conversation.customer_id) or customer
    request, preview, shown = build(db, owner, payload)
    _, client = inbox._client(db, customer)
    message = inbox._outbound(db, customer, conversation, type="interactive", text=preview,
                              payload={"request": request, "commerce": shown})
    wa_id = conversation.contact.wa_id
    return inbox._deliver(db, conversation, message, lambda: client.send({"to": wa_id, **request}))
