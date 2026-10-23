import json
import logging

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.modules.customer.automation import engine as auto_replies
from app.modules.customer.inbox.processor import process_payload
from app.modules.customer.whatsapp.models import WhatsAppAccount, WhatsAppWebhookEvent
from app.services.whatsapp import verify_signature
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)


def _account(db: Session, webhook_key: str) -> WhatsAppAccount | None:
    return db.query(WhatsAppAccount).filter(WhatsAppAccount.webhook_key == webhook_key).first()


def verify(db: Session, webhook_key: str, mode: str | None, token: str | None, challenge: str | None) -> str | None:
    """Meta's GET handshake. Returns the challenge to echo back, or None to refuse."""
    account = _account(db, webhook_key)
    if account is None or mode != "subscribe" or not challenge or token != account.verify_token:
        return None
    account.webhook_verified_at = now()
    db.commit()
    return challenge


def _kinds(payload: dict) -> list[str]:
    kinds = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            field = change.get("field")
            if value.get("messages"):
                kinds.append("message")
            elif value.get("statuses"):
                kinds.append("status")
            elif field in ("message_template_status_update", "message_template_quality_update",
                           "template_category_update"):
                kinds.append("template")
            else:
                kinds.append(field or "other")
    return kinds or ["other"]


def receive(db: Session, webhook_key: str, body: bytes, signature: str | None) -> tuple[int, str]:
    """Stores the raw event, then turns it into contacts, conversations and messages.

    The raw event is committed first, so a processing error never loses data: Meta still gets
    a 200 (it would otherwise retry for days) and the event stays unprocessed for replay.
    """
    account = _account(db, webhook_key)
    if account is None:
        return 404, "Unknown webhook"
    app_secret = decrypt_secret(account.app_secret)
    if app_secret and not verify_signature(app_secret, body, signature):
        return 401, "Invalid signature"
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        return 400, "Invalid JSON"

    received = now()
    events = [WhatsAppWebhookEvent(account_id=account.id, kind=kind, payload=payload, created_at=received)
              for kind in _kinds(payload)]
    db.add_all(events)
    account.last_event_at = received
    db.commit()

    try:
        counts = process_payload(db, account, payload)
        for event in events:
            event.processed = True
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("WhatsApp webhook processing failed for account %s", account.id)
        return 200, "ok"
    try:
        auto_replies.handle(db, account, counts["new_message_ids"])  # welcome, keywords, away, opt-out…
    except Exception:
        db.rollback()
        logger.exception("Automatic replies failed for account %s", account.id)
    return 200, "ok"


def replay_unprocessed(db: Session) -> int:
    """Re-runs processing for stored events that were never turned into messages. Returns how many."""
    events = (db.query(WhatsAppWebhookEvent).filter(WhatsAppWebhookEvent.processed.is_(False))
              .order_by(WhatsAppWebhookEvent.id).all())
    done = 0
    for event in events:
        account = db.get(WhatsAppAccount, event.account_id)
        if account is None:
            continue
        process_payload(db, account, event.payload or {})
        event.processed = True
        db.commit()
        done += 1
    return done
