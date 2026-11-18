"""WhatsApp voice calls between customers and the team, answered in the browser (WebRTC, SDP via Meta).

Incoming: Meta's `connect` webhook creates a ringing call for the people it rings for. One of them claims it
(atomic), the browser answers the customer's offer and the answer SDP goes to Meta (pre_accept + accept).
Either side hangs up; a call nobody answers becomes "missed" and the customer gets the follow-up message.
Outgoing: someone calls a customer who allowed calls (Meta requires that permission). The browser's offer goes
to Meta; the customer's answer SDP comes back in the `connect` webhook and the browser picks it up by polling.
Webhook handling never raises: a broken call must not stop messages.
"""
import logging
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import WaContact, WaConversation
from app.modules.customer.team import assign as assigning
from app.modules.customer.team.access import actor, actor_name, can_reply, settings_of
from app.modules.customer.wa_calls.models import WaCall, WaCallPermission, WaCallSettings
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.services.whatsapp import WhatsAppClient, WhatsAppError
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

RING = timedelta(seconds=90)  # nobody answered by then: missed
CLAIM = timedelta(seconds=20)  # a claim not answered by then goes back to ringing
LIVE = timedelta(hours=4)  # an answered call without a terminate still counts as live this long
OUT_STALE = timedelta(seconds=75)  # an outgoing call with no answer by then: not answered
IN_LIVE = ("ringing", "answering", "answered")
OUT_LIVE = ("dialing", "ringing", "answered")
TEMPORARY = timedelta(days=7)
REQUEST_GAP = timedelta(hours=24)
REVOKE_AFTER = 4  # Meta removes the permission after this many unanswered calls in a row
WARN_AFTER = 2
SENDER = "Calls"  # automatic messages are labelled with this (see inbox AUTOMATED_SENDERS)

INCOMING, MISSED, OUTGOING = "📞 Incoming call", "📞 Missed call", "📞 Outgoing call"
DEFAULT_FOLLOWUP = "Sorry we missed your call! Reply here and our team will help you right away."
DEFAULT_PERMISSION = "We'd like to call you on WhatsApp. Tap Allow so our team can call you."
OUT_ERRORS = {
    138006: "{name} hasn't allowed calls yet. Ask for permission first.",
    138012: "WhatsApp's daily limit of calls from this number is reached. Try again later.",
    138005: "Too many calls right now. Wait a minute and try again.",
    138003: "{name} is already on a call with you.",
    138001: "{name} can't receive WhatsApp calls.",
    138013: "WhatsApp calling isn't available for this number.",
    138014: "WhatsApp paused calling for this number because of low call quality.",
    138000: "WhatsApp calling isn't turned on for this number. Check Calls → Settings.",
}
SYNC_ERRORS = {
    138015: "Your WhatsApp number needs a messaging limit of at least 2,000 a day before Meta allows calls.",
    138018: "Turn on the 'calls' webhook field for your app in Meta (WhatsApp → Configuration → Webhooks).",
}
REQUEST_ERRORS = {
    138009: "You've asked {name} too often. WhatsApp allows 1 request a day and 2 a week.",
    138017: "{name} already allows calls.",
}


# basics -----------------------------------------------------------------------------------------

def _settings(db: Session, customer_id: int) -> WaCallSettings | None:
    return db.query(WaCallSettings).filter(WaCallSettings.customer_id == customer_id).first()


def calling_on(db: Session, customer_id: int) -> bool:
    st = _settings(db, customer_id)
    return bool(st and st.enabled)


def _client(db: Session, customer_id: int, required: bool = True) -> WhatsAppClient | None:
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer_id).first()
    if account is None or account.status != "connected":
        if required:
            raise HTTPException(422, detail="Connect a working WhatsApp number first")
        return None
    return WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "")


def _meta(db: Session, call: WaCall, action: str) -> None:
    """Best-effort reject / terminate at Meta (never raises)."""
    try:
        client = _client(db, call.customer_id, required=False)
        if client is not None and not call.wacid.startswith("pending-"):
            client.call_action(call.wacid, action)
    except WhatsAppError as exc:
        logger.warning("WhatsApp call %s %s failed: %s", call.id, action, exc)


def _name(contact: WaContact) -> str:
    return contact.name or contact.profile_name or f"+{contact.wa_id}"


def _seconds(delta: timedelta) -> int:
    return max(0, int(delta.total_seconds()))


def _duration_text(seconds: int | None) -> str:
    if not seconds:
        return ""
    m, s = divmod(seconds, 60)
    return f" · {m} min {s} s" if m else f" · {s} s"


def _conversation(db: Session, call: WaCall) -> WaConversation:
    return db.get(WaConversation, call.conversation_id)


def _event(db: Session, conversation: WaConversation | None, text: str, who: str | None = None) -> None:
    if conversation is not None:
        assigning.event(db, conversation, "call", text, who)


def _preview(conversation: WaConversation, text: str, direction: str) -> None:
    moment = now()
    conversation.last_message_at, conversation.last_message_preview = moment, text
    conversation.last_message_direction, conversation.last_message_type = direction, "call"
    if conversation.contact is not None:
        conversation.contact.last_message_at = moment


def _person_name(db: Session, member_id: int | None) -> str | None:
    person = db.get(Customer, member_id) if member_id else None
    return (person.name or person.email) if person else None


def ring_audience(db: Session, conversation: WaConversation) -> list[int]:
    """Who an incoming call rings for: whoever handles the chat, otherwise everyone who could answer it."""
    from app.modules.customer.account import notify

    team = [p for p in notify.team(db, conversation.customer_id) if p.role != "viewer"]
    if conversation.assignee_id and any(p.id == conversation.assignee_id for p in team):
        return [conversation.assignee_id]
    owner = db.get(Customer, conversation.customer_id)
    hidden = owner is not None and settings_of(owner)["agent_visibility"] == "own"
    return [p.id for p in team if not (hidden and p.workspace_id is not None and p.role == "agent")]


# permission -------------------------------------------------------------------------------------

def _permission(db: Session, contact: WaContact, create: bool = False) -> WaCallPermission | None:
    row = db.query(WaCallPermission).filter(WaCallPermission.contact_id == contact.id).first()
    if row is None and create:
        row = WaCallPermission(customer_id=contact.customer_id, contact_id=contact.id, status="none", unanswered=0,
                               updated_at=now())
        db.add(row)
        db.flush()
    return row


def _current(row: WaCallPermission | None) -> str:
    if row is None:
        return "none"
    if row.status == "temporary" and row.expires_at and row.expires_at <= now():
        row.status = "expired"
    return row.status


def _grant_automatic(db: Session, contact: WaContact) -> None:
    """The customer called: Meta lets the business call back for 7 days."""
    row = _permission(db, contact, create=True)
    if _current(row) == "permanent":
        return
    moment = now()
    row.status, row.expires_at, row.responded_at, row.response_source = "temporary", moment + TEMPORARY, moment, \
        "automatic"
    row.updated_at = moment


def _unanswered(db: Session, contact_id: int) -> None:
    contact = db.get(WaContact, contact_id)
    if contact is None:
        return
    row = _permission(db, contact, create=True)
    row.unanswered = (row.unanswered or 0) + 1
    if row.unanswered >= REVOKE_AFTER and _current(row) in ("temporary", "permanent"):
        row.status, row.expires_at, row.response_source = "expired", None, "auto_revoked"
    row.updated_at = now()


def is_permission_reply(raw: dict | None) -> bool:
    inter = (raw or {}).get("interactive") or {}
    return (raw or {}).get("type") == "interactive" and inter.get("type") == "call_permission_reply"


def permission_reply_text(raw: dict) -> str:
    r = (raw.get("interactive") or {}).get("call_permission_reply") or {}
    if (r.get("response") or "").lower() != "accept":
        return "Declined calls"
    return "✅ Allowed calls" if r.get("is_permanent") else "✅ Allowed calls for 7 days"


def on_permission_reply(db: Session, conversation: WaConversation, contact: WaContact, raw: dict) -> None:
    """The customer answered a call-permission request (called while the inbound message is stored)."""
    from datetime import datetime, timezone

    r = (raw.get("interactive") or {}).get("call_permission_reply") or {}
    accept = (r.get("response") or "").lower() == "accept"
    permanent = accept and bool(r.get("is_permanent"))
    row = _permission(db, contact, create=True)
    moment = now()
    if accept:
        row.status = "permanent" if permanent else "temporary"
        expires = None
        if not permanent and r.get("expiration_timestamp"):
            try:
                expires = datetime.fromtimestamp(int(r["expiration_timestamp"]), timezone.utc).replace(tzinfo=None)
            except (TypeError, ValueError):
                expires = None
        row.expires_at = None if permanent else (expires or moment + TEMPORARY)
        row.unanswered = 0
    else:
        row.status, row.expires_at = "rejected", None
    row.responded_at, row.response_source, row.updated_at = moment, (r.get("response_source") or "user_action")[:20], \
        moment
    _event(db, conversation, "Allowed calls" + ("" if permanent else " for 7 days") if accept else "Declined calls")


def permission_state(db: Session, ws: Customer, conversation: WaConversation) -> dict:
    contact = conversation.contact
    on = calling_on(db, ws.id)
    row = _permission(db, contact)
    status = _current(row)
    name = _name(contact)
    allowed = status in ("temporary", "permanent")
    can_call, can_request, reason, warning = allowed, not allowed, None, None
    from app.modules.customer.inbox.service import window_open

    if not on:
        can_call = can_request = False
        reason = "WhatsApp calls are turned off. An admin can turn them on in Calls → Settings."
    elif contact.blocked:
        can_call = can_request = False
        reason = "This contact is blocked."
    elif allowed:
        if row is not None and (row.unanswered or 0) >= WARN_AFTER:
            warning = (f"{name} didn't answer the last {row.unanswered} calls. After {REVOKE_AFTER} unanswered "
                       "calls WhatsApp removes the permission.")
    else:
        reason = {
            "requested": f"Waiting for {name} to allow calls.",
            "rejected": f"{name} declined calls.",
            "expired": (f"{name}'s permission was removed after {REVOKE_AFTER} unanswered calls."
                        if row is not None and row.response_source == "auto_revoked"
                        else f"{name}'s permission to call has expired. Ask again."),
        }.get(status, f"{name} hasn't allowed calls yet. Ask for permission first.")
        if row is not None and row.requested_at and now() - row.requested_at < REQUEST_GAP:
            can_request = False
            reason += " You can ask once a day."
        elif not window_open(conversation):
            can_request = False
            reason += " The 24-hour chat window is closed: they need to message you first."
    db.commit()
    return {"status": status, "expires_at": iso(row.expires_at if row and status == "temporary" else None),
            "requested_at": iso(row.requested_at if row else None), "can_call": can_call,
            "can_request": can_request, "reason": reason, "warning": warning, "calling_on": on}


def request_permission(db: Session, ws: Customer, conversation: WaConversation) -> dict:
    from app.modules.customer.inbox import service as inbox

    contact = conversation.contact
    name = _name(contact)
    if not calling_on(db, ws.id):
        raise HTTPException(422, detail="WhatsApp calls are turned off. An admin can turn them on in Calls → Settings.")
    if contact.blocked:
        raise HTTPException(422, detail="This contact is blocked.")
    row = _permission(db, contact, create=True)
    if _current(row) in ("temporary", "permanent"):
        db.commit()
        raise HTTPException(409, detail=f"{name} already allows calls.")
    if row.requested_at and now() - row.requested_at < REQUEST_GAP:
        db.commit()
        raise HTTPException(422, detail=f"You already asked {name} today. WhatsApp allows one request a day.")
    if not inbox.window_open(conversation):
        db.commit()
        raise HTTPException(422, detail="The 24-hour chat window is closed: they need to message you first.")
    _, client = inbox._client(db, ws)
    st = _settings(db, ws.id)
    text = (st.permission_text if st and st.permission_text else DEFAULT_PERMISSION)[:1024]
    interactive = {"type": "call_permission_request", "action": {"name": "call_permission_request"},
                   "body": {"text": text}}
    request = {"type": "interactive", "interactive": interactive}
    message = inbox._outbound(db, ws, conversation, type="interactive", text=text, payload={"request": request})
    inbox._attempt(db, conversation, message, lambda: client.send({"to": contact.wa_id, **request}))
    if message.status == "failed":
        plain = REQUEST_ERRORS.get(message.error_code)
        raise HTTPException(422, detail=plain.format(name=name) if plain
                            else f"WhatsApp didn't send the request: {message.error_message}")
    moment = now()
    row.status, row.requested_at, row.updated_at = "requested", moment, moment
    db.commit()
    return permission_state(db, ws, conversation)


# webhooks ---------------------------------------------------------------------------------------

def handle_webhook(db: Session, account: WhatsAppAccount, value: dict) -> int:
    """Applies one `calls` webhook value. Returns how many calls it touched. Never raises."""
    names = {c.get("wa_id"): (c.get("profile") or {}).get("name")
             for c in value.get("contacts") or [] if isinstance(c, dict)}
    touched = 0
    for raw in value.get("calls") or []:
        if not isinstance(raw, dict):
            continue
        outbound = (raw.get("direction") or "USER_INITIATED").upper() == "BUSINESS_INITIATED"
        event = (raw.get("event") or "").lower()
        try:
            if event == "connect":
                call = _out_connect(db, account, raw) if outbound else _in_connect(db, account, raw, names)
            elif event == "terminate":
                call = _terminate(db, account, raw)
            else:
                continue
            touched += call is not None
        except Exception:
            db.rollback()
            logger.exception("WhatsApp call webhook failed for number %s, call %s", account.customer_id, raw.get("id"))
    for raw in value.get("statuses") or []:
        if not isinstance(raw, dict) or (raw.get("type") or "call") != "call":
            continue
        try:
            touched += _out_status(db, account, raw) is not None
        except Exception:
            db.rollback()
            logger.exception("WhatsApp call status failed for number %s, call %s", account.customer_id, raw.get("id"))
    return touched


def _locked(db: Session, account: WhatsAppAccount, wacid) -> WaCall | None:
    wacid = str(wacid or "")[:128]
    if not wacid:
        return None
    return (db.query(WaCall).filter(WaCall.wacid == wacid, WaCall.customer_id == account.customer_id)
            .with_for_update().first())


def _in_connect(db: Session, account: WhatsAppAccount, raw: dict, names: dict) -> WaCall | None:
    from app.modules.customer.contacts.service import to_wa_id
    from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation

    wacid = str(raw.get("id") or "")[:128]
    wa_id = "".join(ch for ch in str(raw.get("from") or "") if ch.isdigit()) or to_wa_id(db, raw.get("from"))
    if not wacid or not wa_id or db.query(WaCall.id).filter(WaCall.wacid == wacid).first():
        return None
    contact = get_or_create_contact(db, account.customer_id, wa_id, names.get(wa_id))
    conversation = get_or_create_conversation(db, contact)
    moment = now()
    call = WaCall(customer_id=account.customer_id, conversation_id=conversation.id, contact_id=contact.id,
                  wacid=wacid, direction="in", status="ringing", offer_sdp=(raw.get("session") or {}).get("sdp"),
                  ringing_ids=[], declined_ids=[], created_at=moment, updated_at=moment)
    db.add(call)
    db.flush()
    # a customer's call opens the 24-hour window, like a message
    if not conversation.last_inbound_at or moment > conversation.last_inbound_at:
        conversation.last_inbound_at = moment
    conversation.unread_count = (conversation.unread_count or 0) + 1
    conversation.waiting_since = conversation.waiting_since or moment
    if conversation.status == "resolved":
        conversation.status, conversation.resolved_at = "open", None
    _preview(conversation, INCOMING, "in")
    _event(db, conversation, "Incoming call")
    if contact.blocked:
        call.status, call.ended_at, call.ended_by = "declined", moment, "system"
        db.commit()
        _meta(db, call, "reject")
        return call
    call.ringing_ids = ring_audience(db, conversation)
    _grant_automatic(db, contact)
    db.commit()
    return call


def _mark_answered(db: Session, call: WaCall) -> None:
    if call.status in ("dialing", "ringing"):
        moment = now()
        call.status, call.answered_at, call.answered_by_id, call.updated_at = "answered", moment, \
            call.started_by_id, moment
        _event(db, _conversation(db, call), "Call answered", _person_name(db, call.started_by_id))
        contact = db.get(WaContact, call.contact_id)
        row = _permission(db, contact) if contact else None
        if row is not None:
            row.unanswered = 0


def _out_unanswered(db: Session, call: WaCall, status: str, ended_by: str, count: bool = True) -> None:
    moment = now()
    call.status, call.ended_at, call.ended_by, call.updated_at = status, moment, ended_by, moment
    conversation = _conversation(db, call)
    text = "📞 Declined call" if status == "rejected" else "📞 Call not answered"
    _event(db, conversation, text.removeprefix("📞 "), _person_name(db, call.started_by_id))
    if conversation is not None and conversation.last_message_type == "call" \
            and conversation.last_message_preview == OUTGOING:
        conversation.last_message_preview = text
    if count:
        _unanswered(db, call.contact_id)


def _out_connect(db: Session, account: WhatsAppAccount, raw: dict) -> WaCall | None:
    """Business-initiated connect: Meta hands over the customer's answer SDP so media can start while the phone
    rings. It only counts as answered on the ACCEPTED status."""
    call = _locked(db, account, raw.get("id"))
    if call is None or call.direction != "out":
        db.rollback()
        return None
    sdp = (raw.get("session") or {}).get("sdp")
    if sdp and call.status in OUT_LIVE:
        call.answer_sdp = sdp
    if call.status == "dialing":
        call.status = "ringing"
    call.updated_at = now()
    db.commit()
    return call


def _out_status(db: Session, account: WhatsAppAccount, raw: dict) -> WaCall | None:
    call = _locked(db, account, raw.get("id"))
    if call is None or call.direction != "out":
        db.rollback()
        return None
    state = (raw.get("status") or "").upper()
    if state == "RINGING" and call.status == "dialing":
        call.status, call.updated_at = "ringing", now()
    elif state == "ACCEPTED":
        _mark_answered(db, call)
    elif state == "REJECTED" and call.status in ("dialing", "ringing"):
        _out_unanswered(db, call, "rejected", "customer")
    db.commit()
    return call


def _reported_duration(raw: dict) -> int | None:
    try:
        if raw.get("duration") is not None:
            return max(0, int(raw["duration"]))
        if raw.get("start_time") and raw.get("end_time"):
            return max(0, int(raw["end_time"]) - int(raw["start_time"]))
    except (TypeError, ValueError):
        pass
    return None


def _terminate(db: Session, account: WhatsAppAccount, raw: dict) -> WaCall | None:
    call = _locked(db, account, raw.get("id"))
    if call is None:
        return None
    moment = now()
    failed = (raw.get("status") or "").upper() == "FAILED"
    errors = raw.get("errors") if isinstance(raw.get("errors"), list) else []
    error = errors[0] if errors and isinstance(errors[0], dict) else {}
    reported = _reported_duration(raw)
    conversation = _conversation(db, call)
    live = OUT_LIVE if call.direction == "out" else IN_LIVE
    if call.status not in live:
        if call.status == "ended" and reported is not None:
            call.duration = reported  # Meta's own count wins
        db.commit()
        return call
    if call.status == "answered":
        call.duration = reported if reported is not None else _seconds(moment - (call.answered_at or moment))
        call.ended_by = call.ended_by or "customer"
        call.status = "failed" if failed else "ended"
        _event(db, conversation, "Call ended" + _duration_text(call.duration))
    elif call.direction == "out":
        if failed:
            call.status, call.ended_by = "failed", "system"
            _event(db, conversation, "Call failed")
        else:
            _out_unanswered(db, call, "no_answer", "customer")
    else:
        call.status = "failed" if failed else "missed"
        call.ended_by = "system" if failed else "customer"
        call.claimed_by_id = call.claimed_at = None
        _event(db, conversation, "Missed call")
    if failed:
        call.error_code = error.get("code") if isinstance(error.get("code"), int) else None
        call.error_message = str(error.get("message") or error.get("title") or "The call failed.")[:500]
    call.ended_at, call.updated_at = call.ended_at or moment, moment
    db.commit()
    if call.status == "missed":
        _after_missed(db, call)
    return call


def _after_missed(db: Session, call: WaCall) -> None:
    """Once per missed incoming call: the follow-up message and a team alert."""
    from app.modules.customer.account import notify
    from app.modules.customer.inbox import service as inbox
    from app.shared.constants import customer_urls

    try:
        conversation = _conversation(db, call)
        if conversation is None:
            return
        if conversation.last_message_type == "call" and conversation.last_message_preview == INCOMING:
            conversation.last_message_preview = MISSED
        db.commit()
        contact = conversation.contact
        people = [p for p in (db.get(Customer, i) for i in call.ringing_ids or []) if p is not None]
        notify.notify(db, people, "missed_call", f"Missed WhatsApp call from {_name(contact)}", None,
                      customer_urls.conversation(conversation.id), {"conversation_id": conversation.id},
                      once_key=f"wacall:{call.id}", number_id=call.customer_id)
        db.commit()
        st = _settings(db, call.customer_id)
        if st is None or not st.followup_on or contact.blocked or contact.opted_out:
            return
        owner = db.get(Customer, call.customer_id)
        _, client = inbox._client(db, owner)
        text = (st.followup_text or DEFAULT_FOLLOWUP)[:1000]
        message = inbox._outbound(db, owner, conversation, sent_by=SENDER, type="text", text=text,
                                  payload={"request": {"type": "text", "text": {"body": text}},
                                           "wa_call_id": call.id})
        inbox._attempt(db, conversation, message, lambda: client.send_text(contact.wa_id, text), reopen=False)
    except Exception:  # the follow-up must never break webhook handling or the scheduler
        db.rollback()
        logger.exception("Missed-call follow-up failed for WhatsApp call %s", call.id)


def expire_due(db: Session) -> int:
    """Scheduler: claims left unanswered ring again; calls ringing too long become missed or not answered."""
    moment = now()
    _release_claims(db)
    stale_out = list(db.execute(
        update(WaCall).where(WaCall.direction == "out", WaCall.status.in_(("dialing", "ringing")),
                             WaCall.created_at < moment - OUT_STALE)
        .values(status="ringing", updated_at=moment).returning(WaCall.id)).scalars())
    db.commit()
    for call_id in stale_out:
        call = db.get(WaCall, call_id)
        _out_unanswered(db, call, "no_answer", "system")
        db.commit()
        _meta(db, call, "terminate")
    missed = list(db.execute(
        update(WaCall).where(WaCall.direction == "in", WaCall.status.in_(("ringing", "answering")),
                             WaCall.created_at < moment - RING)
        .values(status="missed", ended_at=moment, ended_by="system", claimed_by_id=None, claimed_at=None,
                updated_at=moment).returning(WaCall.id)).scalars())
    db.commit()
    for call_id in missed:
        call = db.get(WaCall, call_id)
        _event(db, _conversation(db, call), "Missed call")
        db.commit()
        _after_missed(db, call)
    return len(stale_out) + len(missed)


def _release_claims(db: Session) -> None:
    moment = now()
    db.execute(update(WaCall).where(WaCall.status == "answering", WaCall.claimed_at < moment - CLAIM)
               .values(status="ringing", claimed_by_id=None, claimed_at=None, updated_at=moment))
    db.commit()


# the team's side --------------------------------------------------------------------------------

def serialize(db: Session, call: WaCall, me: int | None = None) -> dict:
    contact = db.get(WaContact, call.contact_id)
    return {
        "id": call.id, "conversation_id": call.conversation_id, "direction": call.direction, "status": call.status,
        "contact": {"name": _name(contact), "phone": f"+{contact.wa_id}"} if contact else None,
        "created_at": iso(call.created_at), "answered_at": iso(call.answered_at), "ended_at": iso(call.ended_at),
        "duration": call.duration, "error": call.error_message,
        "answered_by": {"id": call.answered_by_id, "name": _person_name(db, call.answered_by_id)}
        if call.answered_by_id else None,
        "mine": me is not None and me in (call.answered_by_id, call.claimed_by_id, call.started_by_id),
        # the customer's answer to our offer, for the person who placed the call
        "answer_sdp": call.answer_sdp if call.direction == "out" and me == call.started_by_id else None,
    }


def _get(db: Session, ws: Customer, call_id: int, lock: bool = False) -> WaCall:
    q = db.query(WaCall).filter(WaCall.id == call_id, WaCall.customer_id == ws.id)
    call = (q.with_for_update() if lock else q).first()
    if call is None:
        raise HTTPException(404, detail="Call not found")
    return call


def _rings_me(ws: Customer, call: WaCall) -> bool:
    return actor(ws).id in (call.ringing_ids or [])


def ringing(db: Session, ws: Customer) -> dict:
    """What the browser shows: calls ringing for me, and my own live call."""
    me = actor(ws).id
    on = calling_on(db, ws.id)
    if not on:
        return {"status": True, "data": {"enabled": False, "ringing": [], "active": None}}
    _release_claims(db)
    since = now() - LIVE
    calls = (db.query(WaCall).filter(WaCall.customer_id == ws.id, WaCall.created_at >= since,
                                     WaCall.status.in_(("ringing", "answering", "answered", "dialing")))
             .order_by(WaCall.id.desc()).limit(20).all())
    rings = [serialize(db, c, me) for c in calls if c.direction == "in" and c.status in ("ringing", "answering")
             and me in (c.ringing_ids or []) and me not in (c.declined_ids or [])
             and (c.status == "ringing" or c.claimed_by_id == me)]
    active = next((c for c in calls if (c.answered_by_id == me and c.status == "answered")
                   or (c.direction == "out" and c.started_by_id == me and c.status in OUT_LIVE)), None)
    return {"status": True, "data": {"enabled": True, "ringing": rings,
                                     "active": serialize(db, active, me) if active else None}}


def get_call(db: Session, ws: Customer, call_id: int) -> dict:
    return {"status": True, "data": serialize(db, _get(db, ws, call_id), actor(ws).id)}


def claim(db: Session, ws: Customer, call_id: int) -> dict:
    """I'm answering: the call stops ringing for the others while my browser sets up audio."""
    if not can_reply(ws):
        raise HTTPException(403, detail="Your role can't answer calls")
    _release_claims(db)
    call = _get(db, ws, call_id)
    me = actor(ws).id
    if not _rings_me(ws, call) or me in (call.declined_ids or []):
        raise HTTPException(404, detail="Call not found")
    moment = now()
    got = db.execute(update(WaCall).where(WaCall.id == call.id, or_(
        WaCall.status == "ringing", and_(WaCall.status == "answering", WaCall.claimed_by_id == me)))
        .values(status="answering", claimed_by_id=me, claimed_at=moment, updated_at=moment)
        .returning(WaCall.id)).first()
    db.commit()
    db.refresh(call)
    if got is None:
        raise HTTPException(409, detail="Someone else answered this call" if call.status in IN_LIVE
                            else "This call has already ended")
    return {"status": True, "data": {"id": call.id, "offer_sdp": call.offer_sdp}}


def _gone(exc: WhatsAppError) -> bool:
    text = f"{exc} {exc.details or ''}".lower()
    return exc.status == 404 or any(w in text for w in ("terminated", "not found", "no longer", "already ended",
                                                        "expired", "does not exist"))


def answer(db: Session, ws: Customer, call_id: int, sdp: str) -> dict:
    call = _get(db, ws, call_id, lock=True)
    me = actor(ws).id
    if call.status not in IN_LIVE:
        db.rollback()
        raise HTTPException(409, detail="This call has already ended")
    if not ((call.status == "answering" and call.claimed_by_id == me) or (call.status == "ringing" and _rings_me(ws, call))):
        db.rollback()
        raise HTTPException(409, detail="Someone else answered this call")
    call.status, call.claimed_by_id, call.claimed_at = "answering", me, now()
    db.commit()
    try:
        _client(db, ws.id).answer_call(call.wacid, sdp)
    except WhatsAppError as exc:
        if _gone(exc):
            call.status, call.ended_at, call.ended_by = "failed", now(), "system"
            call.error_code, call.error_message = exc.code, (exc.details or str(exc))[:500]
            db.commit()
            raise HTTPException(422, detail="This call has already ended") from exc
        raise HTTPException(422, detail=f"WhatsApp couldn't connect the call: {exc.details or exc}") from exc
    moment = now()
    call.status, call.answered_by_id, call.answered_at, call.answer_sdp, call.updated_at = \
        "answered", me, moment, sdp, moment
    conversation = _conversation(db, call)
    _event(db, conversation, "Call answered", actor_name(ws))
    if conversation.assignee_id is None:  # whoever answers handles the chat
        assigning.assign(db, ws, conversation, me, conversation.team_id, actor_name(ws))
    conversation.waiting_since = None
    db.commit()
    return {"status": True, "message": "Connected", "data": serialize(db, call, me)}


def decline(db: Session, ws: Customer, call_id: int) -> dict:
    call = _get(db, ws, call_id, lock=True)
    me = actor(ws).id
    if not _rings_me(ws, call):
        db.rollback()
        raise HTTPException(404, detail="Call not found")
    declined = list(call.declined_ids or [])
    if me not in declined:
        declined.append(me)
        call.declined_ids = declined
    # everyone it rang for declined: end it for the customer too
    everyone = not (set(call.ringing_ids or []) - set(declined))
    became = everyone and call.status == "ringing"
    if became:
        call.status, call.ended_at, call.ended_by = "declined", now(), "team"
        _event(db, _conversation(db, call), "Call declined", actor_name(ws))
    call.updated_at = now()
    db.commit()
    if became:
        _meta(db, call, "reject")
        _after_missed(db, call)
    return {"status": True, "data": serialize(db, call, me)}


def hangup(db: Session, ws: Customer, call_id: int) -> dict:
    call = _get(db, ws, call_id, lock=True)
    me = actor(ws).id
    if call.direction == "out" and call.status in ("dialing", "ringing"):
        if call.started_by_id != me:
            db.rollback()
            raise HTTPException(403, detail="Only the person on the call can hang up")
        _out_unanswered(db, call, "no_answer", "team", count=False)  # gave up before they picked up
        db.commit()
        _meta(db, call, "terminate")
        return {"status": True, "data": serialize(db, call, me)}
    if call.status == "answering" and call.claimed_by_id == me:  # gave up before it connected: ring again
        call.status, call.claimed_by_id, call.claimed_at = "ringing", None, None
        db.commit()
        return {"status": True, "data": serialize(db, call, me)}
    if call.answered_by_id != me:
        db.rollback()
        raise HTTPException(403, detail="Only the person on the call can hang up")
    if call.status != "answered":
        db.rollback()
        return {"status": True, "data": serialize(db, call, me)}
    moment = now()
    call.status, call.ended_at, call.ended_by, call.updated_at = "ended", moment, "team", moment
    call.duration = _seconds(moment - (call.answered_at or moment))
    _event(db, _conversation(db, call), "Call ended" + _duration_text(call.duration), actor_name(ws))
    db.commit()
    _meta(db, call, "terminate")
    return {"status": True, "data": serialize(db, call, me)}


def start(db: Session, ws: Customer, conversation: WaConversation, sdp: str) -> dict:
    """Calls a customer who allowed calls. The answer SDP arrives by webhook; the browser polls get_call."""
    if not can_reply(ws):
        raise HTTPException(403, detail="Your role can't make calls")
    contact = conversation.contact
    name = _name(contact)
    state = permission_state(db, ws, conversation)
    if not state["can_call"]:
        raise HTTPException(422, detail=state["reason"] or f"{name} can't be called right now")
    me = actor(ws).id
    since = now() - LIVE
    if db.query(WaCall.id).filter(WaCall.contact_id == contact.id, WaCall.created_at >= since,
                                  WaCall.status.in_(("dialing", "ringing", "answering", "answered"))).first():
        raise HTTPException(409, detail=f"{name} is already on a call with you")
    if db.query(WaCall.id).filter(WaCall.customer_id == ws.id, WaCall.created_at >= since, or_(
            and_(WaCall.started_by_id == me, WaCall.status.in_(OUT_LIVE)),
            and_(WaCall.answered_by_id == me, WaCall.status == "answered"))).first():
        raise HTTPException(409, detail="You're already on a call. Hang up first.")
    moment = now()
    call = WaCall(customer_id=ws.id, conversation_id=conversation.id, contact_id=contact.id,
                  wacid=f"pending-{uuid.uuid4().hex}", direction="out", status="dialing", offer_sdp=sdp,
                  ringing_ids=[], declined_ids=[], started_by_id=me, created_at=moment, updated_at=moment)
    db.add(call)
    db.flush()
    _event(db, conversation, "Outgoing call", actor_name(ws))
    _preview(conversation, OUTGOING, "out")
    db.commit()
    try:
        data = _client(db, ws.id).start_call(contact.wa_id, sdp, f"chatdesk-call-{call.id}")
        wacid = str(((data or {}).get("calls") or [{}])[0].get("id") or "")
        if not wacid:
            raise WhatsAppError("WhatsApp didn't return a call id")
    except WhatsAppError as exc:
        plain = OUT_ERRORS.get(exc.code)
        message = plain.format(name=name) if plain else f"WhatsApp couldn't place the call: {exc.details or exc}"
        call.status, call.ended_at, call.ended_by = "failed", now(), "system"
        call.error_code, call.error_message = exc.code, message[:500]
        _event(db, conversation, "Call failed")
        if exc.code == 138006:  # Meta says there's no permission after all
            row = _permission(db, contact, create=True)
            row.status, row.expires_at = "none", None
        db.commit()
        raise HTTPException(422, detail=message) from exc
    call.wacid = wacid[:128]
    db.commit()
    return {"status": True, "message": f"Calling {name}…", "data": serialize(db, call, me)}


# settings ---------------------------------------------------------------------------------------

def _meta_calling(enabled: bool) -> dict:
    if not enabled:
        return {"status": "DISABLED"}
    # callback permission on: a customer who calls can be called back for 7 days
    return {"status": "ENABLED", "call_icon_visibility": "DEFAULT", "callback_permission_status": "ENABLED"}


def serialize_settings(st: WaCallSettings | None) -> dict:
    return {"enabled": bool(st and st.enabled), "followup_on": st.followup_on if st else True,
            "followup_text": (st.followup_text if st else None) or DEFAULT_FOLLOWUP,
            "permission_text": (st.permission_text if st else None) or DEFAULT_PERMISSION,
            "synced_at": iso(st.synced_at) if st else None, "sync_error": st.sync_error if st else None}


def get_settings(db: Session, ws: Customer) -> dict:
    return {"status": True, "data": serialize_settings(_settings(db, ws.id))}


def save_settings(db: Session, ws: Customer, payload) -> dict:
    st = _settings(db, ws.id)
    if st is None:
        st = WaCallSettings(customer_id=ws.id, enabled=False)
        db.add(st)
    changed = st.enabled != payload.enabled or st.synced_at is None
    st.enabled, st.followup_on = payload.enabled, payload.followup_on
    st.followup_text = (payload.followup_text or "").strip()[:1000] or None
    st.permission_text = (payload.permission_text or "").strip()[:1024] or None
    if changed or payload.enabled:
        client = _client(db, ws.id, required=False)
        if client is None:
            st.sync_error = "Connect a working WhatsApp number first."
        else:
            try:
                client.set_calling(_meta_calling(payload.enabled))
            except WhatsAppError as exc:
                st.sync_error = SYNC_ERRORS.get(exc.code) or f"WhatsApp said: {exc.details or exc}"[:500]
            else:
                st.synced_at, st.sync_error = now(), None
    db.commit()
    message = "WhatsApp calling saved" if not st.sync_error else "Saved, but WhatsApp didn't accept it. See below."
    return {"status": True, "message": message, "data": serialize_settings(st)}
