from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.commerce import (
    carts, insights, manage, messages, meta, orders, payments, service, stores,
)
from app.modules.customer.commerce.schemas import (
    BulkSchema,
    CheckoutSchema,
    CollectionSchema,
    ConnectCatalogSchema,
    CouponSchema,
    GatewaySchema,
    OrderActionSchema,
    OrderNoteSchema,
    OrderSchema,
    OrderUpdateSchema,
    PaymentLinkSchema,
    PaymentOptionsSchema,
    PaymentStatusSchema,
    ProductSchema,
    RefundSchema,
    ReorderSchema,
    SendProductsSchema,
    SettingsSchema,
)
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/commerce", tags=["Customer Commerce"])
_csrf = Depends(require_customer_csrf)


# store settings and the Meta catalog ----------------------------------------------------------

@router.get("/settings")
def get_settings(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_settings(db, customer)


@router.put("/settings", dependencies=[_csrf])
def update_settings(payload: SettingsSchema, customer: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.update_settings(db, customer, payload)


@router.get("/catalog", dependencies=[Depends(RateLimit(30, 60))])
def catalogs(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return meta.catalogs(db, customer)


@router.post("/catalog/connect", dependencies=[_csrf, Depends(RateLimit(10, 60))])
def connect(payload: ConnectCatalogSchema, customer: Customer = Depends(require_admin),
            db: Session = Depends(get_db)):
    return meta.connect(db, customer, payload.catalog_id)


@router.delete("/catalog", dependencies=[_csrf])
def disconnect(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return meta.disconnect(db, customer)


@router.post("/catalog/sync", dependencies=[_csrf, Depends(RateLimit(10, 60))])
def sync(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return meta.sync_now(db, customer)


@router.post("/catalog/import", dependencies=[_csrf, Depends(RateLimit(5, 60))])
def import_catalog(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return meta.import_catalog(db, customer)


# collections ---------------------------------------------------------------------------------

@router.get("/collections")
def collections(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_collections(db, customer)


@router.post("/collections", dependencies=[_csrf])
def create_collection(payload: CollectionSchema, customer: Customer = Depends(require_admin),
                      db: Session = Depends(get_db)):
    return service.save_collection(db, customer, payload)


@router.put("/collections/order", dependencies=[_csrf])
def reorder_collections(payload: ReorderSchema, customer: Customer = Depends(require_admin),
                        db: Session = Depends(get_db)):
    return service.reorder_collections(db, customer, payload.ids)


@router.put("/collections/{collection_id}", dependencies=[_csrf])
def update_collection(collection_id: int, payload: CollectionSchema, customer: Customer = Depends(require_admin),
                      db: Session = Depends(get_db)):
    return service.save_collection(db, customer, payload, collection_id)


@router.delete("/collections/{collection_id}", dependencies=[_csrf])
def delete_collection(collection_id: int, customer: Customer = Depends(require_admin),
                      db: Session = Depends(get_db)):
    return service.delete_collection(db, customer, collection_id)


# products ------------------------------------------------------------------------------------

@router.get("/products")
def products(page: int | None = None, per_page: int | None = None, search: str | None = None,
             status: Literal["active", "hidden", "draft"] | None = None, collection_id: int | None = None,
             stock: Literal["out", "low"] | None = None, filters: str | None = None,
             match: Literal["and", "or"] = "and", sort: str | None = None,
             customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_products(db, customer, page, per_page, search, status, collection_id, stock, filters,
                                 match, sort)


@router.get("/products/stats")
def stats(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    meta.check_sync(db, customer)
    return service.stats(db, customer)


@router.post("/products/images", dependencies=[_csrf, Depends(RateLimit(60, 60))])
def upload_image(file: UploadFile = File(...), customer: Customer = Depends(require_admin)):
    return service.upload_image(customer, file)


@router.post("/products/bulk", dependencies=[_csrf])
def bulk(payload: BulkSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.bulk(db, customer, payload)


@router.post("/products", dependencies=[_csrf])
def create_product(payload: ProductSchema, customer: Customer = Depends(require_admin),
                   db: Session = Depends(get_db)):
    return service.create_product(db, customer, payload)


@router.get("/products/{product_id}")
def show_product(product_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.show_product(db, customer, product_id)


@router.put("/products/{product_id}", dependencies=[_csrf])
def update_product(product_id: int, payload: ProductSchema, customer: Customer = Depends(require_admin),
                   db: Session = Depends(get_db)):
    return service.update_product(db, customer, product_id, payload)


@router.post("/products/{product_id}/duplicate", dependencies=[_csrf])
def duplicate_product(product_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.duplicate_product(db, customer, product_id)


@router.delete("/products/{product_id}", dependencies=[_csrf])
def delete_product(product_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_product(db, customer, product_id)


# sending products in a chat --------------------------------------------------------------------

@router.post("/conversations/{conversation_id}/products", dependencies=[_csrf, Depends(RateLimit(60, 60))])
def send_products(conversation_id: int, payload: SendProductsSchema,
                  customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return messages.send(db, customer, conversation_id, payload)


# checkout, coupons and orders --------------------------------------------------------------------

def _person(owner: Customer) -> Customer:
    return getattr(owner, "actor", None) or owner


@router.get("/checkout")
def checkout_settings(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return manage.get_checkout(db, customer)


@router.put("/checkout", dependencies=[_csrf])
def update_checkout(payload: CheckoutSchema, customer: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return manage.update_checkout(db, customer, payload)


@router.get("/coupons")
def coupons(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return manage.list_coupons(db, customer)


@router.post("/coupons", dependencies=[_csrf])
def create_coupon(payload: CouponSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return manage.save_coupon(db, customer, payload)


@router.put("/coupons/{coupon_id}", dependencies=[_csrf])
def update_coupon(coupon_id: int, payload: CouponSchema, customer: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return manage.save_coupon(db, customer, payload, coupon_id)


@router.delete("/coupons/{coupon_id}", dependencies=[_csrf])
def delete_coupon(coupon_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return manage.delete_coupon(db, customer, coupon_id)


@router.get("/orders")
def list_orders(page: int | None = None, per_page: int | None = None, search: str | None = None,
                status: str | None = None, payment: str | None = None, contact_id: int | None = None,
                filters: str | None = None, match: Literal["and", "or"] = "and", sort: str | None = None,
                customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return orders.list_orders(db, customer, page, per_page, search, status, payment, contact_id, filters, match,
                              sort)


@router.get("/orders/stats")
def order_stats(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return orders.stats(db, customer)


@router.post("/orders", dependencies=[_csrf])
def create_order(payload: OrderSchema, customer: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return manage.create(db, customer, _person(customer), payload)


@router.get("/orders/{order_id}")
def show_order(order_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return orders.show(db, customer, order_id)


@router.put("/orders/{order_id}", dependencies=[_csrf])
def update_order(order_id: int, payload: OrderUpdateSchema, customer: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return manage.update(db, customer, _person(customer), order_id, payload)


@router.post("/orders/{order_id}/action", dependencies=[_csrf])
def order_action(order_id: int, payload: OrderActionSchema, customer: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return manage.act(db, customer, _person(customer), order_id, payload)


@router.put("/orders/{order_id}/payment", dependencies=[_csrf])
def order_payment(order_id: int, payload: PaymentStatusSchema, customer: Customer = Depends(require_workspace),
                  db: Session = Depends(get_db)):
    return manage.set_payment(db, customer, _person(customer), order_id, payload)


@router.post("/orders/{order_id}/notes", dependencies=[_csrf])
def order_note(order_id: int, payload: OrderNoteSchema, customer: Customer = Depends(require_workspace),
               db: Session = Depends(get_db)):
    return manage.add_note(db, customer, _person(customer), order_id, payload)


@router.post("/orders/{order_id}/send", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def order_send(order_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return manage.send_to_customer(db, customer, _person(customer), order_id)


@router.get("/contacts/{contact_id}/orders")
def contact_orders(contact_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return manage.contact_orders(db, customer, contact_id)


@router.post("/orders/{order_id}/payment-link", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def order_payment_link(order_id: int, payload: PaymentLinkSchema, customer: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    return payments.send_for_order(db, customer, _person(customer), order_id, payload.send)


@router.post("/orders/{order_id}/refunds", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def order_refund(order_id: int, payload: RefundSchema, customer: Customer = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return payments.refund(db, customer, _person(customer), order_id, payload)


@router.post("/orders/{order_id}/cod-confirmation", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def order_cod_confirmation(order_id: int, customer: Customer = Depends(require_workspace),
                           db: Session = Depends(get_db)):
    return payments.ask_cod(db, customer, _person(customer), order_id)


# payments ------------------------------------------------------------------------------------------

Provider = Literal["razorpay", "cashfree", "payu", "stripe", "whatsapp_pay"]


@router.get("/payments")
def list_payments(page: int | None = None, per_page: int | None = None, search: str | None = None,
                  status: str | None = None, provider: Provider | None = None,
                  customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return payments.list_payments(db, customer, page, per_page, search, status, provider)


@router.get("/payments/stats")
def payment_stats(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return payments.stats(db, customer)


@router.get("/payments/setup")
def payment_setup(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return payments.list_gateways(db, customer)


@router.put("/payments/options", dependencies=[_csrf])
def payment_options(payload: PaymentOptionsSchema, customer: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return payments.update_options(db, customer, payload)


@router.put("/payments/gateways/{provider}", dependencies=[_csrf, Depends(RateLimit(10, 60))])
def save_gateway(provider: Provider, payload: GatewaySchema, customer: Customer = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return payments.save_gateway(db, customer, provider, payload)


@router.post("/payments/gateways/{provider}/check", dependencies=[_csrf, Depends(RateLimit(10, 60))])
def check_gateway(provider: Provider, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return payments.check_gateway(db, customer, provider)


@router.post("/payments/gateways/{provider}/default", dependencies=[_csrf])
def default_gateway(provider: Provider, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return payments.make_default(db, customer, provider)


@router.delete("/payments/gateways/{provider}", dependencies=[_csrf])
def remove_gateway(provider: Provider, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return payments.remove_gateway(db, customer, provider)


@router.post("/payments/{payment_id}/check", dependencies=[_csrf, Depends(RateLimit(30, 60))])
def check_payment(payment_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return payments.refresh(db, customer, payment_id)


@router.post("/payments/{payment_id}/resend", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def resend_payment(payment_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return payments.resend(db, customer, _person(customer), payment_id)


@router.post("/payments/{payment_id}/cancel", dependencies=[_csrf])
def cancel_payment(payment_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return payments.cancel(db, customer, _person(customer), payment_id)


# abandoned carts ----------------------------------------------------------------------------------

@router.get("/carts")
def list_carts(state: Literal["open", "recovered", "lost"] = "open", page: int | None = None,
               per_page: int | None = None, search: str | None = None,
               customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return carts.list_carts(db, customer, state, page, per_page, search)


@router.get("/carts/stats")
def cart_stats(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return carts.stats(db, customer)


@router.get("/carts/settings")
def cart_settings(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return carts.get_settings(db, customer)


@router.put("/carts/settings", dependencies=[_csrf])
def save_cart_settings(payload: carts.RecoverySchema, customer: Customer = Depends(require_admin),
                       db: Session = Depends(get_db)):
    return carts.save_settings(db, customer, payload)


@router.post("/orders/{order_id}/remind", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def remind_order(order_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return carts.remind_now(db, customer, _person(customer), order_id)


# online stores (Shopify, WooCommerce) -------------------------------------------------------------

StorePlatform = Literal["shopify", "woocommerce"]


@router.get("/stores")
def list_stores(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return stores.list_stores(db, customer)


@router.put("/stores/{platform}", dependencies=[_csrf, Depends(RateLimit(10, 60))])
def save_store(platform: StorePlatform, payload: stores.StoreSchema, customer: Customer = Depends(require_admin),
               db: Session = Depends(get_db)):
    return stores.save_store(db, customer, platform, payload)


@router.post("/stores/{platform}/sync", dependencies=[_csrf, Depends(RateLimit(5, 60))])
def sync_store(platform: StorePlatform, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return stores.sync(db, customer, platform)


@router.delete("/stores/{platform}", dependencies=[_csrf])
def remove_store(platform: StorePlatform, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return stores.remove_store(db, customer, platform)


# insights ----------------------------------------------------------------------------------------------

@router.get("/insights")
def commerce_insights(days: int = 30, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    if days not in insights.PERIODS:
        from fastapi import HTTPException

        raise HTTPException(422, detail="Choose 7, 30 or 90 days")
    return insights.insights(db, customer, days)
