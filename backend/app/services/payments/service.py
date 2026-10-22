import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import DEFAULT_APP_NAME, settings
from app.services.payments import config
from app.services.payments.base import OrderRequest, PaymentError
from app.services.payments.gateways import PAYMENT_GATEWAYS
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)

NO_GATEWAY = "No payment gateway is turned on. Enable one in Settings → Payment gateways."
WEBHOOK_PATH = "/api/v1/website/payments/webhook/{gateway}"


def webhook_url(gateway: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{WEBHOOK_PATH.format(gateway=gateway)}"


def _branding(db: Session) -> dict:
    from app.modules.admin.settings.service import get_group

    general = get_group(db, "general")
    return {"name": general.get("app_name") or DEFAULT_APP_NAME, "logo": general.get("logo_light")}


def _pick(cfg: dict, gateway: str | None) -> str:
    enabled = config.enabled_gateways(cfg)
    if gateway:
        if gateway not in PAYMENT_GATEWAYS:
            raise PaymentError("Unknown payment gateway")
        if gateway not in enabled:
            raise PaymentError(f"{PAYMENT_GATEWAYS[gateway].label} is turned off")
        return gateway
    if not enabled:
        raise PaymentError(NO_GATEWAY)
    return cfg["default_gateway"] if cfg["default_gateway"] in enabled else enabled[0]


def _ready(cfg: dict, key: str) -> dict:
    values = cfg["gateways"][key]
    missing = PAYMENT_GATEWAYS[key].missing(values)
    if missing:
        raise PaymentError(f"{PAYMENT_GATEWAYS[key].label}: add the {', '.join(missing)}")
    return values


def to_minor(amount: float) -> int:
    return int(round(float(amount) * 100))


def start_checkout(db: Session, *, amount: int, currency: str | None = None, gateway: str | None = None,
                   purpose: str = "payment", description: str = "", reference: str | None = None,
                   customer_id: int | None = None, payer: dict | None = None, notes: dict | None = None) -> dict:
    from app.modules.admin.payments.models import Payment

    if amount < 100:
        raise PaymentError("The amount must be at least 1.00")
    cfg = config.load(db, with_secrets=True)
    key = _pick(cfg, gateway)
    values = _ready(cfg, key)
    gw = PAYMENT_GATEWAYS[key]
    currency = (currency or cfg["currency"]).upper()
    if currency not in gw.currencies:
        raise PaymentError(f"{gw.label} doesn't accept {currency}")
    payer = {k: v for k, v in (payer or {}).items() if v}
    payment = Payment(gateway=key, purpose=purpose, reference=reference, customer_id=customer_id, amount=amount,
                      currency=currency, status="created", test_mode=gw.is_test_mode(values),
                      description=description[:255] or None, payer=payer or None, notes=notes or None)
    db.add(payment)
    db.flush()
    request = OrderRequest(amount=amount, currency=currency, receipt=f"pay_{payment.id}", description=description,
                           notes={"payment_id": str(payment.id), "purpose": purpose, **(notes or {})}, payer=payer)
    try:
        order = gw.create_order(values, request)
    except PaymentError:
        db.rollback()
        raise
    payment.gateway_order_id = order.order_id
    db.commit()
    return {"payment_id": payment.id, "gateway": key, "test_mode": payment.test_mode,
            "checkout": gw.checkout(values, order, request, _branding(db))}


def _find(db: Session, gateway: str, order_id: str | None):
    from app.modules.admin.payments.models import Payment

    if not order_id:
        return None
    return db.query(Payment).filter(Payment.gateway == gateway, Payment.gateway_order_id == order_id).first()


def _mark(payment, status: str, *, payment_id: str | None = None, method: str | None = None,
          error: str | None = None) -> None:
    if payment.status == "paid" and status == "failed":
        return
    if payment.status == "refunded" and status != "refunded":
        return
    payment.status = status
    payment.gateway_payment_id = payment_id or payment.gateway_payment_id
    payment.method = method or payment.method
    if status == "paid":
        payment.paid_at = payment.paid_at or now()
        payment.error = None
    elif error:
        payment.error = error[:1000]


def confirm_payment(db: Session, gateway: str, data: dict):
    cfg = config.load(db, with_secrets=True)
    if gateway not in PAYMENT_GATEWAYS:
        raise PaymentError("Unknown payment gateway")
    values = _ready(cfg, gateway)
    result = PAYMENT_GATEWAYS[gateway].verify_payment(values, data)
    payment = _find(db, gateway, result.order_id)
    if payment is None:
        raise PaymentError("We couldn't find this payment")
    _mark(payment, "paid" if result.paid else (result.status or "failed"), payment_id=result.payment_id,
          method=result.method, error=result.error)
    db.commit()
    return payment


def record_failure(db: Session, gateway: str, order_id: str, error: str | None):
    payment = _find(db, gateway, order_id)
    if payment is not None and payment.status == "created":
        _mark(payment, "failed", error=error or "Payment failed")
        db.commit()
    return payment


def handle_webhook(db: Session, gateway: str, body: bytes, headers: dict) -> tuple[int, str]:
    from app.modules.admin.payments.models import PaymentWebhook

    if gateway not in PAYMENT_GATEWAYS:
        return 404, "Unknown gateway"
    gw = PAYMENT_GATEWAYS[gateway]
    cfg = config.load(db, with_secrets=True)
    values = cfg["gateways"][gateway]
    valid = gw.verify_webhook(values, body, headers)
    try:
        event = gw.parse_webhook(body, headers)
    except PaymentError as exc:
        db.add(PaymentWebhook(gateway=gateway, event="invalid", signature_valid=valid, status="rejected",
                              error=str(exc)))
        db.commit()
        return 400, str(exc)

    log = PaymentWebhook(gateway=gateway, event=event.event[:100], event_id=(event.event_id or None),
                         signature_valid=valid, payload=event.raw, status="received")
    if not valid:
        log.status = "rejected"
        log.error = "Signature didn't match. Check the webhook secret." if values.get("webhook_secret") else \
            "No webhook secret is saved in Settings → Payment gateways."
        log.event_id = None
        db.add(log)
        db.commit()
        return 400, "Invalid signature"
    try:
        db.add(log)
        db.flush()
    except IntegrityError:
        db.rollback()
        return 200, "Already processed"

    payment = _find(db, gateway, event.order_id)
    log.payment_id = payment.id if payment else None
    if payment is None:
        log.status = "ignored"
        log.error = "No matching payment"
    elif event.status:
        _mark(payment, event.status, payment_id=event.payment_id, method=event.method, error=event.error)
        log.status = "processed"
    else:
        log.status = "ignored"
    db.commit()
    return 200, log.status
