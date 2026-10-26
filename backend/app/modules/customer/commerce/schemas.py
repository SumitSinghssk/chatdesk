from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

CURRENCIES = ("INR", "USD", "EUR", "GBP", "AED", "SAR", "SGD", "AUD", "CAD", "IDR", "MYR", "BRL", "MXN")
MAX_IMAGES = 10
MAX_OPTIONS = 3
MAX_VARIANTS = 100

Money = Decimal  # sent and shown in rupees/dollars; stored in paise/cents


def _strip(v):
    return v.strip() or None if isinstance(v, str) else v


class SettingsSchema(BaseModel):
    currency: Literal[CURRENCIES] = "INR"  # type: ignore[valid-type]
    store_name: Optional[str] = Field(None, max_length=120)
    auto_sync: bool = True
    cart_enabled: bool = True
    catalog_visible: bool = True

    @field_validator("store_name", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class ConnectCatalogSchema(BaseModel):
    catalog_id: str = Field(..., min_length=5, max_length=40, pattern=r"^\d+$")


class CollectionSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=300)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class ReorderSchema(BaseModel):
    ids: list[int] = Field(..., max_length=500)


class OptionSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    values: list[str] = Field(..., min_length=1, max_length=30)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _strip(v)

    @field_validator("values")
    @classmethod
    def _values(cls, v):
        values = list(dict.fromkeys(x.strip()[:40] for x in v if x and x.strip()))
        if not values:
            raise ValueError("Add at least one value")
        return values


class VariantSchema(BaseModel):
    id: Optional[int] = None
    retailer_id: Optional[str] = Field(None, max_length=100)  # SKU; made up when empty
    option_values: dict[str, str] = Field(default_factory=dict)
    price: Money = Field(..., ge=0, le=Decimal("10000000"), decimal_places=2)
    sale_price: Optional[Money] = Field(None, ge=0, le=Decimal("10000000"), decimal_places=2)
    stock: Optional[int] = Field(None, ge=0, le=10_000_000)
    image: Optional[str] = Field(None, max_length=500)

    @field_validator("retailer_id", "image", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)

    @field_validator("retailer_id")
    @classmethod
    def _sku(cls, v):
        if v and any(c.isspace() for c in v):
            raise ValueError("Use letters, numbers, - or _ (no spaces)")
        return v

    @model_validator(mode="after")
    def _sale(self):
        if self.sale_price is not None and self.sale_price >= self.price:
            raise ValueError("The sale price must be lower than the price")
        return self


class ProductSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    collection_id: Optional[int] = None
    brand: Optional[str] = Field(None, max_length=100)
    images: list[str] = Field(default_factory=list, max_length=MAX_IMAGES)
    url: Optional[str] = Field(None, max_length=500, pattern=r"^https?://\S+$")
    status: Literal["active", "hidden", "draft"] = "active"
    condition: Literal["new", "refurbished", "used"] = "new"
    options: list[OptionSchema] = Field(default_factory=list, max_length=MAX_OPTIONS)
    variants: list[VariantSchema] = Field(..., min_length=1, max_length=MAX_VARIANTS)

    @field_validator("name", "description", "brand", "url", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)

    @model_validator(mode="after")
    def _variants(self):
        names = [o.name for o in self.options]
        if len({n.lower() for n in names}) != len(names):
            raise ValueError("Each option needs a different name")
        if not self.options and len(self.variants) > 1:
            raise ValueError("Add an option (like Size) to have more than one variant")
        seen: set[tuple] = set()
        for v in self.variants:
            if self.options:
                if set(v.option_values) != set(names):
                    raise ValueError("Every variant needs a value for each option")
                for o in self.options:
                    if v.option_values[o.name] not in o.values:
                        raise ValueError(f"“{v.option_values[o.name]}” isn't one of the {o.name} values")
            else:
                v.option_values = {}
            key = tuple(v.option_values.get(n) for n in names)
            if key in seen:
                raise ValueError("Two variants have the same options")
            seen.add(key)
        skus = [v.retailer_id.lower() for v in self.variants if v.retailer_id]
        if len(skus) != len(set(skus)):
            raise ValueError("Each variant needs its own SKU")
        return self


class BulkSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)
    action: Literal["delete", "activate", "hide", "collection", "sync"]
    collection_id: Optional[int] = None


class SendProductsSchema(BaseModel):
    """Products sent into a chat.

    product: one product card from the catalog · products: a list of up to 30 (sections by collection) ·
    catalog: the whole catalog · card: photo, price and buttons (works without a Meta catalog).
    """

    kind: Literal["product", "products", "catalog", "card"]
    product_ids: list[int] = Field(default_factory=list, max_length=30)
    header: Optional[str] = Field(None, max_length=60)
    body: Optional[str] = Field(None, max_length=1024)
    footer: Optional[str] = Field(None, max_length=60)

    @field_validator("header", "body", "footer", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)

    @model_validator(mode="after")
    def _count(self):
        if self.kind in ("product", "card") and len(self.product_ids) != 1:
            raise ValueError("Choose one product")
        if self.kind == "products" and not self.product_ids:
            raise ValueError("Choose at least one product")
        return self


# checkout, coupons and orders --------------------------------------------------------------

NOTIFY_STEPS = ("confirmed", "packed", "shipped", "delivered", "cancelled", "paid", "refunded")


class NotifyRule(BaseModel):
    on: bool = True
    template_id: Optional[int] = None


class CheckoutSchema(BaseModel):
    order_prefix: str = Field("#", min_length=1, max_length=10, pattern=r"^[A-Za-z0-9#\-_/]+$")
    shipping_fee: Money = Field(Decimal("0"), ge=0, le=Decimal("1000000"), decimal_places=2)
    free_shipping_above: Optional[Money] = Field(None, ge=0, le=Decimal("10000000"), decimal_places=2)
    tax_percent: Decimal = Field(Decimal("0"), ge=0, le=100, decimal_places=2)
    tax_inclusive: bool = True
    cod_enabled: bool = True
    cod_fee: Money = Field(Decimal("0"), ge=0, le=Decimal("100000"), decimal_places=2)
    min_order: Optional[Money] = Field(None, ge=0, le=Decimal("10000000"), decimal_places=2)
    ask_address: bool = True
    notifications: dict[Literal[NOTIFY_STEPS], NotifyRule] = Field(default_factory=dict)  # type: ignore[valid-type]


class CouponSchema(BaseModel):
    code: str = Field(..., min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    kind: Literal["percent", "fixed", "free_shipping"] = "percent"
    value: Decimal = Field(Decimal("0"), ge=0, le=Decimal("10000000"), decimal_places=2)
    min_order: Optional[Money] = Field(None, ge=0, decimal_places=2)
    max_discount: Optional[Money] = Field(None, ge=0, decimal_places=2)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    usage_limit: Optional[int] = Field(None, ge=1, le=10_000_000)
    per_customer: Optional[int] = Field(None, ge=1, le=1000)
    active: bool = True
    description: Optional[str] = Field(None, max_length=200)

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("description", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "percent" and not (1 <= self.value <= 100):
            raise ValueError("A percent discount is between 1 and 100")
        if self.kind == "fixed" and self.value <= 0:
            raise ValueError("Enter the discount amount")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("The end date must be after the start date")
        return self


class AddressSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=25)
    line1: str = Field(..., min_length=3, max_length=300)
    line2: Optional[str] = Field(None, max_length=200)
    landmark: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(None, max_length=60)

    @field_validator("*", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class OrderItemInput(BaseModel):
    variant_id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=200)  # a custom line without a product
    unit_price: Optional[Money] = Field(None, ge=0, le=Decimal("10000000"), decimal_places=2)
    quantity: int = Field(1, ge=1, le=9999)

    @model_validator(mode="after")
    def _either(self):
        if self.variant_id is None and (not self.name or self.unit_price is None):
            raise ValueError("Choose a product, or give the item a name and price")
        return self


class OrderSchema(BaseModel):
    contact_id: Optional[int] = None
    items: list[OrderItemInput] = Field(..., min_length=1, max_length=100)
    coupon_code: Optional[str] = Field(None, max_length=30)
    payment_method: Optional[Literal["cod", "online"]] = None
    paid: bool = False
    address: Optional[AddressSchema] = None
    note: Optional[str] = Field(None, max_length=2000)
    internal_note: Optional[str] = Field(None, max_length=2000)
    # confirmed: the order is final · checkout: the customer picks how to pay in the chat ·
    # link: the customer gets a payment link and the order is confirmed when it's paid
    mode: Literal["confirmed", "checkout", "link"] = "confirmed"

    @field_validator("coupon_code", "note", "internal_note", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class OrderUpdateSchema(BaseModel):
    items: Optional[list[OrderItemInput]] = Field(None, min_length=1, max_length=100)
    coupon_code: Optional[str] = Field(None, max_length=30)
    address: Optional[AddressSchema] = None
    note: Optional[str] = Field(None, max_length=2000)
    internal_note: Optional[str] = Field(None, max_length=2000)
    courier: Optional[str] = Field(None, max_length=80)
    tracking_number: Optional[str] = Field(None, max_length=80)
    tracking_url: Optional[str] = Field(None, max_length=500, pattern=r"^https?://\S+$")

    @field_validator("coupon_code", "note", "internal_note", "courier", "tracking_number", "tracking_url",
                     mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class OrderActionSchema(BaseModel):
    action: Literal["confirm", "pack", "ship", "deliver", "cancel"]
    courier: Optional[str] = Field(None, max_length=80)
    tracking_number: Optional[str] = Field(None, max_length=80)
    tracking_url: Optional[str] = Field(None, max_length=500, pattern=r"^https?://\S+$")
    reason: Optional[str] = Field(None, max_length=300)
    notify: bool = True

    @field_validator("courier", "tracking_number", "tracking_url", "reason", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class PaymentStatusSchema(BaseModel):
    payment_status: Literal["paid", "unpaid", "refunded"]
    payment_method: Optional[Literal["cod", "online"]] = None


class OrderNoteSchema(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


# payments ------------------------------------------------------------------------------------

PAYMENT_TEMPLATES = ("payment_link", "payment_reminder", "cod_confirm")
WA_PAY_GATEWAYS = ("razorpay", "payu", "billdesk", "zaakpay")


class GatewaySchema(BaseModel):
    # the gateway's keys; a blank secret keeps the one already saved
    credentials: dict[str, str] = Field(default_factory=dict)
    mode: Optional[Literal["test", "live"]] = None
    webhook_secret: Optional[str] = Field(None, max_length=300)
    # WhatsApp Pay: the payment configuration made in WhatsApp Manager, and the gateway behind it
    configuration_name: Optional[str] = Field(None, max_length=100)
    wa_gateway: Optional[Literal[WA_PAY_GATEWAYS]] = None  # type: ignore[valid-type]
    active: bool = True
    make_default: bool = False

    @field_validator("credentials", mode="before")
    @classmethod
    def _creds(cls, v):
        if not isinstance(v, dict):
            return v
        if len(v) > 6 or any(len(str(x)) > 500 for x in v.values()):
            raise ValueError("Those keys don't look right")
        return {str(k): str(x).strip() for k, x in v.items() if x is not None and str(x).strip()}

    @field_validator("webhook_secret", "configuration_name", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)


class PaymentOptionsSchema(BaseModel):
    online_enabled: bool = True
    link_expiry_minutes: int = Field(1440, ge=15, le=60 * 24 * 30)
    reminders: list[int] = Field(default_factory=lambda: [60, 720], max_length=3)  # minutes after the link
    cancel_unpaid: bool = False
    prepaid_kind: Optional[Literal["percent", "fixed"]] = None
    prepaid_value: Decimal = Field(Decimal("0"), ge=0, le=Decimal("1000000"), decimal_places=2)
    cod_confirm: bool = False
    cod_to_prepaid: bool = False
    templates: dict[Literal[PAYMENT_TEMPLATES], Optional[int]] = Field(default_factory=dict)  # type: ignore[valid-type]

    @field_validator("reminders")
    @classmethod
    def _reminders(cls, v):
        if any(m < 5 or m > 60 * 24 * 7 for m in v):
            raise ValueError("Reminders are between 5 minutes and 7 days after the link")
        return sorted(set(v))

    @model_validator(mode="after")
    def _check(self):
        if self.prepaid_kind == "percent" and not (0 < self.prepaid_value <= 50):
            raise ValueError("A prepaid discount is between 1 and 50%")
        if self.prepaid_kind == "fixed" and self.prepaid_value <= 0:
            raise ValueError("Enter the prepaid discount amount")
        if not self.prepaid_kind:
            self.prepaid_value = Decimal("0")
        return self


class PaymentLinkSchema(BaseModel):
    send: bool = True  # message it to the customer (otherwise just make it, to share another way)


class RefundSchema(BaseModel):
    amount: Money = Field(..., gt=0, le=Decimal("10000000"), decimal_places=2)
    reason: Optional[str] = Field(None, max_length=300)
    method: Literal["gateway", "manual"] = "gateway"  # manual: money given back outside ChatDesk (cash, bank)
    cancel_order: bool = False
    notify: bool = True

    @field_validator("reason", mode="before")
    @classmethod
    def _clean(cls, v):
        return _strip(v)
