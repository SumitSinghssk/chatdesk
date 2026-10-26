"""The payment gateways a business can connect: Razorpay, Cashfree, PayU and Stripe.

Each one does the same few things with the business's own keys: check the keys work, make a payment link
for an amount (with an expiry), say what happened to a link, cancel one, refund a payment, and read and
verify the gateway's webhooks. Money goes straight to the business's account.

PAYMENT_GATEWAY_URL points every gateway at a stand-in (end-to-end tests); leave it unset in real use.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

FAKE_URL = (os.getenv("PAYMENT_GATEWAY_URL") or "").rstrip("/")


class GatewayError(Exception):
    """Something the gateway refused or couldn't do, worded for the team."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


@dataclass
class Link:
    ref: str  # the gateway's id for the link / session
    url: str


@dataclass
class Event:
    """Something that happened to a payment or refund, from a webhook or from asking the gateway."""

    kind: str  # paid | failed | expired | cancelled | refund_processed | refund_failed | pending
    reference: str | None = None  # ours
    ref: str | None = None  # the gateway's link / session id
    payment_id: str | None = None
    method: str | None = None
    amount: int | None = None  # paise/cents
    refund_ref: str | None = None
    error: str | None = None


@dataclass
class Customer:
    name: str
    phone: str  # digits with country code
    email: str | None = None


@dataclass
class LinkRequest:
    reference: str
    amount: int  # paise/cents
    currency: str
    description: str
    customer: Customer
    expires_at: datetime  # naive UTC
    return_url: str
    notify_url: str
    items: list[dict] = field(default_factory=list)


def _unix(at: datetime) -> int:
    return int(at.replace(tzinfo=timezone.utc).timestamp())


def _major(amount: int) -> str:
    return f"{amount / 100:.2f}"


def request(method: str, url: str, headers: dict, body: dict | None = None, form: dict | None = None,
            timeout: int = 20) -> tuple[int, dict]:
    """One HTTP call. Returns (status, JSON body); network problems raise GatewayError."""
    data = None
    headers = {"Accept": "application/json", **headers}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    elif form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw, status = res.read(), res.status
    except urllib.error.HTTPError as exc:
        raw, status = exc.read(), exc.code
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GatewayError("Couldn't reach the payment gateway. Try again in a minute.") from exc
    try:
        return status, json.loads(raw or b"{}")
    except ValueError:
        return status, {"raw": raw[:500].decode("utf-8", "replace")}


def _safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


class Provider:
    name = ""
    label = ""
    # what the business fills in: (key, label, secret?)
    fields: tuple[tuple[str, str, bool], ...] = ()
    needs_mode = False  # test/live chosen by the business (otherwise read from the key)
    max_expiry_minutes = 60 * 24 * 30

    def __init__(self, credentials: dict, mode: str = "test", webhook_secret: str | None = None):
        self.c = credentials
        self.mode = mode
        self.webhook_secret = webhook_secret

    # what each gateway implements
    def detect_mode(self) -> str:
        return self.mode

    def hint(self) -> str:
        key = next((self.c.get(k) for k, _, secret in self.fields if not secret and self.c.get(k)), "")
        return f"{key[:12]}…{key[-4:]}" if len(key) > 18 else key

    def check(self) -> None:
        raise NotImplementedError

    def create_link(self, req: LinkRequest) -> Link:
        raise NotImplementedError

    def fetch(self, ref: str, reference: str) -> Event | None:
        raise NotImplementedError

    def cancel(self, ref: str, reference: str) -> None:
        raise NotImplementedError

    def refund(self, payment_id: str, amount: int, reference: str, reason: str | None,
               ref: str | None = None) -> tuple[str, str]:
        """Returns (refund id, processed | pending)."""
        raise NotImplementedError

    def parse_webhook(self, body: bytes, headers: dict) -> list[Event]:
        """Verifies the webhook came from the gateway (GatewayError if not) and reads what happened."""
        raise NotImplementedError

    def _fail(self, status: int, data: dict, doing: str):
        if status in (401, 403):
            raise GatewayError(f"{self.label} refused the keys. Check they're right and for the right mode "
                               "(test or live).", status)
        message = self._message(data) or f"{self.label} error ({status})"
        raise GatewayError(f"{self.label} couldn't {doing}: {message}", status)

    def _message(self, data: dict) -> str:
        err = data.get("error")
        if isinstance(err, dict):
            return err.get("description") or err.get("message") or ""
        return data.get("message") or (err if isinstance(err, str) else "")


# Razorpay ------------------------------------------------------------------------------------

class Razorpay(Provider):
    """Payment Links API. Webhooks: payment_link.paid / expired / cancelled, refund.processed / failed."""

    name, label = "razorpay", "Razorpay"
    fields = (("key_id", "Key ID", False), ("key_secret", "Key secret", True))

    @property
    def base(self) -> str:
        return f"{FAKE_URL}/razorpay/v1" if FAKE_URL else "https://api.razorpay.com/v1"

    def _call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        token = base64.b64encode(f"{self.c.get('key_id', '')}:{self.c.get('key_secret', '')}".encode()).decode()
        return request(method, f"{self.base}{path}", {"Authorization": f"Basic {token}"}, body)

    def detect_mode(self) -> str:
        return "live" if str(self.c.get("key_id", "")).startswith("rzp_live_") else "test"

    def check(self) -> None:
        if not str(self.c.get("key_id", "")).startswith("rzp_"):
            raise GatewayError("A Razorpay Key ID starts with rzp_test_ or rzp_live_")
        status, data = self._call("GET", "/payment_links?count=1")
        if status != 200:
            self._fail(status, data, "check the keys")

    def create_link(self, req: LinkRequest) -> Link:
        body = {
            "amount": req.amount, "currency": req.currency, "accept_partial": False,
            "expire_by": _unix(req.expires_at), "reference_id": req.reference,
            "description": req.description[:2048],
            "customer": {"name": req.customer.name[:100], "contact": f"+{req.customer.phone}"},
            "notify": {"sms": False, "email": False}, "reminder_enable": False,
            "notes": {"reference": req.reference}, "callback_url": req.return_url, "callback_method": "get",
        }
        status, data = self._call("POST", "/payment_links", body)
        if status != 200 or not data.get("short_url"):
            self._fail(status, data, "make the payment link")
        return Link(ref=data["id"], url=data["short_url"])

    def fetch(self, ref: str, reference: str) -> Event | None:
        status, data = self._call("GET", f"/payment_links/{ref}")
        if status != 200:
            self._fail(status, data, "check the payment")
        state = data.get("status")
        if state == "paid":
            pay = next((p for p in data.get("payments") or [] if p.get("status") == "captured"), None) or {}
            return Event("paid", reference, ref, pay.get("payment_id"), pay.get("method"),
                         data.get("amount_paid") or data.get("amount"))
        return {"expired": Event("expired", reference, ref), "cancelled": Event("cancelled", reference, ref)}.get(
            state)

    def cancel(self, ref: str, reference: str) -> None:
        status, data = self._call("POST", f"/payment_links/{ref}/cancel", {})
        if status != 200 and "cancel" not in json.dumps(data).lower():
            self._fail(status, data, "cancel the payment link")

    def refund(self, payment_id, amount, reference, reason, ref=None):
        status, data = self._call("POST", f"/payments/{payment_id}/refund",
                                  {"amount": amount, "speed": "normal",
                                   "notes": {"reason": (reason or "")[:250], "reference": reference}})
        if status != 200:
            self._fail(status, data, "refund")
        return data["id"], "processed" if data.get("status") == "processed" else "pending"

    def parse_webhook(self, body, headers):
        signature = headers.get("x-razorpay-signature") or ""
        if not self.webhook_secret:
            raise GatewayError("Add the webhook secret in ChatDesk to accept Razorpay webhooks")
        expected = hmac.new(self.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        if not _safe_equal(expected, signature):
            raise GatewayError("Invalid Razorpay signature")
        data = json.loads(body or b"{}")
        kind, payload = data.get("event"), data.get("payload") or {}
        link = (payload.get("payment_link") or {}).get("entity") or {}
        pay = (payload.get("payment") or {}).get("entity") or {}
        refund = (payload.get("refund") or {}).get("entity") or {}
        reference = link.get("reference_id") or (pay.get("notes") or {}).get("reference")
        if kind == "payment_link.paid":
            return [Event("paid", reference, link.get("id"), pay.get("id"), pay.get("method"),
                          pay.get("amount") or link.get("amount_paid"))]
        if kind in ("payment_link.expired", "payment_link.cancelled"):
            return [Event(kind.split(".")[1], reference, link.get("id"))]
        if kind == "payment.failed":
            return [Event("failed", reference, None, pay.get("id"), pay.get("method"),
                          error=pay.get("error_description"))]
        if kind in ("refund.processed", "refund.failed"):
            return [Event("refund_processed" if kind == "refund.processed" else "refund_failed",
                          (refund.get("notes") or {}).get("reference"), None, refund.get("payment_id"),
                          amount=refund.get("amount"), refund_ref=refund.get("id"))]
        return []


# Cashfree ------------------------------------------------------------------------------------

class Cashfree(Provider):
    """Payment Links (PG API 2023-08-01). Webhooks are signed with the secret key."""

    name, label = "cashfree", "Cashfree"
    fields = (("app_id", "App ID", False), ("secret_key", "Secret key", True))
    needs_mode = True

    @property
    def base(self) -> str:
        if FAKE_URL:
            return f"{FAKE_URL}/cashfree/pg"
        return "https://api.cashfree.com/pg" if self.mode == "live" else "https://sandbox.cashfree.com/pg"

    def _call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        return request(method, f"{self.base}{path}", {
            "x-client-id": self.c.get("app_id", ""), "x-client-secret": self.c.get("secret_key", ""),
            "x-api-version": "2023-08-01"}, body)

    def _message(self, data: dict) -> str:
        return data.get("message") or super()._message(data)

    def check(self) -> None:
        status, data = self._call("GET", "/links/chatdesk-key-check")
        if status in (401, 403):
            self._fail(status, data, "check the keys")
        if status >= 500:
            self._fail(status, data, "check the keys")

    def create_link(self, req: LinkRequest) -> Link:
        body = {
            "link_id": req.reference, "link_amount": float(_major(req.amount)), "link_currency": req.currency,
            "link_purpose": req.description[:500],
            "customer_details": {"customer_phone": req.customer.phone[-10:] if req.customer.phone.startswith("91")
                                 else req.customer.phone, "customer_name": req.customer.name[:100]},
            "link_expiry_time": req.expires_at.replace(tzinfo=timezone.utc).isoformat(),
            "link_notify": {"send_sms": False, "send_email": False}, "link_auto_reminders": False,
            "link_meta": {"return_url": req.return_url, "notify_url": req.notify_url},
            "link_notes": {"reference": req.reference},
        }
        status, data = self._call("POST", "/links", body)
        if status != 200 or not data.get("link_url"):
            self._fail(status, data, "make the payment link")
        return Link(ref=data.get("link_id") or req.reference, url=data["link_url"])

    def fetch(self, ref, reference):
        status, data = self._call("GET", f"/links/{ref}")
        if status != 200:
            self._fail(status, data, "check the payment")
        state = data.get("link_status")
        if state == "PAID":
            status, orders = self._call("GET", f"/links/{ref}/orders")
            paid = next((o for o in (orders if isinstance(orders, list) else []) if o.get("order_status") == "PAID"),
                        {})
            return Event("paid", reference, ref, paid.get("order_id"), None,
                         int(round(float(data.get("link_amount_paid") or data.get("link_amount") or 0) * 100)))
        return {"EXPIRED": Event("expired", reference, ref), "CANCELLED": Event("cancelled", reference, ref)}.get(
            state)

    def cancel(self, ref, reference):
        status, data = self._call("POST", f"/links/{ref}/cancel", {})
        if status != 200 and status != 400:
            self._fail(status, data, "cancel the payment link")

    def refund(self, payment_id, amount, reference, reason, ref=None):
        refund_id = f"R{reference}{int(time.time()) % 100000}"[:40]
        status, data = self._call("POST", f"/orders/{payment_id}/refunds",
                                  {"refund_amount": float(_major(amount)), "refund_id": refund_id,
                                   "refund_note": (reason or "Refund")[:100]})
        if status != 200:
            self._fail(status, data, "refund")
        return data.get("refund_id") or refund_id, "processed" if data.get("refund_status") == "SUCCESS" \
            else "pending"

    def parse_webhook(self, body, headers):
        stamp, signature = headers.get("x-webhook-timestamp") or "", headers.get("x-webhook-signature") or ""
        expected = base64.b64encode(hmac.new(str(self.c.get("secret_key", "")).encode(),
                                             stamp.encode() + body, hashlib.sha256).digest()).decode()
        if not signature or not _safe_equal(expected, signature):
            raise GatewayError("Invalid Cashfree signature")
        data = json.loads(body or b"{}")
        kind, inner = data.get("type"), data.get("data") or {}
        if kind == "PAYMENT_LINK_EVENT":
            state = inner.get("link_status")
            order = inner.get("order") or {}
            notes = inner.get("link_notes") or {}
            reference = notes.get("reference") or inner.get("link_id")
            if state == "PAID" or order.get("transaction_status") == "SUCCESS":
                return [Event("paid", reference, inner.get("link_id"), order.get("order_id"), None,
                              int(round(float(inner.get("link_amount_paid") or inner.get("link_amount") or 0)
                                        * 100)))]
            if state in ("EXPIRED", "CANCELLED"):
                return [Event(state.lower(), reference, inner.get("link_id"))]
            return []
        if kind == "REFUND_STATUS_WEBHOOK":
            refund = inner.get("refund") or {}
            state = refund.get("refund_status")
            if state in ("SUCCESS", "CANCELLED", "FAILED"):
                return [Event("refund_processed" if state == "SUCCESS" else "refund_failed", None, None,
                              refund.get("order_id"), amount=int(round(float(refund.get("refund_amount") or 0)
                                                                       * 100)),
                              refund_ref=refund.get("refund_id"))]
        return []


# PayU ------------------------------------------------------------------------------------------

class PayU(Provider):
    """PayU India: payment links (create_invoice), checked with verify_payment, refunded with
    cancel_refund_transaction. Its webhook posts the payment with a reverse hash made with the salt."""

    name, label = "payu", "PayU"
    fields = (("merchant_key", "Merchant key", False), ("salt", "Merchant salt", True))
    needs_mode = True

    @property
    def base(self) -> str:
        if FAKE_URL:
            return f"{FAKE_URL}/payu/merchant/postservice.php?form=2"
        host = "info.payu.in" if self.mode == "live" else "test.payu.in"
        return f"https://{host}/merchant/postservice.php?form=2"

    def _command(self, command: str, var1: str, **more) -> dict:
        key, salt = self.c.get("merchant_key", ""), self.c.get("salt", "")
        digest = hashlib.sha512(f"{key}|{command}|{var1}|{salt}".encode()).hexdigest()
        status, data = request("POST", self.base, {}, form={"key": key, "command": command, "var1": var1,
                                                            "hash": digest, **more})
        if status != 200:
            self._fail(status, data, command.replace("_", " "))
        if isinstance(data, dict) and str(data.get("status")) == "0" and "invalid" in str(data.get("msg", "")).lower():
            raise GatewayError(f"PayU refused the keys: {data.get('msg')}", 401)
        return data

    def check(self) -> None:
        self._command("verify_payment", "chatdesk-key-check")

    def create_link(self, req: LinkRequest) -> Link:
        minutes = max(1, int((req.expires_at - datetime.now(timezone.utc).replace(tzinfo=None)).total_seconds() // 60))
        var1 = json.dumps({
            "amount": _major(req.amount), "txnid": req.reference, "productinfo": req.description[:100],
            "firstname": (req.customer.name or "Customer")[:60], "email": req.customer.email or "",
            "phone": req.customer.phone[-10:], "validation_period": max(1, round(minutes / 1440)),
            "send_email_now": "0", "send_sms": "0", "time_unit": "D",
            "surl": req.return_url, "furl": req.return_url,
        })
        data = self._command("create_invoice", var1)
        url = data.get("URL") or data.get("url")
        if not url:
            raise GatewayError(f"PayU couldn't make the payment link: {data.get('msg') or 'no link returned'}")
        return Link(ref=req.reference, url=url)

    def fetch(self, ref, reference):
        data = self._command("verify_payment", reference)
        row = (data.get("transaction_details") or {}).get(reference) or {}
        state = str(row.get("status", "")).lower()
        if state == "success":
            return Event("paid", reference, ref, row.get("mihpayid"), row.get("mode"),
                         int(round(float(row.get("amt") or row.get("amount") or 0) * 100)))
        if state in ("failure", "failed"):
            return Event("failed", reference, ref, row.get("mihpayid"), error=row.get("error_Message"))
        return None

    def cancel(self, ref, reference):
        try:
            self._command("expire_invoice", reference)
        except GatewayError:
            pass  # PayU can't always expire links; ours is closed either way

    def refund(self, payment_id, amount, reference, reason, ref=None):
        token = f"R{reference}{int(time.time()) % 100000}"[:23]
        data = self._command("cancel_refund_transaction", payment_id, var2=token, var3=_major(amount))
        if str(data.get("status")) != "1":
            raise GatewayError(f"PayU couldn't refund: {data.get('msg') or 'refused'}")
        return str(data.get("request_id") or token), "pending"

    def parse_webhook(self, body, headers):
        form = {k: v[0] for k, v in urllib.parse.parse_qs(body.decode("utf-8", "replace")).items()}
        if not form and body.strip().startswith(b"{"):
            form = json.loads(body)
        key, salt = self.c.get("merchant_key", ""), self.c.get("salt", "")
        fields = [salt, form.get("status", "")] + [""] * 5 + [form.get(f"udf{i}", "") for i in (5, 4, 3, 2, 1)] + [
            form.get("email", ""), form.get("firstname", ""), form.get("productinfo", ""), form.get("amount", ""),
            form.get("txnid", ""), key]
        if form.get("additionalCharges"):
            fields.insert(0, form["additionalCharges"])
        expected = hashlib.sha512("|".join(fields).encode()).hexdigest()
        if not form.get("hash") or not _safe_equal(expected, form["hash"]):
            raise GatewayError("Invalid PayU hash")
        state = str(form.get("status", "")).lower()
        amount = int(round(float(form.get("amount") or 0) * 100))
        if state == "success":
            return [Event("paid", form.get("txnid"), None, form.get("mihpayid"), form.get("mode"), amount)]
        if state in ("failure", "failed"):
            return [Event("failed", form.get("txnid"), None, form.get("mihpayid"), error=form.get("error_Message"))]
        return []


# Stripe ----------------------------------------------------------------------------------------

class Stripe(Provider):
    """Checkout Sessions (they expire between 30 minutes and 24 hours). Webhooks: checkout.session.completed /
    expired, refund.updated / charge.refund.updated."""

    name, label = "stripe", "Stripe"
    fields = (("secret_key", "Secret key", True),)
    max_expiry_minutes = 60 * 24

    @property
    def base(self) -> str:
        return f"{FAKE_URL}/stripe/v1" if FAKE_URL else "https://api.stripe.com/v1"

    def _call(self, method: str, path: str, form: dict | None = None) -> tuple[int, dict]:
        return request(method, f"{self.base}{path}", {"Authorization": f"Bearer {self.c.get('secret_key', '')}"},
                       form=form)

    def detect_mode(self) -> str:
        return "live" if str(self.c.get("secret_key", "")).startswith(("sk_live_", "rk_live_")) else "test"

    def hint(self) -> str:
        key = str(self.c.get("secret_key", ""))
        return f"{key[:8]}…{key[-4:]}" if len(key) > 14 else ""

    def check(self) -> None:
        if not str(self.c.get("secret_key", "")).startswith(("sk_", "rk_")):
            raise GatewayError("A Stripe secret key starts with sk_test_ or sk_live_")
        status, data = self._call("GET", "/balance")
        if status != 200:
            self._fail(status, data, "check the key")

    def create_link(self, req: LinkRequest) -> Link:
        form = {
            "mode": "payment", "client_reference_id": req.reference,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": req.currency.lower(),
            "line_items[0][price_data][unit_amount]": str(req.amount),
            "line_items[0][price_data][product_data][name]": req.description[:250],
            "expires_at": str(_unix(req.expires_at)),
            "success_url": req.return_url, "cancel_url": req.return_url,
            "metadata[reference]": req.reference, "payment_intent_data[metadata][reference]": req.reference,
        }
        status, data = self._call("POST", "/checkout/sessions", form)
        if status != 200 or not data.get("url"):
            self._fail(status, data, "make the payment link")
        return Link(ref=data["id"], url=data["url"])

    def fetch(self, ref, reference):
        status, data = self._call("GET", f"/checkout/sessions/{ref}")
        if status != 200:
            self._fail(status, data, "check the payment")
        if data.get("payment_status") == "paid":
            return Event("paid", reference, ref, data.get("payment_intent"), "card", data.get("amount_total"))
        return Event("expired", reference, ref) if data.get("status") == "expired" else None

    def cancel(self, ref, reference):
        status, data = self._call("POST", f"/checkout/sessions/{ref}/expire", {})
        if status != 200 and "expire" not in json.dumps(data).lower():
            self._fail(status, data, "cancel the payment link")

    def refund(self, payment_id, amount, reference, reason, ref=None):
        status, data = self._call("POST", "/refunds", {"payment_intent": payment_id, "amount": str(amount),
                                                        "metadata[reference]": reference,
                                                        "metadata[reason]": (reason or "")[:400]})
        if status != 200:
            self._fail(status, data, "refund")
        return data["id"], "processed" if data.get("status") == "succeeded" else "pending"

    def parse_webhook(self, body, headers, tolerance: int = 600):
        if not self.webhook_secret:
            raise GatewayError("Add the webhook signing secret in ChatDesk to accept Stripe webhooks")
        parts = dict(p.split("=", 1) for p in (headers.get("stripe-signature") or "").split(",") if "=" in p)
        stamp = parts.get("t", "")
        expected = hmac.new(self.webhook_secret.encode(), f"{stamp}.".encode() + body, hashlib.sha256).hexdigest()
        if not stamp or not _safe_equal(expected, parts.get("v1", "")) or abs(time.time() - int(stamp)) > tolerance:
            raise GatewayError("Invalid Stripe signature")
        data = json.loads(body or b"{}")
        kind, obj = data.get("type"), (data.get("data") or {}).get("object") or {}
        reference = (obj.get("metadata") or {}).get("reference") or obj.get("client_reference_id")
        if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded") \
                and obj.get("payment_status") == "paid":
            return [Event("paid", reference, obj.get("id"), obj.get("payment_intent"), "card", obj.get("amount_total"))]
        if kind == "checkout.session.expired":
            return [Event("expired", reference, obj.get("id"))]
        if kind == "checkout.session.async_payment_failed":
            return [Event("failed", reference, obj.get("id"))]
        if kind in ("refund.updated", "refund.created", "charge.refund.updated") and obj.get("object") == "refund":
            state = obj.get("status")
            if state in ("succeeded", "failed", "canceled"):
                return [Event("refund_processed" if state == "succeeded" else "refund_failed", reference, None,
                              obj.get("payment_intent"), amount=obj.get("amount"), refund_ref=obj.get("id"))]
        return []


PROVIDERS: dict[str, type[Provider]] = {p.name: p for p in (Razorpay, Cashfree, PayU, Stripe)}


def provider(name: str, credentials: dict, mode: str = "test", webhook_secret: str | None = None) -> Provider:
    return PROVIDERS[name](credentials, mode, webhook_secret)
