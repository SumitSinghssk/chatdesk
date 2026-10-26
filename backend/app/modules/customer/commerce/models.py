from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class CommerceSettings(Base, TimestampMixin):
    """One per business: its currency and the Meta catalog its products are kept in."""

    __tablename__ = "commerce_settings"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    currency = Column(String(3), nullable=False, default="INR")
    store_name = Column(String(120), nullable=True)  # brand on catalog items; defaults to the business name
    # the Meta catalog connected to the WhatsApp Business Account
    catalog_id = Column(String(40), nullable=True)
    catalog_name = Column(String(200), nullable=True)
    catalog_connected_at = Column(DateTime, nullable=True)
    cart_enabled = Column(Boolean, nullable=False, default=True)
    catalog_visible = Column(Boolean, nullable=False, default=True)
    auto_sync = Column(Boolean, nullable=False, default=True)  # push every product change to Meta
    last_sync_at = Column(DateTime, nullable=True)
    sync_handle = Column(String(120), nullable=True)  # Meta's batch handle, checked for per-item errors
    sync_error = Column(Text, nullable=True)
    # checkout
    order_prefix = Column(String(10), nullable=False, default="#", server_default="#")
    next_number = Column(Integer, nullable=False, default=1001, server_default="1001")
    shipping_fee = Column(Integer, nullable=False, default=0, server_default="0")  # flat, paise/cents
    free_shipping_above = Column(Integer, nullable=True)
    tax_percent = Column(Integer, nullable=False, default=0, server_default="0")  # in hundredths: 1800 = 18%
    tax_inclusive = Column(Boolean, nullable=False, default=True, server_default="true")  # prices include tax
    cod_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    cod_fee = Column(Integer, nullable=False, default=0, server_default="0")
    min_order = Column(Integer, nullable=True)
    ask_address = Column(Boolean, nullable=False, default=True, server_default="true")
    # WhatsApp messages at each step: {"confirmed": {"on": true, "template_id": 12}, ...}
    notifications = Column(JSON, nullable=False, default=dict, server_default="{}")
    # payments
    online_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    link_expiry_minutes = Column(Integer, nullable=False, default=1440, server_default="1440")
    reminders = Column(JSON, nullable=False, default=lambda: [60, 720], server_default="[60, 720]")  # minutes
    cancel_unpaid = Column(Boolean, nullable=False, default=False, server_default="false")  # when the link expires
    prepaid_kind = Column(String(10), nullable=True)  # percent | fixed: a discount for paying online
    prepaid_value = Column(Integer, nullable=False, default=0, server_default="0")  # percent, or paise/cents
    cod_confirm = Column(Boolean, nullable=False, default=False, server_default="false")  # ask COD buyers to confirm
    cod_to_prepaid = Column(Boolean, nullable=False, default=False, server_default="false")  # offer to pay now
    # abandoned carts: {"on": bool, "steps": [{"after": minutes, "coupon_id": int|None, "template_id": int|None}]}
    recovery = Column(JSON, nullable=False, default=dict, server_default="{}")


class ProductCollection(Base, TimestampMixin):
    """A group of products, e.g. "Sweets" or "Gift boxes": a section in multi-product messages."""

    __tablename__ = "commerce_collections"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    description = Column(String(300), nullable=True)
    position = Column(Integer, nullable=False, default=0)


class Product(Base, TimestampMixin, SoftDeleteMixin):
    """Something the business sells. It has one or more variants (sizes, colours), each a catalog item."""

    __tablename__ = "commerce_products"
    __table_args__ = (Index("ix_commerce_products_customer_status", "customer_id", "status"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    collection_id = Column(Integer, ForeignKey("commerce_collections.id", ondelete="SET NULL"), nullable=True,
                           index=True)
    brand = Column(String(100), nullable=True)
    images = Column(JSON, nullable=False, default=list)  # stored upload paths ("uploads/products/…") or URLs
    url = Column(String(500), nullable=True)  # the product page on the business's website, if any
    status = Column(String(10), nullable=False, default="active")  # active | hidden | draft
    condition = Column(String(20), nullable=False, default="new")
    # variant options, e.g. [{"name": "Size", "values": ["S", "M"]}, {"name": "Colour", "values": ["Red"]}]
    options = Column(JSON, nullable=False, default=list)
    source = Column(String(20), nullable=False, default="manual")  # manual | import | meta | shopify | woocommerce
    external_id = Column(String(64), nullable=True, index=True)  # the product's id in Shopify / WooCommerce

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan",
                            order_by="ProductVariant.position", passive_deletes=True)
    collection = relationship("ProductCollection")


class ProductVariant(Base, TimestampMixin):
    """One buyable version of a product (one size/colour). Its SKU is its id in the Meta catalog."""

    __tablename__ = "commerce_variants"
    __table_args__ = (UniqueConstraint("customer_id", "retailer_id", name="uq_commerce_variants_sku"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("commerce_products.id", ondelete="CASCADE"), nullable=False,
                        index=True)
    retailer_id = Column(String(100), nullable=False)  # SKU; Meta's content id
    option_values = Column(JSON, nullable=False, default=dict)  # {"Size": "M", "Colour": "Red"}
    price = Column(Integer, nullable=False, default=0)  # in paise/cents
    sale_price = Column(Integer, nullable=True)
    stock = Column(Integer, nullable=True)  # None: not tracked (always in stock)
    image = Column(String(500), nullable=True)  # one of the product's images, for this variant
    position = Column(Integer, nullable=False, default=0)
    # Meta catalog sync: synced | pending | error
    sync_state = Column(String(10), nullable=False, default="pending")
    sync_error = Column(String(500), nullable=True)
    synced_at = Column(DateTime, nullable=True)
    external_id = Column(String(64), nullable=True)  # the variant's id in Shopify / WooCommerce

    product = relationship("Product", back_populates="variants")


class Coupon(Base, TimestampMixin):
    """A discount code customers type in the chat, or the team applies to an order."""

    __tablename__ = "commerce_coupons"
    __table_args__ = (UniqueConstraint("customer_id", "code", name="uq_commerce_coupons_code"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(30), nullable=False)  # stored upper case
    kind = Column(String(15), nullable=False, default="percent")  # percent | fixed | free_shipping
    value = Column(Integer, nullable=False, default=0)  # percent (1-100), or paise/cents for fixed
    min_order = Column(Integer, nullable=True)  # paise/cents
    max_discount = Column(Integer, nullable=True)  # cap for percent coupons
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    usage_limit = Column(Integer, nullable=True)  # total uses
    per_customer = Column(Integer, nullable=True)  # uses per customer
    used = Column(Integer, nullable=False, default=0)
    active = Column(Boolean, nullable=False, default=True)
    description = Column(String(200), nullable=True)


class Order(Base, TimestampMixin):
    """An order: from a WhatsApp cart, a Buy now tap, or made by the team."""

    __tablename__ = "commerce_orders"
    __table_args__ = (
        UniqueConstraint("customer_id", "number", name="uq_commerce_orders_number"),
        Index("ix_commerce_orders_customer_status", "customer_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(Integer, nullable=False)  # shown as prefix + number, e.g. #1024
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="SET NULL"), nullable=True)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)
    # whatsapp_cart | buy_button | manual | chatbot | shopify | woocommerce
    source = Column(String(20), nullable=False, default="manual")
    # an order (or abandoned checkout, "checkout:<token>") from a connected store, kept as the store has it
    external_id = Column(String(80), nullable=True, index=True)
    external_ref = Column(String(40), nullable=True)  # the store's own order number, e.g. #1042
    external_url = Column(String(1000), nullable=True)  # the store's checkout link (abandoned checkouts)
    # checkout: waiting for the customer (address, then how to pay); then the order's own life
    # draft | awaiting_address | awaiting_payment | confirmed | packed | shipped | delivered | cancelled
    status = Column(String(20), nullable=False, default="confirmed", index=True)
    # unpaid | paid | partially_refunded | refunded
    payment_status = Column(String(20), nullable=False, default="unpaid")
    payment_method = Column(String(20), nullable=True)  # cod | online
    prepaid_discount = Column(Integer, nullable=False, default=0, server_default="0")  # for paying online
    # asking a cash-on-delivery buyer to confirm: pending | confirmed | declined
    cod_check = Column(String(10), nullable=True)
    cod_checked_at = Column(DateTime, nullable=True)
    # abandoned-cart reminders sent while the customer hadn't finished checkout, and whether one won it back
    recovery_sent = Column(Integer, nullable=False, default=0, server_default="0")
    last_recovery_at = Column(DateTime, nullable=True)
    recovered_at = Column(DateTime, nullable=True)
    recovered_step = Column(Integer, nullable=True)  # which reminder (1, 2, 3) it came back after
    currency = Column(String(3), nullable=False, default="INR")
    subtotal = Column(Integer, nullable=False, default=0)  # paise/cents, before discount
    discount = Column(Integer, nullable=False, default=0)
    shipping = Column(Integer, nullable=False, default=0)
    cod_fee = Column(Integer, nullable=False, default=0)
    tax = Column(Integer, nullable=False, default=0)
    total = Column(Integer, nullable=False, default=0)
    coupon_code = Column(String(30), nullable=True)
    customer_name = Column(String(150), nullable=True)
    customer_phone = Column(String(25), nullable=True)
    address = Column(JSON, nullable=True)  # {name, phone, line1, line2, landmark, city, state, pincode, country}
    note = Column(Text, nullable=True)  # from the customer
    internal_note = Column(Text, nullable=True)
    courier = Column(String(80), nullable=True)
    tracking_number = Column(String(80), nullable=True)
    tracking_url = Column(String(500), nullable=True)
    cancel_reason = Column(String(300), nullable=True)
    invoice_key = Column(String(40), nullable=True, unique=True)  # the public invoice link
    created_by = Column(String(150), nullable=True)
    placed_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    packed_at = Column(DateTime, nullable=True)
    shipped_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan",
                         order_by="OrderItem.id", passive_deletes=True)
    events = relationship("OrderEvent", back_populates="order", cascade="all, delete-orphan",
                          order_by="OrderEvent.id", passive_deletes=True)
    payments = relationship("OrderPayment", back_populates="order", order_by="OrderPayment.id", passive_deletes=True)


class OrderItem(Base):
    """A line of an order. Name and price are copied, so the order stays right if the product changes."""

    __tablename__ = "commerce_order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("commerce_products.id", ondelete="SET NULL"), nullable=True)
    variant_id = Column(Integer, ForeignKey("commerce_variants.id", ondelete="SET NULL"), nullable=True)
    retailer_id = Column(String(100), nullable=True)
    name = Column(String(200), nullable=False)
    variant_label = Column(String(150), nullable=True)
    image = Column(String(500), nullable=True)
    unit_price = Column(Integer, nullable=False, default=0)
    quantity = Column(Integer, nullable=False, default=1)

    order = relationship("Order", back_populates="items")


class OrderEvent(Base):
    """The order's timeline: placed, address added, confirmed, shipped, messages sent, notes."""

    __tablename__ = "commerce_order_events"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # placed | status | address | message | note | payment | edit
    text = Column(String(1000), nullable=False)
    actor = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False)

    order = relationship("Order", back_populates="events")


class PaymentGateway(Base, TimestampMixin):
    """A business's own payment account (Razorpay, Cashfree, PayU, Stripe) or WhatsApp Pay. Money goes
    straight to the business; ChatDesk only makes the links and hears back when they're paid."""

    __tablename__ = "commerce_gateways"
    __table_args__ = (UniqueConstraint("customer_id", "provider", name="uq_commerce_gateways_provider"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)  # razorpay | cashfree | payu | stripe | whatsapp_pay
    mode = Column(String(4), nullable=False, default="test")  # test | live
    credentials = Column(Text, nullable=True)  # encrypted JSON
    hint = Column(String(80), nullable=True)  # the key, masked, so people can tell which account it is
    webhook_key = Column(String(40), nullable=False, unique=True)  # in the webhook URL given to the gateway
    webhook_secret = Column(Text, nullable=True)  # encrypted
    active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)  # the one payment links use
    verified_at = Column(DateTime, nullable=True)
    last_event_at = Column(DateTime, nullable=True)
    last_error = Column(String(500), nullable=True)


class OrderPayment(Base, TimestampMixin):
    """One request for money: a payment link, or WhatsApp's own Review and pay."""

    __tablename__ = "commerce_payments"
    __table_args__ = (Index("ix_commerce_payments_open", "status", "expires_at"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway_id = Column(Integer, ForeignKey("commerce_gateways.id", ondelete="SET NULL"), nullable=True)
    provider = Column(String(20), nullable=False)
    reference = Column(String(40), nullable=False, unique=True)  # ours: the order number + random letters
    provider_ref = Column(String(120), nullable=True, index=True)  # the gateway's link / session id
    provider_payment_id = Column(String(120), nullable=True)  # the payment itself, needed for refunds
    url = Column(String(1000), nullable=True)
    amount = Column(Integer, nullable=False)  # paise/cents
    currency = Column(String(3), nullable=False, default="INR")
    # created (waiting) | paid | failed | expired | cancelled
    status = Column(String(10), nullable=False, default="created", index=True)
    refunded = Column(Integer, nullable=False, default=0)
    method = Column(String(30), nullable=True)  # upi, card, netbanking...
    purpose = Column(String(12), nullable=False, default="checkout")  # checkout | prepaid (switching from COD)
    expires_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    checked_at = Column(DateTime, nullable=True)  # last time we asked the gateway (in case a webhook was missed)
    reminders_sent = Column(Integer, nullable=False, default=0)
    error = Column(String(500), nullable=True)
    created_by = Column(String(150), nullable=True)

    order = relationship("Order", back_populates="payments")
    refunds = relationship("OrderRefund", back_populates="payment", order_by="OrderRefund.id", passive_deletes=True)


class OrderRefund(Base):
    """Money given back: through the gateway, or recorded by the team (cash, bank transfer)."""

    __tablename__ = "commerce_refunds"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_id = Column(Integer, ForeignKey("commerce_payments.id", ondelete="SET NULL"), nullable=True)
    provider = Column(String(20), nullable=False, default="manual")
    provider_ref = Column(String(120), nullable=True, index=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="pending")  # pending | processed | failed
    reason = Column(String(300), nullable=True)
    error = Column(String(500), nullable=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False)
    processed_at = Column(DateTime, nullable=True)

    payment = relationship("OrderPayment", back_populates="refunds")


class StoreConnection(Base, TimestampMixin):
    """A business's Shopify or WooCommerce store: products come in, orders come in by webhook, and the
    customer gets WhatsApp updates, COD confirmation and abandoned-checkout reminders."""

    __tablename__ = "commerce_stores"
    __table_args__ = (UniqueConstraint("customer_id", "platform", name="uq_commerce_stores_platform"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(20), nullable=False)  # shopify | woocommerce
    shop_url = Column(String(255), nullable=False)
    name = Column(String(200), nullable=True)
    credentials = Column(Text, nullable=True)  # encrypted JSON
    webhook_key = Column(String(40), nullable=False, unique=True)
    webhook_secret = Column(Text, nullable=True)  # encrypted (WooCommerce: made by ChatDesk)
    webhooks = Column(JSON, nullable=False, default=list)  # the store's webhook ids, removed on disconnect
    import_orders = Column(Boolean, nullable=False, default=True)
    notify = Column(Boolean, nullable=False, default=True)  # WhatsApp order updates for store orders
    abandoned = Column(Boolean, nullable=False, default=True)  # cart reminders for abandoned checkouts
    status = Column(String(12), nullable=False, default="connected")  # connected | error
    last_error = Column(String(500), nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_event_at = Column(DateTime, nullable=True)
    products_synced = Column(Integer, nullable=False, default=0)
    orders_synced = Column(Integer, nullable=False, default=0)
