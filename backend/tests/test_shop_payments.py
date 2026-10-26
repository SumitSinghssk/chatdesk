import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta
from urllib.parse import parse_qs

import pytest

from app.core.database import SessionLocal
from app.modules.customer.commerce import gateways, payments
from app.modules.customer.commerce.models import OrderPayment
from app.shared.utils.datetime import now
from tests.test_commerce import C, FakeShop, _product, shop  # noqa: F401
from tests.test_inbox import BASE, WEB, business, inbound, post_webhook  # noqa: F401
from tests.test_orders import ASHA, _checkout, _order, _reply, _sent

RZP_SECRET = "rzp-webhook-secret"
STRIPE_SECRET = "whsec_test_123"


class FakeGateway:
    """Razorpay and Stripe as far as ChatDesk uses them. Records every call."""

    calls: list[tuple[str, str, dict]] = []
    links: dict[str, dict] = {}

    def __call__(self, method, url, headers, body=None, form=None, timeout=20):
        data = body if body is not None else (form or {})
        FakeGateway.calls.append((method, url, data))
        auth = headers.get("Authorization", "")
        if "/razorpay/" in url or "api.razorpay.com" in url:
            if base64.b64decode(auth.split(" ", 1)[1]).decode() != "rzp_test_good1234567:rzp-secret":
                return 401, {"error": {"description": "Authentication failed"}}
            path = url.split("/v1", 1)[1]
            if path.startswith("/payment_links?"):
                return 200, {"items": []}
            if path == "/payment_links" and method == "POST":
                ref = f"plink_{len(FakeGateway.links) + 1}"
                FakeGateway.links[ref] = {"id": ref, "status": "created", **data}
                return 200, {"id": ref, "short_url": f"https://rzp.io/i/{ref}", "status": "created"}
            if path.endswith("/cancel"):
                FakeGateway.links[path.split("/")[2]]["status"] = "cancelled"
                return 200, {"status": "cancelled"}
            if path.startswith("/payment_links/"):
                return 200, FakeGateway.links[path.split("/")[2]]
            if "/refund" in path:
                return 200, {"id": f"rfnd_{len(FakeGateway.calls)}", "status": "pending", "amount": data["amount"]}
        if "api.stripe.com" in url or "/stripe/" in url:
            if auth != "Bearer sk_test_good":
                return 401, {"error": {"message": "Invalid API Key provided"}}
            path = url.split("/v1", 1)[1]
            if path == "/balance":
                return 200, {"object": "balance"}
            if path == "/checkout/sessions":
                ref = f"cs_test_{len(FakeGateway.links) + 1}"
                FakeGateway.links[ref] = {"id": ref, "status": "open", "payment_status": "unpaid", **data}
                return 200, {"id": ref, "url": f"https://checkout.stripe.com/c/pay/{ref}"}
            if path.endswith("/expire"):
                FakeGateway.links[path.split("/")[3]]["status"] = "expired"
                return 200, {"status": "expired"}
            if path.startswith("/checkout/sessions/"):
                return 200, FakeGateway.links[path.split("/")[3]]
            if path == "/refunds":
                return 200, {"id": "re_1", "status": "succeeded"}
        return 404, {"error": {"message": "not faked"}}


@pytest.fixture()
def pay(shop, monkeypatch):  # noqa: F811
    FakeGateway.calls, FakeGateway.links = [], {}
    monkeypatch.setattr(gateways, "request", FakeGateway())
    monkeypatch.setattr(FakeShop, "payment_lookup", lambda self, cfg, ref: {"payments": []}, raising=False)
    monkeypatch.setattr(FakeShop, "payment_refund",
                        lambda self, cfg, ref, amount, currency="INR": FakeShop.sent.append(
                            {"refund": ref, "amount": amount}) or {"success": True}, raising=False)
    return shop


def _created(kind="/payment_links"):
    return [d for m, u, d in FakeGateway.calls if m == "POST" and u.endswith(kind)]


def _hook_path(setup, provider):
    gw = next(p["gateway"] for p in setup["providers"] if p["provider"] == provider)
    return "/api/v1/website/shop/pay/" + gw["webhook_url"].split("/shop/pay/", 1)[1]


def _razorpay_hook(web, path, event, secret=RZP_SECRET):
    body = json.dumps(event).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return web.post(path, content=body, headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"})


def _stripe_hook(web, path, event):
    body = json.dumps(event).encode()
    stamp = str(int(time.time()))
    sig = hmac.new(STRIPE_SECRET.encode(), f"{stamp}.".encode() + body, hashlib.sha256).hexdigest()
    return web.post(path, content=body, headers={"Stripe-Signature": f"t={stamp},v1={sig}"})


def _options(web, **over):
    body = {"online_enabled": True, "link_expiry_minutes": 60, "reminders": [30], "cancel_unpaid": False,
            "prepaid_kind": None, "prepaid_value": 0, "cod_confirm": False, "cod_to_prepaid": False, "templates": {}}
    body.update(over)
    res = web.put(f"{C}/payments/options", headers=WEB, json=body)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def _cart_to_summary(web, wa_id=ASHA, qty=2):
    inbound(web, wa_id=wa_id, name="Asha", text=None, type="order",
            order={"catalog_id": "1", "product_items": [{"product_retailer_id": "KK-250", "quantity": qty,
                                                          "item_price": 499, "currency": "INR"}]})
    address = {"values": {"name": "Asha Verma", "phone_number": "9811100001", "house_number": "12 MG Road",
                          "city": "Delhi", "state": "Delhi", "in_pin_code": "110001"}}
    inbound(web, wa_id=wa_id, text=None, type="interactive",
            interactive={"type": "nfm_reply", "nfm_reply": {"name": "address_message",
                                                             "response_json": json.dumps(address)}})
    return _order(web)


def _events(order):
    return [e["text"] for e in order["events"]]


def test_razorpay_link_paid_by_webhook_then_refunds(pay):
    _checkout(pay)
    pay.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 499, "stock": 10,
                                                                     "retailer_id": "KK-250"}]))

    # connecting: wrong keys are refused with the gateway's reason; secrets never come back
    bad = pay.put(f"{C}/payments/gateways/razorpay", headers=WEB,
                  json={"credentials": {"key_id": "rzp_test_wrong123456", "key_secret": "nope"}})
    assert bad.status_code == 422 and "refused the keys" in bad.text
    assert pay.put(f"{C}/payments/gateways/razorpay", headers=WEB,
                   json={"credentials": {"key_id": "nonsense", "key_secret": "x"}}).status_code == 422
    ok = pay.put(f"{C}/payments/gateways/razorpay", headers=WEB, json={
        "credentials": {"key_id": "rzp_test_good1234567", "key_secret": "rzp-secret"}, "webhook_secret": RZP_SECRET})
    assert ok.status_code == 200, ok.text
    gw = ok.json()["data"]
    assert gw["mode"] == "test" and gw["is_default"] and gw["has_webhook_secret"] and gw["hint"].startswith("rzp_")
    setup = pay.get(f"{C}/payments/setup").json()["data"]
    assert setup["ready"] and "rzp-secret" not in json.dumps(setup) and RZP_SECRET not in json.dumps(setup)
    # saving again without the secret keeps it
    assert pay.put(f"{C}/payments/gateways/razorpay", headers=WEB,
                   json={"credentials": {"key_id": "rzp_test_good1234567"}}).status_code == 200
    hook = _hook_path(setup, "razorpay")
    _options(pay, prepaid_kind="percent", prepaid_value=5)

    # the summary offers paying online, with the saving over cash on delivery
    order = _cart_to_summary(pay)
    summary = _sent("button")[-1]["interactive"]
    titles = [b["reply"]["title"] for b in summary["action"]["buttons"]]
    assert titles == ["Pay online", "Cash on delivery", "Cancel order"]
    # cash: 998 + 50 delivery + 20 fee = 1068 · online: 998 - 5% (49.90) + 50 = 998.10
    assert "Pay online: *₹998.10* (you save ₹69.90)" in summary["body"]["text"]

    _reply(pay, ASHA, f"shop:pay:{order['id']}", "Pay online")
    link = _created()[-1]
    assert link["amount"] == 99810 and link["reference_id"].startswith("CD1001") and link["currency"] == "INR"
    assert link["customer"]["contact"] == f"+{ASHA}" and link["callback_url"].endswith(link["reference_id"])
    cta = _sent("cta_url")[-1]["interactive"]
    assert cta["action"]["parameters"]["display_text"] == "Pay ₹998.10"
    go = cta["action"]["parameters"]["url"]
    assert go.endswith(f"/shop/pay/go/{link['reference_id']}") and "Razorpay" in cta["footer"]["text"]
    order = _order(pay)
    assert order["status"] == "awaiting_payment" and order["payments"][0]["status"] == "created"
    assert order["online"]["can_link"] and order["online"]["amount_text"] == "₹998.10"

    # the customer's link forwards to Razorpay while it's open
    res = pay.get("/api/v1/website/shop/pay/go/" + link["reference_id"], follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"] == "https://rzp.io/i/plink_1"

    # a forged webhook is refused; the real one confirms and pays the order
    paid_event = {"event": "payment_link.paid", "payload": {
        "payment_link": {"entity": {"id": "plink_1", "reference_id": link["reference_id"], "status": "paid"}},
        "payment": {"entity": {"id": "pay_ABC123", "method": "upi", "amount": 99810}}}}
    assert _razorpay_hook(pay, hook, paid_event, secret="forged").status_code == 401
    assert _razorpay_hook(pay, hook, paid_event).status_code == 200
    assert _razorpay_hook(pay, hook, paid_event).status_code == 200  # Razorpay retries: no double payment
    order = _order(pay)
    assert order["status"] == "confirmed" and order["payment_status"] == "paid" and order["payment_method"] == "online"
    assert order["total"] == 998.1 and order["prepaid_discount"] == 49.9 and order["cod_fee"] == 0
    paid_lines = [t for t in _events(order) if t.startswith("Paid ₹998.10 online by UPI · Razorpay pay_ABC123")]
    assert len(paid_lines) == 1
    confirmed = [m for m in _sent("text") if "confirmed" in str(m.get("text"))][-1]
    assert "Paid online" in confirmed["text"]["body"] and "Paying online: −₹49.90" in confirmed["text"]["body"]
    bell = pay.get(f"{BASE}/account/notifications").json()["data"]["items"]
    assert any(n["event"] == "payment_received" and "₹998.10" in n["title"] for n in bell)
    page = pay.get("/api/v1/website/shop/pay/r/" + link["reference_id"])
    assert "Payment received" in page.text and "#1001" in page.text
    assert pay.get("/api/v1/website/shop/pay/go/" + link["reference_id"], follow_redirects=False).status_code == 200

    # refunds: part through Razorpay, the rest recorded by hand, never more than was paid
    res = pay.post(f"{C}/orders/{order['id']}/refunds", headers=WEB, json={"amount": 100, "reason": "One box broken"})
    assert res.status_code == 200, res.text
    assert res.json()["message"] == "Refund of ₹100 started through Razorpay"
    refund_call = [d for m, u, d in FakeGateway.calls if u.endswith("/payments/pay_ABC123/refund")][-1]
    assert refund_call["amount"] == 10000
    data = res.json()["data"]
    assert data["payment_status"] == "partially_refunded" and data["refunds"][0]["status"] == "pending"
    assert data["refundable_text"] == "₹898.10"
    refund_id = data["refunds"][0]["provider_ref"]
    assert _razorpay_hook(pay, hook, {"event": "refund.processed", "payload": {"refund": {"entity": {
        "id": refund_id, "payment_id": "pay_ABC123", "amount": 10000, "status": "processed"}}}}).status_code == 200
    order = _order(pay)
    assert order["refunds"][0]["status"] == "processed"
    assert any("We've refunded ₹100 for order #1001" in str(m.get("text")) for m in _sent("text"))
    too_much = pay.post(f"{C}/orders/{order['id']}/refunds", headers=WEB, json={"amount": 1000})
    assert too_much.status_code == 422 and "up to ₹898.10" in too_much.text
    rest = pay.post(f"{C}/orders/{order['id']}/refunds", headers=WEB,
                    json={"amount": 898.10, "method": "manual", "reason": "Cash back", "notify": False})
    assert rest.status_code == 200 and rest.json()["data"]["payment_status"] == "refunded"
    assert pay.put(f"{C}/orders/{order['id']}/payment", headers=WEB,
                   json={"payment_status": "unpaid"}).status_code == 422

    listing = pay.get(f"{C}/payments", params={"page": 1}).json()
    assert listing["data"][0]["order"]["ref"] == "#1001" and listing["data"][0]["refunded_text"] == "₹100"
    stats = pay.get(f"{C}/payments/stats").json()["data"]
    assert stats["collected_text"] == "₹998.10" and stats["paid_count"] == 1 and stats["conversion"] == 100


def test_reminders_expiry_cod_switch_and_confirmation(pay):
    _checkout(pay)
    pay.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 499, "stock": 10,
                                                                     "retailer_id": "KK-250"}]))
    assert pay.put(f"{C}/payments/gateways/stripe", headers=WEB,
                   json={"credentials": {"secret_key": "sk_test_bad"}}).status_code == 422
    assert pay.put(f"{C}/payments/gateways/stripe", headers=WEB, json={
        "credentials": {"secret_key": "sk_test_good"}, "webhook_secret": STRIPE_SECRET}).status_code == 200
    hook = _hook_path(pay.get(f"{C}/payments/setup").json()["data"], "stripe")
    _options(pay, reminders=[30], link_expiry_minutes=60, cod_confirm=True, cod_to_prepaid=True,
             prepaid_kind="fixed", prepaid_value=20)

    order = _cart_to_summary(pay)
    _reply(pay, ASHA, f"shop:pay:{order['id']}")
    session = _created("/checkout/sessions")[-1]
    assert session["line_items[0][price_data][unit_amount]"] == str(99800 - 2000 + 5000)  # 1028 online

    # 40 minutes on: one reminder; then the link runs out and the customer is offered a new one
    with SessionLocal() as db:
        p = db.query(OrderPayment).filter(OrderPayment.order_id == order["id"]).one()
        p.created_at = now() - timedelta(minutes=40)
        db.commit()
        assert payments.run_due(db) == (1, 0, 0)
        assert payments.run_due(db) == (0, 0, 0)  # only once
    assert "A reminder: order #1001" in _sent("cta_url")[-1]["interactive"]["body"]["text"]
    with SessionLocal() as db:
        p = db.query(OrderPayment).filter(OrderPayment.order_id == order["id"]).one()
        p.expires_at = now() - timedelta(minutes=1)
        db.commit()
        assert payments.run_due(db) == (0, 1, 0)
    expired = _sent("button")[-1]["interactive"]
    assert "has expired" in expired["body"]["text"]
    assert [b["reply"]["title"] for b in expired["action"]["buttons"]] == [
        "New payment link", "Cash on delivery", "Cancel order"]
    assert pay.get("/api/v1/website/shop/pay/go/" + session["client_reference_id"],
                   follow_redirects=False).status_code == 200  # an "expired" page, not the gateway

    # a new link, then the customer picks cash on delivery after all: the link is closed, "pay now" offered
    _reply(pay, ASHA, f"shop:link:{order['id']}")
    assert len(_created("/checkout/sessions")) == 2
    _reply(pay, ASHA, f"shop:cod:{order['id']}", "Cash on delivery")
    order = _order(pay)
    assert order["status"] == "confirmed" and order["payment_method"] == "cod" and order["total"] == 1068
    assert [p["status"] for p in order["payments"]] == ["cancelled", "expired"]
    assert FakeGateway.links["cs_test_2"]["status"] == "expired"  # closed at Stripe too
    offer = _sent("button")[-1]["interactive"]
    assert "save ₹40" in offer["body"]["text"] and offer["action"]["buttons"][0]["reply"]["title"] == "Pay now"

    # switching to paying now: no COD fee, the prepaid discount, and the order stays confirmed
    _reply(pay, ASHA, f"shop:prepay:{order['id']}", "Pay now")
    session = _created("/checkout/sessions")[-1]
    assert session["line_items[0][price_data][unit_amount]"] == "102800"
    assert _stripe_hook(pay, hook, {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_3", "client_reference_id": session["client_reference_id"], "payment_status": "paid",
        "payment_intent": "pi_123", "amount_total": 102800, "metadata": {"reference": session["client_reference_id"]}
    }}}).status_code == 200
    order = _order(pay)
    assert order["payment_status"] == "paid" and order["payment_method"] == "online" and order["cod_fee"] == 0
    assert order["total"] == 1028 and order["prepaid_discount"] == 20
    assert any("received your payment of ₹1,028" in str(m.get("text")) for m in _sent("text"))
    bad = pay.post(hook, content=b"{}", headers={"Stripe-Signature": "t=1,v1=00"})
    assert bad.status_code == 401

    # a phone order on cash on delivery: the customer is asked to confirm, and says yes
    contact_id = order["contact"]["id"]
    made = pay.post(f"{C}/orders", headers=WEB, json={
        "contact_id": contact_id, "items": [{"name": "Gift box", "unit_price": 300, "quantity": 1}],
        "payment_method": "cod", "address": {"line1": "12 MG Road"}, "mode": "confirmed"})
    assert made.status_code == 200, made.text
    ask = _sent("button")[-1]["interactive"]
    assert "Please confirm your order #1002" in ask["body"]["text"]
    assert [b["reply"]["title"] for b in ask["action"]["buttons"]] == ["Confirm order", "Pay now", "Cancel order"]
    assert made.json()["data"]["cod_check"] == "pending"
    assert pay.get(f"{C}/orders", params={"payment": "cod_check"}).json()["data"][0]["number"] == 1002
    inbound(pay, wa_id=ASHA, text="Yes please")
    second = _order(pay, 1002)
    assert second["cod_check"] == "confirmed" and second["status"] == "confirmed"
    assert "Thank you! Order #1002 is confirmed" in _sent("text")[-1]["text"]["body"]

    # another one the customer turns down
    pay.post(f"{C}/orders", headers=WEB, json={
        "contact_id": contact_id, "items": [{"name": "Gift box", "unit_price": 300, "quantity": 1}],
        "payment_method": "cod", "mode": "confirmed"})
    third = _order(pay, 1003)
    _reply(pay, ASHA, f"shop:codno:{third['id']}", "Cancel order")
    third = _order(pay, 1003)
    assert third["status"] == "cancelled" and third["cod_check"] == "declined"
    assert third["cancel_reason"] == "The customer declined the order"


def test_whatsapp_pay_links_for_manual_orders_and_closed_window(pay):
    _checkout(pay, cod_enabled=False)
    pay.post(f"{C}/products", headers=WEB, json=_product(variants=[{"price": 499, "stock": 10,
                                                                     "retailer_id": "KK-250"}]))
    # no gateway yet: no "Pay online", and payment-link orders are refused
    order = _cart_to_summary(pay, qty=1)
    assert "We'll send you the payment details shortly" in _sent("text")[-1]["text"]["body"]
    refused = pay.post(f"{C}/orders", headers=WEB, json={"items": [{"name": "Box", "unit_price": 100}],
                                                         "mode": "link"})
    assert refused.status_code == 422 and "Connect a payment gateway" in refused.text

    assert pay.put(f"{C}/payments/gateways/whatsapp_pay", headers=WEB, json={}).status_code == 422
    res = pay.put(f"{C}/payments/gateways/whatsapp_pay", headers=WEB,
                  json={"configuration_name": "chatdesk-upi", "wa_gateway": "razorpay"})
    assert res.status_code == 200 and res.json()["data"]["configuration_name"] == "chatdesk-upi"

    # the team sends it: WhatsApp's own Review and pay, priced to the paisa
    sent = pay.post(f"{C}/orders/{order['id']}/payment-link", headers=WEB, json={"send": True})
    assert sent.status_code == 200, sent.text
    review = _sent("order_details")[-1]["interactive"]
    params = review["action"]["parameters"]
    assert params["total_amount"] == {"value": 54900, "offset": 100}  # 499 + 50 delivery
    assert params["order"]["subtotal"]["value"] + params["order"]["shipping"]["value"] == 54900
    assert params["payment_settings"][0]["payment_gateway"] == {"type": "razorpay",
                                                                "configuration_name": "chatdesk-upi"}
    reference = params["reference_id"]
    post_webhook(pay, {"messaging_product": "whatsapp", "statuses": [{
        "id": "wamid.PAY1", "type": "payment", "status": "captured", "recipient_id": ASHA,
        "timestamp": str(int(time.time())),
        "payment": {"reference_id": reference, "amount": {"value": 54900, "offset": 100}, "currency": "INR",
                    "transaction": {"id": "txn_99", "type": "upi", "status": "success"}}}]})
    order = _order(pay)
    assert order["status"] == "confirmed" and order["payment_status"] == "paid"
    assert order["payments"][0]["provider"] == "whatsapp_pay" and order["payments"][0]["method_label"] == "UPI"
    assert _sent("order_status")[-1]["interactive"]["action"]["parameters"]["order"]["status"] == "processing"
    refund = pay.post(f"{C}/orders/{order['id']}/refunds", headers=WEB, json={"amount": 549})
    assert refund.status_code == 200 and {"refund": reference, "amount": 54900} in FakeShop.sent

    # with a link gateway too, a payment-link order made for someone outside the chat window still gets a link
    pay.put(f"{C}/payments/gateways/razorpay", headers=WEB,
            json={"credentials": {"key_id": "rzp_test_good1234567", "key_secret": "rzp-secret"}})
    from app.modules.customer.inbox.models import WaConversation

    with SessionLocal() as db:
        row = db.get(WaConversation, order["contact"]["conversation_id"])
        row.last_inbound_at = now() - timedelta(days=2)
        db.commit()
    made = pay.post(f"{C}/orders", headers=WEB, json={
        "contact_id": order["contact"]["id"], "items": [{"name": "Hamper", "unit_price": 1200}], "mode": "link"})
    assert made.status_code == 200, made.text
    data = made.json()["data"]
    assert data["status"] == "awaiting_payment" and data["payments"][0]["url"].endswith(
        data["payments"][0]["reference"])
    assert any("window is closed" in t for t in _events(data))
    resent = pay.post(f"{C}/payments/{data['payments'][0]['id']}/resend", headers=WEB)
    assert resent.status_code == 200 and "window is closed" in resent.json()["message"]
    cancelled = pay.post(f"{C}/payments/{data['payments'][0]['id']}/cancel", headers=WEB)
    assert cancelled.status_code == 200 and FakeGateway.links["plink_1"]["status"] == "cancelled"

    # disconnecting
    assert pay.delete(f"{C}/payments/gateways/razorpay", headers=WEB).status_code == 200
    assert pay.post(f"{C}/payments/gateways/razorpay/check", headers=WEB).status_code == 404


def test_webhook_signatures_for_cashfree_and_payu():
    body = b'{"type":"PAYMENT_LINK_EVENT","data":{"link_id":"CD1001AB","link_status":"PAID","link_amount_paid":549,' \
           b'"link_notes":{"reference":"CD1001AB"},"order":{"order_id":"CF1","transaction_status":"SUCCESS"}}}'
    stamp = "1700000000"
    sig = base64.b64encode(hmac.new(b"cf-secret", stamp.encode() + body, hashlib.sha256).digest()).decode()
    cf = gateways.provider("cashfree", {"app_id": "app", "secret_key": "cf-secret"})
    [event] = cf.parse_webhook(body, {"x-webhook-timestamp": stamp, "x-webhook-signature": sig})
    assert (event.kind, event.reference, event.payment_id, event.amount) == ("paid", "CD1001AB", "CF1", 54900)
    with pytest.raises(gateways.GatewayError):
        cf.parse_webhook(body, {"x-webhook-timestamp": stamp, "x-webhook-signature": "AAAA"})

    payu = gateways.provider("payu", {"merchant_key": "mkey", "salt": "msalt"})
    form = {"status": "success", "txnid": "CD1001AB", "amount": "549.00", "productinfo": "Order #1001",
            "firstname": "Asha", "email": "", "mihpayid": "403993715", "mode": "UPI"}
    seq = ["msalt", "success", "", "", "", "", "", "", "", "", "", "", "", "Asha", "Order #1001", "549.00",
           "CD1001AB", "mkey"]
    form["hash"] = hashlib.sha512("|".join(seq).encode()).hexdigest()
    raw = "&".join(f"{k}={v}" for k, v in form.items()).replace(" ", "+").replace("#", "%23").encode()
    assert parse_qs(raw.decode())["productinfo"] == ["Order #1001"]
    [event] = payu.parse_webhook(raw, {})
    assert (event.kind, event.reference, event.payment_id, event.amount) == ("paid", "CD1001AB", "403993715", 54900)
    with pytest.raises(gateways.GatewayError):
        payu.parse_webhook(raw.replace(b"549.00", b"1.00"), {})
