"""Journeys: automatic template messages at moments in the customer's life.

- post_purchase: a few days after an order is delivered ("How are you finding it?")
- reorder: later after delivery, a reminder to order again
- birthday: on the day in the contact's `birthday` field (2026-03-14, 14-03, 14/03 or 14-03-1990)

Each is sent once per order (or once a year), at the chosen local hour, with an approved template whose variables
get the customer's first name, the order number (or "-") and the business name. Opted-out and blocked contacts
never get one. The scheduler's `journeys` job runs `run_due()`.
"""
import logging
import re
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import WaContact
from app.modules.customer.journeys.models import WaJourney, WaJourneyRun
from app.shared.utils.datetime import now, site_now

logger = logging.getLogger(__name__)

SENDER = "Journeys"
KINDS = {
    "post_purchase": {"label": "After an order", "hint": "Checks in a few days after delivery.", "delay": 3},
    "reorder": {"label": "Reorder reminder", "hint": "Reminds them to order again.", "delay": 30},
    "birthday": {"label": "Birthday wishes", "hint": "On the day in the contact's “birthday” field.", "delay": 0},
}
LOOKBACK = timedelta(days=3)  # orders that became due this recently still get it (if the job was down)
BIRTHDAY = re.compile(r"^\s*(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?)\s*$")


def birthday_of(value) -> tuple[int, int] | None:
    """(month, day) from "1990-03-14", "14-03", "14/03/1990"... or None."""
    m = BIRTHDAY.match(str(value or ""))
    if not m:
        return None
    if m.group(1):
        month, day = int(m.group(2)), int(m.group(3))
    else:
        day, month = int(m.group(4)), int(m.group(5))
    return (month, day) if 1 <= month <= 12 and 1 <= day <= 31 else None


# settings ---------------------------------------------------------------------------------------

def _rows(db: Session, customer_id: int) -> dict[str, WaJourney]:
    return {j.kind: j for j in db.query(WaJourney).filter(WaJourney.customer_id == customer_id).all()}


def list_journeys(db: Session, ws: Customer) -> dict:
    rows = _rows(db, ws.id)
    since = now() - timedelta(days=30)
    sent = dict(db.query(WaJourney.kind, func.count(WaJourneyRun.id))
                .join(WaJourneyRun, WaJourneyRun.journey_id == WaJourney.id)
                .filter(WaJourney.customer_id == ws.id, WaJourneyRun.status == "sent", WaJourneyRun.created_at >= since)
                .group_by(WaJourney.kind).all())
    data = []
    for kind, info in KINDS.items():
        j = rows.get(kind)
        data.append({"kind": kind, "label": info["label"], "hint": info["hint"], "enabled": bool(j and j.enabled),
                     "template_id": j.template_id if j else None,
                     "delay_days": j.delay_days if j else info["delay"], "send_hour": j.send_hour if j else 10,
                     "sent_30_days": int(sent.get(kind, 0))})
    return {"status": True, "data": data}


def save_journey(db: Session, ws: Customer, kind: str, payload) -> dict:
    from app.modules.customer.templates.models import WaTemplate

    if kind not in KINDS:
        raise HTTPException(404, detail="Unknown journey")
    if payload.template_id is not None:
        t = db.get(WaTemplate, payload.template_id)
        if t is None or t.customer_id != ws.id:
            raise HTTPException(422, detail={"errors": {"template_id": ["That template doesn't exist"]}})
    if payload.enabled and payload.template_id is None:
        raise HTTPException(422, detail={"errors": {"template_id": ["Choose the template to send"]}})
    j = _rows(db, ws.id).get(kind)
    if j is None:
        j = WaJourney(customer_id=ws.id, kind=kind)
        db.add(j)
    j.enabled, j.template_id = payload.enabled, payload.template_id
    j.delay_days, j.send_hour = payload.delay_days, payload.send_hour
    db.commit()
    return {"status": True, "message": f"{KINDS[kind]['label']} saved", "data": list_journeys(db, ws)["data"]}


# sending ----------------------------------------------------------------------------------------

def _claim(db: Session, journey: WaJourney, contact_id: int, key: str) -> WaJourneyRun | None:
    """Reserves (journey, key) so it's only ever sent once, even with two workers."""
    run = WaJourneyRun(journey_id=journey.id, contact_id=contact_id, key=key, status="skipped", created_at=now())
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    return run


def _send(db: Session, journey: WaJourney, contact: WaContact, run: WaJourneyRun, order_ref: str | None) -> None:
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.inbox.processor import get_or_create_conversation
    from app.modules.customer.templates import builder
    from app.modules.customer.templates import service as templates_service
    from app.modules.customer.templates.models import WaTemplate

    if contact.blocked or contact.opted_out:
        run.note = "Opted out or blocked"
        return
    template = db.get(WaTemplate, journey.template_id) if journey.template_id else None
    if template is None or template.status != "approved":
        run.status, run.note = "failed", "The template isn't approved"
        return
    owner = db.get(Customer, journey.customer_id)
    _, client = inbox._client(db, owner)
    conversation = get_or_create_conversation(db, contact)
    first = (contact.name or contact.profile_name or "there").split()[0]
    values = [first, order_ref or "-", owner.business_name or owner.name or "us"]
    needs = builder.send_params(templates_service.form_of(template))
    prepared = inbox.prepare_template(db, owner, client, template,
                                      header=(values + ["-"] * 10)[:len(needs["header"])],
                                      body=(values + ["-"] * 10)[:len(needs["body"])],
                                      buttons={b["index"]: order_ref or "-" for b in needs["buttons"]})
    message, note = inbox.send_prepared(db, owner, conversation, template, prepared, client, sent_by=SENDER,
                                        campaign={"id": f"journey:{journey.kind}", "name": KINDS[journey.kind]["label"]})
    run.status = "sent" if message.status == "sent" else "failed"
    run.note, run.message_id = note[:300], message.id


def _run_one(db: Session, journey: WaJourney, contact: WaContact, key: str, order_ref: str | None = None) -> bool:
    run = _claim(db, journey, contact.id, key)
    if run is None:
        return False
    try:
        _send(db, journey, contact, run, order_ref)
    except HTTPException as exc:
        db.rollback()
        run = db.get(WaJourneyRun, run.id)
        run.status, run.note = "failed", str(exc.detail)[:300]
    except Exception as exc:  # one customer mustn't stop the rest
        db.rollback()
        logger.exception("Journey %s for contact %s failed", journey.id, contact.id)
        run = db.get(WaJourneyRun, run.id)
        run.status, run.note = "failed", f"Unexpected error: {exc}"[:300]
    db.commit()
    return run.status == "sent"


def run_due(db: Session, limit: int = 200) -> int:
    """Sends what's due now. Returns how many messages went out."""
    from app.modules.customer.commerce.models import CommerceSettings, Order

    sent = 0
    local = site_now()
    moment = now()
    for journey in db.query(WaJourney).filter(WaJourney.enabled.is_(True), WaJourney.template_id.isnot(None)).all():
        if local.hour < journey.send_hour:
            continue  # not yet today
        if journey.kind in ("post_purchase", "reorder"):
            due_until = moment - timedelta(days=journey.delay_days)
            orders = (db.query(Order).filter(Order.customer_id == journey.customer_id, Order.status == "delivered",
                                             Order.contact_id.isnot(None), Order.delivered_at <= due_until,
                                             Order.delivered_at > due_until - LOOKBACK)
                      .order_by(Order.delivered_at).limit(limit).all())
            prefix = (db.query(CommerceSettings.order_prefix)
                      .filter(CommerceSettings.customer_id == journey.customer_id).scalar() or "#")
            for order in orders:
                if db.query(WaJourneyRun.id).filter(WaJourneyRun.journey_id == journey.id,
                                                    WaJourneyRun.key == f"order:{order.id}").first():
                    continue
                contact = db.get(WaContact, order.contact_id)
                if contact is not None:
                    sent += _run_one(db, journey, contact, f"order:{order.id}", f"{prefix}{order.number}")
        elif journey.kind == "birthday":
            key = f"bday:{local.year}"
            done = {c for (c,) in db.query(WaJourneyRun.contact_id).filter(WaJourneyRun.journey_id == journey.id,
                                                                           WaJourneyRun.key == key)}
            contacts = (db.query(WaContact).filter(WaContact.customer_id == journey.customer_id,
                                                   WaContact.opted_out.is_(False), WaContact.blocked.is_(False),
                                                   WaContact.attributes["birthday"].as_string().isnot(None)).all())
            for contact in contacts:
                if contact.id in done:
                    continue
                if birthday_of((contact.attributes or {}).get("birthday")) == (local.month, local.day):
                    sent += _run_one(db, journey, contact, key)
    return sent
