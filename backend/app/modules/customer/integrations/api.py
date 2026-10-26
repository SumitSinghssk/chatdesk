"""The public REST API: other apps send WhatsApp messages and manage contacts with an API key.

Mounted at /api/v1/public. Every call needs `Authorization: Bearer <API key>` (or `X-API-Key`); the
key belongs to one WhatsApp number, so everything here happens on that number. Responses use the same
envelope as the rest of ChatDesk: {"status": true, "data": ...} or {"status": false, "message": ...}.
"""
import mimetypes
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core import rate_limiter
from app.core.database import get_db
from app.core.security import sha256
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.integrations import data
from app.modules.customer.integrations.models import ApiKey
from app.modules.customer.integrations.schemas import ApiContactSchema, ApiContactUpdateSchema, SendMessageSchema
from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage
from app.services.whatsapp import MEDIA_LIMITS, media_kind
from app.shared.enums import Status
from app.shared.utils.datetime import now
from app.shared.utils.request_meta import client_ip

router = APIRouter(prefix="/public", tags=["Public API"])
PER_MINUTE = 120  # calls per key per minute
MAX_PAGE = 100


# Auth -----------------------------------------------------------------------------------------

def _unauthorized(message: str) -> HTTPException:
    return HTTPException(401, detail={"message": message, "errors": {"api_key": [message]}},
                         headers={"WWW-Authenticate": "Bearer"})


def api_number(request: Request, authorization: str | None = Header(None),
               x_api_key: str | None = Header(None), db: Session = Depends(get_db)) -> Customer:
    """The number the API key belongs to, acting as "API (key name)"."""
    given = (x_api_key or (authorization or "").removeprefix("Bearer ").strip()).strip()
    if not given:
        raise _unauthorized("Add your API key: Authorization: Bearer <your key>")
    key = db.query(ApiKey).filter(ApiKey.key_hash == sha256(given)).first()
    if key is None:
        raise _unauthorized("This API key isn't valid. It may have been deleted.")
    wait = rate_limiter._hit((f"apikey:{key.id}", "public-api"), PER_MINUTE, 60)
    if wait is not None:
        raise HTTPException(429, detail={"message": f"Too many requests: {PER_MINUTE} a minute per key. "
                                                    f"Try again in {wait} seconds.",
                                         "errors": {"rate_limit": [f"Try again in {wait} seconds."]}},
                            headers={"Retry-After": str(wait)})
    number = db.query(Customer).filter(Customer.id == key.customer_id, Customer.not_deleted()).first()
    main = number.parent if number is not None and number.parent_id else number
    if number is None or main is None or main.deleted_at is not None or main.status != Status.ACTIVE.value:
        raise HTTPException(403, detail="This account isn't active.")
    if key.last_used_at is None or (now() - key.last_used_at).total_seconds() > 60:
        key.last_used_at, key.last_used_ip = now(), client_ip(request)
        db.commit()
    number.actor = SimpleNamespace(id=None, name=f"API ({key.name})", email=None)
    number.member_role = "owner"
    number.numbers = [number]
    return number


def _phone(db: Session, raw: str) -> str:
    from app.modules.customer.contacts.service import to_wa_id

    wa_id = to_wa_id(db, raw)
    if not wa_id:
        raise field_error(422, "to", "Use a phone number with its country code, e.g. +919876543210")
    return wa_id


def _page(page: int, per_page: int, total: int) -> dict:
    return {"page": page, "per_page": per_page, "total": total, "has_more": page * per_page < total}


# Account ----------------------------------------------------------------------------------------

@router.get("/me")
def me(ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    from app.modules.customer.integrations.webhooks import _number
    from app.modules.customer.whatsapp.models import WhatsAppAccount

    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == ws.id).first()
    return {"status": True, "data": {**_number(db, ws.id), "business": ws.business_name,
                                     "connected": bool(account and account.status == "connected")}}


# Messages ---------------------------------------------------------------------------------------

def _download(url: str, field: str) -> tuple[bytes, str, str]:
    """(content, mime, filename) of a public file, for sending it on WhatsApp."""
    from app.modules.customer.ai_agent.providers import address_allowed
    from app.modules.customer.chatbots.engine import _NoRedirect

    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(4):
        if not url.lower().startswith(("https://", "http://")) or not address_allowed(url):
            raise field_error(422, field, "Use a public https:// link to the file")
        req = urllib.request.Request(url, headers={"User-Agent": "ChatDesk/1.0 (+media fetch)"})
        try:
            with opener.open(req, timeout=20) as res:
                content = res.read(MEDIA_LIMITS["document"] + 1)
                mime = (res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                break
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308) and exc.headers.get("Location"):
                url = urllib.parse.urljoin(url, exc.headers["Location"])
                continue
            raise field_error(422, field, f"Couldn't download the file: the server answered {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise field_error(422, field, "Couldn't download the file. Check the link.") from exc
    else:
        raise field_error(422, field, "The file link redirected too many times")
    name = Path(urllib.parse.urlsplit(url).path).name or "file"
    if not mime or mime == "application/octet-stream":
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    if not content:
        raise field_error(422, field, "The file is empty")
    return content, mime, name[:200]


def _conversation_for(db: Session, ws: Customer, wa_id: str, name: str | None) -> WaConversation:
    from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation

    existed = db.query(WaContact.id).filter(WaContact.customer_id == ws.id, WaContact.wa_id == wa_id).first()
    contact = get_or_create_contact(db, ws.id, wa_id)
    if not existed:
        contact.source = "api"
    if name and not contact.name:
        contact.name = name
    if contact.blocked:
        raise HTTPException(422, detail="This contact is blocked. Unblock them in ChatDesk to message them.")
    return get_or_create_conversation(db, contact)


def _sent(db: Session, message: WaMessage, conversation: WaConversation, text: str):
    body = {"status": message.status != "failed", "message": text,
            "data": data.message(message, conversation.contact)}
    return JSONResponse(status_code=201 if message.status != "failed" else 422, content=body)


@router.post("/messages", status_code=201)
def send_message(payload: SendMessageSchema, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.templates import service as templates_service

    wa_id = _phone(db, payload.to)
    conversation = _conversation_for(db, ws, wa_id, payload.name)
    _, client = inbox._client(db, ws)

    if payload.type == "template":
        if payload.template is None:
            raise field_error(422, "template", "Add the template: its name, language and variable values")
        if conversation.contact.opted_out:
            raise HTTPException(422, detail="This contact opted out of messages. Templates can't be sent to them.")
        t = payload.template
        template = templates_service.find_approved(db, ws, t.name, t.language)
        if template is None:
            raise field_error(422, "template.name", f"No approved template “{t.name}” in language “{t.language}”. "
                                                    "GET /templates lists the ones you can send.")
        media = None
        if t.header_media_url:
            content, mime, filename = _download(t.header_media_url, "template.header_media_url")
            tmp = Path(tempfile.mkdtemp()) / filename
            tmp.write_bytes(content)
            try:
                media = (client.upload_media(content, mime, filename), mime, filename, tmp)
            except Exception as exc:  # noqa: BLE001
                raise field_error(422, "template.header_media_url", f"Meta didn't accept the file: {exc}") from exc
        prepared = inbox.prepare_template(db, ws, client, template, header=t.header, body=t.body,
                                          buttons={b.index: b.text for b in t.buttons}, media=media)
        message, text = inbox.send_prepared(db, ws, conversation, template, prepared, client)
        return _sent(db, message, conversation, text)

    if not inbox.window_open(conversation):
        raise HTTPException(422, detail="The 24-hour window is closed: this customer hasn't messaged you in the "
                                        "last 24 hours, so WhatsApp only allows an approved template. "
                                        "Send it with \"type\": \"template\".")
    if payload.type == "text":
        if not payload.text:
            raise field_error(422, "text", "Add the message text")
        request = {"type": "text", "text": {"body": payload.text, "preview_url": True}}
        if payload.reply_to:
            request["context"] = {"message_id": payload.reply_to}
        message = inbox._outbound(db, ws, conversation, type="text", text=payload.text,
                                  context_wamid=payload.reply_to, payload={"request": request})
        text = inbox._attempt(db, conversation, message,
                              lambda: client.send_text(conversation.contact.wa_id, payload.text, payload.reply_to))
        return _sent(db, message, conversation, text)

    if payload.media is None:
        raise field_error(422, "media", "Add the file: media.url (and a caption if you like)")
    content, mime, filename = _download(payload.media.url, "media.url")
    kind = payload.type
    if kind != "document":
        if media_kind(mime) != kind or mime not in inbox.ACCEPTED.get(kind, {mime}):
            allowed = ", ".join(sorted(inbox.ACCEPTED[kind]))
            raise field_error(422, "media.url", f"This file is {mime}. WhatsApp sends {kind}s as {allowed}; "
                                                f"send it as \"type\": \"document\" instead.")
    if len(content) > MEDIA_LIMITS[kind]:
        raise field_error(422, "media.url", f"WhatsApp allows {kind}s up to {MEDIA_LIMITS[kind] // 1048576} MB")
    message, send = inbox.send_file(db, ws, conversation, kind, content, mime, payload.media.filename or filename,
                                    payload.media.caption, payload.reply_to)
    text = inbox._attempt(db, conversation, message, send)
    return _sent(db, message, conversation, text)


@router.get("/messages/{message_id}")
def get_message(message_id: int, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    message = (db.query(WaMessage).options(joinedload(WaMessage.conversation).joinedload(WaConversation.contact))
               .filter(WaMessage.id == message_id, WaMessage.customer_id == ws.id).first())
    if message is None:
        raise HTTPException(404, detail="Message not found")
    return {"status": True, "data": data.message(message)}


# Contacts ---------------------------------------------------------------------------------------

def _contact(db: Session, ws: Customer, phone: str) -> WaContact:
    contact = db.query(WaContact).filter(WaContact.customer_id == ws.id, WaContact.wa_id == _phone(db, phone)).first()
    if contact is None:
        raise HTTPException(404, detail="No contact with this phone number")
    return contact


@router.get("/contacts")
def list_contacts(search: str | None = None, tag: str | None = None, page: int = Query(1, ge=1),
                  per_page: int = Query(25, ge=1, le=MAX_PAGE), ws: Customer = Depends(api_number),
                  db: Session = Depends(get_db)):
    q = db.query(WaContact).filter(WaContact.customer_id == ws.id)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(WaContact.name.ilike(like), WaContact.profile_name.ilike(like),
                         WaContact.wa_id.ilike(f"%{''.join(c for c in search if c.isdigit()) or search}%"),
                         WaContact.email.ilike(like)))
    rows = q.order_by(WaContact.id.desc()).all() if tag else None
    if tag:
        matching = [c for c in rows if tag in (c.tags or [])]
        total, items = len(matching), matching[(page - 1) * per_page:page * per_page]
    else:
        total = q.count()
        items = q.order_by(WaContact.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"status": True, "data": [data.contact(c) for c in items], "meta": _page(page, per_page, total)}


@router.post("/contacts")
def upsert_contact(payload: ApiContactSchema, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    """Adds the contact, or updates the one with this phone number."""
    from app.modules.customer.inbox.processor import get_or_create_contact

    wa_id = _phone(db, payload.phone)
    existed = db.query(WaContact).filter(WaContact.customer_id == ws.id, WaContact.wa_id == wa_id).first()
    contact = existed or get_or_create_contact(db, ws.id, wa_id)
    if not existed:
        contact.source = "api"
    for field in ("name", "email", "opted_out"):
        if getattr(payload, field) is not None:
            setattr(contact, field, getattr(payload, field))
    if payload.tags is not None:
        contact.tags = payload.tags
    if payload.attributes is not None:
        contact.attributes = {**(contact.attributes or {}), **payload.attributes}
    db.commit()
    return JSONResponse(status_code=200 if existed else 201, content={
        "status": True, "message": "Contact updated" if existed else "Contact added", "data": data.contact(contact)})


@router.get("/contacts/{phone}")
def get_contact(phone: str, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    return {"status": True, "data": data.contact(_contact(db, ws, phone))}


@router.patch("/contacts/{phone}")
def update_contact(phone: str, payload: ApiContactUpdateSchema, ws: Customer = Depends(api_number),
                   db: Session = Depends(get_db)):
    from app.modules.customer.contacts.schemas import clean_attributes, clean_tags

    contact = _contact(db, ws, phone)
    sent = payload.model_dump(exclude_unset=True)
    for field in ("name", "email", "opted_out", "blocked"):
        if field in sent:
            setattr(contact, field, sent[field] if field in ("name", "email") else bool(sent[field]))
    tags = list(payload.tags) if payload.tags is not None else list(contact.tags or [])
    tags += [t for t in clean_tags(payload.add_tags) if t not in tags]
    contact.tags = [t for t in tags if t not in set(clean_tags(payload.remove_tags))]
    if payload.attributes is not None:
        merged = {**(contact.attributes or {})}
        for key, value in payload.attributes.items():
            if value is None:
                merged.pop(str(key).strip().lower().replace(" ", "_"), None)
        merged.update(clean_attributes(payload.attributes))
        contact.attributes = merged
    db.commit()
    return {"status": True, "message": "Contact updated", "data": data.contact(contact)}


@router.delete("/contacts/{phone}")
def delete_contact(phone: str, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    db.delete(_contact(db, ws, phone))
    db.commit()
    return {"status": True, "message": "Contact and their chat deleted", "data": None}


# Conversations ----------------------------------------------------------------------------------

@router.get("/conversations")
def list_conversations(status: str | None = Query(None, pattern="^(open|pending|resolved)$"),
                       page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=MAX_PAGE),
                       ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    q = (db.query(WaConversation).options(joinedload(WaConversation.contact))
         .filter(WaConversation.customer_id == ws.id))
    if status:
        q = q.filter(WaConversation.status == status)
    total = q.count()
    rows = (q.order_by(WaConversation.last_message_at.desc().nulls_last(), WaConversation.id.desc())
            .offset((page - 1) * per_page).limit(per_page).all())
    return {"status": True, "data": [data.conversation(c) for c in rows], "meta": _page(page, per_page, total)}


@router.get("/conversations/{phone}/messages")
def conversation_messages(phone: str, before: int | None = Query(None, ge=1),
                          limit: int = Query(25, ge=1, le=MAX_PAGE), ws: Customer = Depends(api_number),
                          db: Session = Depends(get_db)):
    contact = _contact(db, ws, phone)
    conversation = contact.conversation
    if conversation is None:
        return {"status": True, "data": [], "meta": {"has_more": False, "next_before": None}}
    q = db.query(WaMessage).filter(WaMessage.conversation_id == conversation.id)
    if before:
        q = q.filter(WaMessage.id < before)
    rows = q.order_by(WaMessage.id.desc()).limit(limit + 1).all()
    more = len(rows) > limit
    rows = rows[:limit]
    return {"status": True, "data": [data.message(m, contact) for m in reversed(rows)],
            "meta": {"has_more": more, "next_before": rows[-1].id if more else None}}


# Templates --------------------------------------------------------------------------------------

@router.get("/templates")
def list_templates(status: str = Query("approved", pattern="^(approved|pending|rejected|all)$"),
                   ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    from app.modules.customer.templates import builder
    from app.modules.customer.templates import service as templates_service
    from app.modules.customer.templates.models import WaTemplate

    q = db.query(WaTemplate).filter(WaTemplate.customer_id == ws.id)
    if status != "all":
        q = q.filter(WaTemplate.status == status)
    out = []
    for t in q.order_by(WaTemplate.name, WaTemplate.language).all():
        form = templates_service.form_of(t)
        out.append(data.template(t, form, builder.send_params(form)))
    return {"status": True, "data": out}


# Orders -----------------------------------------------------------------------------------------

@router.get("/orders")
def list_orders(status: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=MAX_PAGE),
                ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    from app.modules.customer.commerce import service as commerce
    from app.modules.customer.commerce.models import Order

    q = db.query(Order).options(joinedload(Order.items)).filter(Order.customer_id == ws.id)
    if status:
        q = q.filter(Order.status == status)
    total = q.count()
    rows = q.order_by(Order.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    store = commerce.settings_of(db, ws)
    return {"status": True, "data": [data.order(o, store) for o in rows], "meta": _page(page, per_page, total)}


@router.get("/orders/{order_id}")
def get_order(order_id: int, ws: Customer = Depends(api_number), db: Session = Depends(get_db)):
    from app.modules.customer.commerce import service as commerce
    from app.modules.customer.commerce.models import Order

    row = db.query(Order).filter(Order.id == order_id, Order.customer_id == ws.id).first()
    if row is None:
        raise HTTPException(404, detail="Order not found")
    return {"status": True, "data": data.order(row, commerce.settings_of(db, ws))}
