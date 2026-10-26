import mimetypes
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.core.config import STORAGE_DIR
from app.core.crypto import decrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.inbox.models import (
    WaContact,
    WaConversation,
    WaConversationEvent,
    WaMessage,
    WaNote,
    WaQuickReply,
)
from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation, touch
from app.modules.customer.inbox.schemas import (
    ContactUpdateSchema,
    NoteSchema,
    QuickReplySchema,
    SendTemplateSchema,
    SendTextSchema,
    StartConversationSchema,
    StatusSchema,
)
from app.modules.customer.team import assign as assigning
from app.modules.customer.team.access import actor, actor_name, role_of, visible_chats
from app.modules.customer.templates import builder
from app.modules.customer.templates import service as templates_service
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.services.whatsapp import MEDIA_LIMITS, WhatsAppClient, WhatsAppError, media_kind
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.search import search_clause

WINDOW = timedelta(hours=24)
MEDIA_DIR = STORAGE_DIR / "whatsapp-media"
# MIME types WhatsApp accepts per media kind; anything else is sent as a document
ACCEPTED = {
    "image": {"image/jpeg", "image/png"},
    "video": {"video/mp4", "video/3gpp"},
    "audio": {"audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"},
}


# Helpers -----------------------------------------------------------------------------

def _client(db: Session, customer: Customer) -> tuple[WhatsAppAccount, WhatsAppClient]:
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()
    if account is None or account.status != "connected":
        raise HTTPException(422, detail="Connect a working WhatsApp number in WhatsApp setup first")
    return account, WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "")


def _scoped(db: Session, customer: Customer):
    """The workspace's chats this member may see (agents can be limited to their own)."""
    q = db.query(WaConversation).filter(WaConversation.customer_id == customer.id)
    rule = visible_chats(db, customer, WaConversation)
    return q.filter(rule) if rule is not None else q


def _conversation(db: Session, customer: Customer, conversation_id: int) -> WaConversation:
    conversation = (_scoped(db, customer).options(joinedload(WaConversation.contact))
                    .filter(WaConversation.id == conversation_id).first())
    if conversation is None:
        raise HTTPException(404, detail="Conversation not found")
    return conversation


def window_expires_at(conversation: WaConversation):
    return conversation.last_inbound_at + WINDOW if conversation.last_inbound_at else None


def window_open(conversation: WaConversation) -> bool:
    expires = window_expires_at(conversation)
    return bool(expires and expires > now())


def _contact(contact: WaContact) -> dict:
    return {
        "id": contact.id,
        "wa_id": contact.wa_id,
        "phone": f"+{contact.wa_id}",
        "name": contact.name,
        "profile_name": contact.profile_name,
        "display_name": contact.name or contact.profile_name or f"+{contact.wa_id}",
        "tags": contact.tags or [],
        "opted_out": contact.opted_out,
        "blocked": contact.blocked,
        "created_at": iso(contact.created_at),
        "last_message_at": iso(contact.last_message_at),
    }


def serialize_conversation(conversation: WaConversation, bot: str | None = None) -> dict:
    return {
        "id": conversation.id,
        "status": conversation.status,
        "unread_count": conversation.unread_count,
        "last_message_at": iso(conversation.last_message_at),
        "last_message_preview": conversation.last_message_preview,
        "last_message_direction": conversation.last_message_direction,
        "last_message_type": conversation.last_message_type,
        "last_inbound_at": iso(conversation.last_inbound_at),
        "window_expires_at": iso(window_expires_at(conversation)),
        "window_open": window_open(conversation),
        "resolved_at": iso(conversation.resolved_at),
        "created_at": iso(conversation.created_at),
        "contact": _contact(conversation.contact),
        "assignee": ({"id": conversation.assignee.id, "name": assigning.display(conversation.assignee)}
                     if conversation.assignee_id and conversation.assignee else None),
        "team": ({"id": conversation.team.id, "name": conversation.team.name}
                 if conversation.team_id and conversation.team else None),
        "assigned_at": iso(conversation.assigned_at),
        "waiting_since": iso(conversation.waiting_since),
        "bot": bot,  # name of the chatbot talking in the chat right now
    }


def serialize_message(message: WaMessage, replied: WaMessage | None = None) -> dict:
    raw = message.payload or {}
    data = {
        "id": message.id,
        "wamid": message.wamid,
        "direction": message.direction,
        "type": message.type,
        "text": message.text,
        "status": message.status,
        "error": message.error_message,
        "error_code": message.error_code,
        "template_name": message.template_name,
        "sent_by": message.sent_by,
        "created_at": iso(message.created_at),
        "sent_at": iso(message.sent_at),
        "delivered_at": iso(message.delivered_at),
        "read_at": iso(message.read_at),
        "media": None,
        "location": None,
        "reaction_to": None,
        "reply_to": None,
        "auto_reply": None,  # name of the automatic reply that sent it
        "template": None,
        "commerce": raw.get("commerce") if message.direction == "out" else None,  # products sent
        "order": raw.get("order") if message.direction == "out" else None,  # {"id", "ref"} of a shop message
        "cart": None,  # an incoming WhatsApp cart: its items
    }
    if message.type == "order":
        cart = raw.get("order") or {}
        data["cart"] = {"items": [{"retailer_id": i.get("product_retailer_id"), "quantity": i.get("quantity"),
                                   "price": i.get("item_price"), "currency": i.get("currency")}
                                  for i in cart.get("product_items") or []],
                        "text": cart.get("text")}
    if message.type == "template":
        data["template"] = raw.get("template") or {"header_format": None, "buttons": []}
    elif message.direction == "out" and raw.get("template"):
        data["template"] = raw["template"]  # buttons / list of an automatic reply
    if raw.get("auto_reply"):
        data["auto_reply"] = raw["auto_reply"]["name"]
    if message.media_id:
        data["media"] = {
            "path": f"/customer/inbox/messages/{message.id}/media",
            "mime": message.media_mime,
            "filename": message.media_filename,
            "size": message.media_size,
            "voice": bool((raw.get("audio") or {}).get("voice")),
        }
    if message.type == "location":
        loc = raw.get("location") or {}
        data["location"] = {k: loc.get(k) for k in ("latitude", "longitude", "name", "address")}
    if message.type == "reaction":
        data["reaction_to"] = (raw.get("reaction") or {}).get("message_id")
    if replied is not None:
        data["reply_to"] = {"id": replied.id, "text": replied.text, "type": replied.type,
                            "direction": replied.direction}
    return data


def _serialize_messages(db: Session, messages: list[WaMessage]) -> list[dict]:
    from app.modules.customer.commerce.models import CommerceSettings, Order

    wamids = {m.context_wamid for m in messages if m.context_wamid}
    replied = {m.wamid: m for m in db.query(WaMessage).filter(WaMessage.wamid.in_(wamids)).all()} if wamids else {}
    rows = [serialize_message(m, replied.get(m.context_wamid)) for m in messages]
    carts = [m.id for m in messages if m.type == "order"]
    if carts:  # link each incoming cart to the order it became
        made = db.query(Order.message_id, Order.id, Order.number, Order.customer_id).filter(
            Order.message_id.in_(carts)).all()
        prefix = dict(db.query(CommerceSettings.customer_id, CommerceSettings.order_prefix).filter(
            CommerceSettings.customer_id.in_({o[3] for o in made})).all()) if made else {}
        by_message = {o[0]: {"id": o[1], "ref": f"{prefix.get(o[3], '#')}{o[2]}"} for o in made}
        for row in rows:
            if row["id"] in by_message:
                row["order"] = by_message[row["id"]]
    return rows


def _outbound(db: Session, customer: Customer, conversation: WaConversation, sent_by: str | None = None,
              **fields) -> WaMessage:
    person = actor(customer)
    message = WaMessage(customer_id=customer.id, conversation_id=conversation.id, direction="out",
                        status="pending", sent_by=sent_by or actor_name(customer), member_id=person.id,
                        created_at=now(), **fields)
    db.add(message)
    db.flush()
    return message


def _attempt(db: Session, conversation: WaConversation, message: WaMessage, send, reopen: bool = True) -> str:
    """Runs `send()` against Meta, records the result on `message` and commits. Returns a status line."""
    try:
        result = send()
        message.wamid = (result.get("messages") or [{}])[0].get("id")
        message.status = "sent"
        message.sent_at = now()
        text = "Message sent"
    except WhatsAppError as exc:
        message.status = "failed"
        message.error_code = exc.code
        message.error_message = exc.details or str(exc)
        text = f"Not sent: {message.error_message}"
        if exc.code == 190:  # the access token expired: nothing can be sent until it's renewed
            from app.modules.customer.account import notify

            notify.whatsapp_problem(db, message.customer_id, "Messages can't be sent: the WhatsApp access token "
                                                             "expired or was revoked. Update it in WhatsApp setup.")
    touch(conversation, message)
    if reopen and message.status == "sent":  # a person answered (campaign sends don't count)
        member = db.get(Customer, message.member_id) if message.member_id else None
        assigning.record_response(db, conversation, member)
        from app.modules.customer.chatbots.engine import stop_for

        stop_for(db, conversation, "agent", f"Chatbot stopped: {message.sent_by or 'a person'} replied")
    if reopen and conversation.status == "resolved":
        conversation.status = "open"
        conversation.resolved_at = None
    db.commit()
    return text


def _deliver(db: Session, conversation: WaConversation, message: WaMessage, send) -> dict:
    text = _attempt(db, conversation, message, send)
    return {"status": True, "message": text, "data": serialize_message(message)}


def _guard_contact(conversation: WaConversation) -> None:
    if conversation.contact.blocked:
        raise HTTPException(422, detail="This contact is blocked. Unblock them to send messages.")


# Conversations -----------------------------------------------------------------------

def list_conversations(db: Session, customer: Customer, status: str | None, search: str | None,
                       unread: bool, page: int | None, per_page: int | None, assignee: str | None = None,
                       team_id: int | None = None) -> dict:
    q = (_scoped(db, customer).join(WaContact, WaConversation.contact_id == WaContact.id)
         .options(joinedload(WaConversation.contact), joinedload(WaConversation.assignee),
                  joinedload(WaConversation.team)))
    if assignee == "me":
        q = q.filter(WaConversation.assignee_id == actor(customer).id)
    elif assignee == "unassigned":
        q = q.filter(WaConversation.assignee_id.is_(None))
    elif assignee and assignee.isdigit():
        q = q.filter(WaConversation.assignee_id == int(assignee))
    if team_id:
        q = q.filter(WaConversation.team_id == team_id)
    if status in ("open", "pending", "resolved"):
        q = q.filter(WaConversation.status == status)
    if unread:
        q = q.filter(WaConversation.unread_count > 0)
    clause = search_clause([WaContact.name, WaContact.profile_name, WaContact.wa_id,
                            WaConversation.last_message_preview], search)
    if clause is not None:
        q = q.filter(clause)
    q = q.order_by(WaConversation.last_message_at.desc().nulls_last(), WaConversation.id.desc())
    result = list_response(q, serialize_conversation, page or 1, per_page or 30, search)
    from app.modules.customer.chatbots.service import running_in

    bots = running_in(db, [c["id"] for c in result["data"]])
    for row in result["data"]:
        row["bot"] = bots.get(row["id"])
    return result


def summary(db: Session, customer: Customer) -> dict:
    row = db.query(
        func.count(WaConversation.id),
        func.sum(case((WaConversation.status == "open", 1), else_=0)),
        func.sum(case((WaConversation.status == "pending", 1), else_=0)),
        func.sum(case((WaConversation.status == "resolved", 1), else_=0)),
        func.sum(case((WaConversation.unread_count > 0, 1), else_=0)),
        func.sum(case(((WaConversation.assignee_id == actor(customer).id)
                       & WaConversation.status.in_(assigning.OPEN), 1), else_=0)),
        func.sum(case((WaConversation.assignee_id.is_(None) & WaConversation.status.in_(assigning.OPEN), 1),
                      else_=0)),
    ).select_from(WaConversation).filter(
        WaConversation.id.in_(_scoped(db, customer).with_entities(WaConversation.id))).one()
    total, open_, pending, resolved, unread, mine, unassigned = (int(v or 0) for v in row)
    return {"status": True, "data": {"all": total, "open": open_, "pending": pending, "resolved": resolved,
                                     "unread": unread, "mine": mine, "unassigned": unassigned,
                                     "role": role_of(customer)}}


def _with_bot(db: Session, conversation: WaConversation) -> dict:
    from app.modules.customer.chatbots.service import session_info

    bot = session_info(db, conversation.id)
    return {**serialize_conversation(conversation, bot["name"] if bot else None), "bot_session": bot}


def get_conversation(db: Session, customer: Customer, conversation_id: int) -> dict:
    return {"status": True, "data": _with_bot(db, _conversation(db, customer, conversation_id))}


def start_conversation(db: Session, customer: Customer, payload: StartConversationSchema) -> dict:
    from app.modules.customer.contacts.service import to_wa_id  # local import: contacts imports inbox models

    contact = get_or_create_contact(db, customer.id, to_wa_id(db, payload.phone) or payload.phone)
    if contact.source == "inbox" and not contact.conversation:
        contact.source = "manual"
    if payload.name and not contact.name:
        contact.name = payload.name.strip()
    conversation = get_or_create_conversation(db, contact)
    if conversation.assignee_id is None:  # whoever starts the chat handles it
        assigning.assign(db, customer, conversation, actor(customer).id, conversation.team_id,
                         actor_name(customer))
    db.commit()
    db.refresh(conversation)
    return {"status": True, "data": serialize_conversation(conversation)}


def set_status(db: Session, customer: Customer, conversation_id: int, payload: StatusSchema) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    if conversation.status != payload.status:
        words = {"open": "Reopened", "pending": "Marked pending", "resolved": "Resolved"}
        assigning.event(db, conversation, "status", words[payload.status], actor_name(customer))
    conversation.status = payload.status
    conversation.resolved_at = now() if payload.status == "resolved" else None
    if payload.status == "resolved":
        conversation.unread_count = 0
        conversation.waiting_since = None  # nothing left to answer
        from app.modules.customer.ai_agent.engine import on_resolved

        on_resolved(db, conversation)
    db.commit()
    labels = {"open": "Conversation reopened", "pending": "Marked as pending", "resolved": "Conversation resolved"}
    return {"status": True, "message": labels[payload.status], "data": serialize_conversation(conversation)}


def mark_read(db: Session, customer: Customer, conversation_id: int) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    if conversation.unread_count:
        conversation.unread_count = 0
        last_in = (db.query(WaMessage).filter(WaMessage.conversation_id == conversation.id,
                                              WaMessage.direction == "in", WaMessage.wamid.isnot(None))
                   .order_by(WaMessage.id.desc()).first())
        account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()
        if last_in and account and account.status == "connected":
            try:  # blue ticks for the contact; never block the inbox on it
                WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "") \
                    .mark_read(last_in.wamid)
            except WhatsAppError:
                pass
        db.commit()
    return {"status": True, "data": serialize_conversation(conversation)}


# Messages ----------------------------------------------------------------------------

def list_messages(db: Session, customer: Customer, conversation_id: int, before: int | None,
                  after: int | None, limit: int) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    q = db.query(WaMessage).filter(WaMessage.conversation_id == conversation.id)
    limit = max(1, min(limit, 100))
    if after is not None:
        rows = q.filter(WaMessage.id > after).order_by(WaMessage.id.asc()).limit(limit).all()
        has_more = False
    else:
        if before is not None:
            q = q.filter(WaMessage.id < before)
        rows = q.order_by(WaMessage.id.desc()).limit(limit + 1).all()
        has_more = len(rows) > limit
        rows = list(reversed(rows[:limit]))
    events = (db.query(WaConversationEvent).filter(WaConversationEvent.conversation_id == conversation.id)
              .order_by(WaConversationEvent.id.desc()).limit(200).all())
    return {"status": True, "data": _serialize_messages(db, rows), "meta": {"has_more": has_more},
            "conversation": _with_bot(db, conversation),
            "events": [{"id": e.id, "kind": e.kind, "text": e.text, "actor": e.actor, "created_at": iso(e.created_at)}
                       for e in reversed(events)]}


def assign_conversation(db: Session, customer: Customer, conversation_id: int, assignee_id: int | None,
                        team_id: int | None) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    before = conversation.assignee_id
    assigning.assign(db, customer, conversation, assignee_id, team_id, actor_name(customer))
    db.commit()
    db.refresh(conversation)
    if assignee_id and assignee_id != before:
        text = "Assigned to you" if assignee_id == actor(customer).id else \
            f"Assigned to {assigning.display(conversation.assignee)}"
    elif before and not assignee_id:
        text = "Chat unassigned"
    else:
        text = "Saved"
    return {"status": True, "message": text, "data": serialize_conversation(conversation)}


def send_text(db: Session, customer: Customer, conversation_id: int, payload: SendTextSchema) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    _guard_contact(conversation)
    if not window_open(conversation):
        raise HTTPException(422, detail="The 24-hour reply window is closed. Send an approved template instead.")
    _, client = _client(db, customer)
    reply_to = None
    if payload.reply_to_id:
        reply_to = db.query(WaMessage).filter(WaMessage.id == payload.reply_to_id,
                                              WaMessage.conversation_id == conversation.id).first()
    request = {"type": "text", "text": {"body": payload.text, "preview_url": True}}
    if reply_to and reply_to.wamid:
        request["context"] = {"message_id": reply_to.wamid}
    message = _outbound(db, customer, conversation, type="text", text=payload.text,
                        context_wamid=reply_to.wamid if reply_to else None, payload={"request": request})
    return _deliver(db, conversation, message,
                    lambda: client.send_text(conversation.contact.wa_id, payload.text,
                                             reply_to.wamid if reply_to else None))


def send_media(db: Session, customer: Customer, conversation_id: int, file: UploadFile,
               caption: str | None) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    _guard_contact(conversation)
    if not window_open(conversation):
        raise HTTPException(422, detail="The 24-hour reply window is closed. Send an approved template instead.")
    _, client = _client(db, customer)
    mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    kind = media_kind(mime)
    if kind in ACCEPTED and mime not in ACCEPTED[kind]:
        kind = "document"  # e.g. a WebP image or MOV video goes as a file instead
    content = file.file.read(MEDIA_LIMITS[kind] + 1)
    if not content:
        raise field_error(422, "file", "The file is empty")
    if len(content) > MEDIA_LIMITS[kind]:
        raise field_error(422, "file", f"WhatsApp allows {kind}s up to {MEDIA_LIMITS[kind] // (1024 * 1024)} MB")
    filename = Path(file.filename or "file").name[:200]
    caption = (caption or "").strip()[:1024] or None
    try:
        media_id = client.upload_media(content, mime, filename)
    except WhatsAppError as exc:
        raise field_error(422, "file", f"Meta didn't accept the file: {exc.details or exc}") from exc
    body = {"id": media_id}
    if caption and kind in ("image", "video", "document"):
        body["caption"] = caption
    if kind == "document":
        body["filename"] = filename
    message = _outbound(db, customer, conversation, type=kind, text=caption, media_id=media_id,
                        media_mime=mime, media_filename=filename, media_size=len(content),
                        payload={"request": {"type": kind, kind: body}})
    _cache_path(message).parent.mkdir(parents=True, exist_ok=True)
    _cache_path(message).write_bytes(content)
    return _deliver(db, conversation, message,
                    lambda: client.send_media(conversation.contact.wa_id, kind, media_id, caption, filename))


def _download_name(message: WaMessage) -> str:
    """The file's own name, or e.g. "photo-25.jpg" for media WhatsApp sends without one."""
    if message.media_filename:
        return message.media_filename
    ext = mimetypes.guess_extension((message.media_mime or "").split(";")[0].strip()) or ""
    label = {"image": "photo", "sticker": "sticker", "audio": "audio", "video": "video"}.get(message.type, "file")
    return f"{label}-{message.id}{ext}"


def _cache_path(message: WaMessage) -> Path:
    return MEDIA_DIR / str(message.customer_id) / str(message.id)


def media(db: Session, customer: Customer, message_id: int, download: bool = False) -> FileResponse:
    message = db.query(WaMessage).filter(WaMessage.id == message_id, WaMessage.customer_id == customer.id).first()
    if message is None or not message.media_id:
        raise HTTPException(404, detail="Media not found")
    path = _cache_path(message)
    if not path.exists():
        _, client = _client(db, customer)
        try:
            content, mime = client.download_media(message.media_id)
        except WhatsAppError as exc:
            raise HTTPException(404, detail="WhatsApp no longer has this file (media expires after 30 days)") from exc
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        message.media_mime = message.media_mime or mime
        message.media_size = len(content)
        db.commit()
    # Pictures and PDFs open in the in-app viewer; ?download=1 saves the file instead
    disposition = "attachment" if download else "inline"
    return FileResponse(path, media_type=message.media_mime or "application/octet-stream",
                        filename=_download_name(message), content_disposition_type=disposition,
                        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})


# Templates ---------------------------------------------------------------------------

def list_templates(db: Session, customer: Customer, fresh: bool) -> dict:
    """Approved templates for the "Send template" picker (synced with Meta first when stale)."""
    if fresh:
        templates_service.sync(db, customer)
        error = None
    else:
        error = templates_service.auto_sync(db, customer)["data"]["error"]
    items = templates_service.approved(db, customer)
    if error and not items:
        raise HTTPException(422, detail=error)  # nothing to show: say why (e.g. an expired token)
    return {"status": True, "data": [templates_service.serialize(t) for t in items]}


def _fill(text: str, values: dict[str, str]) -> str:
    return builder.VAR.sub(lambda m: values.get(m.group(1), m.group(0)), text or "")


def _params(names: list[str], values: list[str]) -> list[dict]:
    params = []
    for name, value in zip(names, values):
        param = {"type": "text", "text": value}
        if not name.isdigit():
            param["parameter_name"] = name  # templates that use named variables
        params.append(param)
    return params


def send_template(db: Session, customer: Customer, conversation_id: int, payload: SendTemplateSchema) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    _guard_contact(conversation)
    if conversation.contact.opted_out:
        raise HTTPException(422, detail="This contact opted out of messages. Templates can't be sent to them.")
    _, client = _client(db, customer)
    template = templates_service.find_approved(db, customer, payload.name, payload.language)
    if template is None:
        raise field_error(422, "name", "This template isn't approved (or no longer exists) on Meta")
    prepared = prepare_template(
        db, customer, client, template,
        header=[p.text for p in payload.header_params], body=[p.text for p in payload.body_params],
        buttons={b.index: b.text for b in payload.button_params}, header_media=payload.header_media,
        location=payload.location.model_dump(exclude_none=True) if payload.location else None)
    message, text = send_prepared(db, customer, conversation, template, prepared, client)
    return {"status": True, "message": text, "data": serialize_message(message)}


def upload_header(db: Session, customer: Customer, client: WhatsAppClient, template, key: str | None = None):
    """(media id, mime, filename, path) for a template's image/video/PDF header, uploaded to WhatsApp."""
    try:
        return templates_service.header_media_id(db, customer, client, template, key)
    except WhatsAppError as exc:
        raise HTTPException(422, detail=f"Couldn't upload the header file: {exc.details or exc}") from exc


def prepare_template(db: Session, customer: Customer, client: WhatsAppClient, template, *, header: list[str],
                     body: list[str], buttons: dict[int, str], header_media: str | None = None,
                     location: dict | None = None, media: tuple | None = None) -> dict:
    """Checks the values for `template` and builds what Meta needs plus the text shown in the chat.

    `media` is an already uploaded header (campaigns upload it once for every recipient).
    """
    form = templates_service.form_of(template)
    needs = builder.send_params(form)
    body_values = [v.strip() for v in body]
    header_values = [v.strip() for v in header]
    button_values = {i: (v or "").strip() for i, v in buttons.items()}
    missing_button = any(not button_values.get(b["index"]) for b in needs["buttons"])
    if len(body_values) != len(needs["body"]) or len(header_values) != len(needs["header"]) \
            or not all(body_values + header_values) or missing_button:
        raise field_error(422, "body_params", "Fill in every variable in the template")

    components: list[dict] = []
    header_format = form["header"]["format"]
    if header_format == "text" and header_values:
        components.append({"type": "header", "parameters": _params(needs["header"], header_values)})
    elif header_format in builder.MEDIA_FORMATS:
        media = media or upload_header(db, customer, client, template, header_media)
        part: dict = {"id": media[0]}
        if header_format == "document":
            part["filename"] = media[2]
        components.append({"type": "header", "parameters": [{"type": header_format, header_format: part}]})
    elif header_format == "location":
        if not location:
            raise field_error(422, "location", "Add the location to show in the header")
        components.append({"type": "header", "parameters": [{"type": "location", "location": location}]})
    if body_values:
        components.append({"type": "body", "parameters": _params(needs["body"], body_values)})
    for b in needs["buttons"]:
        value = button_values[b["index"]]
        param = ({"type": "coupon_code", "coupon_code": value} if b["type"] == "copy_code"
                 else {"type": "text", "text": value})
        components.append({"type": "button", "sub_type": b["type"], "index": str(b["index"]), "parameters": [param]})
    if template.category == "authentication" and body_values:
        # the copy-code button carries the same one-time code as the body
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": body_values[0]}]})

    header_text = (_fill(form["header"]["text"], dict(zip(needs["header"], header_values)))
                   if header_format == "text" else None)
    rendered = "\n\n".join(filter(None, [
        header_text,
        _fill(form["body"], dict(zip(needs["body"], body_values))),
        form.get("footer"),
    ]))
    return {
        "components": components,
        "rendered": rendered,
        "media": media if header_format in builder.MEDIA_FORMATS else None,
        "info": {"header_format": header_format,
                 "buttons": [{"type": b["type"], "text": b["text"]} for b in form["buttons"]]},
    }


def send_prepared(db: Session, customer: Customer, conversation: WaConversation, template, prepared: dict,
                  client: WhatsAppClient, sent_by: str | None = None, campaign: dict | None = None,
                  ) -> tuple[WaMessage, str]:
    """Sends a prepared template into `conversation` and records it there like any other message.

    Campaign messages carry `campaign` ({"id", "name"}) and don't reopen resolved chats.
    """
    components = prepared["components"]
    request_template = {"name": template.name, "language": {"code": template.language}}
    if components:
        request_template["components"] = components
    media_fields: dict = {}
    media = prepared["media"]
    if media:
        media_fields = {"media_id": media[0], "media_mime": media[1], "media_filename": media[2],
                        "media_size": media[3].stat().st_size}
    info = {**prepared["info"], **({"campaign": campaign} if campaign else {})}
    message = _outbound(db, customer, conversation, sent_by=sent_by, type="template", text=prepared["rendered"],
                        template_name=template.name, **media_fields,
                        payload={"request": {"type": "template", "template": request_template}, "template": info})
    if media:
        _cache_path(message).parent.mkdir(parents=True, exist_ok=True)
        _cache_path(message).write_bytes(media[3].read_bytes())  # so the chat shows the header right away
    text = _attempt(db, conversation, message,
                    lambda: client.send_template(conversation.contact.wa_id, template.name,
                                                 template.language, components or None),
                    reopen=campaign is None)
    return message, text


# Contact & notes ---------------------------------------------------------------------

def update_contact(db: Session, customer: Customer, conversation_id: int, payload: ContactUpdateSchema) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    contact = conversation.contact
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        contact.name = data["name"]
    if "tags" in data and data["tags"] is not None:
        contact.tags = data["tags"]
    for flag in ("opted_out", "blocked"):
        if data.get(flag) is not None:
            setattr(contact, flag, data[flag])
    db.commit()
    return {"status": True, "message": "Contact saved", "data": serialize_conversation(conversation)}


def contact_tags(db: Session, customer: Customer) -> dict:
    tags: dict[str, int] = {}
    for (row,) in db.query(WaContact.tags).filter(WaContact.customer_id == customer.id).all():
        for tag in row or []:
            tags[tag] = tags.get(tag, 0) + 1
    return {"status": True, "data": sorted(tags, key=lambda t: (-tags[t], t.lower()))}


def _note(note: WaNote) -> dict:
    return {"id": note.id, "body": note.body, "author": note.author, "created_at": iso(note.created_at)}


def list_notes(db: Session, customer: Customer, conversation_id: int) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    notes = (db.query(WaNote).filter(WaNote.conversation_id == conversation.id)
             .order_by(WaNote.id.desc()).limit(200).all())
    return {"status": True, "data": [_note(n) for n in notes]}


def add_note(db: Session, customer: Customer, conversation_id: int, payload: NoteSchema) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    note = WaNote(customer_id=customer.id, conversation_id=conversation.id, body=payload.body,
                  author=actor_name(customer), created_at=now())
    db.add(note)
    db.commit()
    return {"status": True, "message": "Note added", "data": _note(note)}


def delete_note(db: Session, customer: Customer, conversation_id: int, note_id: int) -> dict:
    conversation = _conversation(db, customer, conversation_id)
    deleted = db.query(WaNote).filter(WaNote.id == note_id, WaNote.conversation_id == conversation.id).delete()
    if not deleted:
        raise HTTPException(404, detail="Note not found")
    db.commit()
    return {"status": True, "message": "Note deleted"}


# Retry & typing ----------------------------------------------------------------------

def retry(db: Session, customer: Customer, message_id: int) -> dict:
    message = db.query(WaMessage).filter(WaMessage.id == message_id, WaMessage.customer_id == customer.id).first()
    if message is None or message.direction != "out":
        raise HTTPException(404, detail="Message not found")
    if message.status != "failed":
        raise HTTPException(422, detail="Only messages that failed can be sent again")
    request = (message.payload or {}).get("request")
    if not request:
        raise HTTPException(422, detail="This message can't be retried. Send it again from the composer.")
    conversation = _conversation(db, customer, message.conversation_id)
    _guard_contact(conversation)
    if message.type != "template" and not window_open(conversation):
        raise HTTPException(422, detail="The 24-hour reply window is closed. Send an approved template instead.")
    _, client = _client(db, customer)
    message.status, message.error_code, message.error_message = "pending", None, None
    message.wamid, message.created_at = None, now()
    return _deliver(db, conversation, message, lambda: client.send({"to": conversation.contact.wa_id, **request}))


def typing(db: Session, customer: Customer, conversation_id: int) -> dict:
    """Best effort: tells WhatsApp to show "typing..." to the customer while an agent writes."""
    conversation = _conversation(db, customer, conversation_id)
    if window_open(conversation) and not conversation.contact.blocked:
        last_in = (db.query(WaMessage).filter(WaMessage.conversation_id == conversation.id,
                                              WaMessage.direction == "in", WaMessage.wamid.isnot(None))
                   .order_by(WaMessage.id.desc()).first())
        account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()
        if last_in and account and account.status == "connected":
            try:
                WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "").typing(last_in.wamid)
            except WhatsAppError:
                pass
    return {"status": True}


# Quick replies -----------------------------------------------------------------------

def _quick(q: WaQuickReply) -> dict:
    return {"id": q.id, "shortcut": q.shortcut, "text": q.text, "updated_at": iso(q.updated_at)}


def _quick_or_404(db: Session, customer: Customer, quick_id: int) -> WaQuickReply:
    row = db.query(WaQuickReply).filter(WaQuickReply.id == quick_id, WaQuickReply.customer_id == customer.id).first()
    if row is None:
        raise HTTPException(404, detail="Quick reply not found")
    return row


def _check_shortcut(db: Session, customer: Customer, shortcut: str, exclude: int | None = None) -> None:
    q = db.query(WaQuickReply.id).filter(WaQuickReply.customer_id == customer.id, WaQuickReply.shortcut == shortcut)
    if exclude:
        q = q.filter(WaQuickReply.id != exclude)
    if q.first():
        raise field_error(409, "shortcut", f"/{shortcut} is already used by another quick reply")


def list_quick_replies(db: Session, customer: Customer) -> dict:
    rows = (db.query(WaQuickReply).filter(WaQuickReply.customer_id == customer.id)
            .order_by(WaQuickReply.shortcut).all())
    return {"status": True, "data": [_quick(q) for q in rows]}


def create_quick_reply(db: Session, customer: Customer, payload: QuickReplySchema) -> dict:
    _check_shortcut(db, customer, payload.shortcut)
    row = WaQuickReply(customer_id=customer.id, shortcut=payload.shortcut, text=payload.text)
    db.add(row)
    db.commit()
    return {"status": True, "message": "Quick reply saved", "data": _quick(row)}


def update_quick_reply(db: Session, customer: Customer, quick_id: int, payload: QuickReplySchema) -> dict:
    row = _quick_or_404(db, customer, quick_id)
    _check_shortcut(db, customer, payload.shortcut, exclude=row.id)
    row.shortcut, row.text = payload.shortcut, payload.text
    db.commit()
    return {"status": True, "message": "Quick reply saved", "data": _quick(row)}


def delete_quick_reply(db: Session, customer: Customer, quick_id: int) -> dict:
    db.delete(_quick_or_404(db, customer, quick_id))
    db.commit()
    return {"status": True, "message": "Quick reply deleted"}
