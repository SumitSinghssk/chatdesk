"""Keeps a business's products in its Meta (WhatsApp) catalog.

Every variant is one catalog item whose id is its SKU (retailer_id); variants of a product share an
item_group_id so WhatsApp shows them as one product with choices. Changes go to Meta in batches;
Meta processes a batch in the background, so `check_sync` asks how it went and marks each item.
"""
import logging
import re
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings as app_settings
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import service
from app.modules.customer.commerce.models import CommerceSettings, Product, ProductVariant
from app.modules.customer.templates import service as templates_service
from app.services.whatsapp import WhatsAppError
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)

BATCH = 1000
META_ATTRS = {"color": "color", "colour": "color", "size": "size", "material": "material", "pattern": "pattern",
              "gender": "gender"}


def _client(db: Session, customer: Customer):
    return templates_service.client_for(db, customer)


def _meta_error(exc: WhatsAppError) -> str:
    text = exc.details or str(exc)
    if exc.code == 190:
        return "Meta didn't accept your WhatsApp access token (expired or wrong). Update it in WhatsApp setup."
    if exc.code in (10, 200, 294) or "permission" in text.lower():
        return ("Meta refused: the access token needs the catalog_management permission and access to this "
                "catalog. " + text)
    return text


def product_link(product: Product) -> str:
    """The product's own page, or the public page ChatDesk serves for it (Meta requires a link)."""
    if product.url:
        return product.url
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/shop/{product.customer_id}/products/{product.id}"


def item(product: Product, variant: ProductVariant, store: CommerceSettings, brand: str) -> dict:
    images = [service.image_url(i, absolute=True) for i in product.images or []]
    main = service.image_url(variant.image, absolute=True) or (images[0] if images else None)
    data = {
        "id": variant.retailer_id,
        "title": product.name[:150],
        "description": (product.description or product.name)[:9999],
        "availability": "out of stock" if variant.stock == 0 else "in stock",
        "condition": product.condition,
        "price": f"{Decimal(variant.price) / 100:.2f} {store.currency}",
        "link": product_link(product),
        "brand": (product.brand or brand)[:100],
        "visibility": "published" if product.status == "active" else "staging",
    }
    if main:
        data["image_link"] = main
    extra = [i for i in images if i != main][:20]
    if extra:
        data["additional_image_link"] = extra
    if variant.sale_price is not None:
        data["sale_price"] = f"{Decimal(variant.sale_price) / 100:.2f} {store.currency}"
    if variant.stock is not None:
        data["inventory"] = variant.stock
    if len(product.variants) > 1 or product.options:
        data["item_group_id"] = f"P{product.id}"
        for name, value in (variant.option_values or {}).items():
            attr = META_ATTRS.get(name.strip().lower())
            if attr:
                data[attr] = str(value)[:100]
    if product.collection:
        data["product_type"] = product.collection.name[:750]
        data["custom_label_0"] = product.collection.name[:100]
    return data


def _push(db: Session, customer: Customer, store: CommerceSettings, products: list[Product],
          removed: list[str]) -> None:
    requests: list[dict] = []
    variants: list[ProductVariant] = []
    brand = store.store_name or customer.business_name or customer.name or "Store"
    for p in products:
        for v in p.variants:
            if p.status == "draft" or p.deleted_at is not None:
                requests.append({"method": "DELETE", "data": {"id": v.retailer_id}})
                v.sync_state, v.sync_error = "synced", None  # nothing to show on Meta
            else:
                requests.append({"method": "UPDATE", "data": item(p, v, store, brand)})
                variants.append(v)
    requests += [{"method": "DELETE", "data": {"id": sku}} for sku in removed]
    if not requests:
        return
    try:
        _, client = _client(db, customer)
        handles: list[str] = []
        for i in range(0, len(requests), BATCH):
            handles += client.catalog_batch(store.catalog_id, requests[i:i + BATCH])
    except HTTPException as exc:
        error = str(exc.detail)
    except WhatsAppError as exc:
        error = _meta_error(exc)
    else:
        store.sync_handle = handles[-1] if handles else None
        store.last_sync_at, store.sync_error = now(), None
        for v in variants:
            v.sync_state, v.sync_error = "pending", None
        db.commit()
        return
    store.sync_error = error[:2000]
    for v in variants:
        v.sync_state, v.sync_error = "error", error[:500]
    db.commit()


def after_change(db: Session, customer: Customer, products: list[Product], removed: list[str] = (),
                 force: bool = False) -> None:
    """Sends changed products to Meta when a catalog is connected (and auto-sync is on, or forced)."""
    store = service.settings_of(db, customer)
    if not store.catalog_id or not (store.auto_sync or force):
        db.commit()
        return
    _push(db, customer, store, products, list(removed))


def _all_products(db: Session, customer: Customer) -> list[Product]:
    return (db.query(Product).options(selectinload(Product.variants), selectinload(Product.collection))
            .filter(Product.customer_id == customer.id, Product.not_deleted()).all())


def push_all(db: Session, customer: Customer) -> None:
    store = service.settings_of(db, customer)
    if store.catalog_id:
        _push(db, customer, store, _all_products(db, customer), [])


def check_sync(db: Session, customer: Customer) -> dict:
    """Asks Meta how the last batch went and marks each item synced or failed."""
    store = service.settings_of(db, customer)
    if not store.catalog_id or not store.sync_handle:
        return {"status": "idle"}
    try:
        _, client = _client(db, customer)
        result = client.catalog_batch_status(store.catalog_id, store.sync_handle)
    except (HTTPException, WhatsAppError) as exc:
        return {"status": "unknown", "error": getattr(exc, "detail", None) or str(exc)}
    state = str(result.get("status") or "").lower()
    if state not in ("finished", "complete", "completed"):
        return {"status": "in_progress"}
    errors: dict[str, str] = {}
    for e in result.get("errors") or []:
        sku = str(e.get("id") or e.get("retailer_id") or "")
        if sku:
            errors[sku] = str(e.get("message") or "Meta didn't accept this item")[:500]
    pending = (db.query(ProductVariant).filter(ProductVariant.customer_id == customer.id,
                                               ProductVariant.sync_state == "pending").all())
    for v in pending:
        if v.retailer_id in errors:
            v.sync_state, v.sync_error = "error", errors[v.retailer_id]
        else:
            v.sync_state, v.sync_error, v.synced_at = "synced", None, now()
    store.sync_handle = None
    db.commit()
    return {"status": "finished", "errors": len(errors)}


# connection -------------------------------------------------------------------------------

def catalogs(db: Session, customer: Customer) -> dict:
    account, client = _client(db, customer)
    store = service.settings_of(db, customer)
    try:
        found = client.product_catalogs(account.waba_id)
    except WhatsAppError as exc:
        raise HTTPException(422, detail=_meta_error(exc))
    commerce = None
    if store.catalog_id:
        try:
            commerce = client.commerce_settings()
        except WhatsAppError:
            commerce = None
    db.commit()
    return {"status": True, "data": {
        "catalogs": [{"id": str(c.get("id")), "name": c.get("name"), "products": c.get("product_count")}
                     for c in found],
        "commerce": {"cart_enabled": commerce.get("is_cart_enabled"),
                     "catalog_visible": commerce.get("is_catalog_visible")} if commerce else None,
    }}


def apply_commerce_settings(db: Session, customer: Customer, store: CommerceSettings) -> None:
    """Turns the cart and the catalog button on (or off) for the WhatsApp number."""
    try:
        _, client = _client(db, customer)
        client.set_commerce_settings(store.cart_enabled, store.catalog_visible)
    except (HTTPException, WhatsAppError) as exc:
        store.sync_error = (f"Couldn't update the cart setting on WhatsApp: "
                            f"{getattr(exc, 'detail', None) or _meta_error(exc)}")[:2000]
        db.commit()


def connect(db: Session, customer: Customer, catalog_id: str) -> dict:
    account, client = _client(db, customer)
    try:
        client.connect_catalog(account.waba_id, catalog_id)
    except WhatsAppError as exc:
        # already connected is fine; anything else (wrong id, no access) is shown as is
        if "already" not in (exc.details or str(exc)).lower():
            raise HTTPException(422, detail={"message": _meta_error(exc),
                                             "errors": {"catalog_id": [_meta_error(exc)]}})
    try:
        info = client.catalog_info(catalog_id)
    except WhatsAppError:
        info = {}
    store = service.settings_of(db, customer)
    if store.catalog_id and store.catalog_id != catalog_id:
        for v in db.query(ProductVariant).filter(ProductVariant.customer_id == customer.id):
            v.sync_state, v.sync_error = "pending", None
    store.catalog_id = catalog_id
    store.catalog_name = info.get("name") or f"Catalog {catalog_id}"
    store.catalog_connected_at = now()
    store.sync_error = None
    db.commit()
    apply_commerce_settings(db, customer, store)
    push_all(db, customer)
    return {"status": True, "message": f"Connected to {store.catalog_name}",
            "data": service.serialize_settings(store)}


def disconnect(db: Session, customer: Customer) -> dict:
    store = service.settings_of(db, customer)
    if store.catalog_id:
        try:
            account, client = _client(db, customer)
            client.disconnect_catalog(account.waba_id, store.catalog_id)
        except (HTTPException, WhatsAppError) as exc:
            logger.info("Catalog disconnect on Meta failed: %s", exc)
    store.catalog_id = store.catalog_name = store.catalog_connected_at = store.sync_handle = None
    store.sync_error = None
    for v in db.query(ProductVariant).filter(ProductVariant.customer_id == customer.id):
        v.sync_state, v.sync_error = "pending", None
    db.commit()
    return {"status": True, "message": "Catalog disconnected. Your products are kept in ChatDesk.",
            "data": service.serialize_settings(store)}


def sync_now(db: Session, customer: Customer) -> dict:
    store = service.settings_of(db, customer)
    if not store.catalog_id:
        raise HTTPException(422, detail="Connect a Meta catalog first")
    push_all(db, customer)
    return {"status": not store.sync_error, "message": store.sync_error or "Sending your products to Meta…",
            "data": service.serialize_settings(store)}


# import -----------------------------------------------------------------------------------

def parse_price(text, currency: str | None = None) -> int | None:
    """Meta returns prices as text, e.g. "₹1,499.00" or "12.50 USD"."""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return int(round(float(text) * 100))
    cleaned = re.sub(r"[^\d.,]", "", str(text))
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    elif cleaned.count(",") == 1 and len(cleaned.split(",")[1]) == 2:
        cleaned = cleaned.replace(",", ".")  # 12,50
    else:
        cleaned = cleaned.replace(",", "")
    try:
        return int((Decimal(cleaned) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError):
        return None


def import_catalog(db: Session, customer: Customer) -> dict:
    """Brings products that are already in the Meta catalog into ChatDesk (existing SKUs are left alone)."""
    store = service.settings_of(db, customer)
    if not store.catalog_id:
        raise HTTPException(422, detail="Connect a Meta catalog first")
    _, client = _client(db, customer)
    try:
        items = client.catalog_products(store.catalog_id)
    except WhatsAppError as exc:
        raise HTTPException(422, detail=_meta_error(exc))
    known = {sku.lower() for (sku,) in db.query(ProductVariant.retailer_id)
             .filter(ProductVariant.customer_id == customer.id)}
    groups: dict[str, list[dict]] = {}
    for it in items:
        sku = str(it.get("retailer_id") or it.get("id") or "")
        if not sku or sku.lower() in known:
            continue
        group = str(it.get("retailer_product_group_id") or f"single:{sku}")
        groups.setdefault(group, []).append({**it, "retailer_id": sku})
    created = 0
    for members in groups.values():
        first = members[0]
        images = [u for u in [first.get("image_url"), *(first.get("additional_image_urls") or [])] if u][:10]
        option_names = [n for n in ("color", "size") if len({m.get(n) for m in members if m.get(n)}) > 0
                        and len(members) > 1]
        product = Product(customer_id=customer.id, name=str(first.get("name") or first["retailer_id"])[:200],
                          description=first.get("description"), brand=(first.get("brand") or None),
                          images=images, url=first.get("url"), source="meta",
                          status="hidden" if str(first.get("visibility") or "").lower() in ("staging", "hidden")
                          else "active",
                          options=[{"name": n.capitalize(), "values": list(dict.fromkeys(
                              str(m.get(n)) for m in members if m.get(n)))} for n in option_names])
        for position, m in enumerate(members):
            values = {n.capitalize(): str(m.get(n)) for n in option_names if m.get(n)}
            if option_names and set(values) != {n.capitalize() for n in option_names}:
                continue
            price = parse_price(m.get("price")) or 0
            sale = parse_price(m.get("sale_price"))
            product.variants.append(ProductVariant(
                customer_id=customer.id, retailer_id=m["retailer_id"][:100], option_values=values, price=price,
                sale_price=sale if sale is not None and sale < price else None,
                stock=0 if str(m.get("availability") or "").lower().startswith("out") else
                (m.get("inventory") if isinstance(m.get("inventory"), int) else None),
                image=None, position=position, sync_state="synced", synced_at=now()))
        if product.variants:
            db.add(product)
            created += 1
    db.commit()
    return {"status": True, "message": f"Imported {created} product{'' if created == 1 else 's'} from Meta",
            "data": {"created": created, "found": len(items)}}
