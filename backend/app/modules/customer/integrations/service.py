"""Integrations in the dashboard: API keys and webhook endpoints of the number in use, with the
delivery log. The public API itself is in api.py, webhook sending in webhooks.py."""
import secrets

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.security import sha256
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.integrations import webhooks
from app.modules.customer.integrations.models import ApiKey, WebhookDelivery, WebhookEndpoint
from app.modules.customer.integrations.schemas import ApiKeySchema, EndpointSchema, TestEventSchema
from app.modules.customer.team.access import actor_name
from app.shared.utils.datetime import iso, now

KEY_PREFIX = "cdk_"
MAX_KEYS = 10
MAX_ENDPOINTS = 10


def new_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32).replace("-", "x").replace("_", "y")


# API keys ---------------------------------------------------------------------------------

def _key(k: ApiKey, secret: str | None = None) -> dict:
    return {"id": k.id, "name": k.name, "hint": f"{k.prefix}…", "created_by": k.created_by,
            "created_at": iso(k.created_at), "last_used_at": iso(k.last_used_at),
            **({"key": secret} if secret else {})}


def list_keys(db: Session, ws: Customer) -> dict:
    rows = db.query(ApiKey).filter(ApiKey.customer_id == ws.id).order_by(ApiKey.id.desc()).all()
    return {"status": True, "data": [_key(k) for k in rows]}


def create_key(db: Session, ws: Customer, payload: ApiKeySchema) -> dict:
    if db.query(func.count(ApiKey.id)).filter(ApiKey.customer_id == ws.id).scalar() >= MAX_KEYS:
        raise HTTPException(422, detail=f"A number can have up to {MAX_KEYS} API keys. Delete one you don't use.")
    secret = new_key()
    row = ApiKey(customer_id=ws.id, name=payload.name, prefix=secret[:12], key_hash=sha256(secret),
                 created_by=actor_name(ws), created_at=now())
    db.add(row)
    db.commit()
    return {"status": True, "message": "API key created. Copy it now: it won't be shown again.",
            "data": _key(row, secret)}


def delete_key(db: Session, ws: Customer, key_id: int) -> dict:
    row = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.customer_id == ws.id).first()
    if row is None:
        raise HTTPException(404, detail="API key not found")
    db.delete(row)
    db.commit()
    return {"status": True, "message": "API key deleted. Apps using it stop working right away.", "data": None}


# Webhook endpoints ----------------------------------------------------------------------------

def _endpoint(db: Session, e: WebhookEndpoint, secret: bool = False) -> dict:
    last = (db.query(WebhookDelivery.status, WebhookDelivery.response_status, WebhookDelivery.last_attempt_at)
            .filter(WebhookDelivery.endpoint_id == e.id, WebhookDelivery.attempts > 0)
            .order_by(WebhookDelivery.last_attempt_at.desc()).first())
    week = (db.query(WebhookDelivery.status, func.count(WebhookDelivery.id))
            .filter(WebhookDelivery.endpoint_id == e.id).group_by(WebhookDelivery.status).all())
    counts = dict(week)
    return {
        "id": e.id, "url": e.url, "description": e.description, "events": e.events or [], "enabled": e.enabled,
        "health": "failing" if e.failures_in_row >= 3 else "ok" if e.last_success_at else "new",
        "failures_in_row": e.failures_in_row, "last_success_at": iso(e.last_success_at),
        "last_failure_at": iso(e.last_failure_at),
        "last_delivery": {"status": last[0], "response_status": last[1], "at": iso(last[2])} if last else None,
        "counts": {"success": int(counts.get("success", 0)), "failed": int(counts.get("failed", 0)),
                   "pending": int(counts.get("pending", 0))},
        "created_at": iso(e.created_at),
        **({"secret": decrypt_secret(e.secret)} if secret else {}),
    }


def _get_endpoint(db: Session, ws: Customer, endpoint_id: int) -> WebhookEndpoint:
    row = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == endpoint_id,
                                           WebhookEndpoint.customer_id == ws.id).first()
    if row is None:
        raise HTTPException(404, detail="Webhook not found")
    return row


def _check_url(url: str) -> None:
    from app.modules.customer.ai_agent.providers import address_allowed

    if not address_allowed(url):
        raise field_error(422, "url", "Use a public internet address (not localhost or a private network)")


def events() -> dict:
    return {"status": True, "data": [{"event": k, "description": v} for k, v in webhooks.EVENTS.items()]}


def list_endpoints(db: Session, ws: Customer) -> dict:
    rows = db.query(WebhookEndpoint).filter(WebhookEndpoint.customer_id == ws.id).order_by(WebhookEndpoint.id).all()
    return {"status": True, "data": [_endpoint(db, e) for e in rows]}


def get_endpoint(db: Session, ws: Customer, endpoint_id: int) -> dict:
    return {"status": True, "data": _endpoint(db, _get_endpoint(db, ws, endpoint_id), secret=True)}


def create_endpoint(db: Session, ws: Customer, payload: EndpointSchema) -> dict:
    if db.query(func.count(WebhookEndpoint.id)).filter(WebhookEndpoint.customer_id == ws.id).scalar() \
            >= MAX_ENDPOINTS:
        raise HTTPException(422, detail=f"A number can have up to {MAX_ENDPOINTS} webhooks")
    _check_url(payload.url)
    row = WebhookEndpoint(customer_id=ws.id, url=payload.url, description=payload.description,
                          events=payload.events, enabled=payload.enabled, secret=encrypt_secret(webhooks.new_secret()),
                          failures_in_row=0)
    db.add(row)
    db.commit()
    return {"status": True, "message": "Webhook added. Send a test event to check it.",
            "data": _endpoint(db, row, secret=True)}


def update_endpoint(db: Session, ws: Customer, endpoint_id: int, payload: EndpointSchema) -> dict:
    row = _get_endpoint(db, ws, endpoint_id)
    _check_url(payload.url)
    row.url, row.description, row.events = payload.url, payload.description, payload.events
    if payload.enabled and not row.enabled:
        row.failures_in_row = 0
    row.enabled = payload.enabled
    db.commit()
    return {"status": True, "message": "Webhook saved", "data": _endpoint(db, row, secret=True)}


def roll_secret(db: Session, ws: Customer, endpoint_id: int) -> dict:
    row = _get_endpoint(db, ws, endpoint_id)
    row.secret = encrypt_secret(webhooks.new_secret())
    db.commit()
    return {"status": True, "message": "New signing secret made. Update it in your app: the old one stops working.",
            "data": _endpoint(db, row, secret=True)}


def delete_endpoint(db: Session, ws: Customer, endpoint_id: int) -> dict:
    db.delete(_get_endpoint(db, ws, endpoint_id))
    db.commit()
    return {"status": True, "message": "Webhook deleted", "data": None}


SAMPLES = {
    "message.received": lambda: {"id": 1001, "wamid": "wamid.TEST", "direction": "inbound", "type": "text",
                                 "text": "Hi! Is this a test?", "status": "received", "from": "+919876543210",
                                 "contact": {"id": 501, "phone": "+919876543210", "name": "Test Customer"},
                                 "conversation_id": 301, "created_at": iso(now())},
    "contact.created": lambda: {"id": 501, "phone": "+919876543210", "wa_id": "919876543210",
                                "name": "Test Customer", "tags": [], "attributes": {}, "opted_out": False,
                                "created_at": iso(now())},
}


def send_test(db: Session, ws: Customer, endpoint_id: int, payload: TestEventSchema) -> dict:
    """Sends a sample event right now (marked "test": true) and returns what the endpoint answered."""
    row = _get_endpoint(db, ws, endpoint_id)
    if payload.event not in webhooks.EVENTS:
        raise field_error(422, "event", "Unknown event")
    sample = SAMPLES.get(payload.event, lambda: {"sample": True})()
    body = {**webhooks.envelope(db, ws.id, payload.event, sample), "test": True}
    delivery = WebhookDelivery(endpoint_id=row.id, customer_id=ws.id, event=payload.event, event_id=body["id"],
                               payload=body, status="pending", attempts=0, created_at=now())
    db.add(delivery)
    db.flush()
    ok = webhooks.attempt(db, delivery, row)
    if not ok:  # a test isn't retried
        delivery.status, delivery.next_attempt_at = "failed", None
    db.commit()
    message = (f"Your server answered {delivery.response_status}" if ok
               else f"Test failed: {delivery.error}")
    return {"status": True, "message": message, "data": _delivery(delivery, full=True)}


# Delivery log ----------------------------------------------------------------------------------

def _delivery(d: WebhookDelivery, full: bool = False) -> dict:
    out = {"id": d.id, "event": d.event, "event_id": d.event_id, "status": d.status, "attempts": d.attempts,
           "response_status": d.response_status, "error": d.error, "duration_ms": d.duration_ms,
           "created_at": iso(d.created_at), "last_attempt_at": iso(d.last_attempt_at),
           "next_attempt_at": iso(d.next_attempt_at)}
    if full:
        out.update(payload=d.payload, response_body=d.response_body)
    return out


def list_deliveries(db: Session, ws: Customer, endpoint_id: int, status: str | None, page: int,
                    per_page: int) -> dict:
    _get_endpoint(db, ws, endpoint_id)
    q = db.query(WebhookDelivery).filter(WebhookDelivery.endpoint_id == endpoint_id)
    if status in ("pending", "success", "failed"):
        q = q.filter(WebhookDelivery.status == status)
    total = q.count()
    rows = q.order_by(WebhookDelivery.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"status": True, "data": [_delivery(d) for d in rows],
            "meta": {"page": page, "per_page": per_page, "total": total}}


def get_delivery(db: Session, ws: Customer, endpoint_id: int, delivery_id: int) -> dict:
    _get_endpoint(db, ws, endpoint_id)
    row = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id,
                                           WebhookDelivery.endpoint_id == endpoint_id).first()
    if row is None:
        raise HTTPException(404, detail="Delivery not found")
    return {"status": True, "data": _delivery(row, full=True)}


def resend(db: Session, ws: Customer, endpoint_id: int, delivery_id: int) -> dict:
    """Sends the same event again now (same id, so the receiver can skip it if it already has it)."""
    endpoint = _get_endpoint(db, ws, endpoint_id)
    row = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id,
                                           WebhookDelivery.endpoint_id == endpoint_id).first()
    if row is None:
        raise HTTPException(404, detail="Delivery not found")
    row.status = "pending"
    ok = webhooks.attempt(db, row, endpoint)
    if not ok:
        row.status, row.next_attempt_at = "failed", None  # sent by hand: no automatic retries
    db.commit()
    return {"status": True, "message": "Delivered" if ok else f"Failed again: {row.error}",
            "data": _delivery(row, full=True)}
