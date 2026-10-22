from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.payments.models import Payment, PaymentWebhook
from app.modules.admin.payments.schemas import (
    ConfirmSchema, FailureSchema, GatewaySchema, PaymentSettingsSchema, TestCheckoutSchema,
)
from app.services.payments import (
    PAYMENT_GATEWAYS, PaymentError, confirm_payment, record_failure, start_checkout, to_minor, webhook_url,
)
from app.services.payments import config as pay_config
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso
from app.shared.utils.search import search_clause

SUBJECT = "settings"


def _unprocessable(errors: dict[str, list[str]]) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"errors": errors})


def _payload(db: Session) -> dict:
    return {
        "status": True,
        "data": {
            "settings": pay_config.load(db),
            "gateways": [{**gw.spec(), "webhook_url": webhook_url(gw.key)} for gw in PAYMENT_GATEWAYS.values()],
        },
    }


def show(db: Session) -> dict:
    return _payload(db)


def _flat(cfg: dict) -> dict:
    flat = {"currency": cfg["currency"], "default_gateway": cfg["default_gateway"]}
    for key, values in cfg["gateways"].items():
        for name, value in values.items():
            if name == "test_mode":
                continue
            if name.startswith("has_"):
                flat[f"{key}.{name[4:]}"] = "••••••" if value else None
            else:
                flat[f"{key}.{name}"] = value
    return flat


def update(db: Session, payload: PaymentSettingsSchema, request: Request) -> dict:
    data = payload.model_dump()
    data["currency"] = data["currency"].upper()
    errors: dict[str, list[str]] = {}
    for key in data["gateways"]:
        if key not in PAYMENT_GATEWAYS:
            errors[f"gateways.{key}"] = ["Unknown payment gateway"]
    if errors:
        raise _unprocessable(errors)

    before = _flat(pay_config.load(db))
    saved = pay_config.save(db, data)
    for key, gw in PAYMENT_GATEWAYS.items():
        values = saved["gateways"][key]
        if not values.get("enabled"):
            continue
        for field in gw.fields:
            if field.required and not str(values.get(field.name) or "").strip():
                errors[f"gateways.{key}.{field.name}"] = [f"{field.label} is required to turn on {gw.label}"]
        if data["currency"] not in gw.currencies:
            errors["currency"] = [f"{gw.label} doesn't accept {data['currency']}"]
        color = str(values.get("theme_color") or "")
        if color and not (color.startswith("#") and len(color) in (4, 7)):
            errors[f"gateways.{key}.theme_color"] = ["Use a hex colour like #4f46e5"]
    if errors:
        db.rollback()
        raise _unprocessable(errors)

    old, new = diff(before, _flat(pay_config.load(db)))
    if old or new:
        log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_label="payments",
                     description=f"Updated payment gateway settings: {', '.join(sorted(new)) or 'no fields'}",
                     old_values=old, new_values=new)
    db.commit()
    return {**_payload(db), "message": "Payment settings saved"}


def test_connection(db: Session, payload: GatewaySchema, request: Request) -> dict:
    gw = PAYMENT_GATEWAYS.get(payload.gateway)
    if gw is None:
        raise _unprocessable({"gateway": ["Unknown payment gateway"]})
    values = pay_config.load(db, with_secrets=True)["gateways"][gw.key]
    missing = gw.missing(values)
    if missing:
        raise HTTPException(status_code=400, detail=f"Save the {', '.join(missing)} first")
    try:
        message = gw.test_connection(values)
    except PaymentError as exc:
        log_activity(db, "tested", request=request, subject_type=SUBJECT, subject_label="payments",
                     description=f"{gw.label} connection test failed: {exc}")
        db.commit()
        raise HTTPException(status_code=400, detail=f"{gw.label}: {exc}")
    log_activity(db, "tested", request=request, subject_type=SUBJECT, subject_label="payments",
                 description=f"{gw.label} connection test passed")
    db.commit()
    return {"status": True, "message": message, "data": {"test_mode": gw.is_test_mode(values)}}


def test_checkout(db: Session, payload: TestCheckoutSchema, request: Request) -> dict:
    user = getattr(request.state, "user", None)
    try:
        data = start_checkout(
            db, amount=to_minor(payload.amount), currency=payload.currency, gateway=payload.gateway,
            purpose="admin_test", description="Test payment from the admin panel",
            payer={"name": user.name, "email": user.email, "phone": user.phone} if user else None,
            notes={"admin_user_id": str(user.id)} if user else None,
        )
    except PaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": True, "data": data}


def confirm(db: Session, payload: ConfirmSchema, request: Request) -> dict:
    try:
        payment = confirm_payment(db, payload.gateway, payload.data)
    except PaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    label = PAYMENT_GATEWAYS[payment.gateway].label
    if payment.purpose == "admin_test":
        log_activity(db, "tested", request=request, subject_type=SUBJECT, subject_label="payments",
                     description=f"Test payment #{payment.id} via {label}: {payment.status}")
        db.commit()
    if payment.status != "paid":
        raise HTTPException(status_code=400, detail={"message": payment.error or "The payment wasn't completed",
                                                     "data": _serialize(payment)})
    return {"status": True, "message": f"Payment #{payment.id} succeeded", "data": _serialize(payment)}


def failed(db: Session, payload: FailureSchema) -> dict:
    payment = record_failure(db, payload.gateway, payload.order_id, payload.error)
    return {"status": True, "data": _serialize(payment) if payment else None}


def _serialize(row: Payment) -> dict:
    gw = PAYMENT_GATEWAYS.get(row.gateway)
    return {
        "id": row.id, "gateway": row.gateway, "gateway_label": gw.label if gw else row.gateway,
        "purpose": row.purpose, "reference": row.reference, "customer_id": row.customer_id,
        "amount": row.amount, "currency": row.currency, "status": row.status, "test_mode": row.test_mode,
        "gateway_order_id": row.gateway_order_id, "gateway_payment_id": row.gateway_payment_id,
        "method": row.method, "description": row.description, "payer": row.payer or {}, "error": row.error,
        "paid_at": iso(row.paid_at), "created_at": iso(row.created_at),
    }


def transactions(db: Session, page=None, per_page=None, search=None, status_filter=None) -> dict:
    q = db.query(Payment)
    clause = search_clause([Payment.gateway_order_id, Payment.gateway_payment_id, Payment.description,
                            Payment.reference], search)
    if clause is not None:
        q = q.filter(clause)
    if status_filter:
        q = q.filter(Payment.status == status_filter)
    return list_response(q.order_by(Payment.id.desc()), _serialize, page or 1, per_page or 20, search)


def _serialize_webhook(row: PaymentWebhook) -> dict:
    gw = PAYMENT_GATEWAYS.get(row.gateway)
    return {"id": row.id, "gateway": row.gateway, "gateway_label": gw.label if gw else row.gateway,
            "event": row.event, "event_id": row.event_id, "payment_id": row.payment_id,
            "signature_valid": row.signature_valid, "status": row.status, "error": row.error,
            "created_at": iso(row.created_at)}


def webhooks(db: Session, page=None, per_page=None, status_filter=None) -> dict:
    q = db.query(PaymentWebhook)
    if status_filter:
        q = q.filter(PaymentWebhook.status == status_filter)
    return list_response(q.order_by(PaymentWebhook.id.desc()), _serialize_webhook, page or 1, per_page or 20)
