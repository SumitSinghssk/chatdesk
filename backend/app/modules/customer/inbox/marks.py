"""Pinned chats (for one person or for everyone) and starred messages (shared with the team)."""
from fastapi import HTTPException
from sqlalchemy import exists, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import (
    WaContact,
    WaConversation,
    WaConversationPin,
    WaMessage,
    WaMessageStar,
)
from app.shared.utils.datetime import iso, now

PIN_LIMIT = 10


# pins -------------------------------------------------------------------------------------------

def pinned_for(member_id: int):
    """SQL: the chat is pinned for this person (their own pin, or one for everyone)."""
    return exists().where(WaConversationPin.conversation_id == WaConversation.id,
                          or_(WaConversationPin.member_id.is_(None), WaConversationPin.member_id == member_id))


def pins_for(db: Session, member_id: int, conversation_ids: list[int]) -> dict[int, str]:
    """{conversation id: "me" | "everyone"} as this person sees them ("me" wins when both)."""
    if not conversation_ids:
        return {}
    rows = (db.query(WaConversationPin.conversation_id, WaConversationPin.member_id)
            .filter(WaConversationPin.conversation_id.in_(conversation_ids),
                    or_(WaConversationPin.member_id.is_(None), WaConversationPin.member_id == member_id)).all())
    out: dict[int, str] = {}
    for conversation_id, owner in rows:
        if owner is not None or conversation_id not in out:
            out[conversation_id] = "me" if owner is not None else "everyone"
    return out


def pin(db: Session, conversation: WaConversation, scope: str, member_id: int) -> bool:
    """Pins the chat. True when it's a new pin for everyone (worth a timeline line)."""
    owner = None if scope == "everyone" else member_id
    q = db.query(WaConversationPin).filter(WaConversationPin.customer_id == conversation.customer_id)
    q = q.filter(WaConversationPin.member_id.is_(None)) if owner is None else q.filter(
        WaConversationPin.member_id == owner)
    if q.filter(WaConversationPin.conversation_id == conversation.id).first():
        return False
    if q.count() >= PIN_LIMIT:
        who = "your team" if owner is None else "you"
        raise HTTPException(422, detail=f"{PIN_LIMIT} chats are already pinned for {who}. Unpin one first.")
    db.add(WaConversationPin(customer_id=conversation.customer_id, conversation_id=conversation.id,
                             member_id=owner, created_by_id=member_id, created_at=now()))
    try:
        db.flush()
    except IntegrityError:  # pinned at the same moment by someone else
        db.rollback()
        return False
    return owner is None


def unpin(db: Session, conversation: WaConversation, scope: str | None, member_id: int) -> bool:
    """scope "me" / "everyone"; None removes both. True when a pin for everyone was removed."""
    q = db.query(WaConversationPin).filter(WaConversationPin.conversation_id == conversation.id)
    if scope == "me":
        q = q.filter(WaConversationPin.member_id == member_id)
    elif scope == "everyone":
        q = q.filter(WaConversationPin.member_id.is_(None))
    else:
        q = q.filter(or_(WaConversationPin.member_id == member_id, WaConversationPin.member_id.is_(None)))
    shared = any(p.member_id is None for p in q.all())
    q.delete(synchronize_session=False)
    return shared


def on_resolved(db: Session, conversation: WaConversation, unpin_on_resolve: bool) -> None:
    if unpin_on_resolve:
        db.query(WaConversationPin).filter(WaConversationPin.conversation_id == conversation.id).delete(
            synchronize_session=False)


# stars ------------------------------------------------------------------------------------------

def stars_for(db: Session, message_ids: list[int]) -> dict[int, dict]:
    """{message id: star} for the messages that are starred."""
    if not message_ids:
        return {}
    rows = (db.query(WaMessageStar, Customer.name, Customer.email)
            .outerjoin(Customer, Customer.id == WaMessageStar.member_id)
            .filter(WaMessageStar.message_id.in_(message_ids)).all())
    return {star.message_id: serialize_star(star, name or email) for star, name, email in rows}


def serialize_star(star: WaMessageStar, by: str | None) -> dict:
    return {"id": star.id, "note": star.note, "created_at": iso(star.created_at),
            "by": {"id": star.member_id, "name": by or "A colleague"} if star.member_id else None}


def star(db: Session, message: WaMessage, note: str | None, member_id: int) -> WaMessageStar:
    if message.type == "reaction":
        raise HTTPException(422, detail="Reactions can't be starred")
    note = (note or "").strip()[:200] or None
    row = db.query(WaMessageStar).filter(WaMessageStar.message_id == message.id).first()
    if row is None:
        row = WaMessageStar(customer_id=message.customer_id, conversation_id=message.conversation_id,
                            message_id=message.id, member_id=member_id, note=note, created_at=now())
        db.add(row)
    else:
        row.note = note
    try:
        db.flush()
    except IntegrityError:  # starred at the same moment by someone else
        db.rollback()
        row = db.query(WaMessageStar).filter(WaMessageStar.message_id == message.id).first()
    return row


def unstar(db: Session, message: WaMessage) -> None:
    db.query(WaMessageStar).filter(WaMessageStar.message_id == message.id).delete(synchronize_session=False)


def starred(db: Session, visible_ids, *, conversation_id: int | None = None, member_id: int | None = None,
            search: str | None = None, before: int | None = None, limit: int = 30):
    """[(star, message, conversation, contact, starred by)] newest first, only in chats the caller may see."""
    q = (db.query(WaMessageStar, WaMessage, WaConversation, WaContact, Customer.name)
         .join(WaMessage, WaMessage.id == WaMessageStar.message_id)
         .join(WaConversation, WaConversation.id == WaMessageStar.conversation_id)
         .join(WaContact, WaContact.id == WaConversation.contact_id)
         .outerjoin(Customer, Customer.id == WaMessageStar.member_id)
         .filter(WaMessageStar.conversation_id.in_(visible_ids)))
    if conversation_id:
        q = q.filter(WaMessageStar.conversation_id == conversation_id)
    if member_id:
        q = q.filter(WaMessageStar.member_id == member_id)
    term = (search or "").strip()
    if term:
        like = f"%{term.replace('%', '').replace('_', '')}%"
        q = q.filter(or_(WaMessage.text.ilike(like), WaMessageStar.note.ilike(like), WaContact.name.ilike(like),
                         WaContact.profile_name.ilike(like), WaMessage.media_filename.ilike(like)))
    if before:
        q = q.filter(WaMessageStar.id < before)
    return q.order_by(WaMessageStar.id.desc()).limit(limit + 1).all()
