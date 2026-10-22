"""Turns raw WhatsApp webhook payloads into contacts, conversations and messages.

Called by the webhook receiver right after the raw event is stored. Safe to run twice on the same
payload: messages are de-duplicated by Meta's message id (wamid) and statuses only move forward.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.shared.utils.datetime import now

STATUS_RANK = {"pending": 0, "sent": 1, "delivered": 2, "read": 3}
MEDIA_TYPES = ("image", "video", "audio", "document", "sticker")
# Plain words only; the inbox draws an icon from `last_message_type`
PREVIEW_LABELS = {
    "image": "Photo",
    "video": "Video",
    "audio": "Audio",
    "document": "Document",
    "sticker": "Sticker",
    "location": "Location",
    "contacts": "Contact",
    "template": "Template",
}


def _ts(value) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError):
        return now()


def preview_of(message: WaMessage) -> str:
    if message.type == "reaction":
        return f"Reacted {message.text or ''}".strip()
    label = PREVIEW_LABELS.get(message.type)
    if message.text:
        return message.text[:255]  # a caption reads better than "Photo: caption"; the icon says it's a photo
    if message.type == "document" and message.media_filename:
        return message.media_filename[:255]
    return label or "Message"


def get_or_create_contact(db: Session, customer_id: int, wa_id: str, profile_name: str | None = None
                          ) -> WaContact:
    contact = db.query(WaContact).filter(WaContact.customer_id == customer_id, WaContact.wa_id == wa_id).first()
    if contact is None:
        contact = WaContact(customer_id=customer_id, wa_id=wa_id, profile_name=profile_name, tags=[])
        db.add(contact)
        db.flush()
    elif profile_name and contact.profile_name != profile_name:
        contact.profile_name = profile_name
    return contact


def get_or_create_conversation(db: Session, contact: WaContact) -> WaConversation:
    conversation = db.query(WaConversation).filter(WaConversation.contact_id == contact.id).first()
    if conversation is None:
        conversation = WaConversation(customer_id=contact.customer_id, contact_id=contact.id, status="open",
                                      unread_count=0)
        db.add(conversation)
        db.flush()
    return conversation


def touch(conversation: WaConversation, message: WaMessage) -> None:
    """Moves the conversation's "last message" to `message` if it is newer.

    Reactions are skipped: the list keeps showing the last real message, as WATI does.
    """
    if message.type == "reaction":
        return
    if conversation.last_message_at and message.created_at < conversation.last_message_at:
        return
    conversation.last_message_at = message.created_at
    conversation.last_message_preview = preview_of(message)
    conversation.last_message_direction = message.direction
    conversation.last_message_type = message.type
    conversation.contact.last_message_at = message.created_at


def _content(raw: dict) -> dict:
    """Message fields for each WhatsApp message type."""
    kind = raw.get("type") or "unknown"
    fields: dict = {"type": kind, "text": None}
    if kind == "text":
        fields["text"] = (raw.get("text") or {}).get("body")
    elif kind in MEDIA_TYPES:
        media = raw.get(kind) or {}
        fields.update(text=media.get("caption"), media_id=media.get("id"), media_mime=media.get("mime_type"),
                      media_filename=media.get("filename"))
    elif kind == "location":
        loc = raw.get("location") or {}
        fields["text"] = loc.get("name") or loc.get("address")
    elif kind == "contacts":
        people = raw.get("contacts") or []
        names = [((p.get("name") or {}).get("formatted_name") or "") for p in people]
        fields["text"] = ", ".join(n for n in names if n) or None
    elif kind == "interactive":
        inter = raw.get("interactive") or {}
        reply = inter.get("button_reply") or inter.get("list_reply") or inter.get("nfm_reply") or {}
        fields["text"] = reply.get("title") or reply.get("body")
    elif kind == "button":
        fields["text"] = (raw.get("button") or {}).get("text")
    elif kind == "reaction":
        fields["text"] = (raw.get("reaction") or {}).get("emoji")
    elif kind == "unsupported" or raw.get("errors"):
        fields.update(type="unsupported", text="This message type isn't supported by WhatsApp's API yet.")
    return fields


def _inbound(db: Session, account: WhatsAppAccount, raw: dict, names: dict[str, str]) -> bool:
    wamid = raw.get("id")
    if not wamid or db.query(WaMessage.id).filter(WaMessage.wamid == wamid).first():
        return False
    wa_id = raw.get("from") or ""
    contact = get_or_create_contact(db, account.customer_id, wa_id, names.get(wa_id))
    conversation = get_or_create_conversation(db, contact)
    created = _ts(raw.get("timestamp"))
    message = WaMessage(
        customer_id=account.customer_id, conversation_id=conversation.id, wamid=wamid, direction="in",
        status="received", context_wamid=(raw.get("context") or {}).get("id"), payload=raw,
        created_at=created, **_content(raw),
    )
    db.add(message)
    if not conversation.last_inbound_at or created > conversation.last_inbound_at:
        conversation.last_inbound_at = created
    if message.type != "reaction":
        conversation.unread_count = (conversation.unread_count or 0) + 1
    if conversation.status == "resolved":
        conversation.status = "open"  # a new message reopens a solved chat
        conversation.resolved_at = None
    touch(conversation, message)
    return True


def _status(db: Session, account: WhatsAppAccount, raw: dict) -> bool:
    message = db.query(WaMessage).filter(WaMessage.wamid == raw.get("id"),
                                         WaMessage.customer_id == account.customer_id).first()
    if message is None:
        return False
    state = raw.get("status")
    at = _ts(raw.get("timestamp"))
    if state == "failed":
        error = (raw.get("errors") or [{}])[0]
        message.status = "failed"
        message.error_code = error.get("code")
        message.error_message = ((error.get("error_data") or {}).get("details") or error.get("message")
                                 or error.get("title") or "WhatsApp couldn't deliver this message")
        return True
    if state not in STATUS_RANK or message.status == "failed":
        return False
    if STATUS_RANK[state] > STATUS_RANK.get(message.status, -1):
        message.status = state
    if state == "sent":
        message.sent_at = message.sent_at or at
    elif state == "delivered":
        message.delivered_at = message.delivered_at or at
    elif state == "read":
        message.delivered_at = message.delivered_at or at
        message.read_at = message.read_at or at
    return True


def process_payload(db: Session, account: WhatsAppAccount, payload: dict) -> dict:
    """Applies one webhook payload. Returns counts of what changed (handy for logs and tests)."""
    counts = {"messages": 0, "statuses": 0}
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            names = {c.get("wa_id"): (c.get("profile") or {}).get("name") for c in value.get("contacts") or []}
            for raw in value.get("messages") or []:
                counts["messages"] += _inbound(db, account, raw, names)
            for raw in value.get("statuses") or []:
                counts["statuses"] += _status(db, account, raw)
    return counts
