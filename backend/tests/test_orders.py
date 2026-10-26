import json
from datetime import timedelta

from app.core.database import SessionLocal
from app.modules.customer.inbox.models import WaConversation
from app.shared.utils.datetime import now
from tests.test_commerce import C, FakeShop, _product, shop  # noqa: F401
from tests.test_inbox import BASE, WEB, business, first_conversation, inbound  # noqa: F401

ASHA = "919811100001"
TOM = "447700900123"


def _checkout(web, **over):
    body = {"order_prefix": "#", "shipping_fee": 50, "free_shipping_above": 1000, "tax_percent": 18,
            "tax_inclusive": True, "cod_enabled": True, "cod_fee": 20, "min_order": None, "ask_address": True,
            "notifications": {}}
    body.update(over)
    res = web.put(f"{C}/checkout", headers=WEB, json=body)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def _sent(kind=None):
    rows = [m for m in FakeShop.sent if "to" in m]
    if kind:
        rows = [m for m in rows if (m.get("interactive") or {}).get("type") == kind or m.get("type") == kind]
    return rows


def _order(web, number=None):
    rows = web.get(f"{C}/orders", params={"page": 1}).json()["data"]
    row = rows[0] if number is None else next(r for r in rows if r["number"] == number)
    return web.get(f"{C}/orders/{row['id']}").json()["data"]


def _reply(web, wa_id, reply_id, title="x", kind="button_reply"):
    inbound(web, wa_id=wa_id, text=None, type="interactive",
            interactive={"type": kind, kind: {"id": reply_id, "title": title}})


def test_whatsapp_cart_to_confirmed_order(shop):  # noqa: F811
    _checkout(shop)
    shop.post(f"{C}/products", headers=WEB, json=_product(
        name="Kaju Katli", options=[{"name": "Size", "values": ["250 g", "500 g"]}],
        variants=[{"option_values": {"Size": "250 g"}, "price": 499, "stock": 10, "retailer_id": "KK-250"},
                  {"option_values": {"Size": "500 g"}, "price": 899, "stock": 5, "retailer_id": "KK-500"}]))
    shop.post(f"{C}/coupons", headers=WEB, json={"code": "diwali10", "kind": "percent", "value": 10})

    # the customer sends a cart from the WhatsApp catalog
    inbound(shop, wa_id=ASHA, name="Asha", text=None, type="order",
            order={"catalog_id": "778899001", "text": "Please pack nicely",
                   "product_items": [{"product_retailer_id": "KK-250", "quantity": 2, "item_price": 499,
                                      "currency": "INR"},
                                     {"product_retailer_id": "UNKNOWN-1", "quantity": 1, "item_price": 99.5,
                                      "currency": "INR"}]})
    order = _order(shop)
    assert order["ref"] == "#1001" and order["status"] == "awaiting_address" and order["source"] == "whatsapp_cart"
    assert [(i["name"], i["variant_label"], i["quantity"]) for i in order["items"]] == [
        ("Kaju Katli", "250 g", 2), ("UNKNOWN-1", None, 1)]
    assert order["subtotal"] == 1097.5 and order["note"] == "Please pack nicely"
    ask = _sent("address_message")[-1]
    assert ask["interactive"]["action"]["parameters"]["values"]["phone_number"] == "9811100001"
    conv = first_conversation(shop)
    msgs = shop.get(f"{BASE}/inbox/conversations/{conv['id']}/messages").json()["data"]
    cart_msg = next(m for m in msgs if m["type"] == "order")
    assert cart_msg["order"]["ref"] == "#1001" and cart_msg["cart"]["items"][0]["retailer_id"] == "KK-250"
    bell = shop.get(f"{BASE}/account/notifications").json()["data"]["items"]
    assert any(n["event"] == "new_order" and "#1001" in n["title"] for n in bell)

    # WhatsApp's address form comes back
    address = {"values": {"name": "Asha Verma", "phone_number": "9811100001", "house_number": "12 MG Road",
                          "landmark_area": "Near the park", "city": "Delhi", "state": "Delhi", "in_pin_code": "110001"}}
    inbound(shop, wa_id=ASHA, text=None, type="interactive",
            interactive={"type": "nfm_reply", "nfm_reply": {"name": "address_message",
                                                             "response_json": json.dumps(address)}})
    order = _order(shop)
    assert order["status"] == "awaiting_payment" and order["address"]["city"] == "Delhi"
    summary = _sent("button")[-1]["interactive"]
    assert "12 MG Road" in summary["body"]["text"] and "*Total: ₹1,097.50*" in summary["body"]["text"]
    assert "Delivery: Free" in summary["body"]["text"]  # over ₹1,000
    assert [b["reply"]["title"] for b in summary["action"]["buttons"]] == ["Cash on delivery", "Cancel order"]

    # a coupon typed into the chat
    inbound(shop, wa_id=ASHA, text="DIWALI10")
    order = _order(shop)
    assert order["coupon_code"] == "DIWALI10" and order["discount"] == 109.75
    assert "Discount (DIWALI10)" in _sent("button")[-1]["interactive"]["body"]["text"]
    inbound(shop, wa_id=ASHA, text="NOTACODE")  # not a coupon: left for other replies
    assert _order(shop)["coupon_code"] == "DIWALI10"

    # cash on delivery: confirmed, fee added, stock down, confirmation sent
    _reply(shop, ASHA, f"shop:cod:{order['id']}", "Cash on delivery")
    order = _order(shop)
    assert order["status"] == "confirmed" and order["payment_method"] == "cod"
    # 1097.50 - 109.75 = 987.75 (< 1000: delivery 50) + COD 20
    assert order["shipping"] == 50 and order["cod_fee"] == 20 and order["total"] == 1057.75
    assert "Order #1001 confirmed" in _sent("text")[-1]["text"]["body"]
    product = shop.get(f"{C}/products", params={"page": 1, "search": "Kaju"}).json()["data"][0]
    assert product["variants"][0]["stock"] == 8
    coupons = shop.get(f"{C}/coupons").json()["data"]
    assert coupons[0]["used"] == 1

    # the team ships and delivers it; the customer hears about each step
    shipped = shop.post(f"{C}/orders/{order['id']}/action", headers=WEB, json={
        "action": "ship", "courier": "Delhivery", "tracking_number": "DLV123",
        "tracking_url": "https://track.example.com/DLV123"})
    assert shipped.status_code == 200, shipped.text
    text = _sent("text")[-1]["text"]["body"]
    assert "shipped via Delhivery" in text and "DLV123" in text and "cash on delivery" in text
    shop.post(f"{C}/orders/{order['id']}/action", headers=WEB, json={"action": "deliver"})
    order = _order(shop)
    assert order["status"] == "delivered" and order["payment_status"] == "paid"
    assert shop.post(f"{C}/orders/{order['id']}/action", headers=WEB,
                     json={"action": "cancel"}).status_code == 422
    kinds = [e["kind"] for e in order["events"]]
    assert kinds.count("message") >= 3 and "address" in kinds

    # the invoice
    page = shop.get(f"/api/v1/website/shop/invoice/{order['invoice_key']}")
    assert page.status_code == 200 and "₹1,057.75" in page.text and "Paid" in page.text
    assert shop.get("/api/v1/website/shop/invoice/not-a-real-invoice-key").status_code == 404

    # the customer's orders, for the inbox panel
    summary = shop.get(f"{C}/contacts/{order['contact']['id']}/orders").json()["data"]
    assert summary["count"] == 1 and summary["spent"] == 1057.75


def test_buy_now_variants_typed_address_and_cancel(shop):  # noqa: F811
    _checkout(shop, cod_fee=0)
    p = shop.post(f"{C}/products", headers=WEB, json=_product(
        name="Kurta", options=[{"name": "Size", "values": ["S", "M"]}],
        variants=[{"option_values": {"Size": "S"}, "price": 700, "stock": 0},
                  {"option_values": {"Size": "M"}, "price": 750, "stock": 3}])).json()["data"]

    _reply(shop, TOM, f"shop:info:{p['id']}", "More details")
    assert "Size: S, M" in _sent("button")[-1]["interactive"]["body"]["text"]
    _reply(shop, TOM, f"shop:buy:{p['id']}", "Buy now")
    rows = _sent("list")[-1]["interactive"]["action"]["sections"][0]["rows"]
    assert [r["title"] for r in rows] == ["M"]  # S is out of stock
    _reply(shop, TOM, rows[0]["id"], "M", kind="list_reply")
    order = _order(shop)
    assert order["source"] == "buy_button" and order["items"][0]["variant_label"] == "M"
    assert "reply with the delivery address" in _sent("text")[-1]["text"]["body"]  # not an Indian number

    inbound(shop, wa_id=TOM, text="ok")  # too short to be an address
    assert _order(shop)["status"] == "awaiting_address"
    inbound(shop, wa_id=TOM, text="221B Baker Street, London NW1 6XE")
    order = _order(shop)
    assert order["status"] == "awaiting_payment" and order["address"]["line1"].startswith("221B")

    _reply(shop, TOM, f"shop:cancel:{order['id']}", "Cancel order")
    order = _order(shop)
    assert order["status"] == "cancelled" and "cancelled" in _sent("text")[-1]["text"]["body"]
    product = shop.get(f"{C}/products/{p['id']}").json()["data"]
    assert product["variants"][1]["stock"] == 3  # never confirmed: stock untouched

    # next time the last address is offered
    _reply(shop, TOM, f"shop:buy:{p['id']}", "Buy now")
    _reply(shop, TOM, _sent("list")[-1]["interactive"]["action"]["sections"][0]["rows"][0]["id"], "M",
           kind="list_reply")
    again = _sent("button")[-1]["interactive"]
    assert "Last time: 221B Baker Street" in again["body"]["text"]
    order = _order(shop)
    _reply(shop, TOM, f"shop:addr:same:{order['id']}", "Same address")
    assert _order(shop)["status"] == "awaiting_payment"


def test_manual_orders_coupons_and_closed_window(shop):  # noqa: F811
    _checkout(shop, tax_inclusive=False, shipping_fee=40, free_shipping_above=None, cod_fee=0)
    inbound(shop, wa_id=ASHA, name="Asha", text="Hi")
    conv = first_conversation(shop)
    contact_id = conv["contact"]["id"]
    p = shop.post(f"{C}/products", headers=WEB, json=_product(name="Barfi", variants=[{"price": 200, "stock": 5}]))
    variant_id = p.json()["data"]["variants"][0]["id"]

    # coupon rules
    shop.post(f"{C}/coupons", headers=WEB, json={"code": "FLAT50", "kind": "fixed", "value": 50, "min_order": 500})
    shop.post(f"{C}/coupons", headers=WEB, json={"code": "OLD", "kind": "percent", "value": 5,
                                                 "ends_at": (now() - timedelta(days=1)).isoformat()})
    assert shop.post(f"{C}/coupons", headers=WEB, json={"code": "flat50", "kind": "fixed",
                                                        "value": 10}).status_code == 422
    assert shop.post(f"{C}/coupons", headers=WEB, json={"code": "BAD", "kind": "percent",
                                                        "value": 150}).status_code == 422
    base = {"contact_id": contact_id, "items": [{"variant_id": variant_id, "quantity": 2}]}
    small = shop.post(f"{C}/orders", headers=WEB, json={**base, "coupon_code": "FLAT50"})
    assert small.status_code == 422 and "at least ₹500" in small.text
    assert "expired" in shop.post(f"{C}/orders", headers=WEB, json={**base, "coupon_code": "OLD"}).text

    # a confirmed order made by the team: tax on top, paid
    made = shop.post(f"{C}/orders", headers=WEB, json={
        **base, "items": [{"variant_id": variant_id, "quantity": 3}, {"name": "Gift wrap", "unit_price": 30}],
        "coupon_code": "flat50", "paid": True, "payment_method": "online",
        "address": {"line1": "5 Park Street", "city": "Kolkata", "pincode": "700016"}})
    assert made.status_code == 200, made.text
    order = made.json()["data"]
    # 630 - 50 = 580; tax 18% = 104.40; + delivery 40 = 724.40
    assert (order["subtotal"], order["discount"], order["tax"], order["shipping"], order["total"]) == (
        630, 50, 104.4, 40, 724.4)
    assert order["status"] == "confirmed" and order["payment_status"] == "paid"
    assert "Order #1001 confirmed" in _sent("text")[-1]["text"]["body"]

    # edits: items can change while confirmed, stock follows
    edited = shop.put(f"{C}/orders/{order['id']}", headers=WEB, json={
        "items": [{"variant_id": variant_id, "quantity": 1}], "coupon_code": None, "internal_note": "VIP"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["total"] == 276  # 200 + 18% tax + 40
    assert shop.get(f"{C}/products/{p.json()['data']['id']}").json()["data"]["variants"][0]["stock"] == 4
    shop.post(f"{C}/orders/{order['id']}/notes", headers=WEB, json={"text": "Called to confirm"})
    shop.put(f"{C}/orders/{order['id']}/payment", headers=WEB, json={"payment_status": "refunded"})
    order = _order(shop)
    assert order["payment_status"] == "refunded" and any(e["text"] == "Called to confirm" for e in order["events"])

    # list, search, stats
    assert shop.get(f"{C}/orders", params={"page": 1, "search": "#1001"}).json()["meta"]["total"] == 1
    assert shop.get(f"{C}/orders", params={"page": 1, "status": "to_ship"}).json()["meta"]["total"] == 1
    stats = shop.get(f"{C}/orders/stats").json()["data"]
    assert stats["to_ship"] == 1 and stats["orders_30d"] == 1 and stats["revenue_30d"] == 276

    # outside the 24-hour window: the chosen template goes instead (or nothing, with a note)
    db = SessionLocal()
    row = db.get(WaConversation, conv["id"])
    row.last_inbound_at = now() - timedelta(days=2)
    db.commit()
    db.close()
    shop.post(f"{C}/orders/{order['id']}/action", headers=WEB, json={"action": "pack"})
    shop.put(f"{C}/checkout", headers=WEB, json={**_checkout(shop, tax_inclusive=False, shipping_fee=40,
                                                            free_shipping_above=None, cod_fee=0),
                                                 "notifications": {"shipped": {"on": True, "template_id": None}}})
    shop.post(f"{C}/orders/{order['id']}/action", headers=WEB, json={"action": "ship"})
    events = _order(shop)["events"]
    assert any("window is closed" in e["text"] for e in events)

    # checkout in the chat needs an open window
    sent = shop.post(f"{C}/orders", headers=WEB, json={**base, "mode": "checkout"})
    assert sent.status_code == 422 and "window is closed" in sent.text
