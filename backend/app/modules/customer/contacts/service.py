import csv
import io
from datetime import timedelta

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, joinedload

from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.contacts.schemas import BulkSchema, ContactSchema, clean_attributes, clean_tags
from app.modules.customer.inbox.models import WaContact, WaConversation
from app.services.sms import config as sms_config
from app.services.sms import normalize_phone
from app.shared.pagination import list_response
from app.shared.utils.datetime import days_ago_start, iso, now, to_site
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

MAX_IMPORT_ROWS = 10_000
MAX_IMPORT_BYTES = 5 * 1024 * 1024
PHONE_HEADERS = ("phone", "mobile", "number", "whatsapp", "wa_id", "phone_number", "mobile_number", "contact")
NAME_HEADERS = ("name", "full_name", "contact_name", "customer_name")

GRID_FIELDS = {
    "name": GridField(func.coalesce(WaContact.name, WaContact.profile_name), "text"),
    "wa_id": GridField(WaContact.wa_id, "text"),
    "email": GridField(WaContact.email, "text"),
    "source": GridField(WaContact.source, "enum"),
    "opted_out": GridField(WaContact.opted_out, "bool"),
    "blocked": GridField(WaContact.blocked, "bool"),
    "last_message_at": GridField(WaContact.last_message_at, "date"),
    "created_at": GridField(WaContact.created_at, "date"),
}


def to_wa_id(db: Session, raw: str | None) -> str | None:
    """'98765 43210' -> '919876543210' using the default country code from settings."""
    phone = normalize_phone(raw, sms_config.load(db)["default_country_code"])
    return phone[1:] if phone else None


def serialize(contact: WaContact) -> dict:
    conversation: WaConversation | None = contact.conversation
    return {
        "id": contact.id,
        "wa_id": contact.wa_id,
        "phone": f"+{contact.wa_id}",
        "name": contact.name,
        "profile_name": contact.profile_name,
        "display_name": contact.name or contact.profile_name or f"+{contact.wa_id}",
        "email": contact.email,
        "tags": contact.tags or [],
        "attributes": contact.attributes or {},
        "source": contact.source,
        "opted_out": contact.opted_out,
        "blocked": contact.blocked,
        "last_message_at": iso(contact.last_message_at),
        "created_at": iso(contact.created_at),
        "updated_at": iso(contact.updated_at),
        "conversation": (
            {"id": conversation.id, "status": conversation.status, "unread_count": conversation.unread_count}
            if conversation else None
        ),
    }


def _get(db: Session, customer: Customer, contact_id: int) -> WaContact:
    contact = (db.query(WaContact).options(joinedload(WaContact.conversation))
               .filter(WaContact.id == contact_id, WaContact.customer_id == customer.id).first())
    if contact is None:
        raise HTTPException(404, detail="Contact not found")
    return contact


def _query(db: Session, customer: Customer, search: str | None, tag: str | None, filters: str | None,
           match: str | None):
    q = (db.query(WaContact).options(joinedload(WaContact.conversation))
         .filter(WaContact.customer_id == customer.id))
    clause = search_clause([WaContact.name, WaContact.profile_name, WaContact.wa_id, WaContact.email], search)
    if clause is not None:
        q = q.filter(clause)
    if tag:
        q = q.filter(cast(WaContact.tags, JSONB).contains([tag]))
    return apply_filters(q, GRID_FIELDS, filters, match)


def list_contacts(db: Session, customer: Customer, page=None, per_page=None, search=None, tag=None,
                  filters=None, match="and", sort=None) -> dict:
    q = _query(db, customer, search, tag, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [WaContact.last_message_at.desc().nulls_last(), WaContact.id.desc()])
    return list_response(q, serialize, page, per_page, search)


def stats(db: Session, customer: Customer) -> dict:
    def count(*conds) -> int:
        return db.query(func.count(WaContact.id)).filter(WaContact.customer_id == customer.id, *conds).scalar() or 0

    week = days_ago_start(6)
    tags: dict[str, int] = {}
    for (row,) in db.query(WaContact.tags).filter(WaContact.customer_id == customer.id).all():
        for t in row or []:
            tags[t] = tags.get(t, 0) + 1
    return {"status": True, "data": {
        "total": count(),
        "new_7d": count(WaContact.created_at >= week),
        "prev_7d": count(WaContact.created_at >= week - timedelta(days=7), WaContact.created_at < week),
        "active_30d": count(WaContact.last_message_at >= now() - timedelta(days=30)),
        "opted_out": count(WaContact.opted_out.is_(True)),
        "blocked": count(WaContact.blocked.is_(True)),
        "tags": [{"tag": t, "count": n} for t, n in sorted(tags.items(), key=lambda i: (-i[1], i[0].lower()))],
    }}


def attribute_keys(db: Session, customer: Customer) -> dict:
    keys: dict[str, int] = {}
    for (attrs,) in db.query(WaContact.attributes).filter(WaContact.customer_id == customer.id).all():
        for k in (attrs or {}):
            keys[k] = keys.get(k, 0) + 1
    return {"status": True, "data": sorted(keys, key=lambda k: (-keys[k], k))}


def _apply(contact: WaContact, payload: ContactSchema) -> None:
    contact.name = payload.name
    contact.email = str(payload.email).lower() if payload.email else None
    contact.tags = payload.tags
    contact.attributes = payload.attributes
    contact.opted_out = payload.opted_out
    contact.blocked = payload.blocked


def create_contact(db: Session, customer: Customer, payload: ContactSchema) -> dict:
    wa_id = to_wa_id(db, payload.phone)
    if not wa_id:
        raise field_error(422, "phone", "Enter a valid WhatsApp number")
    if db.query(WaContact.id).filter(WaContact.customer_id == customer.id, WaContact.wa_id == wa_id).first():
        raise field_error(409, "phone", "A contact with this number already exists")
    contact = WaContact(customer_id=customer.id, wa_id=wa_id, source="manual")
    _apply(contact, payload)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return {"status": True, "message": "Contact added", "data": serialize(contact)}


def get_contact(db: Session, customer: Customer, contact_id: int) -> dict:
    return {"status": True, "data": serialize(_get(db, customer, contact_id))}


def update_contact(db: Session, customer: Customer, contact_id: int, payload: ContactSchema) -> dict:
    contact = _get(db, customer, contact_id)
    wa_id = to_wa_id(db, payload.phone)
    if not wa_id:
        raise field_error(422, "phone", "Enter a valid WhatsApp number")
    if wa_id != contact.wa_id:
        if contact.conversation is not None:
            raise field_error(422, "phone", "This contact already has chats, so their number can't change")
        if db.query(WaContact.id).filter(WaContact.customer_id == customer.id, WaContact.wa_id == wa_id).first():
            raise field_error(409, "phone", "A contact with this number already exists")
        contact.wa_id = wa_id
    _apply(contact, payload)
    db.commit()
    return {"status": True, "message": "Contact saved", "data": serialize(contact)}


def delete_contact(db: Session, customer: Customer, contact_id: int) -> dict:
    db.delete(_get(db, customer, contact_id))
    db.commit()
    return {"status": True, "message": "Contact deleted"}


def bulk(db: Session, customer: Customer, payload: BulkSchema) -> dict:
    rows = db.query(WaContact).filter(WaContact.customer_id == customer.id, WaContact.id.in_(payload.ids)).all()
    if payload.action in ("add_tag", "remove_tag") and not payload.tag:
        raise field_error(422, "tag", "Choose a tag")
    for row in rows:
        if payload.action == "delete":
            db.delete(row)
        elif payload.action == "add_tag":
            row.tags = clean_tags([*(row.tags or []), payload.tag])
        elif payload.action == "remove_tag":
            row.tags = [t for t in row.tags or [] if t != payload.tag]
        elif payload.action in ("opt_out", "opt_in"):
            row.opted_out = payload.action == "opt_out"
        else:
            row.blocked = payload.action == "block"
    db.commit()
    verbs = {"delete": "deleted", "add_tag": "tagged", "remove_tag": "untagged", "opt_out": "opted out",
             "opt_in": "opted in", "block": "blocked", "unblock": "unblocked"}
    n = len(rows)
    return {"status": True, "message": f"{n} contact{'s' if n != 1 else ''} {verbs[payload.action]}"}


# CSV ---------------------------------------------------------------------------------

def _pick(headers: list[str], options: tuple[str, ...]) -> str | None:
    norm = {h: h.strip().lower().replace(" ", "_") for h in headers}
    return next((h for h, n in norm.items() if n in options), None)


def import_csv(db: Session, customer: Customer, file: UploadFile, tag: str | None, update_existing: bool) -> dict:
    raw = file.file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise field_error(422, "file", "The file is larger than 5 MB. Split it into smaller files.")
    text = raw.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = reader.fieldnames or []
    phone_col = _pick(headers, PHONE_HEADERS)
    if not phone_col:
        raise field_error(422, "file", "Add a column named phone (or mobile / number / whatsapp)")
    name_col = _pick(headers, NAME_HEADERS)
    email_col = _pick(headers, ("email", "email_address", "e-mail"))
    tags_col = _pick(headers, ("tags", "tag", "labels"))
    known = {phone_col, name_col, email_col, tags_col}
    extra = [h for h in headers if h and h not in known]
    extra_tag = clean_tags([tag])[0] if tag and clean_tags([tag]) else None

    existing = {c.wa_id: c for c in db.query(WaContact).filter(WaContact.customer_id == customer.id).all()}
    country = sms_config.load(db)["default_country_code"]
    created = updated = skipped = 0
    errors: list[dict] = []
    seen: set[str] = set()
    for line, row in enumerate(reader, start=2):
        if line - 1 > MAX_IMPORT_ROWS:
            errors.append({"row": line, "message": f"Stopped after {MAX_IMPORT_ROWS} rows"})
            break
        phone = normalize_phone(row.get(phone_col), country)
        if not phone:
            skipped += 1
            if len(errors) < 50:
                errors.append({"row": line, "message": f"Invalid number: {row.get(phone_col) or '(empty)'}"})
            continue
        wa_id = phone[1:]
        if wa_id in seen:
            skipped += 1
            continue
        seen.add(wa_id)
        name = (row.get(name_col) or "").strip()[:150] if name_col else ""
        email = (row.get(email_col) or "").strip().lower()[:255] if email_col else ""
        tags = clean_tags([*((row.get(tags_col) or "").replace("|", ";").replace(",", ";").split(";")
                             if tags_col else []), *([extra_tag] if extra_tag else [])])
        attrs = clean_attributes({h: row.get(h) for h in extra})
        contact = existing.get(wa_id)
        if contact is None:
            contact = WaContact(customer_id=customer.id, wa_id=wa_id, source="import", name=name or None,
                                email=email or None, tags=tags, attributes=attrs)
            db.add(contact)
            existing[wa_id] = contact
            created += 1
        elif update_existing:
            contact.name = name or contact.name
            contact.email = email or contact.email
            contact.tags = clean_tags([*(contact.tags or []), *tags])
            contact.attributes = {**(contact.attributes or {}), **attrs}
            updated += 1
        else:
            skipped += 1
    db.commit()
    return {"status": True, "message": f"Imported {created} new, updated {updated}, skipped {skipped}",
            "data": {"created": created, "updated": updated, "skipped": skipped, "errors": errors,
                     "columns": {"phone": phone_col, "name": name_col, "email": email_col, "tags": tags_col,
                                 "custom": extra}}}


def _when(value) -> str:
    """Readable local time for spreadsheets, e.g. 2026-10-22 12:59 (site timezone)."""
    return to_site(value).strftime("%Y-%m-%d %H:%M") if value else ""


def export_csv(db: Session, customer: Customer, search=None, tag=None, filters=None, match="and",
               sort=None) -> StreamingResponse:
    q = _query(db, customer, search, tag, filters, match)
    rows = apply_sort(q, GRID_FIELDS, sort, [WaContact.id.asc()]).all()
    attr_keys = sorted({k for r in rows for k in (r.attributes or {})})
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["phone", "name", "whatsapp_name", "email", "tags", "opted_out", "blocked", "source",
                     "last_message_at", "created_at", *attr_keys])
    for r in rows:
        # ="+91..." keeps Excel from turning the number into 9.17E+11; our importer reads it back fine
        writer.writerow([f'="+{r.wa_id}"', r.name or "", r.profile_name or "", r.email or "", ";".join(r.tags or []),
                         "yes" if r.opted_out else "no", "yes" if r.blocked else "no", r.source,
                         _when(r.last_message_at), _when(r.created_at),
                         *[(r.attributes or {}).get(k, "") for k in attr_keys]])
    stamp = now().strftime("%Y%m%d-%H%M")
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="contacts-{stamp}.csv"'})
