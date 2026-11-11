"""Phone calls through the business's own provider account (Exotel), and what happens after each one:
a WhatsApp message for an answered or a missed call (the business picks both in Calls → Settings) and a
copy of the recording kept here.

Flow: the provider calls our callback URL → `receive()` records the call id and answers at once →
`refresh()` (in the background) reads the call back from the provider with the business's credentials,
decides the outcome and sends the follow-up → `save_recording()` downloads the recording. The scheduler's
`calls` job (`run_due()`) retries anything a lost callback or a slow recording left behind.
"""
import logging
import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR, settings as app_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.calls.models import CallLog, CallSettings, default_rule
from app.modules.customer.calls.schemas import ConnectionSchema, SettingsSchema, StartCallSchema
from app.modules.customer.inbox.models import WaContact
from app.modules.customer.team.access import actor
from app.services.voice import GATEWAYS, CallReport, VoiceError, VoiceGateway
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now, to_site
from app.shared.utils.search import search_clause

logger = logging.getLogger(__name__)

RECORDINGS_DIR = STORAGE_DIR / "call-recordings"
SENDER = "Calls"
GIVE_UP_AFTER = timedelta(hours=24)  # a call the provider never finished reporting
RECHECK_AFTER = timedelta(minutes=3)
MAX_RECORDING_TRIES = 8
PLACEHOLDERS = ("name", "business", "time", "duration")


# settings ---------------------------------------------------------------------------------------

def _settings(db: Session, customer_id: int) -> CallSettings | None:
    return db.query(CallSettings).filter(CallSettings.customer_id == customer_id).first()


def _gateway(st: CallSettings) -> VoiceGateway:
    gateway = GATEWAYS.get(st.provider)
    if gateway is None:
        raise VoiceError(f"Unknown calling provider: {st.provider}")
    return gateway


def _config(st: CallSettings) -> dict:
    """The saved provider config with secrets decrypted."""
    gateway = _gateway(st)
    secret = {f.name for f in gateway.fields if f.secret}
    return {k: (decrypt_secret(v) if k in secret else v) for k, v in (st.config or {}).items()}


def callback_url(st: CallSettings) -> str:
    return f"{app_settings.APP_URL.rstrip('/')}/api/v1/website/calls/webhook/{st.webhook_key}"


def _new_settings(db: Session, customer: Customer) -> CallSettings:
    st = CallSettings(customer_id=customer.id, webhook_key=secrets.token_urlsafe(24), config={},
                      answered=default_rule(), missed=default_rule())
    db.add(st)
    db.flush()
    return st


def _rule(value) -> dict:
    return {**default_rule(), **(value or {})}


def serialize_settings(st: CallSettings | None) -> dict:
    providers = [g.spec() for g in GATEWAYS.values()]
    if st is None:
        return {"connected": False, "provider": "exotel", "providers": providers, "config": {}, "status": None,
                "last_error": None, "last_event_at": None, "callback_url": None,
                "answered": default_rule(), "missed": default_rule(), "min_answered_seconds": 5,
                "record_calls": True, "save_recordings": True, "agent_number": None}
    gateway = GATEWAYS.get(st.provider)
    config = {}
    for f in gateway.fields if gateway else ():
        value = (st.config or {}).get(f.name)
        config[f.name] = bool(value) if f.secret else (value or f.default)
    return {
        "connected": st.status == "connected",
        "provider": st.provider,
        "providers": providers,
        "config": config,  # secret fields come back as true/false (saved or not)
        "status": st.status,
        "last_error": st.last_error,
        "last_event_at": iso(st.last_event_at),
        "callback_url": callback_url(st),
        "answered": _rule(st.answered),
        "missed": _rule(st.missed),
        "min_answered_seconds": st.min_answered_seconds,
        "record_calls": st.record_calls,
        "save_recordings": st.save_recordings,
        "agent_number": st.agent_number,
    }


def get_settings(db: Session, customer: Customer) -> dict:
    return {"status": True, "data": serialize_settings(_settings(db, customer.id))}


def save_connection(db: Session, customer: Customer, payload: ConnectionSchema) -> dict:
    gateway = GATEWAYS.get(payload.provider)
    if gateway is None:
        raise field_error(422, "provider", "Choose a calling provider")
    st = _settings(db, customer.id) or _new_settings(db, customer)
    if st.provider != payload.provider:
        st.config = {}
    st.provider = payload.provider
    saved = dict(st.config or {})
    errors: dict[str, list[str]] = {}
    for f in gateway.fields:
        value = (payload.config.get(f.name) or "").strip()
        if f.secret:
            if value:
                saved[f.name] = encrypt_secret(value)
        else:
            saved[f.name] = value or f.default or None
        if f.options and saved.get(f.name) not in {v for v, _ in f.options}:
            errors[f"config.{f.name}"] = ["Choose one of the options"]
        if f.required and not saved.get(f.name):
            errors[f"config.{f.name}"] = [f"Enter the {f.label}"]
    if errors:
        db.rollback()
        raise HTTPException(422, detail={"errors": errors})
    st.config = saved
    try:
        gateway.check(_config(st))
        st.status, st.last_error = "connected", None
    except VoiceError as exc:
        st.status, st.last_error = "error", str(exc)
    db.commit()
    message = (f"{gateway.label} connected" if st.status == "connected"
               else f"Saved, but {gateway.label} rejected the details. See the error below.")
    return {"status": True, "message": message, "data": serialize_settings(st)}


def _check_rule(db: Session, customer: Customer, key: str, rule) -> None:
    from app.modules.customer.templates import builder
    from app.modules.customer.templates import service as templates_service
    from app.modules.customer.templates.models import WaTemplate

    if rule.template_id is not None:
        template = db.get(WaTemplate, rule.template_id)
        if template is None or template.customer_id != customer.id:
            raise field_error(422, f"{key}.template_id", "That template doesn't exist")
        needs = builder.send_params(templates_service.form_of(template))
        if needs["buttons"]:
            raise field_error(422, f"{key}.template_id",
                              "This template has a button that needs its own value. Choose one without.")
    if rule.on and not rule.text and rule.template_id is None:
        raise field_error(422, f"{key}.text", "Write a message, choose a template, or turn this off")


def save_settings(db: Session, customer: Customer, payload: SettingsSchema) -> dict:
    _check_rule(db, customer, "answered", payload.answered)
    _check_rule(db, customer, "missed", payload.missed)
    st = _settings(db, customer.id) or _new_settings(db, customer)
    st.answered = payload.answered.model_dump()
    st.missed = payload.missed.model_dump()
    st.min_answered_seconds = payload.min_answered_seconds
    st.record_calls = payload.record_calls
    st.save_recordings = payload.save_recordings
    st.agent_number = payload.agent_number
    db.commit()
    return {"status": True, "message": "Call settings saved", "data": serialize_settings(st)}


def disconnect(db: Session, customer: Customer) -> dict:
    st = _settings(db, customer.id)
    if st is not None:
        st.config, st.status, st.last_error = {}, "pending", None
        st.webhook_key = secrets.token_urlsafe(24)  # the old callback URL stops working
        db.commit()
    return {"status": True, "message": "Calling provider disconnected", "data": serialize_settings(st)}


# call log ---------------------------------------------------------------------------------------

def _plus(number: str | None) -> str | None:
    if not number:
        return None
    return number if number.startswith("+") else f"+{number}"


def serialize_call(log: CallLog) -> dict:
    contact = log.contact
    return {
        "id": log.id,
        "provider": log.provider,
        "call_sid": log.call_sid,
        "direction": log.direction,
        "from_number": log.from_number,
        "to_number": log.to_number,
        "customer_number": _plus(log.customer_number),
        "contact": ({"id": contact.id, "name": contact.name or contact.profile_name or f"+{contact.wa_id}"}
                    if contact else None),
        "outcome": log.outcome,
        "provider_status": log.provider_status,
        "duration": log.duration,
        "started_at": iso(log.started_at),
        "ended_at": iso(log.ended_at),
        "follow_up": log.follow_up,
        "follow_up_note": log.follow_up_note,
        "recording": {"status": log.recording_status, "available": log.recording_status == "saved",
                      "size": log.recording_size},
        "created_at": iso(log.created_at),
    }


def list_calls(db: Session, customer: Customer, page=None, per_page=None, search=None, outcome=None,
               direction=None) -> dict:
    query = db.query(CallLog).filter(CallLog.customer_id == customer.id)
    if outcome:
        query = query.filter(CallLog.outcome == outcome)
    if direction:
        query = query.filter(CallLog.direction == direction)
    if search:
        digits = "".join(ch for ch in search if ch.isdigit())
        by_name = search_clause([WaContact.name, WaContact.profile_name], search)
        clauses = [c for c in (by_name, CallLog.customer_number.contains(digits) if len(digits) >= 3 else None)
                   if c is not None]
        if clauses:
            query = query.outerjoin(WaContact, WaContact.id == CallLog.contact_id).filter(or_(*clauses))
    query = query.order_by(CallLog.created_at.desc(), CallLog.id.desc())
    return list_response(query, serialize_call, page, per_page or (None if page is None else 25), search)


def _recording_path(log: CallLog) -> Path:
    return RECORDINGS_DIR / str(log.customer_id) / (log.recording_file or f"{log.id}.mp3")


def recording(db: Session, customer: Customer, call_id: int, download: bool = False) -> FileResponse:
    log = db.query(CallLog).filter(CallLog.id == call_id, CallLog.customer_id == customer.id).first()
    if log is None or log.recording_status != "saved" or not _recording_path(log).exists():
        raise HTTPException(404, detail="Recording not found")
    return FileResponse(_recording_path(log), media_type="audio/mpeg",
                        filename=f"call-{log.id}.mp3",
                        content_disposition_type="attachment" if download else "inline",
                        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


def start_call(db: Session, customer: Customer, payload: StartCallSchema) -> dict:
    from app.modules.customer.contacts.service import to_wa_id

    st = _settings(db, customer.id)
    if st is None or st.status != "connected":
        raise HTTPException(422, detail="Connect your calling provider in Calls → Settings first")
    agent = payload.agent_number or st.agent_number
    if not agent:
        raise field_error(422, "agent_number", "Enter the phone that should ring first, or set a default in "
                                               "Calls → Settings")
    customer_number = to_wa_id(db, payload.to) or payload.to
    gateway = _gateway(st)
    try:
        sid = gateway.start_call(_config(st), agent=to_wa_id(db, agent) or agent, customer=customer_number,
                                 callback_url=callback_url(st), record=st.record_calls)
    except VoiceError as exc:
        raise field_error(422, "to", str(exc)) from exc
    contact = db.query(WaContact).filter(WaContact.customer_id == customer.id,
                                         WaContact.wa_id == customer_number).first()
    log = CallLog(customer_id=customer.id, provider=st.provider, call_sid=sid, direction="outbound",
                  customer_number=customer_number, contact_id=contact.id if contact else None,
                  started_by_id=actor(customer).id, started_at=now())
    db.add(log)
    db.commit()
    return {"status": True, "message": "Calling… your phone rings first", "data": serialize_call(log)}


# provider callbacks -------------------------------------------------------------------------------

def receive(db: Session, webhook_key: str, params: dict) -> tuple[int, str, int | None]:
    """Records that the provider reported on a call. Returns (http status, message, call log id to refresh)."""
    st = db.query(CallSettings).filter(CallSettings.webhook_key == webhook_key).first()
    if st is None:
        return 404, "Unknown callback URL", None
    gateway = GATEWAYS.get(st.provider)
    sid = gateway.call_sid(params) if gateway else None
    if not sid:
        return 400, "No call id", None
    log = _log_for(db, st, sid)
    log.payload = {k: params[k] for k in list(params)[:60]}  # kept for debugging, never trusted
    st.last_event_at = now()
    db.commit()
    return 200, "Received", log.id


def _log_for(db: Session, st: CallSettings, sid: str) -> CallLog:
    query = db.query(CallLog).filter(CallLog.customer_id == st.customer_id, CallLog.call_sid == sid)
    log = query.first()
    if log is not None:
        return log
    log = CallLog(customer_id=st.customer_id, provider=st.provider, call_sid=sid)
    db.add(log)
    try:
        db.flush()
    except IntegrityError:  # the same call reported twice at once
        db.rollback()
        log = query.first()
        if log is None:
            raise
    return log


def refresh(db: Session, log: CallLog, params: dict | None = None) -> None:
    """Reads the call back from the provider, then sends the follow-up and saves the recording once."""
    st = _settings(db, log.customer_id)
    if st is None or st.status == "pending":
        return
    try:
        report = _gateway(st).fetch(_config(st), log.call_sid, params)
    except VoiceError as exc:
        logger.warning("Call %s: couldn't read it from %s: %s", log.id, st.provider, exc)
        log.updated_at = now()
        db.commit()
        return
    _apply(db, st, log, report)
    db.commit()
    if log.outcome != "pending":
        follow_up(db, st, log)
    if log.recording_status == "pending" and log.recording_attempts == 0:
        save_recording(db, st, log)


def _apply(db: Session, st: CallSettings, log: CallLog, report: CallReport) -> None:
    from app.modules.customer.contacts.service import to_wa_id

    log.direction = report.direction
    log.from_number, log.to_number = report.from_number, report.to_number
    log.provider_status = report.provider_status
    log.duration = report.duration
    log.started_at = report.started_at or log.started_at
    log.ended_at = report.ended_at or log.ended_at
    log.payload = {**(log.payload or {}), "report": report.raw}
    if report.customer_number and not log.customer_number:
        log.customer_number = to_wa_id(db, report.customer_number) or report.customer_number.lstrip("+")
    if log.contact_id is None and log.customer_number:
        contact = db.query(WaContact).filter(WaContact.customer_id == log.customer_id,
                                             WaContact.wa_id == log.customer_number).first()
        log.contact_id = contact.id if contact else None
    if report.recording_url and st.save_recordings and log.recording_status == "none":
        log.recording_url, log.recording_status = report.recording_url, "pending"
    if report.ended and log.outcome == "pending":
        if not report.customer_rung:
            log.outcome = "not_connected"
        elif report.answered and report.duration >= (st.min_answered_seconds or 0):
            log.outcome = "answered"
        else:
            log.outcome = "missed"
        log.ended_at = log.ended_at or now()


# the WhatsApp message after a call ----------------------------------------------------------------

def _duration_text(seconds: int) -> str:
    minutes, rest = divmod(max(0, seconds), 60)
    return f"{minutes} min {rest} sec" if minutes else f"{rest} sec"


def _values(db: Session, owner: Customer, log: CallLog, contact: WaContact) -> dict[str, str]:
    first = (contact.name or contact.profile_name or "there").split()[0]
    when = to_site(log.ended_at or log.started_at or now())
    return {"name": first, "business": owner.business_name or owner.name or "us",
            "time": when.strftime("%d %b, %I:%M %p") if when else "-", "duration": _duration_text(log.duration)}


def _fill(text: str, values: dict[str, str]) -> str:
    for key in PLACEHOLDERS:
        text = text.replace("{" + key + "}", values[key])
    return text


def _claim(db: Session, log: CallLog) -> bool:
    """Marks the call handled. False when another worker got there first (callbacks come in pairs)."""
    done = db.execute(update(CallLog).where(CallLog.id == log.id, CallLog.processed_at.is_(None))
                      .values(processed_at=now()))
    db.commit()
    db.refresh(log)
    return done.rowcount == 1


def _finish(db: Session, log: CallLog, status: str, note: str, message_id: int | None = None) -> None:
    log.follow_up, log.follow_up_note, log.follow_up_message_id = status, note, message_id
    db.commit()


def follow_up(db: Session, st: CallSettings, log: CallLog) -> None:
    if log.outcome not in ("answered", "missed", "not_connected", "unknown") or not _claim(db, log):
        return
    if log.outcome not in ("answered", "missed"):
        return _finish(db, log, "skipped", "The customer's phone didn't ring" if log.outcome == "not_connected"
                       else "The provider never reported how the call ended")
    rule = _rule(st.answered if log.outcome == "answered" else st.missed)
    if not rule["on"]:
        return _finish(db, log, "skipped", f"Messages after {log.outcome} calls are turned off")
    if not log.customer_number:
        return _finish(db, log, "skipped", "The provider didn't share the customer's number")
    try:
        status, note, message_id = _send(db, st, log, rule)
    except HTTPException as exc:
        status, note, message_id = "failed", str(exc.detail if isinstance(exc.detail, str) else exc.detail), None
    except Exception as exc:  # never let one call's message break the callback or the scheduler
        logger.exception("Call %s: the follow-up message failed", log.id)
        status, note, message_id = "failed", f"Unexpected error: {exc}", None
    _finish(db, log, status, note, message_id)


def _send(db: Session, st: CallSettings, log: CallLog, rule: dict) -> tuple[str, str, int | None]:
    from app.modules.customer.inbox import service as inbox
    from app.modules.customer.inbox.processor import get_or_create_contact, get_or_create_conversation
    from app.modules.customer.templates import builder
    from app.modules.customer.templates import service as templates_service
    from app.modules.customer.templates.models import WaTemplate

    owner = db.get(Customer, log.customer_id)
    _, client = inbox._client(db, owner)  # raises when WhatsApp isn't connected
    contact = get_or_create_contact(db, owner.id, log.customer_number)
    log.contact_id = contact.id
    if contact.blocked or contact.opted_out:
        db.commit()
        return "skipped", "This contact is blocked or opted out of messages", None
    conversation = get_or_create_conversation(db, contact)
    values = _values(db, owner, log, contact)

    if rule["text"] and inbox.window_open(conversation):
        text = _fill(rule["text"], values)
        request = {"type": "text", "text": {"body": text, "preview_url": True}}
        message = inbox._outbound(db, owner, conversation, sent_by=SENDER, type="text", text=text,
                                  payload={"request": request, "call_id": log.id})
        result = inbox._attempt(db, conversation, message, lambda: client.send_text(contact.wa_id, text),
                                reopen=False)
        return ("sent" if message.status == "sent" else "failed"), result, message.id

    template = db.get(WaTemplate, rule["template_id"]) if rule["template_id"] else None
    if template is None or template.customer_id != owner.id:
        db.commit()
        return "skipped", "The 24-hour chat window is closed and no template is chosen", None
    if template.status != "approved":
        db.commit()
        return "failed", f"Template “{template.name}” isn't approved on WhatsApp", None
    needs = builder.send_params(templates_service.form_of(template))
    ordered = [values[k] for k in PLACEHOLDERS]
    body = (ordered + ["-"] * 10)[:len(needs["body"])]
    header = (ordered + ["-"] * 10)[:len(needs["header"])]
    prepared = inbox.prepare_template(db, owner, client, template, header=header, body=body, buttons={})
    message, result = inbox.send_prepared(db, owner, conversation, template, prepared, client, sent_by=SENDER,
                                          campaign=None)
    return ("sent" if message.status == "sent" else "failed"), result, message.id


# recordings ---------------------------------------------------------------------------------------

def save_recording(db: Session, st: CallSettings, log: CallLog) -> None:
    if not log.recording_url or log.recording_status not in ("pending", "failed"):
        return
    log.recording_attempts += 1
    try:
        content, _ = _gateway(st).download(_config(st), log.recording_url)
    except VoiceError as exc:
        log.recording_status = "failed" if log.recording_attempts >= MAX_RECORDING_TRIES else "pending"
        log.updated_at = now()
        db.commit()
        logger.info("Call %s: recording not saved yet (%s)", log.id, exc)
        return
    log.recording_file = f"{log.id}.mp3"
    path = _recording_path(log)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    log.recording_size = len(content)
    log.recording_status = "saved"
    db.commit()


# scheduler ----------------------------------------------------------------------------------------

def run_due(db: Session, limit: int = 50) -> tuple[int, int, int]:
    """(calls re-checked, recordings saved, calls given up). Catches what callbacks missed."""
    moment = now()
    checked = saved = given_up = 0
    stale = (db.query(CallLog).filter(CallLog.outcome == "pending", CallLog.updated_at < moment - RECHECK_AFTER)
             .order_by(CallLog.updated_at).limit(limit).all())
    for log in stale:
        if log.created_at < moment - GIVE_UP_AFTER:
            log.outcome = "unknown"
            db.commit()
            st = _settings(db, log.customer_id)
            if st is not None:
                follow_up(db, st, log)
            given_up += 1
            continue
        refresh(db, log)
        checked += 1
    # a message the callback couldn't finish (the server restarted mid-way)
    unsent = (db.query(CallLog).filter(CallLog.outcome.in_(("answered", "missed")), CallLog.processed_at.is_(None),
                                       CallLog.updated_at < moment - RECHECK_AFTER).limit(limit).all())
    for log in unsent:
        st = _settings(db, log.customer_id)
        if st is not None:
            follow_up(db, st, log)
    recordings = (db.query(CallLog).filter(CallLog.recording_status == "pending",
                                           CallLog.recording_attempts < MAX_RECORDING_TRIES)
                  .order_by(CallLog.updated_at).limit(limit).all())
    for log in recordings:
        # back off: 1, 2, 4 ... minutes between tries
        if log.updated_at > moment - timedelta(minutes=2 ** min(log.recording_attempts, 7)):
            continue
        st = _settings(db, log.customer_id)
        if st is None or not st.save_recordings:
            continue
        save_recording(db, st, log)
        saved += log.recording_status == "saved"
    return checked, saved, given_up
