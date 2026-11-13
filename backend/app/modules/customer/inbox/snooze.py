"""Snooze a chat: hide it from the queues until a time, then bring it back on top with a reminder.

A customer message wakes it early (unless "keep snoozed" was chosen). Replying or resolving clears the
"came back" marker. The scheduler's `inbox` job calls wake_due() every minute.
"""
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.modules.customer.inbox.models import WaConversation
from app.shared.utils.datetime import iso, now, to_utc

logger = logging.getLogger(__name__)

MAX_DAYS = 90


def active(moment: datetime | None = None):
    """SQL: the chat is snoozed right now."""
    return WaConversation.snoozed_until > (moment or now())


def not_snoozed(moment: datetime | None = None):
    return or_(WaConversation.snoozed_until.is_(None), WaConversation.snoozed_until <= (moment or now()))


def serialize(conversation: WaConversation) -> dict:
    on = bool(conversation.snoozed_until and conversation.snoozed_until > now())
    return {
        "snoozed_until": iso(conversation.snoozed_until) if on else None,
        "snooze_note": conversation.snooze_note if (on or conversation.snooze_woke_at) else None,
        "snooze_keep": bool(conversation.snooze_keep) if on else False,
        "snooze_woke_at": iso(conversation.snooze_woke_at),
    }


def snooze(conversation: WaConversation, until: datetime, note: str | None, keep: bool, member_id: int | None) -> str:
    """Snoozes the chat. Returns the timeline text."""
    until = to_utc(until).replace(second=0, microsecond=0)
    moment = now()
    if until <= moment + timedelta(seconds=30):
        raise HTTPException(422, detail="Pick a time in the future")
    if until > moment + timedelta(days=MAX_DAYS):
        raise HTTPException(422, detail=f"A chat can be snoozed for up to {MAX_DAYS} days")
    if conversation.status == "resolved":
        raise HTTPException(422, detail="This chat is resolved. Reopen it to snooze it.")
    conversation.snoozed_until = until
    conversation.snooze_note = (note or "").strip()[:200] or None
    conversation.snoozed_by_id = member_id
    conversation.snooze_keep = bool(keep)
    conversation.snooze_woke_at = None
    return "Snoozed" + (f": {conversation.snooze_note}" if conversation.snooze_note else "")


def _clear(conversation: WaConversation) -> None:
    conversation.snoozed_until = None
    conversation.snooze_keep = False
    conversation.snooze_woke_at = None


def wake(conversation: WaConversation) -> bool:
    """Wake now, or dismiss the "came back" marker. True when it was still snoozed."""
    was = bool(conversation.snoozed_until and conversation.snoozed_until > now())
    _clear(conversation)
    return was


def clear(conversation: WaConversation) -> None:
    """Someone replied or resolved: the chat is handled, so drop any snooze or "came back" marker."""
    if conversation.snoozed_until or conversation.snooze_woke_at:
        _clear(conversation)


def on_customer_message(conversation: WaConversation) -> bool:
    """The customer wrote: wake the chat unless "keep snoozed". True = it stays snoozed."""
    if not conversation.snoozed_until or conversation.snoozed_until <= now():
        return False
    if conversation.snooze_keep:
        return True
    conversation.snoozed_until = None
    conversation.snooze_keep = False
    conversation.snooze_woke_at = now()
    return False


def wake_due(db: Session, limit: int = 200) -> int:
    """Snoozes whose time has come: back on top, a timeline line and a reminder to whoever snoozed it."""
    from app.modules.customer.account import notify
    from app.modules.customer.team import assign as assigning

    moment = now()
    due = (db.query(WaConversation).filter(WaConversation.snoozed_until.isnot(None),
                                           WaConversation.snoozed_until <= moment)
           .order_by(WaConversation.snoozed_until).limit(limit).all())
    woke = 0
    for conversation in due:
        try:
            conversation.snoozed_until = None
            conversation.snooze_keep = False
            if conversation.status == "resolved":
                conversation.snooze_woke_at = None
                db.commit()
                continue
            conversation.snooze_woke_at = moment
            assigning.event(db, conversation, "snooze", "Snooze ended" + (
                f": {conversation.snooze_note}" if conversation.snooze_note else ""), None)
            notify.snooze_ended(db, conversation)
            db.commit()
            woke += 1
        except Exception:  # one bad chat mustn't stop the others
            db.rollback()
            logger.warning("Waking snoozed chat %s failed", conversation.id, exc_info=True)
    return woke
