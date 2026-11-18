"""Web push: notifications that reach a person's browser or phone even when no ChatDesk tab is open.

Each browser that allows it registers a subscription (its push endpoint and keys). Notifications on the
"browser" channel are pushed to every subscription of that person, signed with the VAPID key pair in the
environment (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT). Without those keys push is simply off and
the in-tab browser notifications still work.
"""
import json
import logging
import os
import threading
from urllib.parse import urlsplit

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.customer.account.models import CustomerPushSubscription
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)
MAX_PER_PERSON = 10  # browsers / phones
MAX_FAILURES = 5


def public_key() -> str:
    return os.getenv("VAPID_PUBLIC_KEY", "").strip()


def enabled() -> bool:
    return bool(public_key() and os.getenv("VAPID_PRIVATE_KEY", "").strip())


def _allowed_endpoint(endpoint: str) -> bool:
    """Only https push services: we POST to this URL from the server."""
    parts = urlsplit(endpoint)
    return parts.scheme == "https" and bool(parts.hostname) and "." in (parts.hostname or "")


def subscribe(db: Session, person_id: int, endpoint: str, p256dh: str, auth: str, user_agent: str | None) -> None:
    if not _allowed_endpoint(endpoint):
        raise ValueError("That isn't a browser push address")
    row = db.query(CustomerPushSubscription).filter(CustomerPushSubscription.endpoint == endpoint).first()
    if row is None:
        mine = (db.query(CustomerPushSubscription).filter(CustomerPushSubscription.customer_id == person_id)
                .order_by(CustomerPushSubscription.last_used_at.asc().nulls_first(),
                          CustomerPushSubscription.id.asc()).all())
        for old in mine[:max(0, len(mine) - MAX_PER_PERSON + 1)]:
            db.delete(old)  # keep the newest browsers
        row = CustomerPushSubscription(endpoint=endpoint, created_at=now())
        db.add(row)
    row.customer_id, row.p256dh, row.auth = person_id, p256dh, auth
    row.user_agent = (user_agent or "")[:255] or None
    row.failures = 0
    try:
        db.commit()
    except IntegrityError:  # the same browser subscribed twice at once
        db.rollback()


def unsubscribe(db: Session, person_id: int, endpoint: str) -> None:
    db.query(CustomerPushSubscription).filter(CustomerPushSubscription.customer_id == person_id,
                                              CustomerPushSubscription.endpoint == endpoint).delete()
    db.commit()


def count(db: Session, person_id: int) -> int:
    return db.query(CustomerPushSubscription).filter(CustomerPushSubscription.customer_id == person_id).count()


def _send_all(person_ids: list[int], message: dict) -> None:
    from pywebpush import WebPushException, webpush

    db = SessionLocal()
    try:
        subs = (db.query(CustomerPushSubscription)
                .filter(CustomerPushSubscription.customer_id.in_(person_ids)).all())
        claims = {"sub": os.getenv("VAPID_SUBJECT", "").strip() or f"mailto:support@{urlsplit(settings.APP_URL).hostname}"}
        body = json.dumps(message)
        for sub in subs:
            try:
                webpush({"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}, body,
                        vapid_private_key=os.getenv("VAPID_PRIVATE_KEY", "").strip(), vapid_claims=dict(claims),
                        ttl=3600, timeout=10)
                sub.last_used_at, sub.failures = now(), 0
            except WebPushException as exc:
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status in (404, 410):  # the browser unsubscribed or the subscription expired
                    db.delete(sub)
                else:
                    sub.failures = (sub.failures or 0) + 1
                    if sub.failures >= MAX_FAILURES:
                        db.delete(sub)
                    logger.info("Push to subscription %s failed: %s", sub.id, exc)
            except Exception:  # a bad subscription must not stop the others
                logger.warning("Push to subscription %s failed", sub.id, exc_info=True)
        db.commit()
    finally:
        db.close()


def send(person_ids: list[int], title: str, body: str | None, url: str | None, tag: str | None = None) -> None:
    """Pushes to every browser of these people, in the background. A no-op without VAPID keys."""
    if not person_ids or not enabled():
        return
    message = {"title": title[:120], "body": (body or "")[:240], "url": url or "/dashboard", "tag": tag}
    if os.getenv("NOTIFY_EMAIL_INLINE") == "1":  # tests run it inline, like emails
        _send_all(person_ids, message)
    else:
        threading.Thread(target=_send_all, args=(person_ids, message), daemon=True).start()
