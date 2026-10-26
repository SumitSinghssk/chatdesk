"""Products, variants, collections and the store settings of a business."""
import re
import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings as app_settings
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce.models import CommerceSettings, Product, ProductCollection, ProductVariant
from app.modules.customer.commerce.schemas import BulkSchema, CollectionSchema, ProductSchema, SettingsSchema
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.uploads import IMAGE_EXTS, public_url, save_upload

GRID_FIELDS = {
    "name": GridField(Product.name, "text"),
    "status": GridField(Product.status, "text"),
    "created_at": GridField(Product.created_at, "date"),
    "updated_at": GridField(Product.updated_at, "date"),
}
SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED ", "SAR": "SAR ", "SGD": "S$", "AUD": "A$",
           "CAD": "C$", "IDR": "Rp ", "MYR": "RM ", "BRL": "R$", "MXN": "MX$"}


# money -------------------------------------------------------------------------------------

def to_minor(amount: Decimal | float | int | None) -> int | None:
    if amount is None:
        return None
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_major(minor: int | None) -> float | None:
    return None if minor is None else round(minor / 100, 2)


def money(minor: int | None, currency: str) -> str:
    """₹1,499 or ₹1,499.50 for messages."""
    if minor is None:
        return ""
    major = Decimal(minor) / 100
    text = f"{major:,.0f}" if major == major.to_integral() else f"{major:,.2f}"
    return f"{SYMBOLS.get(currency, currency + ' ')}{text}"


# settings ----------------------------------------------------------------------------------

def settings_of(db: Session, customer: Customer) -> CommerceSettings:
    row = db.query(CommerceSettings).filter(CommerceSettings.customer_id == customer.id).first()
    if row is None:
        row = CommerceSettings(customer_id=customer.id)
        db.add(row)
        db.flush()
    return row


def serialize_settings(row: CommerceSettings) -> dict:
    return {
        "currency": row.currency,
        "store_name": row.store_name,
        "auto_sync": row.auto_sync,
        "cart_enabled": row.cart_enabled,
        "catalog_visible": row.catalog_visible,
        "catalog": {"id": row.catalog_id, "name": row.catalog_name, "connected_at": iso(row.catalog_connected_at)}
        if row.catalog_id else None,
        "last_sync_at": iso(row.last_sync_at),
        "sync_error": row.sync_error,
    }


def get_settings(db: Session, customer: Customer) -> dict:
    row = settings_of(db, customer)
    db.commit()
    return {"status": True, "data": serialize_settings(row)}


def update_settings(db: Session, customer: Customer, payload: SettingsSchema) -> dict:
    from app.modules.customer.commerce import meta

    row = settings_of(db, customer)
    changed_currency = row.currency != payload.currency
    commerce_changed = (row.cart_enabled, row.catalog_visible) != (payload.cart_enabled, payload.catalog_visible)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    if row.catalog_id and commerce_changed:
        meta.apply_commerce_settings(db, customer, row)
    if row.catalog_id and row.auto_sync and changed_currency:
        meta.push_all(db, customer)  # every price goes to Meta in the new currency
    return {"status": True, "message": "Store settings saved", "data": serialize_settings(row)}


# images ------------------------------------------------------------------------------------

def image_url(path: str | None, absolute: bool = False) -> str | None:
    """A stored upload path as a URL; absolute (for Meta) uses the API's public address."""
    if not path:
        return None
    if path.startswith(("http://", "https://")):
        return path
    url = public_url(path)
    if absolute and url.startswith("/"):
        url = f"{app_settings.APP_URL.rstrip('/')}{url}"
    return url


def upload_image(customer: Customer, file: UploadFile) -> dict:
    saved = save_upload(file, folder="products", allowed=IMAGE_EXTS - {".ico", ".gif"})
    return {"status": True, "data": {"path": saved["path"], "url": image_url(saved["path"])}}


# collections -------------------------------------------------------------------------------

def _collection(db: Session, customer: Customer, collection_id: int | None) -> ProductCollection | None:
    if collection_id is None:
        return None
    row = db.query(ProductCollection).filter(ProductCollection.id == collection_id,
                                             ProductCollection.customer_id == customer.id).first()
    if row is None:
        raise HTTPException(422, detail={"message": "That collection doesn't exist",
                                         "errors": {"collection_id": ["That collection doesn't exist"]}})
    return row


def list_collections(db: Session, customer: Customer) -> dict:
    counts = dict(db.query(Product.collection_id, func.count(Product.id))
                  .filter(Product.customer_id == customer.id, Product.not_deleted())
                  .group_by(Product.collection_id).all())
    rows = (db.query(ProductCollection).filter(ProductCollection.customer_id == customer.id)
            .order_by(ProductCollection.position, ProductCollection.id).all())
    return {"status": True, "data": [
        {"id": r.id, "name": r.name, "description": r.description, "position": r.position,
         "products": counts.get(r.id, 0)} for r in rows]}


def save_collection(db: Session, customer: Customer, payload: CollectionSchema, collection_id: int | None = None):
    clash = db.query(ProductCollection.id).filter(
        ProductCollection.customer_id == customer.id, func.lower(ProductCollection.name) == payload.name.lower(),
        ProductCollection.id != (collection_id or 0)).first()
    if clash:
        raise HTTPException(422, detail={"message": "You already have a collection with this name",
                                         "errors": {"name": ["You already have a collection with this name"]}})
    if collection_id:
        row = _collection(db, customer, collection_id)
    else:
        position = (db.query(func.max(ProductCollection.position))
                    .filter(ProductCollection.customer_id == customer.id).scalar() or 0) + 1
        row = ProductCollection(customer_id=customer.id, position=position)
        db.add(row)
    row.name, row.description = payload.name, payload.description
    db.commit()
    return {"status": True, "message": "Collection saved", "data": {"id": row.id, "name": row.name}}


def reorder_collections(db: Session, customer: Customer, ids: list[int]) -> dict:
    rows = {r.id: r for r in db.query(ProductCollection).filter(ProductCollection.customer_id == customer.id)}
    for position, collection_id in enumerate(ids, start=1):
        if collection_id in rows:
            rows[collection_id].position = position
    db.commit()
    return list_collections(db, customer)


def delete_collection(db: Session, customer: Customer, collection_id: int) -> dict:
    row = _collection(db, customer, collection_id)
    db.query(Product).filter(Product.collection_id == row.id).update({Product.collection_id: None})
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Collection deleted. Its products are kept.", "data": None}


# products ----------------------------------------------------------------------------------

def variant_label(variant: ProductVariant) -> str:
    return " / ".join(str(v) for v in (variant.option_values or {}).values())


def _sync_state(product: Product, catalog: bool) -> str | None:
    if not catalog or product.status == "draft":
        return None
    states = {v.sync_state for v in product.variants}
    return "error" if "error" in states else "pending" if "pending" in states else "synced"


def serialize_variant(v: ProductVariant, currency: str) -> dict:
    return {
        "id": v.id,
        "retailer_id": v.retailer_id,
        "option_values": v.option_values or {},
        "label": variant_label(v),
        "price": to_major(v.price),
        "sale_price": to_major(v.sale_price),
        "price_text": money(v.sale_price if v.sale_price is not None else v.price, currency),
        "stock": v.stock,
        "image": v.image,
        "image_url": image_url(v.image),
        "sync_state": v.sync_state,
        "sync_error": v.sync_error,
    }


def serialize_product(p: Product, store: CommerceSettings) -> dict:
    currency = store.currency
    prices = [v.sale_price if v.sale_price is not None else v.price for v in p.variants] or [0]
    tracked = [v.stock for v in p.variants if v.stock is not None]
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "collection": {"id": p.collection.id, "name": p.collection.name} if p.collection else None,
        "brand": p.brand,
        "images": [{"path": i, "url": image_url(i)} for i in p.images or []],
        "image_url": image_url((p.images or [None])[0]),
        "url": p.url,
        "status": p.status,
        "condition": p.condition,
        "options": p.options or [],
        "variants": [serialize_variant(v, currency) for v in p.variants],
        "currency": currency,
        "price_min": to_major(min(prices)),
        "price_max": to_major(max(prices)),
        "price_text": money(min(prices), currency) + (f" – {money(max(prices), currency)}"
                                                      if max(prices) != min(prices) else ""),
        "on_sale": any(v.sale_price is not None for v in p.variants),
        "stock": sum(tracked) if len(tracked) == len(p.variants) and tracked else None,
        "out_of_stock": bool(p.variants) and all(v.stock == 0 for v in p.variants),
        "sync_state": _sync_state(p, bool(store.catalog_id)),
        "sync_errors": [f"{variant_label(v) or v.retailer_id}: {v.sync_error}" for v in p.variants if v.sync_error],
        "source": p.source,
        "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
    }


def _query(db: Session, customer: Customer):
    return (db.query(Product).options(selectinload(Product.variants), selectinload(Product.collection))
            .filter(Product.customer_id == customer.id, Product.not_deleted()))


def get_product(db: Session, customer: Customer, product_id: int) -> Product:
    product = _query(db, customer).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(404, detail="Product not found")
    return product


def list_products(db: Session, customer: Customer, page=None, per_page=None, search=None, status=None,
                  collection_id=None, stock=None, filters=None, match="and", sort=None) -> dict:
    store = settings_of(db, customer)
    q = _query(db, customer)
    clause = search_clause([Product.name, Product.brand, Product.description], search)
    if search:
        sku = db.query(ProductVariant.product_id).filter(ProductVariant.customer_id == customer.id,
                                                         ProductVariant.retailer_id.ilike(f"%{search.strip()}%"))
        clause = Product.id.in_(sku) if clause is None else (clause | Product.id.in_(sku))
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Product.status == status)
    if collection_id == 0:
        q = q.filter(Product.collection_id.is_(None))
    elif collection_id:
        q = q.filter(Product.collection_id == collection_id)
    if stock == "out":
        out = db.query(ProductVariant.product_id).group_by(ProductVariant.product_id).having(
            func.bool_and(ProductVariant.stock == 0))
        q = q.filter(Product.id.in_(out))
    elif stock == "low":
        low = db.query(ProductVariant.product_id).filter(ProductVariant.stock.between(1, 5))
        q = q.filter(Product.id.in_(low))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Product.updated_at.desc(), Product.id.desc()])
    result = list_response(q, lambda p: serialize_product(p, store), page, per_page, search)
    db.commit()
    return result


def stats(db: Session, customer: Customer) -> dict:
    store = settings_of(db, customer)
    base = db.query(Product).filter(Product.customer_id == customer.id, Product.not_deleted())
    by_status = dict(base.with_entities(Product.status, func.count(Product.id)).group_by(Product.status).all())
    live = base.filter(Product.status != "draft").with_entities(Product.id)
    variant_rows = (db.query(ProductVariant.sync_state, ProductVariant.stock)
                    .filter(ProductVariant.product_id.in_(live)).all())
    out = (db.query(ProductVariant.product_id).filter(ProductVariant.product_id.in_(live))
           .group_by(ProductVariant.product_id).having(func.bool_and(ProductVariant.stock == 0)).count())
    db.commit()
    return {"status": True, "data": {
        "total": sum(by_status.values()),
        "active": by_status.get("active", 0),
        "hidden": by_status.get("hidden", 0),
        "draft": by_status.get("draft", 0),
        "out_of_stock": out,
        "low_stock": sum(1 for _, s in variant_rows if s is not None and 1 <= s <= 5),
        "synced": sum(1 for state, _ in variant_rows if state == "synced"),
        "sync_errors": sum(1 for state, _ in variant_rows if state == "error"),
        "catalog_connected": bool(store.catalog_id),
        "currency": store.currency,
    }}


def _new_sku(name: str) -> str:
    stem = re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")[:20] or "ITEM"
    return f"{stem}-{uuid.uuid4().hex[:6].upper()}"


def _check_skus(db: Session, customer: Customer, payload: ProductSchema, product_id: int | None) -> None:
    skus = [v.retailer_id for v in payload.variants if v.retailer_id]
    if not skus:
        return
    q = (db.query(ProductVariant.retailer_id)
         .join(Product, Product.id == ProductVariant.product_id)
         .filter(ProductVariant.customer_id == customer.id, func.lower(ProductVariant.retailer_id).in_(
             [s.lower() for s in skus]), Product.not_deleted()))
    if product_id:
        q = q.filter(ProductVariant.product_id != product_id)
    taken = q.first()
    if taken:
        msg = f"Another product already uses the SKU {taken[0]}"
        raise HTTPException(422, detail={"message": msg, "errors": {"variants": [msg]}})


def _apply(db: Session, customer: Customer, product: Product, payload: ProductSchema) -> list[str]:
    """Copies the form onto the product. Returns SKUs that were removed (to delete them from Meta)."""
    _collection(db, customer, payload.collection_id)
    product.name = payload.name
    product.description = payload.description
    product.collection_id = payload.collection_id
    product.brand = payload.brand
    product.images = list(dict.fromkeys(payload.images))
    product.url = payload.url
    product.status = payload.status
    product.condition = payload.condition
    product.options = [o.model_dump() for o in payload.options]
    existing = {v.id: v for v in product.variants}
    kept: list[ProductVariant] = []
    for position, data in enumerate(payload.variants):
        variant = existing.pop(data.id, None) if data.id else None
        if variant is None:
            variant = ProductVariant(customer_id=customer.id)
            product.variants.append(variant)
        variant.retailer_id = data.retailer_id or variant.retailer_id or _new_sku(product.name)
        variant.option_values = data.option_values
        variant.price = to_minor(data.price)
        variant.sale_price = to_minor(data.sale_price)
        variant.stock = data.stock
        variant.image = data.image if data.image in product.images else None
        variant.position = position
        variant.sync_state, variant.sync_error = "pending", None
        kept.append(variant)
    removed = [v.retailer_id for v in existing.values()]
    for v in existing.values():
        product.variants.remove(v)
    return removed


def create_product(db: Session, customer: Customer, payload: ProductSchema) -> dict:
    from app.modules.customer.commerce import meta

    _check_skus(db, customer, payload, None)
    product = Product(customer_id=customer.id, source="manual")
    db.add(product)
    _apply(db, customer, product, payload)
    db.commit()
    meta.after_change(db, customer, [product])
    store = settings_of(db, customer)
    return {"status": True, "message": "Product added", "data": serialize_product(get_product(db, customer,
                                                                                             product.id), store)}


def update_product(db: Session, customer: Customer, product_id: int, payload: ProductSchema) -> dict:
    from app.modules.customer.commerce import meta

    product = get_product(db, customer, product_id)
    _check_skus(db, customer, payload, product.id)
    removed = _apply(db, customer, product, payload)
    db.commit()
    meta.after_change(db, customer, [product], removed)
    store = settings_of(db, customer)
    return {"status": True, "message": "Product saved", "data": serialize_product(get_product(db, customer,
                                                                                             product.id), store)}


def show_product(db: Session, customer: Customer, product_id: int) -> dict:
    store = settings_of(db, customer)
    data = serialize_product(get_product(db, customer, product_id), store)
    db.commit()
    return {"status": True, "data": data}


def duplicate_product(db: Session, customer: Customer, product_id: int) -> dict:
    source = get_product(db, customer, product_id)
    copy = Product(customer_id=customer.id, name=f"{source.name} (copy)"[:200], description=source.description,
                   collection_id=source.collection_id, brand=source.brand, images=list(source.images or []),
                   url=source.url, status="draft", condition=source.condition, options=source.options or [],
                   source="manual")
    for v in source.variants:
        copy.variants.append(ProductVariant(customer_id=customer.id, retailer_id=_new_sku(source.name),
                                            option_values=v.option_values, price=v.price,
                                            sale_price=v.sale_price, stock=v.stock, image=v.image,
                                            position=v.position))
    db.add(copy)
    db.commit()
    store = settings_of(db, customer)
    return {"status": True, "message": "Copy made as a draft",
            "data": serialize_product(get_product(db, customer, copy.id), store)}


def delete_products(db: Session, customer: Customer, products: list[Product]) -> None:
    from app.modules.customer.commerce import meta

    skus = [v.retailer_id for p in products for v in p.variants]
    for p in products:
        p.deleted_at = now()
        # free the SKUs so they can be used again
        for v in p.variants:
            v.retailer_id = f"{v.retailer_id[:80]}~del{p.id}-{v.id}"
    db.commit()
    meta.after_change(db, customer, [], skus)


def delete_product(db: Session, customer: Customer, product_id: int) -> dict:
    delete_products(db, customer, [get_product(db, customer, product_id)])
    return {"status": True, "message": "Product deleted", "data": None}


def bulk(db: Session, customer: Customer, payload: BulkSchema) -> dict:
    from app.modules.customer.commerce import meta

    products = _query(db, customer).filter(Product.id.in_(payload.ids)).all()
    if not products:
        raise HTTPException(404, detail="Those products don't exist")
    if payload.action == "delete":
        delete_products(db, customer, products)
        return {"status": True, "message": f"{len(products)} deleted", "data": None}
    if payload.action == "collection":
        _collection(db, customer, payload.collection_id)
        for p in products:
            p.collection_id = payload.collection_id
    elif payload.action in ("activate", "hide"):
        for p in products:
            p.status = "active" if payload.action == "activate" else "hidden"
    for p in products:
        for v in p.variants:
            v.sync_state, v.sync_error = "pending", None
    db.commit()
    meta.after_change(db, customer, products, force=payload.action == "sync")
    labels = {"activate": "shown in the catalog", "hide": "hidden", "collection": "moved", "sync": "sent to Meta"}
    return {"status": True, "message": f"{len(products)} {labels[payload.action]}", "data": None}
