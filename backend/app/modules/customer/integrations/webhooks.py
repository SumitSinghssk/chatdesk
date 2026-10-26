"""Webhooks: ChatDesk calls the business's own URL when something happens on one of its numbers.

`emit()` is called where things happen (a message came in, a status update, a new order…). It adds one
delivery per subscribed endpoint to the caller's transaction; once that commits, the deliveries go out
on a background thread. Failed calls are retried with growing gaps (`RETRY_AFTER`) by the ticker below
and the scheduler's `webhooks` job.

Every call is signed like Stripe's: `X-ChatDesk-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of
"<t>.<raw body>" with the endpoint's signing secret>`, so the receiver can check it came from us.
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from datetime import timedelta

from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.core.database import SessionLocal
from app.modules.customer.integrations.models import WebhookDelivery, WebhookEndpoint
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

EVENTS = {
    "message.received": "A customer sent you a message",
    "message.sent": "A message you sent reached WhatsApp",
    "message.delivered": "A message you sent was delivered to the customer's phone",
    "message.read": "The customer read a message you sent",
    "message.failed": "A message you sent couldn't be delivered",
    "contact.created": "A new contact was added",
    "contact.opted_out": "A contact asked not to get messages",
    "contact.opted_in": "A contact agreed to get messages again",
    "conversation.resolved": "A chat was marked resolved",
    "order.created": "A customer placed an order",
    "order.paid": "An order was paid",
    "campaign.finished": "A campaign finished sending",
}
ALL = "*"
RETRY_AFTER = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=2),
               timedelta(hours=6), timedelta(hours=12)]  # 7 tries over about 21 hours
TIMEOUT = 10
KEEP_DAYS = 30
USER_AGENT = "ChatDesk-Webhooks/1.0"


def new_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def sign(secret: str, body: bytes, timestamp: int) -> str:
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def _number(db: Session, number_id: int) -> dict:
    from app.modules.customer.account.models import Customer
    from app.modules.customer.numbers.service import label_of
    from app.modules.customer.whatsapp.models import WhatsAppAccount

    number = db.get(Customer, number_id)
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == number_id).first()
    return {"id": number_id, "name": label_of(number, account) if number else None,
            "phone": account.display_phone_number if account else None}


def envelope(db: Session, number_id: int, event: str, data: dict) -> dict:
    return {"id": "evt_" + secrets.token_hex(12), "event": event, "created_at": iso(now()),
            "number": _number(db, number_id), "data": data}


def emit(db: Session, number_id: int, event: str, data: dict) -> int:
    """Queues `event` for every endpoint of this number that listens to it. Returns how many."""
    endpoints = [e for e in db.query(WebhookEndpoint).filter(WebhookEndpoint.customer_id == number_id,
                                                            WebhookEndpoint.enabled.is_(True))
                 if ALL in (e.events or []) or event in (e.events or [])]
    if not endpoints:
        return 0
    payload = envelope(db, number_id, event, data)
    rows = [WebhookDelivery(endpoint_id=e.id, customer_id=number_id, event=event, event_id=payload["id"],
                            payload=payload, status="pending", attempts=0, next_attempt_at=now(),
                            created_at=now()) for e in endpoints]
    db.add_all(rows)
    db.flush()
    db.info.setdefault("webhook_deliveries", []).extend(r.id for r in rows)
    return len(rows)


def safe_emit(db: Session, number_id: int, event: str, data) -> None:
    """emit() for where things happen: it never breaks them, and costs nothing when nobody listens.

    `data` is a callable building the event's data. It runs when the transaction commits, so it sees the
    final state (e.g. a new contact's name, set after the contact was created)."""
    try:
        if db.query(WebhookEndpoint.id).filter(WebhookEndpoint.customer_id == number_id,
                                               WebhookEndpoint.enabled.is_(True)).first():
            db.info.setdefault("webhook_later", []).append((number_id, event, data))
    except Exception:  # noqa: BLE001
        logger.exception("Couldn't queue webhook %s for number %s", event, number_id)


@sa_event.listens_for(Session, "before_commit")
def _build_events(session: Session) -> None:
    for number_id, event, data in session.info.pop("webhook_later", None) or []:
        try:
            emit(session, number_id, event, data() if callable(data) else data)
        except Exception:  # noqa: BLE001
            logger.exception("Couldn't queue webhook %s for number %s", event, number_id)


@sa_event.listens_for(Session, "after_commit")
def _send_committed(session: Session) -> None:
    ids = session.info.pop("webhook_deliveries", None)
    if not ids:
        return
    if os.getenv("WEBHOOKS_INLINE") == "1":  # tests: deliver right away, in order
        for delivery_id in ids:
            deliver(delivery_id)
        return
    threading.Thread(target=lambda: [deliver(i) for i in ids], name="webhook-send", daemon=True).start()


@sa_event.listens_for(Session, "after_rollback")
def _forget(session: Session) -> None:
    session.info.pop("webhook_deliveries", None)
    session.info.pop("webhook_later", None)


def _post(endpoint: WebhookEndpoint, delivery: WebhookDelivery) -> tuple[int | None, str, str | None, int]:
    """(HTTP status, response text, error, milliseconds) of one call."""
    from app.modules.customer.ai_agent.providers import address_allowed

    body = json.dumps(delivery.payload, separators=(",", ":"), ensure_ascii=False).encode()
    started = time.monotonic()
    if not address_allowed(endpoint.url):
        return None, "", "This URL isn't on the public internet", 0
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT,
               "X-ChatDesk-Event": delivery.event, "X-ChatDesk-Delivery": str(delivery.id),
               "X-ChatDesk-Signature": sign(decrypt_secret(endpoint.secret) or "", body, int(time.time()))}
    req = urllib.request.Request(endpoint.url, data=body, method="POST", headers=headers)
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=TIMEOUT) as res:
            text = res.read(1000).decode("utf-8", "replace")
            return res.status, text, None, int((time.monotonic() - started) * 1000)
    except urllib.error.HTTPError as exc:
        text = exc.read(1000).decode("utf-8", "replace") if exc.fp else ""
        error = "Redirects aren't followed: use the final URL" if 300 <= exc.code < 400 else None
        return exc.code, text, error, int((time.monotonic() - started) * 1000)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", exc)
        error = "Timed out after 10 seconds" if isinstance(reason, TimeoutError) or "timed out" in str(reason) \
            else f"Couldn't connect: {reason}"
        return None, "", error[:255], int((time.monotonic() - started) * 1000)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def attempt(db: Session, delivery: WebhookDelivery, endpoint: WebhookEndpoint) -> bool:
    """Calls the endpoint once and records how it went. The caller commits."""
    status, text, error, ms = _post(endpoint, delivery)
    delivery.attempts += 1
    delivery.last_attempt_at = now()
    delivery.response_status, delivery.response_body, delivery.duration_ms = status, text[:1000] or None, ms
    ok = status is not None and 200 <= status < 300
    delivery.error = None if ok else (error or f"Your server answered {status}")[:255]
    if ok:
        delivery.status, delivery.next_attempt_at = "success", None
        endpoint.failures_in_row, endpoint.last_success_at = 0, now()
    else:
        endpoint.failures_in_row = (endpoint.failures_in_row or 0) + 1
        endpoint.last_failure_at = now()
        if delivery.attempts <= len(RETRY_AFTER):
            delivery.next_attempt_at = now() + RETRY_AFTER[delivery.attempts - 1]
        else:
            delivery.status, delivery.next_attempt_at = "failed", None
    return ok


def deliver(delivery_id: int) -> None:
    db = SessionLocal()
    try:
        delivery = (db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id,
                                                     WebhookDelivery.status == "pending")
                    .with_for_update(skip_locked=True).first())
        if delivery is None:
            return
        endpoint = db.get(WebhookEndpoint, delivery.endpoint_id)
        if endpoint is None or not endpoint.enabled:
            delivery.status, delivery.error, delivery.next_attempt_at = "failed", "The endpoint was turned off", None
        else:
            attempt(db, delivery, endpoint)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Webhook delivery %s failed", delivery_id)
    finally:
        db.close()


def run_due(db: Session, limit: int = 200) -> tuple[int, int]:
    """Retries deliveries that are due. Returns (delivered, still failing)."""
    ids = [i for (i,) in db.query(WebhookDelivery.id).filter(WebhookDelivery.status == "pending",
                                                             WebhookDelivery.next_attempt_at <= now())
           .order_by(WebhookDelivery.next_attempt_at).limit(limit)]
    db.commit()
    for delivery_id in ids:
        deliver(delivery_id)
    done = db.query(WebhookDelivery).filter(WebhookDelivery.id.in_(ids or [0]),
                                            WebhookDelivery.status == "success").count()
    return done, len(ids) - done


def purge(db: Session) -> int:
    gone = db.query(WebhookDelivery).filter(WebhookDelivery.created_at < now() - timedelta(days=KEEP_DAYS)) \
        .delete(synchronize_session=False)
    db.commit()
    return gone


# In-API ticker (the scheduler's `webhooks` job does the same) ------------------------------

_ticker: threading.Thread | None = None


def _tick() -> None:
    while True:
        time.sleep(30)
        db = SessionLocal()
        try:
            run_due(db)
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Webhook retries failed")
        finally:
            db.close()


def start_ticker() -> None:
    global _ticker
    if os.getenv("WEBHOOKS_WORKER", "on").lower() in ("off", "0", "false"):
        return
    if _ticker is None or not _ticker.is_alive():
        _ticker = threading.Thread(target=_tick, name="webhooks-ticker", daemon=True)
        _ticker.start()
