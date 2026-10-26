"""Shopify and WooCommerce: a business connects its online store and ChatDesk keeps up with it.

Products are imported (and kept up to date by webhook), so they can be sent on WhatsApp and synced to the
Meta catalog. Orders arrive by webhook and become ChatDesk orders with the store's own amounts: the customer
gets the WhatsApp updates set in Commerce settings (confirmed, shipped with tracking, delivered, cancelled),
cash-on-delivery buyers can be asked to confirm, and Shopify's abandoned checkouts get the cart reminders,
linking back to the store's checkout. The store stays in charge of stock, coupons and fulfilment.

STORE_API_URL points both platforms at a stand-in (end-to-end tests); leave it unset in real use.
"""
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode, urlparse

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings as app_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import orders, service
from app.modules.customer.commerce.gateways import GatewayError, request
from app.modules.customer.commerce.models import (
    Order, OrderItem, Product, ProductVariant, StoreConnection,
)
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

FAKE_URL = (os.getenv("STORE_API_URL") or "").rstrip("/")
SHOPIFY_VERSION = "2024-10"
LABELS = {"shopify": "Shopify", "woocommerce": "WooCommerce"}
IMPORT_DAYS = 30  # "import recent orders" goes this far back
MAX_PAGES = 40


class StoreSchema(BaseModel):
    shop_url: str = Field(..., min_length=3, max_length=255)
    credentials: dict[str, str] = Field(default_factory=dict)  # a blank one keeps what's saved
    import_orders: bool = True
    notify: bool = True
    abandoned: bool = True

    @field_validator("credentials", mode="before")
    @classmethod
    def _creds(cls, v):
        if not isinstance(v, dict) or len(v) > 4 or any(len(str(x)) > 300 for x in v.values()):
            raise ValueError("Those keys don't look right")
        return {str(k): str(x).strip() for k, x in v.items() if x is not None and str(x).strip()}


def _err(message: str, field: str = "store", status: int = 422):
    return HTTPException(status, detail={"message": message, "errors": {field: [message]}})


def _minor(value) -> int:
    try:
        return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError):
        return 0


def _plain(text: str | None, limit: int = 5000) -> str | None:
    if not text:
        return None
    text = re.sub(r"<(br|/p|/li|/div)\s*/?>", "\n", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit] or None


def _when(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return at.astimezone(timezone.utc).replace(tzinfo=None) if at.tzinfo else at


# the platforms -------------------------------------------------------------------------------------

class Platform:
    name = ""
    label = ""
    fields: tuple[tuple[str, str, bool], ...] = ()  # (key, label, secret?)
    topics: tuple[str, ...] = ()

    def __init__(self, shop_url: str, creds: dict, webhook_secret: str | None = None):
        self.url, self.c, self.secret = shop_url, creds, webhook_secret

    def _fail(self, status: int, data: dict, doing: str):
        if status in (401, 403):
            raise GatewayError(f"{self.label} refused the keys. Check they're right and have the access listed.",
                               status)
        if status == 404:
            raise GatewayError(f"Couldn't find the {self.label} store at that address.", status)
        detail = data.get("errors") or data.get("message") or data.get("error") or f"error {status}"
        if isinstance(detail, (dict, list)):
            detail = json.dumps(detail)[:200]
        raise GatewayError(f"{self.label} couldn't {doing}: {detail}", status)


class Shopify(Platform):
    name, label = "shopify", "Shopify"
    fields = (("access_token", "Admin API access token", True), ("api_secret", "API secret key", True))
    topics = ("orders/create", "orders/updated", "orders/cancelled", "checkouts/create", "checkouts/update",
              "products/create", "products/update")

    @staticmethod
    def clean_url(raw: str) -> str:
        raw = raw.strip().lower()
        host = urlparse(raw if "://" in raw else f"https://{raw}").netloc or raw
        host = host.split("/")[0]
        if not host.endswith(".myshopify.com"):
            host = f"{host.split('.')[0]}.myshopify.com"
        if not re.match(r"^[a-z0-9][a-z0-9-]*\.myshopify\.com$", host):
            raise _err("Enter your store's address, e.g. mystore.myshopify.com", "shop_url")
        return host

    @property
    def base(self) -> str:
        return f"{FAKE_URL}/shopify/admin/api/{SHOPIFY_VERSION}" if FAKE_URL else \
            f"https://{self.url}/admin/api/{SHOPIFY_VERSION}"

    def _call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        return request(method, f"{self.base}{path}", {"X-Shopify-Access-Token": self.c.get("access_token", "")}, body)

    def check(self) -> str:
        status, data = self._call("GET", "/shop.json")
        if status != 200:
            self._fail(status, data, "connect")
        return (data.get("shop") or {}).get("name") or self.url

    def add_webhook(self, topic: str, address: str) -> str | None:
        status, data = self._call("POST", "/webhooks.json",
                                  {"webhook": {"topic": topic, "address": address, "format": "json"}})
        if status in (200, 201):
            return str((data.get("webhook") or {}).get("id"))
        if status == 422 and "taken" in json.dumps(data):
            return None  # already there
        self._fail(status, data, f"add the {topic} webhook")

    def remove_webhook(self, webhook_id: str) -> None:
        self._call("DELETE", f"/webhooks/{webhook_id}.json")

    def products(self) -> list[dict]:
        out, since = [], 0
        for _ in range(MAX_PAGES):
            status, data = self._call("GET", f"/products.json?{urlencode({'limit': 250, 'since_id': since})}")
            if status != 200:
                self._fail(status, data, "list products")
            page = data.get("products") or []
            out += [self.product(p) for p in page]
            if len(page) < 250:
                break
            since = page[-1]["id"]
        return out

    def recent_orders(self, since: datetime) -> list[dict]:
        out, since_id = [], 0
        for _ in range(MAX_PAGES):
            q = {"status": "any", "limit": 250, "since_id": since_id, "created_at_min": since.isoformat() + "Z"}
            status, data = self._call("GET", f"/orders.json?{urlencode(q)}")
            if status != 200:
                self._fail(status, data, "list orders")
            page = data.get("orders") or []
            out += [self.order(o) for o in page]
            if len(page) < 250:
                break
            since_id = page[-1]["id"]
        return out

    def verify(self, body: bytes, headers: dict) -> None:
        sent = headers.get("x-shopify-hmac-sha256") or ""
        expected = base64.b64encode(hmac.new(self.c.get("api_secret", "").encode(), body, hashlib.sha256)
                                    .digest()).decode()
        if not sent or not hmac.compare_digest(sent, expected):
            raise GatewayError("Invalid Shopify signature")

    def topic(self, headers: dict) -> str:
        return headers.get("x-shopify-topic") or ""

    def product(self, p: dict) -> dict:
        options = [{"name": o["name"], "values": [str(v) for v in o.get("values") or []]}
                   for o in p.get("options") or [] if o.get("name") and o["name"] != "Title"]
        variants = []
        for v in p.get("variants") or []:
            values = {o["name"]: v.get(f"option{i + 1}") for i, o in enumerate(options) if v.get(f"option{i + 1}")}
            price, compare = _minor(v.get("price")), _minor(v.get("compare_at_price"))
            tracked = v.get("inventory_management") == "shopify"
            variants.append({"id": str(v["id"]), "sku": (v.get("sku") or "").strip(), "options": values,
                             "price": compare if compare > price else price,
                             "sale_price": price if compare > price else None,
                             "stock": max(0, int(v.get("inventory_quantity") or 0)) if tracked else None})
        return {"id": str(p["id"]), "name": p.get("title") or "Product", "description": _plain(p.get("body_html")),
                "images": [i["src"] for i in p.get("images") or [] if i.get("src")][:10],
                "status": "active" if p.get("status", "active") == "active" else "draft",
                "url": f"https://{self.url}/products/{p['handle']}" if p.get("handle") else None,
                "options": options, "variants": variants}

    def _items(self, rows: list[dict]) -> list[dict]:
        return [{"product": str(i.get("product_id") or ""), "variant": str(i.get("variant_id") or ""),
                 "sku": (i.get("sku") or "").strip(), "name": i.get("title") or i.get("name") or "Item",
                 "variant_label": i.get("variant_title") or None, "qty": int(i.get("quantity") or 1),
                 "price": _minor(i.get("price"))} for i in rows]

    @staticmethod
    def _person(o: dict) -> tuple[str | None, str | None, str | None]:
        ship, bill, cust = o.get("shipping_address") or {}, o.get("billing_address") or {}, o.get("customer") or {}
        phone = o.get("phone") or ship.get("phone") or cust.get("phone") or bill.get("phone")
        name = ship.get("name") or " ".join(filter(None, [cust.get("first_name"), cust.get("last_name")])) or \
            bill.get("name")
        return name or None, phone or None, o.get("email") or cust.get("email")

    @staticmethod
    def _address(a: dict | None) -> dict | None:
        if not a or not a.get("address1"):
            return None
        return {k: v for k, v in {"name": a.get("name"), "phone": a.get("phone"), "line1": a.get("address1"),
                                  "line2": a.get("address2"), "city": a.get("city"), "state": a.get("province"),
                                  "pincode": a.get("zip"), "country": a.get("country")}.items() if v}

    def order(self, o: dict) -> dict:
        gateways = " ".join(o.get("payment_gateway_names") or []).lower()
        cod = "cash on delivery" in gateways or "cod" in gateways.split()
        financial = o.get("financial_status") or "pending"
        payment = {"paid": "paid", "refunded": "refunded", "partially_refunded": "partially_refunded"}.get(
            financial, "unpaid")
        fulfils = o.get("fulfillments") or []
        last = fulfils[-1] if fulfils else {}
        if o.get("cancelled_at"):
            status = "cancelled"
        elif any(f.get("shipment_status") == "delivered" for f in fulfils):
            status = "delivered"
        elif o.get("fulfillment_status") in ("fulfilled", "partial") or fulfils:
            status = "shipped"
        else:
            status = "confirmed"
        name, phone, email = self._person(o)
        subtotal = _minor(o.get("subtotal_price"))
        discount = _minor(o.get("total_discounts"))
        return {
            "id": str(o["id"]), "ref": o.get("name") or f"#{o.get('order_number')}", "status": status,
            "payment_status": payment, "method": "cod" if cod else ("online" if payment != "unpaid" else None),
            "currency": o.get("currency") or "INR", "subtotal": subtotal + discount, "discount": discount,
            "shipping": _minor((o.get("total_shipping_price_set") or {}).get("shop_money", {}).get("amount")),
            "tax": _minor(o.get("total_tax")), "total": _minor(o.get("total_price")),
            "tax_inclusive": bool(o.get("taxes_included")),
            "coupon": ((o.get("discount_codes") or [{}])[0]).get("code"),
            "items": self._items(o.get("line_items") or []), "name": name, "phone": phone, "email": email,
            "address": self._address(o.get("shipping_address")), "note": o.get("note"),
            "courier": last.get("tracking_company"), "tracking_number": last.get("tracking_number"),
            "tracking_url": last.get("tracking_url"), "checkout_token": o.get("checkout_token"),
            "placed_at": _when(o.get("created_at")), "cancel_reason": o.get("cancel_reason"),
        }

    def checkout(self, c: dict) -> dict:
        name, phone, email = self._person(c)
        return {"token": c.get("token"), "url": c.get("abandoned_checkout_url"), "completed": bool(c.get("completed_at")),
                "items": self._items(c.get("line_items") or []), "name": name, "phone": phone,
                "currency": c.get("currency") or "INR", "total": _minor(c.get("total_price")),
                "subtotal": _minor(c.get("subtotal_price")), "discount": _minor(c.get("total_discounts")),
                "placed_at": _when(c.get("created_at"))}


class WooCommerce(Platform):
    name, label = "woocommerce", "WooCommerce"
    fields = (("consumer_key", "Consumer key", False), ("consumer_secret", "Consumer secret", True))
    topics = ("order.created", "order.updated", "product.created", "product.updated")

    @staticmethod
    def clean_url(raw: str) -> str:
        raw = raw.strip().rstrip("/")
        url = raw if "://" in raw else f"https://{raw}"
        parts = urlparse(url)
        if not parts.netloc or "." not in parts.netloc:
            raise _err("Enter your store's address, e.g. https://www.myshop.com", "shop_url")
        if parts.scheme != "https" and not FAKE_URL:
            raise _err("Your store needs to use https:// for its keys to be sent safely", "shop_url")
        return f"{parts.scheme}://{parts.netloc}{parts.path.rstrip('/')}"

    @property
    def base(self) -> str:
        return f"{FAKE_URL}/woo/wp-json/wc/v3" if FAKE_URL else f"{self.url}/wp-json/wc/v3"

    def _call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        token = base64.b64encode(f"{self.c.get('consumer_key', '')}:{self.c.get('consumer_secret', '')}".encode())
        status, data = request(method, f"{self.base}{path}", {"Authorization": f"Basic {token.decode()}"}, body)
        return status, data if isinstance(data, (dict, list)) else {}

    def check(self) -> str:
        status, data = self._call("GET", "/products?per_page=1")
        if status != 200:
            self._fail(status, data if isinstance(data, dict) else {}, "connect")
        return urlparse(self.url).netloc

    def add_webhook(self, topic: str, address: str) -> str | None:
        status, data = self._call("POST", "/webhooks", {"name": f"ChatDesk {topic}", "topic": topic,
                                                        "delivery_url": address, "secret": self.secret,
                                                        "status": "active"})
        if status in (200, 201):
            return str(data.get("id"))
        self._fail(status, data, f"add the {topic} webhook")

    def remove_webhook(self, webhook_id: str) -> None:
        self._call("DELETE", f"/webhooks/{webhook_id}?force=true")

    def _pages(self, path: str) -> list[dict]:
        out = []
        for page in range(1, MAX_PAGES + 1):
            sep = "&" if "?" in path else "?"
            status, data = self._call("GET", f"{path}{sep}per_page=100&page={page}")
            if status != 200:
                self._fail(status, data if isinstance(data, dict) else {}, "read the store")
            rows = data if isinstance(data, list) else []
            out += rows
            if len(rows) < 100:
                break
        return out

    def products(self) -> list[dict]:
        out = []
        for p in self._pages("/products?status=any"):
            variations = self._pages(f"/products/{p['id']}/variations") if p.get("type") == "variable" else []
            out.append(self.product(p, variations))
        return out

    def recent_orders(self, since: datetime) -> list[dict]:
        return [self.order(o) for o in self._pages(f"/orders?{urlencode({'after': since.isoformat()})}")]

    def verify(self, body: bytes, headers: dict) -> None:
        sent = headers.get("x-wc-webhook-signature") or ""
        expected = base64.b64encode(hmac.new((self.secret or "").encode(), body, hashlib.sha256).digest()).decode()
        if not sent or not hmac.compare_digest(sent, expected):
            raise GatewayError("Invalid WooCommerce signature")

    def topic(self, headers: dict) -> str:
        return headers.get("x-wc-webhook-topic") or ""

    @staticmethod
    def _variant(v: dict, options: dict) -> dict:
        regular = _minor(v.get("regular_price") or v.get("price"))
        sale = _minor(v.get("sale_price")) if v.get("sale_price") else None
        return {"id": str(v["id"]), "sku": (v.get("sku") or "").strip(), "options": options, "price": regular,
                "sale_price": sale if sale and sale < regular else None,
                "stock": max(0, int(v.get("stock_quantity") or 0)) if v.get("manage_stock") is True else
                (0 if v.get("stock_status") == "outofstock" else None)}

    def product(self, p: dict, variations: list[dict] | None = None) -> dict:
        options = [{"name": a["name"], "values": [str(x) for x in a.get("options") or []]}
                   for a in p.get("attributes") or [] if a.get("variation") and a.get("name")]
        if variations:
            variants = [self._variant(v, {a["name"]: a["option"] for a in v.get("attributes") or []
                                          if a.get("name") and a.get("option")}) for v in variations]
        else:
            variants = [self._variant(p, {})]
            variants[0]["id"] = f"p{p['id']}"
        return {"id": str(p["id"]), "name": p.get("name") or "Product",
                "description": _plain(p.get("short_description") or p.get("description")),
                "images": [i["src"] for i in p.get("images") or [] if i.get("src")][:10],
                "status": "active" if p.get("status") == "publish" else "draft", "url": p.get("permalink"),
                "options": options, "variants": variants}

    def order(self, o: dict) -> dict:
        state = o.get("status") or "pending"
        cod = o.get("payment_method") == "cod"
        if state in ("cancelled", "failed", "refunded"):
            status = "cancelled"
        elif state == "completed":
            status = "delivered"
        elif state == "pending":
            status = "awaiting_payment"
        else:  # processing, on-hold
            status = "confirmed"
        if state == "refunded":
            payment = "refunded"
        elif o.get("date_paid") or (state in ("processing", "completed") and not cod) or (cod and state == "completed"):
            payment = "paid"
        else:
            payment = "unpaid"
        ship, bill = o.get("shipping") or {}, o.get("billing") or {}
        name = " ".join(filter(None, [ship.get("first_name") or bill.get("first_name"),
                                      ship.get("last_name") or bill.get("last_name")])) or None
        items = [{"product": str(i.get("product_id") or ""),
                  "variant": str(i.get("variation_id") or "") if i.get("variation_id") else f"p{i.get('product_id')}",
                  "sku": (i.get("sku") or "").strip(), "name": i.get("name") or "Item", "variant_label": None,
                  "qty": int(i.get("quantity") or 1), "price": _minor(i.get("price"))} for i in o.get("line_items") or []]
        address = None
        if ship.get("address_1") or bill.get("address_1"):
            a = ship if ship.get("address_1") else bill
            address = {k: v for k, v in {"name": name, "phone": ship.get("phone") or bill.get("phone"),
                                         "line1": a.get("address_1"), "line2": a.get("address_2"),
                                         "city": a.get("city"), "state": a.get("state"),
                                         "pincode": a.get("postcode"), "country": a.get("country")}.items() if v}
        total = _minor(o.get("total"))
        discount = _minor(o.get("discount_total"))
        shipping, tax = _minor(o.get("shipping_total")), _minor(o.get("total_tax"))
        return {
            "id": str(o["id"]), "ref": f"#{o.get('number') or o['id']}", "status": status, "payment_status": payment,
            "method": "cod" if cod else ("online" if payment == "paid" else None),
            "currency": o.get("currency") or "INR", "subtotal": sum(i["price"] * i["qty"] for i in items),
            "discount": discount, "shipping": shipping, "tax": tax, "total": total,
            "tax_inclusive": bool(o.get("prices_include_tax")),
            "coupon": ((o.get("coupon_lines") or [{}])[0]).get("code"), "items": items, "name": name,
            "phone": bill.get("phone") or ship.get("phone"), "email": bill.get("email"), "address": address,
            "note": o.get("customer_note") or None, "courier": None, "tracking_number": None, "tracking_url": None,
            "checkout_token": None, "placed_at": _when(o.get("date_created_gmt") and o["date_created_gmt"] + "Z"),
            "cancel_reason": None,
        }


PLATFORMS: dict[str, type[Platform]] = {"shopify": Shopify, "woocommerce": WooCommerce}


def credentials(conn: StoreConnection) -> dict:
    try:
        return json.loads(decrypt_secret(conn.credentials) or "{}")
    except ValueError:
        return {}


def platform_of(conn: StoreConnection) -> Platform:
    return PLATFORMS[conn.platform](conn.shop_url, credentials(conn), decrypt_secret(conn.webhook_secret))


def webhook_url(conn: StoreConnection) -> str:
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/shop/store/{conn.platform}/{conn.webhook_key}"


# connecting ----------------------------------------------------------------------------------------

def serialize(conn: StoreConnection) -> dict:
    return {"id": conn.id, "platform": conn.platform, "label": LABELS[conn.platform], "shop_url": conn.shop_url,
            "name": conn.name, "status": conn.status, "last_error": conn.last_error,
            "import_orders": conn.import_orders, "notify": conn.notify, "abandoned": conn.abandoned,
            "last_sync_at": iso(conn.last_sync_at), "last_event_at": iso(conn.last_event_at),
            "products_synced": conn.products_synced, "orders_synced": conn.orders_synced,
            "webhook_url": webhook_url(conn), "webhooks": len(conn.webhooks or []),
            "saved_fields": sorted(credentials(conn).keys())}


def list_stores(db: Session, owner: Customer) -> dict:
    rows = {s.platform: s for s in db.query(StoreConnection).filter(StoreConnection.customer_id == owner.id)}
    db.commit()
    return {"status": True, "data": [
        {"platform": name, "label": cls.label,
         "fields": [{"key": k, "label": label, "secret": secret} for k, label, secret in cls.fields],
         "store": serialize(rows[name]) if name in rows else None}
        for name, cls in PLATFORMS.items()]}


def _conn(db: Session, owner: Customer, name: str) -> StoreConnection | None:
    if name not in PLATFORMS:
        raise HTTPException(404, detail="Unknown store platform")
    return db.query(StoreConnection).filter(StoreConnection.customer_id == owner.id,
                                            StoreConnection.platform == name).first()


def save_store(db: Session, owner: Customer, name: str, payload: StoreSchema) -> dict:
    conn = _conn(db, owner, name)
    cls = PLATFORMS[name]
    shop_url = cls.clean_url(payload.shop_url)
    saved = credentials(conn) if conn else {}
    creds = {k: payload.credentials.get(k) or saved.get(k) for k, _, _ in cls.fields}
    missing = next(((k, label) for k, label, _ in cls.fields if not creds.get(k)), None)
    if missing:
        raise _err(f"Enter the {missing[1]}", f"credentials.{missing[0]}")
    is_new = conn is None
    if is_new:
        conn = StoreConnection(customer_id=owner.id, platform=name, webhook_key=secrets.token_urlsafe(24)[:32],
                               webhook_secret=encrypt_secret(secrets.token_urlsafe(32)), webhooks=[])
    moved = not is_new and conn.shop_url != shop_url
    conn.shop_url = shop_url
    store = cls(shop_url, creds, decrypt_secret(conn.webhook_secret))
    try:
        conn.name = store.check()
    except GatewayError as exc:
        raise _err(str(exc), "credentials") from exc
    conn.credentials = encrypt_secret(json.dumps(creds))
    conn.import_orders, conn.notify, conn.abandoned = payload.import_orders, payload.notify, payload.abandoned
    db.add(conn)
    db.flush()
    if is_new or moved or not conn.webhooks:
        try:
            ids = [store.add_webhook(t, webhook_url(conn)) for t in store.topics]
        except GatewayError as exc:
            db.rollback()
            raise _err(f"Connected, but {exc}. Give the app permission for orders, products"
                       f"{' and checkouts' if name == 'shopify' else ''}.", "credentials") from exc
        conn.webhooks = [i for i in ids if i]
    conn.status, conn.last_error = "connected", None
    db.commit()
    if is_new:
        try:
            sync(db, owner, name)
        except HTTPException:
            pass  # connected; the import's problem is on the card
    db.refresh(conn)
    return {"status": True, "message": f"{LABELS[name]} connected" if is_new else f"{LABELS[name]} saved",
            "data": serialize(conn)}


def remove_store(db: Session, owner: Customer, name: str) -> dict:
    conn = _conn(db, owner, name)
    if conn is None:
        raise HTTPException(404, detail="That store isn't connected")
    store = platform_of(conn)
    for webhook_id in conn.webhooks or []:
        try:
            store.remove_webhook(webhook_id)
        except GatewayError:
            pass
    db.delete(conn)
    db.commit()
    return {"status": True, "message": f"{LABELS[name]} disconnected. Products and orders already imported stay.",
            "data": None}


# products ------------------------------------------------------------------------------------------

def _sku(db: Session, owner_id: int, wanted: str, fallback: str, own_ids: set[int]) -> str:
    """The variant's catalog id: its SKU, unless another product already uses it."""
    if wanted:
        clash = db.query(ProductVariant.id).filter(ProductVariant.customer_id == owner_id,
                                                   ProductVariant.retailer_id == wanted).first()
        if clash is None or clash[0] in own_ids:
            return wanted[:100]
    return fallback[:100]


def upsert_product(db: Session, owner: Customer, source: str, data: dict) -> Product:
    product = (db.query(Product).options(selectinload(Product.variants))
               .filter(Product.customer_id == owner.id, Product.source == source,
                       Product.external_id == data["id"]).first())
    if product is None:
        product = Product(customer_id=owner.id, source=source, external_id=data["id"], images=[], options=[])
        db.add(product)
    product.deleted_at = None
    product.name, product.description = data["name"][:200], data["description"]
    product.images, product.url, product.status = data["images"], (data["url"] or "")[:500] or None, data["status"]
    product.options = data["options"]
    db.flush()
    existing = {v.external_id: v for v in product.variants}
    own_ids = {v.id for v in product.variants}
    keep = []
    prefix = "SH" if source == "shopify" else "WC"
    for i, v in enumerate(data["variants"][:100] or []):
        variant = existing.get(v["id"])
        if variant is None:
            variant = ProductVariant(customer_id=owner.id, external_id=v["id"])
            product.variants.append(variant)
        variant.retailer_id = _sku(db, owner.id, v["sku"], f"{prefix}-{v['id']}", own_ids)
        variant.option_values, variant.price, variant.sale_price = v["options"], v["price"], v["sale_price"]
        variant.stock, variant.position, variant.sync_state = v["stock"], i, "pending"
        db.flush()
        own_ids.add(variant.id)
        keep.append(variant)
    for variant in list(product.variants):
        if variant not in keep:
            product.variants.remove(variant)
    db.flush()
    return product


def sync(db: Session, owner: Customer, name: str) -> dict:
    """Imports every product, and the last 30 days of orders (quietly: no WhatsApp messages for those)."""
    from app.modules.customer.commerce import meta

    conn = _conn(db, owner, name)
    if conn is None:
        raise HTTPException(404, detail="That store isn't connected")
    store = platform_of(conn)
    try:
        products = store.products()
        rows = [upsert_product(db, owner, name, p) for p in products]
        db.commit()
        found = store.recent_orders(now() - timedelta(days=IMPORT_DAYS)) if conn.import_orders else []
        added = sum(1 for o in found if apply_order(db, owner, conn, o, quiet=True) == "new")
    except GatewayError as exc:
        db.rollback()
        conn.status, conn.last_error = "error", str(exc)[:500]
        db.commit()
        raise _err(str(exc), "store") from exc
    conn.products_synced, conn.last_sync_at = len(rows), now()
    conn.status, conn.last_error = "connected", None
    db.commit()
    meta.after_change(db, owner, rows)
    return {"status": True, "message": f"Imported {len(rows)} product{'' if len(rows) == 1 else 's'}"
                                       f"{f' and {added} order' + ('' if added == 1 else 's') if added else ''}",
            "data": serialize(conn)}


# orders ----------------------------------------------------------------------------------------------

def _contact(db: Session, owner: Customer, phone: str | None, name: str | None):
    from app.modules.customer.contacts.service import to_wa_id
    from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation

    wa_id = to_wa_id(db, phone) if phone else None
    if not wa_id:
        return None, None
    contact = get_or_create_contact(db, owner.id, wa_id)
    if name and not contact.name:
        contact.name = name[:150]
    return contact, get_or_create_conversation(db, contact)


def _items(db: Session, owner: Customer, source: str, rows: list[dict]) -> list[OrderItem]:
    ids = [r["variant"] for r in rows if r["variant"]]
    by_ext = {v.external_id: v for v in db.query(ProductVariant).options(selectinload(ProductVariant.product))
              .filter(ProductVariant.customer_id == owner.id, ProductVariant.external_id.in_(ids)).all()} if ids else {}
    out = []
    for r in rows:
        v = by_ext.get(r["variant"])
        item = OrderItem(name=r["name"][:200], variant_label=(r["variant_label"] or "")[:150] or None,
                         retailer_id=(r["sku"] or None), unit_price=r["price"], quantity=max(1, r["qty"]))
        if v is not None and v.product.source == source:
            item.product_id, item.variant_id = v.product_id, v.id
            item.retailer_id = v.retailer_id
            item.image = v.image or (v.product.images or [None])[0]
        out.append(item)
    return out


def _amounts(order: Order, data: dict) -> None:
    order.currency = (data.get("currency") or order.currency or "INR")[:3]
    order.subtotal, order.discount = data["subtotal"], data["discount"]
    order.shipping, order.tax, order.total = data.get("shipping", 0), data.get("tax", 0), data["total"]
    order.cod_fee = order.prepaid_discount = 0


STEPS = ("confirmed", "shipped", "delivered")


def apply_order(db: Session, owner: Customer, conn: StoreConnection, data: dict, quiet: bool = False) -> str | None:
    """Creates or updates the ChatDesk order for a store order. Returns "new", "updated" or None."""
    from app.modules.customer.commerce import payments

    source = conn.platform
    base = db.query(Order).options(selectinload(Order.items), selectinload(Order.payments)) \
        .filter(Order.customer_id == owner.id, Order.source == source)
    order = base.filter(Order.external_id == data["id"]).first()
    if order is None and data.get("checkout_token"):
        order = base.filter(Order.external_id == f"checkout:{data['checkout_token']}").first()
    from_checkout = order is not None and (order.external_id or "").startswith("checkout:")
    is_new = order is None
    if is_new and not conn.import_orders:
        return None
    store = service.settings_of(db, owner)
    if is_new:
        contact, conversation = _contact(db, owner, data["phone"], data["name"])
        order = Order(customer_id=owner.id, number=orders.next_number(db, owner.id), source=source,
                      status="awaiting_payment", contact_id=contact.id if contact else None,
                      conversation_id=conversation.id if conversation else None,
                      placed_at=data["placed_at"] or now(), created_by=LABELS[source],
                      invoice_key=secrets.token_urlsafe(18), items=[])
        db.add(order)
        db.flush()
    if is_new or from_checkout:
        order.items = _items(db, owner, source, data["items"])
        orders.log(db, order, "placed", f"Order {data['ref']} placed on {LABELS[source]}", LABELS[source])
    order.external_id, order.external_ref = data["id"], (data["ref"] or "")[:40]
    order.customer_name = (data["name"] or order.customer_name or "")[:150] or None
    if data["phone"] and order.contact_id:
        from app.modules.customer.inbox.models import WaContact

        contact = db.get(WaContact, order.contact_id)
        order.customer_phone = f"+{contact.wa_id}" if contact else order.customer_phone
    order.address = data["address"] or order.address
    order.note = data["note"] or order.note
    order.coupon_code = (data["coupon"] or "")[:30] or None
    order.payment_method = data["method"] or order.payment_method
    order.courier = data["courier"] or order.courier
    order.tracking_number = data["tracking_number"] or order.tracking_number
    order.tracking_url = data["tracking_url"] or order.tracking_url
    _amounts(order, data)
    paid_before = order.payment_status
    order.payment_status = data["payment_status"]
    if order.payment_status == "paid" and paid_before == "unpaid":
        order.paid_at = now()
        orders.log(db, order, "payment", f"Paid on {LABELS[source]}", LABELS[source])

    # where the order has got to (only ever forward, apart from cancelling)
    target, reached = data["status"], None
    current = order.status
    if target == "cancelled" and current != "cancelled":
        payments.close_open(db, owner, order)
        order.status, order.cancelled_at = "cancelled", now()
        order.cancel_reason = (data.get("cancel_reason") or "")[:300] or order.cancel_reason
        orders.log(db, order, "status", f"Cancelled on {LABELS[source]}", LABELS[source])
        reached = "cancelled" if order.confirmed_at else None
    elif target != "awaiting_payment" and current != "cancelled":
        if current in orders.CHECKOUT:
            orders.confirm(db, owner, order, LABELS[source])
            reached = "confirmed"
        rank = {s: i for i, s in enumerate(("confirmed", "packed", "shipped", "delivered"))}
        if target in ("shipped", "delivered") and rank.get(order.status, 0) < rank["shipped"]:
            order.status, order.shipped_at = "shipped", now()
            via = f" via {order.courier}" if order.courier else ""
            orders.log(db, order, "status", f"Shipped{via}", LABELS[source])
            reached = "shipped"
        if target == "delivered" and order.status != "delivered":
            order.status, order.delivered_at = "delivered", now()
            if order.payment_method == "cod" and order.payment_status == "unpaid":
                order.payment_status, order.paid_at = "paid", now()
            orders.log(db, order, "status", "Delivered", LABELS[source])
            reached = "delivered"
    if is_new:
        conn.orders_synced += 1
    conn.last_event_at = now()
    db.commit()
    if is_new and not quiet:
        from app.modules.customer.account import notify

        notify.new_order(db, order, order.customer_name or LABELS[source])
        db.commit()
    if reached and not quiet and conn.notify and order.conversation_id:
        asked = False
        if reached == "confirmed" and store.cod_confirm and order.payment_method == "cod" \
                and order.payment_status == "unpaid":
            try:
                asked = payments.ask_cod_confirmation(db, owner, order, LABELS[source]).endswith("sent")
            except HTTPException:
                db.rollback()
        if not asked:
            orders.notify(db, owner, order, reached)
    return "new" if is_new else "updated"


def apply_checkout(db: Session, owner: Customer, conn: StoreConnection, data: dict) -> str | None:
    """A Shopify checkout the customer hasn't finished: kept as a waiting cart, for the cart reminders."""
    if not conn.abandoned or data["completed"] or not data["token"] or not data["url"]:
        return None
    key = f"checkout:{data['token']}"
    order = (db.query(Order).options(selectinload(Order.items))
             .filter(Order.customer_id == owner.id, Order.source == conn.platform, Order.external_id == key).first())
    if order is not None and order.status not in orders.CHECKOUT:
        return None
    is_new = order is None
    if is_new:
        contact, conversation = _contact(db, owner, data["phone"], data["name"])
        if contact is None:
            return None  # no phone: nobody to remind
        order = Order(customer_id=owner.id, number=orders.next_number(db, owner.id), source=conn.platform,
                      status="awaiting_payment", contact_id=contact.id, conversation_id=conversation.id,
                      customer_name=(data["name"] or contact.name or "")[:150] or None,
                      customer_phone=f"+{contact.wa_id}", external_id=key, placed_at=data["placed_at"] or now(),
                      created_by=LABELS[conn.platform], invoice_key=secrets.token_urlsafe(18), items=[])
        db.add(order)
        db.flush()
        orders.log(db, order, "placed", f"Checkout started on {LABELS[conn.platform]} (not finished yet)",
                   LABELS[conn.platform])
    order.items = _items(db, owner, conn.platform, data["items"])
    order.external_url = data["url"][:1000]
    order.subtotal, order.discount, order.total = data["subtotal"] + data["discount"], data["discount"], data["total"]
    order.currency = data["currency"][:3]
    conn.last_event_at = now()
    db.commit()
    return "new" if is_new else "updated"


def webhook(db: Session, name: str, webhook_key: str, body: bytes, headers: dict) -> tuple[int, str]:
    conn = db.query(StoreConnection).filter(StoreConnection.webhook_key == webhook_key,
                                            StoreConnection.platform == name).first()
    if conn is None or name not in PLATFORMS:
        return 404, "Unknown webhook"
    headers = {k.lower(): v for k, v in headers.items()}
    if name == "woocommerce" and body.startswith(b"webhook_id="):
        return 200, "ok"  # WooCommerce's ping when a webhook is made
    store = platform_of(conn)
    try:
        store.verify(body, headers)
    except GatewayError as exc:
        conn.last_error = f"Webhook refused: {exc}"[:500]
        db.commit()
        return 401, str(exc)
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        return 400, "Invalid body"
    topic = store.topic(headers)
    owner = db.get(Customer, conn.customer_id)
    try:
        if topic.startswith(("orders/", "order.")):
            apply_order(db, owner, conn, store.order(payload))
        elif topic.startswith("checkouts/"):
            apply_checkout(db, owner, conn, store.checkout(payload))
        elif topic.startswith(("products/", "product.")):
            from app.modules.customer.commerce import meta

            if name == "woocommerce" and payload.get("type") == "variable":
                product = upsert_product(db, owner, name, store.product(
                    payload, store._pages(f"/products/{payload['id']}/variations")))
            else:
                product = upsert_product(db, owner, name, store.product(payload))
            conn.last_event_at = now()
            db.commit()
            meta.after_change(db, owner, [product])
    except GatewayError as exc:
        db.rollback()
        logger.warning("%s webhook %s for store %s failed: %s", name, topic, conn.id, exc)
    except Exception:  # noqa: BLE001 - answer 200 anyway, or the store retries the same broken event for days
        db.rollback()
        logger.exception("%s webhook %s for store %s failed", name, topic, conn.id)
    return 200, "ok"

