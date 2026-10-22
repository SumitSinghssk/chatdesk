import csv
import io
from datetime import timezone

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, cast, exists, func, not_, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, aliased, joinedload

from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.campaigns.models import WaCampaign, WaCampaignRecipient
from app.modules.customer.campaigns.schemas import (
    AudienceSchema,
    CampaignSchema,
    PreviewSchema,
    TestSendSchema,
    VariableSource,
    VariablesSchema,
)
from app.modules.customer.contacts.service import to_wa_id
from app.modules.customer.inbox import service as inbox_service
from app.modules.customer.inbox.models import WaContact, WaMessage
from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation
from app.modules.customer.team.access import actor_name
from app.modules.customer.templates import builder
from app.modules.customer.templates import service as templates_service
from app.modules.customer.templates.models import WaTemplate
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now, to_site
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

EDITABLE = {"draft", "scheduled"}
ACTIVE = {"sending", "paused"}
# Rough Meta prices in ₹ per delivered template message (Meta's rate card changes; this is a guide).
RATES = {
    "91": {"marketing": 0.7846, "utility": 0.115, "authentication": 0.115},
}
OTHER_RATE = {"marketing": 3.5, "utility": 0.9, "authentication": 0.8}  # typical international price in ₹
TIER_LIMITS = {"TIER_50": 50, "TIER_250": 250, "TIER_1K": 1_000, "TIER_2K": 2_000, "TIER_10K": 10_000,
               "TIER_100K": 100_000}

GRID_FIELDS = {
    "name": GridField(WaCampaign.name, "text"),
    "status": GridField(WaCampaign.status, "enum"),
    "template_name": GridField(WaCampaign.template_name, "text"),
    "total": GridField(WaCampaign.total, "number"),
    "scheduled_at": GridField(WaCampaign.scheduled_at, "date"),
    "started_at": GridField(WaCampaign.started_at, "date"),
    "created_at": GridField(WaCampaign.created_at, "date"),
}


# Helpers -----------------------------------------------------------------------------

def _get(db: Session, customer: Customer, campaign_id: int) -> WaCampaign:
    campaign = db.query(WaCampaign).filter(WaCampaign.id == campaign_id,
                                           WaCampaign.customer_id == customer.id).first()
    if campaign is None:
        raise HTTPException(404, detail="Campaign not found")
    return campaign


def _template(db: Session, customer: Customer, template_id: int, approved: bool = True) -> WaTemplate:
    template = db.query(WaTemplate).filter(WaTemplate.id == template_id,
                                           WaTemplate.customer_id == customer.id).first()
    if template is None:
        raise field_error(422, "template_id", "Choose a template")
    if approved and template.status != "approved":
        raise field_error(422, "template_id", "Only templates Meta approved can be sent")
    return template


# Audience ----------------------------------------------------------------------------

def _replied(message=WaMessage):
    """A message the contact sent after receiving `message` (same chat)."""
    inbound = aliased(WaMessage)
    return exists().where(inbound.conversation_id == message.conversation_id, inbound.direction == "in",
                          inbound.created_at >= message.created_at, inbound.type != "reaction")


def _clicked(message=WaMessage):
    """The contact tapped one of the template's quick reply buttons."""
    inbound = aliased(WaMessage)
    return exists().where(inbound.context_wamid == message.wamid, inbound.direction == "in",
                          inbound.type.in_(("button", "interactive")))


def audience_query(db: Session, customer: Customer, audience: AudienceSchema):
    """Contacts the audience describes (before skipping opted-out and blocked people)."""
    q = db.query(WaContact).filter(WaContact.customer_id == customer.id)
    tags = cast(WaContact.tags, JSONB)
    if audience.type == "tags":
        if not audience.tags:
            raise field_error(422, "audience.tags", "Choose at least one tag")
        matches = [tags.contains([t]) for t in audience.tags]
        q = q.filter(or_(*matches) if audience.tag_match == "any" else and_(*matches))
    elif audience.type == "contacts":
        if not audience.contact_ids:
            raise field_error(422, "audience.contact_ids", "Choose at least one contact")
        q = q.filter(WaContact.id.in_(audience.contact_ids))
    elif audience.type == "campaign":
        source = db.query(WaCampaign).filter(WaCampaign.id == audience.campaign_id,
                                             WaCampaign.customer_id == customer.id).first()
        if source is None:
            raise field_error(422, "audience.campaign_id", "Choose an earlier campaign")
        rq = (db.query(WaCampaignRecipient.contact_id)
              .outerjoin(WaMessage, WaMessage.id == WaCampaignRecipient.message_id)
              .filter(WaCampaignRecipient.campaign_id == source.id))
        sent = WaCampaignRecipient.status == "sent"
        segment = audience.segment or "sent"
        rq = rq.filter({
            "sent": sent,
            "delivered": and_(sent, WaMessage.status.in_(("delivered", "read"))),
            "read": and_(sent, WaMessage.status == "read"),
            "not_read": and_(sent, WaMessage.status != "read", WaMessage.status != "failed"),
            "replied": and_(sent, _replied()),
            "not_replied": and_(sent, WaMessage.status != "failed", not_(_replied())),
            "clicked": and_(sent, _clicked()),
            "failed": or_(WaCampaignRecipient.status == "failed", WaMessage.status == "failed"),
        }[segment])
        q = q.filter(WaContact.id.in_(rq.subquery().select()))
    if audience.exclude_tags:
        q = q.filter(not_(or_(*[tags.contains([t]) for t in audience.exclude_tags])))
    return q


def _eligible(q):
    return q.filter(WaContact.opted_out.is_(False), WaContact.blocked.is_(False))


# Variables ---------------------------------------------------------------------------

def resolve(source: VariableSource | None, contact: WaContact | None) -> str | None:
    """One variable's value for one contact (static text, a contact field, or the fallback)."""
    if source is None:
        return None
    value = None
    if source.source == "static":
        value = source.value
    elif contact is not None:
        name = contact.name or contact.profile_name
        value = {
            "name": name,
            "first_name": name.split()[0] if name and name.split() else None,
            "phone": f"+{contact.wa_id}",
            "email": contact.email,
            "attribute": str((contact.attributes or {}).get(source.value or "") or "") or None,
        }.get(source.source)
    return (value or "").strip() or source.fallback


def _values(template: WaTemplate, variables: VariablesSchema, contact: WaContact | None) -> dict:
    needs = builder.send_params(templates_service.form_of(template))
    header = [resolve(variables.header.get(n), contact) for n in needs["header"]]
    body = [resolve(variables.body.get(n), contact) for n in needs["body"]]
    buttons = {b["index"]: resolve(variables.buttons.get(str(b["index"])), contact) for b in needs["buttons"]}
    missing = [f"{{{{{n}}}}}" for n, v in zip(needs["header"] + needs["body"], header + body) if not v]
    missing += [f"button {i + 1}" for i, v in buttons.items() if not v]
    return {"header": [v or "" for v in header], "body": [v or "" for v in body],
            "buttons": {i: v or "" for i, v in buttons.items()}, "missing": missing}


def _check_variables(template: WaTemplate, variables: VariablesSchema) -> None:
    needs = builder.send_params(templates_service.form_of(template))
    for part, names in (("header", needs["header"]), ("body", needs["body"]),
                        ("buttons", [str(b["index"]) for b in needs["buttons"]])):
        for name in names:
            src = getattr(variables, part).get(name)
            if src is None or (src.source in ("static", "attribute") and not src.value):
                label = f"button {int(name) + 1}" if part == "buttons" else f"{{{{{name}}}}}"
                raise field_error(422, f"variables.{part}.{name}", f"Choose a value for {label}")


# Preview & cost ----------------------------------------------------------------------

def _rate(wa_id: str, category: str) -> float:
    table = next((r for prefix, r in RATES.items() if wa_id.startswith(prefix)), OTHER_RATE)
    return table.get(category, table["marketing"])


def preview(db: Session, customer: Customer, payload: PreviewSchema) -> dict:
    template = _template(db, customer, payload.template_id, approved=False)
    q = audience_query(db, customer, payload.audience)
    total = q.count()
    opted_out = q.filter(WaContact.opted_out.is_(True), WaContact.blocked.is_(False)).count()
    blocked = q.filter(WaContact.blocked.is_(True)).count()
    eligible = _eligible(q)
    contacts = eligible.order_by(WaContact.id).limit(5000).all()
    category = template.category
    cost = sum(_rate(c.wa_id, category) for c in contacts)
    count = eligible.count()
    if count > len(contacts) and contacts:
        cost = cost / len(contacts) * count
    missing = sum(1 for c in contacts if _values(template, payload.variables, c)["missing"])
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()
    limit = TIER_LIMITS.get((account.messaging_limit_tier if account else None) or "")
    samples = []
    for c in contacts[:3]:
        values = _values(template, payload.variables, c)
        samples.append({"contact": {"id": c.id, "name": c.name or c.profile_name, "phone": f"+{c.wa_id}"},
                        "header": values["header"], "body": values["body"],
                        "buttons": {str(k): v for k, v in values["buttons"].items()}, "missing": values["missing"]})
    return {"status": True, "data": {
        "matched": total, "eligible": count, "opted_out": opted_out, "blocked": blocked,
        "missing_values": missing, "cost": round(cost, 2), "currency": "INR", "category": category,
        "daily_limit": limit, "over_limit": bool(limit and count > limit), "samples": samples,
    }}


# Serialize & list --------------------------------------------------------------------

def _report(db: Session, campaign_ids: list[int]) -> dict[int, dict]:
    if not campaign_ids:
        return {}
    sent = WaCampaignRecipient.status == "sent"
    rows = (db.query(
        WaCampaignRecipient.campaign_id,
        func.count(WaCampaignRecipient.id),
        func.sum(case((WaCampaignRecipient.status == "pending", 1), else_=0)),
        func.sum(case((sent, 1), else_=0)),
        func.sum(case((and_(sent, WaMessage.status.in_(("delivered", "read"))), 1), else_=0)),
        func.sum(case((and_(sent, WaMessage.status == "read"), 1), else_=0)),
        func.sum(case((or_(WaCampaignRecipient.status == "failed", WaMessage.status == "failed"), 1), else_=0)),
        func.sum(case((and_(sent, _replied()), 1), else_=0)),
        func.sum(case((and_(sent, _clicked()), 1), else_=0)),
    ).outerjoin(WaMessage, WaMessage.id == WaCampaignRecipient.message_id)
        .filter(WaCampaignRecipient.campaign_id.in_(campaign_ids))
        .group_by(WaCampaignRecipient.campaign_id).all())
    keys = ("recipients", "pending", "sent", "delivered", "read", "failed", "replied", "clicked")
    return {row[0]: dict(zip(keys, (int(v or 0) for v in row[1:]))) for row in rows}


EMPTY_REPORT = {"recipients": 0, "pending": 0, "sent": 0, "delivered": 0, "read": 0, "failed": 0, "replied": 0,
                "clicked": 0}


def serialize(c: WaCampaign, report: dict | None = None, template: WaTemplate | None = None) -> dict:
    data = {
        "id": c.id,
        "name": c.name,
        "template_id": c.template_id,
        "template_name": c.template_name,
        "template_language": c.template_language,
        "template_category": c.template_category,
        "audience": c.audience or {},
        "variables": c.variables or {},
        "header_media": c.header_media,
        "location": c.location,
        "status": c.status,
        "scheduled_at": iso(c.scheduled_at),
        "started_at": iso(c.started_at),
        "completed_at": iso(c.completed_at),
        "error": c.error,
        "total": c.total,
        "skipped": c.skipped,
        "created_by": c.created_by,
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
        "report": report or EMPTY_REPORT,
    }
    if template is not None:
        data["template"] = templates_service.serialize(template)
    return data


def list_campaigns(db: Session, customer: Customer, page=None, per_page=None, search=None, status=None,
                   filters=None, match="and", sort=None) -> dict:
    q = db.query(WaCampaign).filter(WaCampaign.customer_id == customer.id)
    clause = search_clause([WaCampaign.name, WaCampaign.template_name], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(WaCampaign.status.in_(status.split(",")))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [WaCampaign.created_at.desc(), WaCampaign.id.desc()])
    result = list_response(q, lambda c: c, page, per_page, search)
    rows: list[WaCampaign] = result["data"]
    reports = _report(db, [c.id for c in rows])
    result["data"] = [serialize(c, reports.get(c.id)) for c in rows]
    return result


def stats(db: Session, customer: Customer) -> dict:
    counts = dict(db.query(WaCampaign.status, func.count(WaCampaign.id))
                  .filter(WaCampaign.customer_id == customer.id).group_by(WaCampaign.status).all())
    since = now().replace(hour=0, minute=0, second=0, microsecond=0)
    ids = [i for (i,) in db.query(WaCampaign.id).filter(WaCampaign.customer_id == customer.id,
                                                       WaCampaign.started_at.isnot(None))]
    totals = dict(EMPTY_REPORT)
    for report in _report(db, ids).values():
        for k in totals:
            totals[k] += report[k]
    today = (db.query(func.count(WaCampaignRecipient.id)).join(WaCampaign)
             .filter(WaCampaign.customer_id == customer.id, WaCampaignRecipient.sent_at >= since).scalar() or 0)
    return {"status": True, "data": {
        "total": sum(counts.values()),
        "scheduled": counts.get("scheduled", 0),
        "active": sum(counts.get(s, 0) for s in ACTIVE),
        "completed": counts.get("completed", 0),
        "draft": counts.get("draft", 0),
        "sent_today": today,
        **{f"all_{k}": v for k, v in totals.items()},
    }}


def get_campaign(db: Session, customer: Customer, campaign_id: int) -> dict:
    c = _get(db, customer, campaign_id)
    template = db.get(WaTemplate, c.template_id) if c.template_id else None
    return {"status": True, "data": serialize(c, _report(db, [c.id]).get(c.id), template)}


# Create, edit, control ----------------------------------------------------------------

def _utc(value):
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _apply(db: Session, customer: Customer, campaign: WaCampaign, payload: CampaignSchema) -> None:
    template = _template(db, customer, payload.template_id, approved=payload.action != "draft")
    if payload.action != "draft":
        _check_variables(template, payload.variables)
        audience_query(db, customer, payload.audience)  # validates tags / campaign / contacts
        form = templates_service.form_of(template)
        if form["header"]["format"] == "location" and payload.location is None:
            raise field_error(422, "location", "Add the location to show in the header")
    campaign.name = payload.name
    campaign.template_id = template.id
    campaign.template_name, campaign.template_language = template.name, template.language
    campaign.template_category = template.category
    campaign.audience = payload.audience.model_dump()
    campaign.variables = payload.variables.model_dump()
    campaign.header_media = payload.header_media
    campaign.location = payload.location.model_dump(exclude_none=True) if payload.location else None
    if payload.action == "schedule":
        when = _utc(payload.scheduled_at)
        if when is None or when <= now():
            raise field_error(422, "scheduled_at", "Pick a time in the future")
        campaign.status, campaign.scheduled_at = "scheduled", when
    elif payload.action == "now":
        campaign.status, campaign.scheduled_at = "scheduled", now()  # the sender picks it up right away
    else:
        campaign.status, campaign.scheduled_at = "draft", _utc(payload.scheduled_at)


def _launch(campaign: WaCampaign) -> None:
    from app.modules.customer.campaigns import runner

    if campaign.status == "scheduled" and campaign.scheduled_at <= now():
        runner.kick()


def _message(campaign: WaCampaign) -> str:
    if campaign.status == "draft":
        return "Draft saved"
    if campaign.scheduled_at and campaign.scheduled_at > now():
        return f"Scheduled for {to_site(campaign.scheduled_at):%d %b, %I:%M %p}"
    return "Sending started"


def create_campaign(db: Session, customer: Customer, payload: CampaignSchema) -> dict:
    campaign = WaCampaign(customer_id=customer.id, created_by=actor_name(customer))
    _apply(db, customer, campaign, payload)
    db.add(campaign)
    db.commit()
    _launch(campaign)
    return {"status": True, "message": _message(campaign), "data": serialize(campaign)}


def update_campaign(db: Session, customer: Customer, campaign_id: int, payload: CampaignSchema) -> dict:
    campaign = _get(db, customer, campaign_id)
    if campaign.status not in EDITABLE:
        raise HTTPException(422, detail=f"A {campaign.status} campaign can't be edited")
    _apply(db, customer, campaign, payload)
    db.commit()
    _launch(campaign)
    return {"status": True, "message": _message(campaign), "data": serialize(campaign)}


def control(db: Session, customer: Customer, campaign_id: int, action: str) -> dict:
    campaign = _get(db, customer, campaign_id)
    allowed = {
        "pause": ({"sending"}, "paused", "Campaign paused"),
        "resume": ({"paused"}, "sending", "Sending resumed"),
        "cancel": ({"scheduled", "sending", "paused"}, "cancelled", "Campaign cancelled"),
    }
    sources, target, text = allowed[action]
    if campaign.status not in sources:
        raise HTTPException(422, detail=f"A {campaign.status} campaign can't be {action}d")
    campaign.status = target
    if target == "cancelled":
        campaign.completed_at = now()
        db.query(WaCampaignRecipient).filter(WaCampaignRecipient.campaign_id == campaign.id,
                                             WaCampaignRecipient.status == "pending") \
            .update({"status": "skipped", "error": "Campaign cancelled"}, synchronize_session=False)
    if target == "sending":
        campaign.heartbeat_at = None  # lets the sender pick it up again right away
        campaign.error = None
    db.commit()
    if target == "sending":
        from app.modules.customer.campaigns import runner

        runner.kick()
    return {"status": True, "message": text, "data": serialize(campaign, _report(db, [campaign.id]).get(campaign.id))}


def delete_campaign(db: Session, customer: Customer, campaign_id: int) -> dict:
    campaign = _get(db, customer, campaign_id)
    if campaign.status in ACTIVE:
        raise HTTPException(422, detail="Pause or cancel the campaign before deleting it")
    db.delete(campaign)
    db.commit()
    return {"status": True, "message": "Campaign deleted", "data": None}


# Recipients --------------------------------------------------------------------------

RECIPIENT_STATUSES = ("pending", "sent", "delivered", "read", "replied", "clicked", "failed", "skipped")


def _recipient_query(db: Session, campaign: WaCampaign, status: str | None, search: str | None):
    q = (db.query(WaCampaignRecipient).join(WaContact, WaContact.id == WaCampaignRecipient.contact_id)
         .outerjoin(WaMessage, WaMessage.id == WaCampaignRecipient.message_id)
         .options(joinedload(WaCampaignRecipient.contact), joinedload(WaCampaignRecipient.message))
         .filter(WaCampaignRecipient.campaign_id == campaign.id))
    clause = search_clause([WaContact.name, WaContact.profile_name, WaContact.wa_id], search)
    if clause is not None:
        q = q.filter(clause)
    sent = WaCampaignRecipient.status == "sent"
    if status in RECIPIENT_STATUSES:
        q = q.filter({
            "pending": WaCampaignRecipient.status == "pending",
            "skipped": WaCampaignRecipient.status == "skipped",
            "sent": sent,
            "delivered": and_(sent, WaMessage.status.in_(("delivered", "read"))),
            "read": and_(sent, WaMessage.status == "read"),
            "replied": and_(sent, _replied()),
            "clicked": and_(sent, _clicked()),
            "failed": or_(WaCampaignRecipient.status == "failed", WaMessage.status == "failed"),
        }[status])
    return q


def _recipient_row(db: Session, r: WaCampaignRecipient) -> dict:
    """One recipient's progress, with plain datetimes (serialized or written to CSV by the callers)."""
    m = r.message
    status = r.status
    if status == "sent" and m is not None:
        status = m.status if m.status in ("delivered", "read", "failed") else "sent"
    replied_at = None
    if m is not None and r.status == "sent":
        replied_at = (db.query(func.min(WaMessage.created_at))
                      .filter(WaMessage.conversation_id == m.conversation_id, WaMessage.direction == "in",
                              WaMessage.created_at >= m.created_at, WaMessage.type != "reaction").scalar())
    c = r.contact
    return {
        "id": r.id,
        "contact": {"id": c.id, "name": c.name or c.profile_name, "phone": f"+{c.wa_id}"},
        "status": status,
        "replied": replied_at is not None,
        "error": r.error or (m.error_message if m is not None else None),
        "sent_at": r.sent_at,
        "delivered_at": m.delivered_at if m is not None else None,
        "read_at": m.read_at if m is not None else None,
        "replied_at": replied_at,
        "conversation_id": m.conversation_id if m is not None else None,
    }


TIMES = ("sent_at", "delivered_at", "read_at", "replied_at")


def _recipient(db: Session, r: WaCampaignRecipient) -> dict:
    row = _recipient_row(db, r)
    return {**row, **{k: iso(row[k]) for k in TIMES}}


def list_recipients(db: Session, customer: Customer, campaign_id: int, page=None, per_page=None,
                    status=None, search=None) -> dict:
    campaign = _get(db, customer, campaign_id)
    q = _recipient_query(db, campaign, status, search).order_by(WaCampaignRecipient.id)
    result = list_response(q, lambda r: r, page or 1, per_page, search)
    result["data"] = [_recipient(db, r) for r in result["data"]]
    return result


def export_recipients(db: Session, customer: Customer, campaign_id: int, status: str | None) -> StreamingResponse:
    campaign = _get(db, customer, campaign_id)
    out = io.StringIO()
    out.write("﻿")
    writer = csv.writer(out)
    writer.writerow(["name", "phone", "status", "replied", "sent_at", "delivered_at", "read_at", "replied_at",
                     "error"])

    for r in _recipient_query(db, campaign, status, None).order_by(WaCampaignRecipient.id).yield_per(500):
        row = _recipient_row(db, r)
        writer.writerow([row["contact"]["name"] or "", f'="{row["contact"]["phone"]}"', row["status"],
                         "yes" if row["replied"] else "no",
                         *[f"{to_site(row[k]):%Y-%m-%d %H:%M}" if row[k] else "" for k in TIMES], row["error"] or ""])
    safe = "".join(ch if ch.isalnum() else "-" for ch in campaign.name.lower()).strip("-") or "campaign"
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{safe}-report.csv"'})


# Test send ---------------------------------------------------------------------------

def send_test(db: Session, customer: Customer, payload: TestSendSchema) -> dict:
    """Sends the campaign's message to one number (yours) to check it before sending to everyone."""
    template = _template(db, customer, payload.template_id)
    wa_id = to_wa_id(db, payload.phone)
    if not wa_id:
        raise field_error(422, "phone", "Enter a valid WhatsApp number")
    _, client = templates_service.client_for(db, customer)
    known = db.query(WaContact.id).filter(WaContact.customer_id == customer.id, WaContact.wa_id == wa_id).first()
    contact = get_or_create_contact(db, customer.id, wa_id)
    if not known:
        contact.source = "manual"
    values = _values(template, payload.variables, contact)
    if values["missing"]:
        raise field_error(422, "variables", f"No value for {', '.join(values['missing'])}. Add a fallback.")
    prepared = inbox_service.prepare_template(
        db, customer, client, template, header=values["header"], body=values["body"], buttons=values["buttons"],
        header_media=payload.header_media,
        location=payload.location.model_dump(exclude_none=True) if payload.location else None)
    conversation = get_or_create_conversation(db, contact)
    message, text = inbox_service.send_prepared(db, customer, conversation, template, prepared, client,
                                                campaign={"id": None, "name": "Test"})
    if message.status == "failed":
        raise HTTPException(422, detail=text)
    return {"status": True, "message": f"Test sent to +{wa_id}", "data": inbox_service.serialize_message(message)}

