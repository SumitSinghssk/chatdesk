import hashlib
import hmac
import json
import urllib.parse

from app.services.payments.base import (
    GatewayOrder, OrderRequest, PaymentError, PaymentGateway, PaymentResult, WebhookEvent,
)
from app.services.fields import GatewayField

API = "https://api.razorpay.com/v1"


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _error(status: int, data: dict, text: str) -> PaymentError:
    detail = (data.get("error") or {}).get("description") if isinstance(data.get("error"), dict) else None
    if status == 401:
        detail = "The key ID or key secret is wrong"
    return PaymentError(f"HTTP {status}: {detail or text.strip()[:200] or 'no response'}")


class RazorpayGateway(PaymentGateway):
    key = "razorpay"
    label = "Razorpay"
    website = "https://razorpay.com"
    dashboard_url = "https://dashboard.razorpay.com/app/website-app-settings/api-keys"
    fields = (
        GatewayField("key_id", "Key ID", required=True, help="Starts with rzp_test_ (test mode) or rzp_live_"),
        GatewayField("key_secret", "Key secret", required=True, secret=True),
        GatewayField("webhook_secret", "Webhook secret", secret=True,
                     help="The secret you typed when adding the webhook in Razorpay"),
        GatewayField("checkout_name", "Name on checkout", help="Defaults to your business name"),
        GatewayField("theme_color", "Checkout colour", default="#4f46e5", help="Hex colour, e.g. #4f46e5"),
    )
    webhook_events = ("payment.captured", "payment.failed", "order.paid", "refund.processed")
    currencies = ("INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD")

    def is_test_mode(self, cfg: dict) -> bool:
        return str(cfg.get("key_id") or "").startswith("rzp_test_")

    def _auth(self, cfg: dict) -> tuple[str, str]:
        return cfg["key_id"].strip(), cfg["key_secret"].strip()

    def test_connection(self, cfg: dict) -> str:
        status, data, text = self.http(f"{API}/orders?count=1", basic=self._auth(cfg))
        if status != 200:
            raise _error(status, data, text)
        return f"Connected to Razorpay in {'test' if self.is_test_mode(cfg) else 'live'} mode"

    def create_order(self, cfg: dict, order: OrderRequest) -> GatewayOrder:
        body = {"amount": order.amount, "currency": order.currency, "receipt": order.receipt[:40],
                "notes": {k: str(v)[:256] for k, v in list(order.notes.items())[:15]}}
        status, data, text = self.http(f"{API}/orders", method="POST", body=body, basic=self._auth(cfg))
        if status >= 300 or not data.get("id"):
            raise _error(status, data, text)
        return GatewayOrder(order_id=data["id"], amount=int(data.get("amount") or order.amount),
                            currency=data.get("currency") or order.currency, raw=data)

    def checkout(self, cfg: dict, order: GatewayOrder, request: OrderRequest, branding: dict) -> dict:
        prefill = {k: v for k, v in {"name": request.payer.get("name"), "email": request.payer.get("email"),
                                     "contact": request.payer.get("phone")}.items() if v}
        options = {
            "key": cfg["key_id"].strip(),
            "amount": order.amount,
            "currency": order.currency,
            "order_id": order.order_id,
            "name": cfg.get("checkout_name") or branding.get("name") or "Payment",
            "description": request.description[:255],
            "prefill": prefill,
            "notes": request.notes,
            "theme": {"color": cfg.get("theme_color") or "#4f46e5"},
        }
        if branding.get("logo"):
            options["image"] = branding["logo"]
        return options

    def _fetch_payment(self, cfg: dict, payment_id: str) -> dict:
        try:
            status, data, _ = self.http(f"{API}/payments/{urllib.parse.quote(payment_id)}", basic=self._auth(cfg))
        except PaymentError:
            return {}
        return data if status == 200 else {}

    def verify_payment(self, cfg: dict, data: dict) -> PaymentResult:
        order_id = str(data.get("razorpay_order_id") or "")
        payment_id = str(data.get("razorpay_payment_id") or "")
        signature = str(data.get("razorpay_signature") or "")
        if not (order_id and payment_id and signature):
            raise PaymentError("Missing Razorpay payment details")
        expected = _sign(cfg["key_secret"].strip(), f"{order_id}|{payment_id}".encode("utf-8"))
        if not hmac.compare_digest(expected, signature):
            return PaymentResult(paid=False, order_id=order_id, payment_id=payment_id, status="failed",
                                 error="The payment signature didn't match")
        details = self._fetch_payment(cfg, payment_id)
        status = details.get("status") or "captured"
        return PaymentResult(paid=status in ("captured", "authorized"), order_id=order_id, payment_id=payment_id,
                             status="paid" if status in ("captured", "authorized") else status,
                             method=details.get("method"), raw=details)

    def verify_webhook(self, cfg: dict, body: bytes, headers: dict) -> bool:
        secret = str(cfg.get("webhook_secret") or "").strip()
        signature = headers.get("x-razorpay-signature") or ""
        return bool(secret and signature) and hmac.compare_digest(_sign(secret, body), signature)

    def parse_webhook(self, body: bytes, headers: dict) -> WebhookEvent:
        try:
            data = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise PaymentError("Webhook body isn't valid JSON")
        payload = data.get("payload") or {}
        payment = (payload.get("payment") or {}).get("entity") or {}
        order = (payload.get("order") or {}).get("entity") or {}
        refund = (payload.get("refund") or {}).get("entity") or {}
        event = data.get("event") or "unknown"
        status = {"payment.captured": "paid", "order.paid": "paid", "payment.failed": "failed",
                  "refund.processed": "refunded"}.get(event)
        return WebhookEvent(
            event_id=headers.get("x-razorpay-event-id"),
            event=event,
            order_id=payment.get("order_id") or order.get("id"),
            payment_id=payment.get("id") or refund.get("payment_id"),
            status=status,
            method=payment.get("method"),
            error=payment.get("error_description"),
            amount=payment.get("amount") or order.get("amount_paid"),
            raw=data,
        )
