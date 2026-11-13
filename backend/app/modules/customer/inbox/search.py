"""Inbox search and filters: words anywhere in a chat (messages, file names, internal notes) with a snippet of
the match, search inside one chat, the filter panel's conditions, and saved views.

Word search is Postgres full-text ('simple' config, every word as a prefix) over GIN indexes, so it stays fast
on big inboxes. MESSAGE_DOC and NOTE_DOC must match the migration's index expressions exactly, or Postgres
won't use the indexes.
"""
import re
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, case, cast, exists, or_, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.modules.customer.inbox.models import (
    WaContact,
    WaConversation,
    WaInboxView,
    WaMessage,
    WaMessageStar,
    WaNote,
)
from app.shared.utils.datetime import day_start, iso, now
from app.shared.utils.search import search_clause

MESSAGE_DOC = "to_tsvector('simple', coalesce(wa_messages.text, '') || ' ' || coalesce(wa_messages.media_filename, ''))"
NOTE_DOC = "to_tsvector('simple', coalesce(wa_notes.body, ''))"
ATTACHMENTS = {"image": ("image", "sticker"), "document": ("document",), "audio": ("audio",), "video": ("video",),
               "location": ("location",)}
WINDOW = timedelta(hours=24)
VIEW_LIMIT = 20


# words ------------------------------------------------------------------------------------------

def words(term: str | None) -> list[str]:
    return [w for w in re.findall(r"\w+", (term or "").lower(), re.UNICODE) if w][:8]


def tsquery(term: str | None) -> str | None:
    """'parcel ab302' -> 'parcel:* & ab302:*' (every word, as a prefix). Only word characters reach SQL."""
    ws = words(term)
    # Postgres reads "AB-302" as "ab" + "-302", so a number also matches its "-302" form
    return " & ".join(f"({w}:* | -{w}:*)" if w.isdigit() else f"{w}:*" for w in ws) if ws else None


def _message_match(tsq: str):
    return text(f"{MESSAGE_DOC} @@ to_tsquery('simple', :tsq)").bindparams(tsq=tsq)


def _note_match(tsq: str):
    return text(f"{NOTE_DOC} @@ to_tsquery('simple', :tsq)").bindparams(tsq=tsq)


def _digits(term: str) -> str:
    return "".join(ch for ch in term if ch.isdigit())


def chat_clause(term: str):
    """A chat matches by the contact's name or number, its last message, or any message or note in it."""
    clauses = []
    named = search_clause([WaContact.name, WaContact.profile_name, WaConversation.last_message_preview], term)
    if named is not None:
        clauses.append(named)
    digits = _digits(term)
    if len(digits) >= 3:
        clauses.append(WaContact.wa_id.contains(digits))
    tsq = tsquery(term)
    if tsq:
        clauses.append(exists().where(and_(WaMessage.conversation_id == WaConversation.id,
                                           WaMessage.type != "reaction", _message_match(tsq))))
        clauses.append(exists().where(and_(WaNote.conversation_id == WaConversation.id, _note_match(tsq))))
    return or_(*clauses) if clauses else None


def name_rank(term: str):
    """0 when the contact's name or number matched (listed first), else 1."""
    hits = []
    named = search_clause([WaContact.name, WaContact.profile_name], term)
    if named is not None:
        hits.append(named)
    digits = _digits(term)
    if len(digits) >= 3:
        hits.append(WaContact.wa_id.contains(digits))
    return case((or_(*hits), 0), else_=1) if hits else None


def snippet(body: str | None, term: str, width: int = 110) -> str:
    """The part of the text around the first matched word."""
    s = re.sub(r"\s+", " ", body or "").strip()
    if len(s) <= width:
        return s
    low = s.lower()
    hit = min((i for i in (low.find(w) for w in words(term)) if i >= 0), default=0)
    start = max(0, hit - width // 3)
    end = min(len(s), start + width)
    start = max(0, end - width)
    return ("…" if start else "") + s[start:end].strip() + ("…" if end < len(s) else "")


def matches_for(db: Session, conversation_ids: list[int], term: str) -> dict[int, dict]:
    """{conversation id: {count, message_id, snippet, created_at, direction, in_note}} for the found chats."""
    tsq = tsquery(term)
    if not conversation_ids or not tsq:
        return {}
    ids = {"ids": [int(i) for i in conversation_ids], "tsq": tsq}
    counts = dict(db.execute(text(
        f"SELECT conversation_id, count(*) FROM wa_messages WHERE conversation_id = ANY(:ids) "
        f"AND type <> 'reaction' AND {MESSAGE_DOC} @@ to_tsquery('simple', :tsq) GROUP BY conversation_id"
    ), ids).all())
    latest = db.execute(text(
        f"SELECT DISTINCT ON (conversation_id) conversation_id, id, text, media_filename, created_at, direction "
        f"FROM wa_messages WHERE conversation_id = ANY(:ids) AND type <> 'reaction' "
        f"AND {MESSAGE_DOC} @@ to_tsquery('simple', :tsq) ORDER BY conversation_id, id DESC"
    ), ids).all()
    out: dict[int, dict] = {}
    for cid, mid, body, filename, created, direction in latest:
        out[cid] = {"count": int(counts.get(cid, 1)), "message_id": mid, "in_note": False,
                    "snippet": snippet(body or filename, term), "direction": direction, "created_at": iso(created)}
    missing = [i for i in conversation_ids if i not in out]
    if missing:
        for cid, body, created in db.execute(text(
            f"SELECT DISTINCT ON (conversation_id) conversation_id, body, created_at FROM wa_notes "
            f"WHERE conversation_id = ANY(:ids) AND {NOTE_DOC} @@ to_tsquery('simple', :tsq) "
            f"ORDER BY conversation_id, id DESC"
        ), {"ids": missing, "tsq": tsq}).all():
            out[cid] = {"count": 1, "message_id": None, "in_note": True, "snippet": snippet(body, term),
                        "direction": None, "created_at": iso(created)}
    return out


def in_chat(db: Session, conversation_id: int, term: str) -> list[int]:
    """Matching message ids in one chat, newest first."""
    tsq = tsquery(term)
    if not tsq:
        return []
    rows = (db.query(WaMessage.id)
            .filter(WaMessage.conversation_id == conversation_id, WaMessage.type != "reaction", _message_match(tsq))
            .order_by(WaMessage.id.desc()).limit(500).all())
    return [r[0] for r in rows]


# filters ----------------------------------------------------------------------------------------

FILTER_KEYS = ("waiting", "attachment", "date_from", "date_to", "window", "starred", "tag")


def _day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(422, detail="Dates must look like 2026-11-13")


def apply_filters(q, f: dict):
    """The filter panel's conditions, all optional and combined with AND."""
    moment = now()
    waiting = int(f.get("waiting") or 0)
    if waiting > 0:
        q = q.filter(WaConversation.waiting_since.isnot(None),
                     WaConversation.waiting_since <= moment - timedelta(minutes=waiting))
    kind = f.get("attachment")
    if kind:
        kinds = [k for v in ATTACHMENTS.values() for k in v] if kind == "any" else ATTACHMENTS.get(kind)
        if not kinds:
            raise HTTPException(422, detail="Unknown attachment type")
        q = q.filter(exists().where(and_(WaMessage.conversation_id == WaConversation.id, WaMessage.type.in_(kinds))))
    d_from, d_to = _day(f.get("date_from")), _day(f.get("date_to"))
    if d_from:  # days in the site's time zone
        q = q.filter(WaConversation.last_message_at >= day_start(d_from))
    if d_to:
        q = q.filter(WaConversation.last_message_at < day_start(d_to + timedelta(days=1)))
    window = f.get("window")
    if window in ("open", "closed"):
        is_open = and_(WaConversation.last_inbound_at.isnot(None), WaConversation.last_inbound_at > moment - WINDOW)
        q = q.filter(is_open if window == "open" else ~is_open)
    if f.get("starred"):
        q = q.filter(exists().where(WaMessageStar.conversation_id == WaConversation.id))
    tag = (f.get("tag") or "").strip()
    if tag:
        q = q.filter(cast(WaContact.tags, JSONB).contains([tag]))
    return q


# saved views ------------------------------------------------------------------------------------

VIEW_KEYS = ("search", "status", "assignee", "unread", *FILTER_KEYS)


def _view(v: WaInboxView, member_id: int) -> dict:
    return {"id": v.id, "name": v.name, "params": v.params or {}, "shared": v.member_id is None,
            "mine": v.created_by_id == member_id}


def list_views(db: Session, customer_id: int, member_id: int) -> list[dict]:
    rows = (db.query(WaInboxView)
            .filter(WaInboxView.customer_id == customer_id,
                    or_(WaInboxView.member_id.is_(None), WaInboxView.member_id == member_id))
            .order_by(WaInboxView.member_id.is_(None).desc(), WaInboxView.name.asc()).all())
    return [_view(v, member_id) for v in rows]


def save_view(db: Session, customer_id: int, member_id: int, name: str, params: dict, shared: bool) -> dict:
    name = re.sub(r"\s+", " ", name or "").strip()[:60]
    if not name:
        raise HTTPException(422, detail="Give the view a name")
    clean = {k: params[k] for k in VIEW_KEYS if params.get(k) not in (None, "", False, 0)}
    if not clean:
        raise HTTPException(422, detail="Pick a search or at least one filter to save")
    owner = None if shared else member_id
    q = db.query(WaInboxView).filter(WaInboxView.customer_id == customer_id)
    q = q.filter(WaInboxView.member_id.is_(None)) if owner is None else q.filter(WaInboxView.member_id == owner)
    if q.count() >= VIEW_LIMIT:
        raise HTTPException(422, detail=f"You can keep up to {VIEW_LIMIT} saved views. Delete one first.")
    if q.filter(WaInboxView.name.ilike(name)).first():
        raise HTTPException(422, detail=f"A view called “{name}” already exists")
    v = WaInboxView(customer_id=customer_id, member_id=owner, name=name, params=clean, created_by_id=member_id,
                    created_at=now())
    db.add(v)
    db.commit()
    return _view(v, member_id)


def delete_view(db: Session, customer_id: int, member_id: int, view_id: int, manager: bool) -> None:
    v = db.query(WaInboxView).filter(WaInboxView.id == view_id, WaInboxView.customer_id == customer_id).first()
    if v is None or (v.member_id is not None and v.member_id != member_id):
        raise HTTPException(404, detail="Saved view not found")
    if v.member_id is None and not (manager or v.created_by_id == member_id):
        raise HTTPException(403, detail="Only an admin, or whoever made it, can delete a shared view")
    db.delete(v)
    db.commit()
