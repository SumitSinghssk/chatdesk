import json
from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.modules.customer.chatbots import engine as bot_engine
from app.modules.customer.chatbots.starters import _e, _n
from app.modules.customer.commerce import carts
from app.modules.customer.commerce.models import Order
from app.shared.utils.datetime import now
from tests.test_commerce import C, FakeShop, _product, shop  # noqa: F401
from tests.test_inbox import BASE, WEB, business, inbound  # noqa: F401
from tests.test_orders import ASHA, _checkout, _order, _reply, _sent
from tests.test_shop_payments import FakeGateway, _cart_to_summary, pay  # noqa: F401

B = f"{BASE}/chatbots"


@pytest.fixture()
def store(pay, monkeypatch):  # noqa: F811
    monkeypatch.setattr(bot_engine, "WhatsAppClient", FakeShop)
    _checkout(pay)
    pay.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 499, "stock": 10,
                                                                     "retailer_id": "KK-250"}]))
    return pay


def _age(order_id, minutes):
    """Pretends the cart was placed `minutes` ago."""
    with SessionLocal() as db:
        row = db.get(Order, order_id)
        row.placed_at = now() - timedelta(minutes=minutes)
        db.commit()


def _run():
    with SessionLocal() as db:
        return carts.run_due(db)


def test_cart_reminders_coupon_and_recovery(store):
    coupon = store.post(f"{C}/coupons", headers=WEB, json={"code": "COMEBACK", "kind": "percent", "value": 10}).json()
    bad = store.put(f"{C}/carts/settings", headers=WEB, json={"on": True, "steps": []})
    assert bad.status_code == 422 and "at least one reminder" in bad.text
    dup = store.put(f"{C}/carts/settings", headers=WEB, json={"on": True, "steps": [{"after": 60}, {"after": 60}]})
    assert dup.status_code == 422
    res = store.put(f"{C}/carts/settings", headers=WEB, json={"on": True, "steps": [
        {"after": 1440, "coupon_id": coupon["data"]["id"]}, {"after": 60}]})
    assert res.status_code == 200, res.text
    assert [s["after"] for s in res.json()["data"]["steps"]] == [60, 1440]  # kept in time order

    order = _cart_to_summary(store, qty=1)
    assert order["status"] == "awaiting_payment" and order["recovery_sent"] == 0
    assert _run() == (0, 0)  # not an hour yet
    _age(order["id"], 70)
    assert _run() == (1, 0)
    assert _run() == (0, 0)  # once per step
    first = _sent("button")[-1]["interactive"]
    assert "You left something in your cart" in first["body"]["text"] and "#1001" in first["body"]["text"]
    assert [b["reply"]["title"] for b in first["action"]["buttons"]] == ["Complete order", "No thanks"]
    listed = store.get(f"{C}/carts", params={"state": "open"}).json()["data"]
    assert listed[0]["recovery_sent"] == 1 and listed[0]["next_reminder_at"]

    # a day on, the second reminder brings the coupon
    _age(order["id"], 1500)
    assert _run() == (1, 0)
    second = _sent("button")[-1]["interactive"]["body"]["text"]
    assert "added code *COMEBACK*" in second and "you save ₹49.90" in second
    order = _order(store)
    assert order["coupon_code"] == "COMEBACK" and order["recovery_sent"] == 2
    assert _run() == (0, 0)  # no more steps

    # the customer comes back and pays cash on delivery: recovered by reminder 2
    _reply(store, ASHA, f"shop:resume:{order['id']}", "Complete order")
    assert "How would you like to pay?" in _sent("button")[-1]["interactive"]["body"]["text"]
    _reply(store, ASHA, f"shop:cod:{order['id']}", "Cash on delivery")
    order = _order(store)
    assert order["status"] == "confirmed" and order["recovered_at"]
    assert any(e["text"] == "Recovered after cart reminder 2" for e in order["events"])
    stats = store.get(f"{C}/carts/stats").json()["data"]
    assert stats["reminded"] == 1 and stats["recovered"] == 1 and stats["rate"] == 100
    assert stats["steps"][1]["recovered"] == 1 and stats["steps"][0]["recovered"] == 0
    assert store.get(f"{C}/carts", params={"state": "recovered"}).json()["data"][0]["recovered_step"] == 2
    assert store.get(f"{C}/carts", params={"state": "open"}).json()["data"] == []


def test_reminders_skip_open_links_opted_out_and_can_be_sent_by_hand(store):
    store.put(f"{C}/carts/settings", headers=WEB, json={"on": True, "steps": [{"after": 30}]})
    store.put(f"{C}/payments/gateways/razorpay", headers=WEB,
              json={"credentials": {"key_id": "rzp_test_good1234567", "key_secret": "rzp-secret"}})
    order = _cart_to_summary(store, qty=1)
    _reply(store, ASHA, f"shop:pay:{order['id']}")  # a payment link is open: payment reminders cover it
    _age(order["id"], 45)
    assert _run() == (0, 0)

    # the team can send one by hand (it counts as the first)
    res = store.post(f"{C}/orders/{order['id']}/remind", headers=WEB)
    assert res.status_code == 200 and res.json()["message"] == "Reminder sent"
    assert res.json()["data"]["recovery_sent"] == 1
    assert any("Cart reminder 1: sent on WhatsApp" == e["text"] for e in res.json()["data"]["events"])
    # "No thanks" cancels it
    _reply(store, ASHA, f"shop:cancel:{order['id']}", "No thanks")
    assert _order(store)["status"] == "cancelled"
    assert store.get(f"{C}/carts", params={"state": "lost"}).json()["data"][0]["number"] == 1001
    assert store.post(f"{C}/orders/{order['id']}/remind", headers=WEB).status_code == 422

    # someone who opted out never gets one
    inbound(store, wa_id="919811100077", name="Ravi", text=None, type="order",
            order={"catalog_id": "1", "product_items": [{"product_retailer_id": "KK-250", "quantity": 1,
                                                          "item_price": 499, "currency": "INR"}]})
    ravi = _order(store, 1002)
    from app.modules.customer.inbox.models import WaContact

    with SessionLocal() as db:
        db.get(WaContact, ravi["contact"]["id"]).opted_out = True
        db.commit()
    _age(ravi["id"], 45)
    assert _run() == (0, 0) and _order(store, 1002)["recovery_sent"] == 1  # marked done, nothing sent


def _bot(web, graph, keywords=("shop",)):
    res = web.post(B, headers=WEB, json={"name": "Shop bot", "trigger": "keyword", "keywords": list(keywords)})
    bot = res.json()["data"]
    assert web.put(f"{B}/{bot['id']}/graph", headers=WEB, json={"graph": graph}).status_code == 200
    return bot


def test_chatbot_shop_blocks(store):
    product_id = store.get(f"{C}/products", params={"page": 1}).json()["data"][0]["id"]
    nodes = [
        _n("start", "start", 0, 0),
        _n("cards", "shop", 300, 0, action="products", style="cards", product_ids=[product_id],
           text="Our bestseller, {{first_name}}:"),
        _n("status", "shop", 600, 0, action="order_status", text="Here's your latest order:"),
        _n("found", "end", 900, 0, text="Anything else about {{order_ref}}?"),
        _n("none", "end", 900, 200, text="You have no orders yet."),
        _n("listfail", "end", 600, 300, text="Sorry, can't show that."),
    ]
    edges = [_e("start", "cards"), _e("cards", "status"), _e("cards", "listfail", "fail"),
             _e("status", "found", "found"), _e("status", "none", "none")]
    bot = _bot(store, {"nodes": nodes, "edges": edges})
    # a product list needs a Meta catalog: publishing checks every block
    problem = {"nodes": [*nodes[:1], _n("cards", "shop", 300, 0, action="products", style="cards",
                                        product_ids=list(range(1, 8)))], "edges": [_e("start", "cards")]}
    sim = store.post(f"{B}/{bot['id']}/simulate", headers=WEB, json={"graph": problem}).json()
    assert sim["status"] is True  # the test chat still runs a half-done canvas
    assert store.post(f"{B}/{bot['id']}/publish", headers=WEB).status_code == 200

    # test chat: the tester has no orders
    step = store.post(f"{B}/{bot['id']}/simulate", headers=WEB, json={"contact": {"name": "Asha"}}).json()["data"]
    kinds = [e["kind"] for e in step["events"]]
    assert kinds[0] == "message" and "Kaju Katli · ₹499" in step["events"][0]["reply"]["text"]
    assert step["events"][-2]["reply"]["text"] == "You have no orders yet."

    # a real chat, after an order
    order = _cart_to_summary(store, qty=1)
    _reply(store, ASHA, f"shop:cod:{order['id']}", "Cash on delivery")
    before = len(FakeShop.sent)
    inbound(store, wa_id=ASHA, text="shop")
    out = [m for m in FakeShop.sent[before:] if m.get("to") == ASHA]
    card = out[0]["interactive"]
    assert card["type"] == "button" and card["body"]["text"].startswith("Our bestseller, Asha:")
    status = out[1]["text"]["body"]
    assert status.startswith("Here's your latest order:") and "*Order #1001*" in status
    assert "Status: *Confirmed*" in status and "Payment: Cash on delivery" in status
    assert out[2]["text"]["body"] == "Anything else about #1001?"


def test_chatbot_collects_payment_and_checks_shop_conditions(store):
    store.put(f"{C}/payments/gateways/razorpay", headers=WEB,
              json={"credentials": {"key_id": "rzp_test_good1234567", "key_secret": "rzp-secret"}})
    nodes = [
        _n("start", "start", 0, 0),
        _n("check", "condition", 300, 0, match="all", rules=[{"field": "shop:unpaid", "op": "equals", "value": "yes"}]),
        _n("pay", "shop", 600, 0, action="payment"),
        _n("deposit", "shop", 600, 200, action="payment", amount=500, item_name="Booking deposit"),
        _n("sent", "end", 900, 0, text="Link sent for {{order_ref}} ({{order_total}})"),
        _n("nothing", "end", 900, 200, text="Nothing to pay"),
    ]
    edges = [_e("start", "check"), _e("check", "pay", "yes"), _e("check", "deposit", "no"),
             _e("pay", "sent", "sent"), _e("pay", "nothing", "none"), _e("deposit", "sent", "sent"),
             _e("deposit", "nothing", "none")]
    bot = _bot(store, {"nodes": nodes, "edges": edges}, keywords=("pay",))
    assert store.post(f"{B}/{bot['id']}/publish", headers=WEB).status_code == 200

    # no unpaid order: the bot makes a ₹500 deposit order (no delivery charge) and sends its link
    inbound(store, wa_id=ASHA, name="Asha", text="pay")
    deposit = _order(store)
    assert deposit["source"] == "chatbot" and deposit["total"] == 500 and deposit["shipping"] == 0
    assert deposit["items"][0]["name"] == "Booking deposit"
    link = [d for m, u, d in FakeGateway.calls if m == "POST" and u.endswith("/payment_links")][-1]
    assert link["amount"] == 50000
    assert _sent("text")[-1]["text"]["body"] == "Link sent for #1001 (₹500)"

    # now there is one: shop:unpaid is yes, and the bot sends a fresh link for that order
    inbound(store, wa_id=ASHA, text="pay")
    links = [d for m, u, d in FakeGateway.calls if m == "POST" and u.endswith("/payment_links")]
    assert len(links) == 2 and links[-1]["reference_id"].startswith("CD1001")
    assert len(store.get(f"{C}/orders", params={"page": 1}).json()["data"]) == 1  # no second order
    sim = store.post(f"{B}/{bot['id']}/simulate", headers=WEB, json={"contact": {"phone": ASHA}}).json()["data"]
    assert any("In a real chat: sends a payment link for order #1001" in (e.get("text") or "")
               for e in sim["events"])
    assert json.dumps(sim).count("Link sent for #1001") == 1
