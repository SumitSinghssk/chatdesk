import base64
import hashlib
import hmac
import json
from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.modules.customer.commerce import carts, stores
from app.modules.customer.commerce.models import Order
from app.shared.utils.datetime import now
from tests.test_commerce import C, FakeShop, shop  # noqa: F401
from tests.test_inbox import BASE, WEB, business, inbound  # noqa: F401
from tests.test_orders import _checkout, _order, _sent
from tests.test_shop_payments import pay  # noqa: F401

API_SECRET = "shpss_secret"
NEHA = "919822233344"


def _shopify_product(pid=101, price="499.00", compare="599.00"):
    return {"id": pid, "title": "Kaju Katli", "body_html": "<p>Fresh <b>cashew</b> fudge</p>", "status": "active",
            "handle": "kaju-katli", "images": [{"src": "https://cdn.shopify.com/kk.jpg"}],
            "options": [{"name": "Size", "values": ["250 g", "500 g"]}],
            "variants": [{"id": 1001, "sku": "KK-250", "option1": "250 g", "price": price, "compare_at_price": compare,
                          "inventory_management": "shopify", "inventory_quantity": 12},
                         {"id": 1002, "sku": "", "option1": "500 g", "price": "899.00", "compare_at_price": None,
                          "inventory_management": None, "inventory_quantity": 0}]}


def _shopify_order(oid=5001, number=1042, cod=True, fulfilled=False, token=None, cancelled=False):
    order = {"id": oid, "name": f"#{number}", "order_number": number, "currency": "INR",
             "financial_status": "pending" if cod else "paid", "payment_gateway_names": ["Cash on Delivery (COD)"] if cod
             else ["razorpay"], "subtotal_price": "998.00", "total_discounts": "0.00", "total_tax": "0.00",
             "total_price": "1038.00", "taxes_included": True,
             "total_shipping_price_set": {"shop_money": {"amount": "40.00"}},
             "phone": None, "email": "neha@example.com", "created_at": "2026-10-20T10:00:00+05:30",
             "customer": {"first_name": "Neha", "last_name": "Gupta", "phone": "+91 98222 33344"},
             "shipping_address": {"name": "Neha Gupta", "address1": "14 Rose Villa", "city": "Pune",
                                  "province": "Maharashtra", "zip": "411001", "phone": "9822233344"},
             "line_items": [{"product_id": 101, "variant_id": 1001, "sku": "KK-250", "title": "Kaju Katli",
                             "variant_title": "250 g", "quantity": 2, "price": "499.00"}],
             "discount_codes": [], "fulfillments": [], "checkout_token": token,
             "cancelled_at": "2026-10-21T10:00:00Z" if cancelled else None}
    if fulfilled:
        order["fulfillment_status"] = "fulfilled"
        order["fulfillments"] = [{"tracking_company": "Delhivery", "tracking_number": "DLV1",
                                  "tracking_url": "https://track.example.com/DLV1"}]
    return order


class FakeStore:
    calls: list = []
    shopify_products: list = []
    shopify_orders: list = []

    def __call__(self, method, url, headers, body=None, form=None, timeout=20):
        FakeStore.calls.append((method, url, body))
        if ".myshopify.com" in url:
            if headers.get("X-Shopify-Access-Token") != "shpat_good":
                return 401, {"errors": "[API] Invalid API key or access token"}
            path = url.split(f"/admin/api/{stores.SHOPIFY_VERSION}", 1)[1]
            if path == "/shop.json":
                return 200, {"shop": {"name": "Meera Sweets"}}
            if path == "/webhooks.json":
                return 201, {"webhook": {"id": len(FakeStore.calls)}}
            if path.startswith("/products.json"):
                return 200, {"products": FakeStore.shopify_products}
            if path.startswith("/orders.json"):
                return 200, {"orders": FakeStore.shopify_orders}
            if path.startswith("/webhooks/"):
                return 200, {}
        if "wp-json/wc/v3" in url:
            auth = base64.b64decode(headers["Authorization"].split()[1]).decode()
            if auth != "ck_good:cs_good":
                return 401, {"code": "woocommerce_rest_cannot_view", "message": "Sorry, you cannot list resources."}
            path = url.split("/wp-json/wc/v3", 1)[1]
            if path.startswith("/products?per_page=1"):
                return 200, []
            if path == "/webhooks":
                return 201, {"id": len(FakeStore.calls)}
            if path.startswith("/products/77/variations"):
                return 200, [{"id": 771, "sku": "LD-S", "attributes": [{"name": "Box", "option": "Small"}],
                              "regular_price": "300", "sale_price": "", "manage_stock": True, "stock_quantity": 5},
                             {"id": 772, "sku": "LD-L", "attributes": [{"name": "Box", "option": "Large"}],
                              "regular_price": "550", "sale_price": "500", "manage_stock": False}]
            if path.startswith("/products?"):
                return 200, [{"id": 77, "name": "Ladoo", "type": "variable", "status": "publish",
                              "short_description": "Besan ladoo", "permalink": "https://shop.example.com/ladoo",
                              "images": [{"src": "https://shop.example.com/ladoo.jpg"}],
                              "attributes": [{"name": "Box", "options": ["Small", "Large"], "variation": True}]}]
            if path.startswith("/orders?"):
                return 200, []
        return 404, {"errors": "Not Found"}


@pytest.fixture()
def stores_api(pay, monkeypatch):  # noqa: F811
    FakeStore.calls, FakeStore.shopify_products, FakeStore.shopify_orders = [], [_shopify_product()], []
    monkeypatch.setattr(stores, "request", FakeStore())
    _checkout(pay, notifications={"shipped": {"on": True, "template_id": None}})
    return pay


def _hook(web, platform, key, payload, topic, secret):
    body = json.dumps(payload).encode()
    sig = base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()
    headers = {"Content-Type": "application/json"}
    if platform == "shopify":
        headers.update({"X-Shopify-Hmac-Sha256": sig, "X-Shopify-Topic": topic})
    else:
        headers.update({"X-WC-Webhook-Signature": sig, "X-WC-Webhook-Topic": topic})
    return web.post(f"/api/v1/website/shop/store/{platform}/{key}", content=body, headers=headers)


def test_shopify_products_orders_tracking_and_abandoned_checkouts(stores_api):
    web = stores_api
    bad = web.put(f"{C}/stores/shopify", headers=WEB, json={"shop_url": "meera-sweets",
                                                            "credentials": {"access_token": "nope", "api_secret": "x"}})
    assert bad.status_code == 422 and "refused the keys" in bad.text
    assert web.put(f"{C}/stores/shopify", headers=WEB, json={"shop_url": "not a url!",
                                                             "credentials": {}}).status_code == 422
    FakeStore.shopify_orders = [_shopify_order(oid=4999, number=1041)]  # an older order: imported quietly
    sent_before = len(FakeShop.sent)
    res = web.put(f"{C}/stores/shopify", headers=WEB, json={
        "shop_url": "https://Meera-Sweets.myshopify.com/admin",
        "credentials": {"access_token": "shpat_good", "api_secret": API_SECRET}})
    assert res.status_code == 200, res.text
    conn = res.json()["data"]
    assert conn["shop_url"] == "meera-sweets.myshopify.com" and conn["name"] == "Meera Sweets"
    assert conn["webhooks"] == len(stores.Shopify.topics) and "shpat_good" not in res.text
    hooks = [b["webhook"]["topic"] for m, u, b in FakeStore.calls if u.endswith("/webhooks.json")]
    assert set(hooks) == set(stores.Shopify.topics)
    listed = web.get(f"{C}/stores").json()["data"]
    assert listed[0]["store"]["products_synced"] == 1 and listed[0]["store"]["orders_synced"] == 1
    assert len(FakeShop.sent) == sent_before  # old orders bring no messages

    # products came in with their variants, sale prices and stock
    product = web.get(f"{C}/products", params={"page": 1}).json()["data"][0]
    detail = web.get(f"{C}/products/{product['id']}").json()["data"]
    assert detail["name"] == "Kaju Katli" and detail["description"] == "Fresh cashew fudge"
    v250, v500 = detail["variants"]
    assert (v250["retailer_id"], v250["price"], v250["sale_price"], v250["stock"]) == ("KK-250", 599, 499, 12)
    assert v500["retailer_id"] == "SH-1002" and v500["stock"] is None
    key = conn["webhook_url"].rsplit("/", 1)[1]

    # a new order: the customer is chatting, so they get the confirmation on WhatsApp
    inbound(web, wa_id=NEHA, name="Neha", text="Hi, I just ordered on your website")
    assert _hook(web, "shopify", key, _shopify_order(), "orders/create", "forged").status_code == 401
    assert _hook(web, "shopify", key, _shopify_order(), "orders/create", API_SECRET).status_code == 200
    assert _hook(web, "shopify", key, _shopify_order(), "orders/create", API_SECRET).status_code == 200  # a retry
    rows = web.get(f"{C}/orders", params={"page": 1}).json()["data"]
    assert len(rows) == 2
    order = _order(web, rows[0]["number"])
    assert order["source"] == "shopify" and order["external_ref"] == "#1042" and order["status"] == "confirmed"
    assert order["total"] == 1038 and order["shipping"] == 40 and order["payment_method"] == "cod"
    assert order["contact"]["phone"] == f"+{NEHA}" and order["items"][0]["variant_label"] == "250 g"
    assert "*Order #" in _sent("text")[-1]["text"]["body"] and "confirmed" in _sent("text")[-1]["text"]["body"]

    # shipped in Shopify: the tracking goes to the customer
    assert _hook(web, "shopify", key, _shopify_order(fulfilled=True), "orders/updated", API_SECRET).status_code == 200
    order = _order(web, order["number"])
    assert order["status"] == "shipped" and order["tracking_number"] == "DLV1"
    shipped = _sent("text")[-1]["text"]["body"]
    assert "has shipped via Delhivery" in shipped and "https://track.example.com/DLV1" in shipped

    # an abandoned checkout gets a cart reminder linking back to the store, and counts as recovered
    web.put(f"{C}/carts/settings", headers=WEB, json={"on": True, "steps": [{"after": 60}]})
    checkout = {"token": "tok123", "abandoned_checkout_url": "https://meera-sweets.myshopify.com/checkouts/tok123",
                "completed_at": None, "currency": "INR", "total_price": "1038.00", "subtotal_price": "998.00",
                "total_discounts": "0.00", "created_at": "2026-10-26T08:00:00Z",
                "customer": {"first_name": "Neha", "phone": "+919822233344"},
                "line_items": [{"product_id": 101, "variant_id": 1001, "sku": "KK-250", "title": "Kaju Katli",
                                "variant_title": "250 g", "quantity": 2, "price": "499.00"}]}
    assert _hook(web, "shopify", key, checkout, "checkouts/create", API_SECRET).status_code == 200
    cart = web.get(f"{C}/carts", params={"state": "open"}).json()["data"][0]
    with SessionLocal() as db:
        db.get(Order, cart["id"]).placed_at = now() - timedelta(minutes=90)
        db.commit()
        assert carts.run_due(db) == (1, 0)
    cta = _sent("cta_url")[-1]["interactive"]
    assert cta["action"]["parameters"]["url"] == checkout["abandoned_checkout_url"]
    assert "You left something in your cart" in cta["body"]["text"]
    done = _shopify_order(oid=5002, number=1043, cod=False, token="tok123")
    assert _hook(web, "shopify", key, done, "orders/create", API_SECRET).status_code == 200
    recovered = _order(web, cart["number"])
    assert recovered["status"] == "confirmed" and recovered["recovered_at"] and recovered["external_ref"] == "#1043"
    assert recovered["payment_status"] == "paid"
    assert web.get(f"{C}/carts/stats").json()["data"]["recovered"] == 1

    # cancelled in Shopify; a product edit updates the price
    assert _hook(web, "shopify", key, _shopify_order(oid=5002, number=1043, cod=False, token="tok123", cancelled=True),
                 "orders/cancelled", API_SECRET).status_code == 200
    assert _order(web, cart["number"])["status"] == "cancelled"
    assert _hook(web, "shopify", key, _shopify_product(price="449.00"), "products/update", API_SECRET).status_code == 200
    assert web.get(f"{C}/products/{product['id']}").json()["data"]["variants"][0]["sale_price"] == 449
    assert web.delete(f"{C}/stores/shopify", headers=WEB).status_code == 200
    assert _hook(web, "shopify", key, _shopify_order(), "orders/create", API_SECRET).status_code == 404


def test_woocommerce_cod_confirmation_and_delivery(stores_api):
    web = stores_api
    web.put(f"{C}/payments/options", headers=WEB, json={"cod_confirm": True})
    assert web.put(f"{C}/stores/woocommerce", headers=WEB, json={
        "shop_url": "shop.example.com", "credentials": {"consumer_key": "ck_bad", "consumer_secret": "x"}}
                   ).status_code == 422
    res = web.put(f"{C}/stores/woocommerce", headers=WEB, json={
        "shop_url": "https://shop.example.com/", "credentials": {"consumer_key": "ck_good", "consumer_secret": "cs_good"}})
    assert res.status_code == 200, res.text
    conn = res.json()["data"]
    assert conn["shop_url"] == "https://shop.example.com" and conn["products_synced"] == 1
    secret = [b["secret"] for m, u, b in FakeStore.calls if u.endswith("/webhooks")][0]
    detail = web.get(f"{C}/products/{web.get(f'{C}/products', params={'page': 1}).json()['data'][0]['id']}").json()["data"]
    assert [(v["retailer_id"], v["option_values"], v["price"], v["sale_price"]) for v in detail["variants"]] == [
        ("LD-S", {"Box": "Small"}, 300, None), ("LD-L", {"Box": "Large"}, 550, 500)]
    key = conn["webhook_url"].rsplit("/", 1)[1]
    assert web.post(f"/api/v1/website/shop/store/woocommerce/{key}", content=b"webhook_id=12").status_code == 200

    inbound(web, wa_id=NEHA, name="Neha", text="Hello")
    woo = {"id": 880, "number": "880", "status": "processing", "currency": "INR", "total": "540.00",
           "discount_total": "0.00", "shipping_total": "40.00", "total_tax": "0.00", "payment_method": "cod",
           "date_paid": None, "date_created_gmt": "2026-10-26T09:00:00", "customer_note": "Ring the bell",
           "billing": {"first_name": "Neha", "last_name": "Gupta", "phone": "9822233344", "email": "n@example.com",
                       "address_1": "14 Rose Villa", "city": "Pune", "postcode": "411001"},
           "shipping": {}, "line_items": [{"product_id": 77, "variation_id": 772, "sku": "LD-L", "name": "Ladoo - Large",
                                           "quantity": 1, "price": 500}], "coupon_lines": []}
    assert _hook(web, "woocommerce", key, woo, "order.created", secret).status_code == 200
    order = _order(web)
    assert order["source"] == "woocommerce" and order["status"] == "confirmed" and order["total"] == 540
    assert order["cod_check"] == "pending" and order["note"] == "Ring the bell"
    ask = _sent("button")[-1]["interactive"]
    assert "Please confirm your order" in ask["body"]["text"]
    inbound(web, wa_id=NEHA, text="yes")
    assert _order(web)["cod_check"] == "confirmed"

    woo["status"] = "completed"
    assert _hook(web, "woocommerce", key, woo, "order.updated", secret).status_code == 200
    order = _order(web)
    assert order["status"] == "delivered" and order["payment_status"] == "paid"  # cash collected


def test_insights(stores_api):
    from app.modules.customer.campaigns.models import WaCampaign, WaCampaignRecipient
    from app.modules.customer.chatbots.models import WaChatbot, WaChatbotSession

    web = stores_api
    inbound(web, wa_id=NEHA, name="Neha", text="Hi")
    contact = web.get(f"{BASE}/inbox/conversations", params={"status": "all"}).json()["data"][0]["contact"]
    product = web.post(f"{C}/products", headers=WEB, json={"name": "Ladoo", "images": [], "status": "active",
                                                           "variants": [{"price": 250, "stock": None}]}).json()["data"]
    with SessionLocal() as db:
        from app.modules.customer.commerce.models import CommerceSettings

        owner_id = db.query(CommerceSettings).order_by(CommerceSettings.id.desc()).first().customer_id
        campaign = WaCampaign(customer_id=owner_id, name="Diwali sale", template_name="diwali", template_language="en",
                              status="completed")
        db.add(campaign)
        db.flush()
        db.add(WaCampaignRecipient(campaign_id=campaign.id, contact_id=contact["id"], status="sent",
                                   sent_at=now() - timedelta(days=2)))
        bot = WaChatbot(customer_id=owner_id, name="Shop bot", trigger="keyword", keywords=[], graph={})
        db.add(bot)
        db.commit()
        campaign_id, bot_id = campaign.id, bot.id
    for qty in (2, 1):
        res = web.post(f"{C}/orders", headers=WEB, json={
            "contact_id": contact["id"], "items": [{"variant_id": product["variants"][0]["id"], "quantity": qty}],
            "payment_method": "cod", "mode": "confirmed"})
        assert res.status_code == 200, res.text
    web.post(f"{C}/orders", headers=WEB, json={"items": [{"name": "Gift box", "unit_price": 100}], "paid": True,
                                               "mode": "confirmed"})
    with SessionLocal() as db:
        conv = db.query(Order).filter(Order.contact_id == contact["id"]).first().conversation_id
        db.add(WaChatbotSession(customer_id=owner_id, chatbot_id=bot_id, contact_id=contact["id"],
                                conversation_id=conv, status="ended", started_at=now() - timedelta(hours=2),
                                last_activity_at=now(), variables={}, trail=[]))
        db.commit()

    data = web.get(f"{C}/insights", params={"days": 7}).json()["data"]
    k = data["kpis"]
    # 2 × 250 + 50 delivery + 20 COD fee, 250 + 50 + 20, and 100 + 50 (the test's checkout settings)
    assert k["orders"] == 3 and k["revenue"] == 1040 and k["aov_text"] == "₹346.66" and k["items_sold"] == 4
    assert k["customers"] == 1 and len(data["series"]) == 7 and data["series"][-1]["orders"] == 3
    assert data["by_source"][0]["label"] == "Made by the team" and data["by_source"][0]["orders"] == 3
    assert {p["label"] for p in data["by_payment"]} == {"Cash on delivery", "Other / marked paid"}
    assert data["top_products"][0]["name"] == "Ladoo" and data["top_products"][0]["quantity"] == 3
    assert data["campaigns"] == [{"id": campaign_id, "name": "Diwali sale", "orders": 2, "revenue": 890,
                                  "revenue_text": "₹890", "sent": 1, "conversion": 200.0}]
    assert data["chatbots"][0]["name"] == "Shop bot" and data["chatbots"][0]["orders"] == 2
    assert [f["count"] for f in data["funnel"]] == [0, 0, 0, 0]
    assert web.get(f"{C}/insights", params={"days": 12}).status_code == 422
