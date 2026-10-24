"""Sends campaigns in the background.

A campaign is claimed with one atomic UPDATE (scheduled and due -> sending, or a sending campaign
whose sender stopped beating), so the API's ticker thread and `python scheduler.py` can both run
without ever sending a campaign twice. Recipients are written when sending starts, so a scheduled
campaign reaches everyone who matches at that moment, and a restart continues where it stopped.
"""

import logging
import os
import threading
import time
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import or_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, joinedload

from app.core.database import SessionLocal
from app.modules.customer.account.models import Customer
from app.modules.customer.campaigns.models import WaCampaign, WaCampaignRecipient
from app.modules.customer.campaigns.schemas import AudienceSchema, VariablesSchema
from app.modules.customer.inbox import service as inbox_service
from app.modules.customer.inbox.models import WaContact
from app.modules.customer.inbox.processor import get_or_create_conversation
from app.modules.customer.templates import builder
from app.modules.customer.templates import service as templates_service
from app.modules.customer.templates.models import WaTemplate
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)

BATCH = 50
SEND_GAP = float(os.getenv("CAMPAIGN_SEND_GAP", "0.05"))  # seconds between messages (~20 a second)
STALE = timedelta(minutes=2)  # a sender that hasn't beaten for this long is presumed dead
TICK_SECONDS = 15
FATAL_CODES = {190, None}  # expired token (190) or Meta unreachable (no code): stop instead of failing everyone
_wake = threading.Event()
_ticker: threading.Thread | None = None
_running: set[int] = set()
_lock = threading.Lock()


def claim_due(db: Session) -> list[int]:
    current = now()
    rows = db.execute(
        update(WaCampaign)
        .where(or_(
            (WaCampaign.status == "scheduled") & (WaCampaign.scheduled_at <= current),
            (WaCampaign.status == "sending") & or_(WaCampaign.heartbeat_at.is_(None),
                                                   WaCampaign.heartbeat_at < current - STALE),
        ))
        .values(status="sending", heartbeat_at=current)
        .returning(WaCampaign.id)
    ).all()
    db.commit()
    return [r[0] for r in rows]


def _materialize(db: Session, campaign: WaCampaign, customer: Customer) -> None:
    """Writes the recipient list the first time a campaign starts."""
    from app.modules.customer.campaigns.service import audience_query

    if db.query(WaCampaignRecipient.id).filter(WaCampaignRecipient.campaign_id == campaign.id).first():
        return
    q = audience_query(db, customer, AudienceSchema(**(campaign.audience or {})))
    rows, skipped = [], 0
    for contact_id, opted_out, blocked in q.with_entities(WaContact.id, WaContact.opted_out, WaContact.blocked):
        reason = "Blocked" if blocked else "Opted out of messages" if opted_out else None
        skipped += bool(reason)
        rows.append({"campaign_id": campaign.id, "contact_id": contact_id,
                     "status": "skipped" if reason else "pending", "error": reason})
    for i in range(0, len(rows), 1000):
        db.execute(insert(WaCampaignRecipient).values(rows[i:i + 1000]).on_conflict_do_nothing())
    campaign.total = len(rows) - skipped
    campaign.skipped = skipped
    campaign.started_at = campaign.started_at or now()
    db.commit()


def _fail(db: Session, campaign: WaCampaign, error: str) -> None:
    campaign.status, campaign.error, campaign.completed_at = "failed", error, now()
    _tell(db, campaign)
    db.commit()


def _tell(db: Session, campaign: WaCampaign, problem: str | None = None) -> None:
    from app.modules.customer.account import notify

    try:
        if problem:
            notify.whatsapp_problem(db, campaign.customer_id, problem)
        else:
            notify.campaign_finished(db, campaign)
    except Exception:  # noqa: BLE001 - telling people never stops a campaign
        logger.exception("Campaign %s notification failed", campaign.id)


def run(campaign_id: int) -> str:
    """Sends one claimed campaign until it is done, paused or cancelled. Returns its final status."""
    with _lock:
        if campaign_id in _running:
            return "busy"
        _running.add(campaign_id)
    db = SessionLocal()
    try:
        return _run(db, campaign_id)
    except Exception as exc:  # noqa: BLE001 - never leave a campaign stuck without a reason
        logger.exception("Campaign %s failed", campaign_id)
        db.rollback()
        campaign = db.get(WaCampaign, campaign_id)
        if campaign is not None and campaign.status == "sending":
            _fail(db, campaign, f"Unexpected error: {exc}")
        return "failed"
    finally:
        db.close()
        with _lock:
            _running.discard(campaign_id)


def _run(db: Session, campaign_id: int) -> str:
    campaign = db.get(WaCampaign, campaign_id)
    if campaign is None or campaign.status != "sending":
        return campaign.status if campaign else "missing"
    customer = db.get(Customer, campaign.customer_id)
    template = db.get(WaTemplate, campaign.template_id) if campaign.template_id else None
    if template is None or template.status != "approved":
        _fail(db, campaign, "The template is no longer approved on Meta")
        return "failed"
    try:
        _, client = templates_service.client_for(db, customer)
    except HTTPException as exc:
        _fail(db, campaign, str(exc.detail))
        return "failed"
    _materialize(db, campaign, customer)

    variables = VariablesSchema(**(campaign.variables or {}))
    form = templates_service.form_of(template)
    media = None
    if form["header"]["format"] in builder.MEDIA_FORMATS:
        try:
            media = inbox_service.upload_header(db, customer, client, template, campaign.header_media)
        except HTTPException as exc:
            _fail(db, campaign, str(exc.detail))
            return "failed"
    meta = {"id": campaign.id, "name": campaign.name}
    from app.modules.customer.campaigns.service import _values

    while True:
        db.refresh(campaign)
        if campaign.status != "sending":
            return campaign.status  # paused or cancelled from the app
        batch = (db.query(WaCampaignRecipient).options(joinedload(WaCampaignRecipient.contact))
                 .filter(WaCampaignRecipient.campaign_id == campaign.id, WaCampaignRecipient.status == "pending")
                 .order_by(WaCampaignRecipient.id).limit(BATCH).all())
        if not batch:
            break
        for recipient in batch:
            contact = recipient.contact
            if contact.blocked or contact.opted_out:
                recipient.status = "skipped"
                recipient.error = "Blocked" if contact.blocked else "Opted out of messages"
                campaign.skipped += 1
                db.commit()
                continue
            values = _values(template, variables, contact)
            if values["missing"]:
                recipient.status, recipient.sent_at = "failed", now()
                recipient.error = f"No value for {', '.join(values['missing'])}"
                db.commit()
                continue
            try:
                prepared = inbox_service.prepare_template(
                    db, customer, client, template, header=values["header"], body=values["body"],
                    buttons=values["buttons"], location=campaign.location, media=media)
            except HTTPException as exc:
                recipient.status, recipient.sent_at = "failed", now()
                recipient.error = str(exc.detail)[:500]
                db.commit()
                continue
            conversation = get_or_create_conversation(db, contact)
            message, _ = inbox_service.send_prepared(db, customer, conversation, template, prepared, client,
                                                     sent_by=campaign.created_by, campaign=meta)
            recipient.message_id = message.id
            recipient.sent_at = now()
            recipient.status = "sent" if message.status == "sent" else "failed"
            recipient.error = message.error_message
            campaign.heartbeat_at = now()
            db.commit()
            if message.status == "failed" and message.error_code in FATAL_CODES:
                # the token expired or Meta is unreachable: not this person's fault, so they go back in the
                # queue with everyone else and Resume sends to them again
                recipient.status, recipient.message_id, recipient.sent_at, recipient.error = "pending", None, None, None
                campaign.status, campaign.error = "paused", f"Paused: {message.error_message}"
                _tell(db, campaign, f"Campaign “{campaign.name}” paused: {message.error_message}")
                db.commit()
                return "paused"
            time.sleep(SEND_GAP)
    campaign.status, campaign.completed_at, campaign.heartbeat_at = "completed", now(), now()
    _tell(db, campaign)
    db.commit()
    return "completed"


def run_due() -> list[tuple[int, str]]:
    """Claims and sends every due campaign (used by scheduler.py and the ticker)."""
    db = SessionLocal()
    try:
        ids = claim_due(db)
    finally:
        db.close()
    return [(i, run(i)) for i in ids]


def _tick() -> None:
    while True:
        _wake.wait(TICK_SECONDS)
        _wake.clear()
        try:
            db = SessionLocal()
            try:
                ids = claim_due(db)
            finally:
                db.close()
            for campaign_id in ids:
                threading.Thread(target=run, args=(campaign_id,), name=f"campaign-{campaign_id}", daemon=True).start()
        except Exception:  # noqa: BLE001
            logger.exception("Campaign ticker failed")
            time.sleep(TICK_SECONDS)


def start_ticker() -> None:
    """Starts the in-process sender (once). Off when CAMPAIGN_WORKER=off, e.g. in tests."""
    global _ticker
    if os.getenv("CAMPAIGN_WORKER", "on").lower() in ("off", "0", "false"):
        return
    if _ticker is None or not _ticker.is_alive():
        _ticker = threading.Thread(target=_tick, name="campaign-ticker", daemon=True)
        _ticker.start()
        _wake.set()


def kick() -> None:
    """Checks for due campaigns now instead of at the next tick."""
    start_ticker()
    _wake.set()
