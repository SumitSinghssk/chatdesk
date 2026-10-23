"""Automatic replies: decides what (if anything) answers an incoming message, and sends it.

Order: opt-out / opt-in keywords, then chatbots (one running in the chat, or one the message starts; see
chatbots/engine.py), then keyword rules (first match, in the order set on the page),
then the welcome reply (first message ever), the away reply (outside office hours) and finally the
default reply when nothing else answered. Each rule's cooldown keeps a person from getting the same
automatic reply again and again.
"""

import logging
import mimetypes
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.automation.models import WaAutoReply, WaAutoReplyHit
from app.modules.customer.automation.schemas import DAYS, SettingsSchema
from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage
from app.services.whatsapp import WhatsAppClient, WhatsAppError
from app.shared.enums import Status
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)
SENDER = "Auto-reply"
STALE = timedelta(hours=1)  # don't answer messages Meta delivered very late
MEDIA_ID_DAYS = 25
NAME = re.compile(r"\{\{\s*(first_name|name)\s*\}\}", re.I)


def settings_of(owner: Customer) -> dict:
    return SettingsSchema(**(owner.automation_settings or {})).model_dump()


def is_open(rules: dict, at: datetime | None = None) -> bool:
    """Is the business within its office hours at `at` (UTC, naive)?"""
    zone = ZoneInfo(rules.get("timezone") or "Asia/Kolkata")
    local = (at or now()).replace(tzinfo=timezone.utc).astimezone(zone)
    day = rules["hours"][DAYS[local.weekday()]]
    if not day["open"]:
        return False
    hhmm = local.strftime("%H:%M")
    start, end = day["start"], day["end"]
    return start <= hhmm < end if start <= end else (hhmm >= start or hhmm < end)  # overnight hours


def nobody_available(db: Session, owner_id: int) -> bool:
    return not db.query(Customer.id).filter(
        (Customer.id == owner_id) | (Customer.workspace_id == owner_id), Customer.not_deleted(),
        Customer.status == Status.ACTIVE.value, Customer.availability == "available").first()


def keyword_matches(rule: WaAutoReply, text: str) -> bool:
    text = " ".join(text.lower().split())
    for kw in rule.keywords or []:
        if rule.match == "exact" and text == kw:
            return True
        if rule.match == "starts_with" and text.startswith(kw):
            return True
        if rule.match == "contains" and re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", text):
            return True
    return False


def _cooled(db: Session, rule: WaAutoReply, contact: WaContact | None, at: datetime) -> bool:
    """True when the rule may answer this person again."""
    if contact is None or not rule.cooldown_minutes:
        return True
    last = db.query(func.max(WaAutoReplyHit.created_at)).filter(
        WaAutoReplyHit.rule_id == rule.id, WaAutoReplyHit.contact_id == contact.id).scalar()
    return last is None or last <= at - timedelta(minutes=rule.cooldown_minutes)


def decide(db: Session, owner: Customer, text: str, first_message: bool, contact: WaContact | None = None,
           at: datetime | None = None) -> list[dict]:
    """What answers `text`: a list of {"kind", "rule", "reason"} (kind: opt_out | opt_in | rule)."""
    at = at or now()
    rules_cfg = settings_of(owner)
    clean = " ".join((text or "").lower().split())
    if clean and clean in rules_cfg["opt_out_keywords"]:
        return [{"kind": "opt_out", "rule": None, "reason": f"“{clean}” is an opt-out keyword"}]
    if clean and clean in rules_cfg["opt_in_keywords"]:
        return [{"kind": "opt_in", "rule": None, "reason": f"“{clean}” is an opt-in keyword"}]

    rules = (db.query(WaAutoReply).filter(WaAutoReply.customer_id == owner.id, WaAutoReply.active.is_(True))
             .order_by(WaAutoReply.position, WaAutoReply.id).all())
    out: list[dict] = []
    special = {r.trigger: r for r in reversed(rules) if r.trigger != "keyword"}  # first one of each kind
    welcome, away, fallback = special.get("welcome"), special.get("away"), special.get("default")
    if welcome and first_message:
        # a new customer is greeted first, even when their first message also asks something
        out.append({"kind": "rule", "rule": welcome, "reason": "First message from this person"})

    for rule in (r for r in rules if r.trigger == "keyword"):
        if clean and keyword_matches(rule, clean):
            if _cooled(db, rule, contact, at):
                return [*out, {"kind": "rule", "rule": rule, "reason": "Keyword matched"}]
            return [*out, {"kind": "cooldown", "rule": rule,
                           "reason": "Keyword matched, but this person got it recently"}]
    closed = not is_open(rules_cfg, at)
    idle = rules_cfg.get("away_when_nobody_available") and nobody_available(db, owner.id)
    if away and (closed or idle) and _cooled(db, away, contact, at):
        out.append({"kind": "rule", "rule": away,
                    "reason": "Outside office hours" if closed else "Nobody in the team is available"})
    if not out and fallback and _cooled(db, fallback, contact, at):
        out.append({"kind": "rule", "rule": fallback, "reason": "Nothing else matched"})
    return out


# Sending --------------------------------------------------------------------------------

def personalise(text: str | None, contact: WaContact) -> str | None:
    if not text:
        return text
    name = contact.name or contact.profile_name or ""

    def value(m):
        return (name.split()[0] if m.group(1).lower() == "first_name" and name else name) or "there"
    return NAME.sub(value, text)


def _media(db: Session, owner: Customer, client: WhatsAppClient, rule: WaAutoReply | None, reply: dict):
    """(media id, mime, filename, local path) for a media reply, uploaded once and reused."""
    from app.modules.customer.templates.service import _sample_path

    path = _sample_path(owner.id, reply["media_key"])
    mime = mimetypes.guess_type(reply["media_key"])[0] or "application/octet-stream"
    filename = reply.get("media_filename") or path.name
    fresh = rule is not None and rule.media_id and rule.media_uploaded_at and \
        rule.media_uploaded_at > now() - timedelta(days=MEDIA_ID_DAYS)
    if fresh:
        return rule.media_id, mime, filename, path
    media_id = client.upload_media(path.read_bytes(), mime, filename)
    if rule is not None:
        rule.media_id, rule.media_uploaded_at = media_id, now()
    return media_id, mime, filename, path


def build(reply: dict, contact: WaContact) -> tuple[dict, dict]:
    """(Meta payload without the media id, what the chat shows) for a reply."""
    kind = reply["type"]
    text = personalise(reply.get("text"), contact)
    if kind == "text":
        return {"type": "text", "text": {"body": text, "preview_url": True}}, {"type": "text", "text": text}
    if kind == "location":
        loc = {"latitude": reply["latitude"], "longitude": reply["longitude"]}
        if reply.get("place"):
            loc["name"] = reply["place"]
        if reply.get("address"):
            loc["address"] = reply["address"]
        return {"type": "location", "location": loc}, {"type": "location", "text": reply.get("place"), "location": loc}
    if kind in ("buttons", "list"):
        interactive: dict = {"body": {"text": text}}
        if reply.get("header"):
            interactive["header"] = {"type": "text", "text": reply["header"]}
        if reply.get("footer"):
            interactive["footer"] = {"text": reply["footer"]}
        if kind == "buttons":
            interactive["type"] = "button"
            interactive["action"] = {"buttons": [{"type": "reply", "reply": {"id": f"b{i + 1}", "title": b}}
                                                 for i, b in enumerate(reply["buttons"])]}
            shown = [{"type": "quick_reply", "text": b} for b in reply["buttons"]]
        else:
            interactive["type"] = "list"
            rows = []
            for i, r in enumerate(reply["rows"]):
                row = {"id": f"r{i + 1}", "title": r["title"]}
                if r.get("description"):
                    row["description"] = r["description"]
                rows.append(row)
            interactive["action"] = {"button": reply.get("list_button") or "Options",
                                     "sections": [{"title": (reply.get("list_button") or "Options")[:24], "rows": rows}]}
            shown = [{"type": "list", "text": reply.get("list_button") or "Options"}]
        body = "\n\n".join(filter(None, [reply.get("header"), text, reply.get("footer")]))
        return {"type": "interactive", "interactive": interactive}, {"type": "interactive", "text": body,
                                                                       "buttons": shown}
    # media: the caller adds the uploaded media id
    media_kind = reply["media_kind"]
    return {"type": media_kind, media_kind: {"caption": text} if text and media_kind != "audio" else {}}, \
        {"type": media_kind, "text": text}


def send(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation, reply: dict,
         label: str, rule: WaAutoReply | None = None) -> WaMessage:
    """Sends one automatic reply into the chat (recorded like any message, from "Auto-reply")."""
    from app.modules.customer.inbox import service as inbox

    contact = conversation.contact
    payload, shown = build(reply, contact)
    fields: dict = {}
    media_path = None
    if reply["type"] == "media":
        media_id, mime, filename, media_path = _media(db, owner, client, rule, reply)
        part = payload[shown["type"]]
        part["id"] = media_id
        if shown["type"] == "document":
            part["filename"] = filename
        fields = {"media_id": media_id, "media_mime": mime, "media_filename": filename,
                  "media_size": media_path.stat().st_size}
    raw = {"request": payload, "auto_reply": {"id": rule.id if rule else None, "name": label}}
    if shown.get("buttons"):
        raw["template"] = {"header_format": None, "buttons": shown["buttons"]}
    if shown["type"] == "location":
        raw["location"] = shown["location"]
    message = inbox._outbound(db, owner, conversation, sent_by=SENDER, type=shown["type"], text=shown.get("text"),
                              payload=raw, **fields)
    message.member_id = None  # nobody from the team: doesn't count as a reply or a response time
    if media_path is not None:
        inbox._cache_path(message).parent.mkdir(parents=True, exist_ok=True)
        inbox._cache_path(message).write_bytes(media_path.read_bytes())
    inbox._attempt(db, conversation, message, lambda: client.send({"to": contact.wa_id, **payload}), reopen=False)
    if rule is not None:
        rule.hits = (rule.hits or 0) + 1
        rule.last_hit_at = now()
        db.add(WaAutoReplyHit(rule_id=rule.id, contact_id=contact.id, message_id=message.id, created_at=now()))
        db.commit()
    return message


def handle(db: Session, account, message_ids: list[int]) -> int:
    """Answers new incoming messages from the webhook. Returns how many replies were sent."""
    from app.core.crypto import decrypt_secret
    from app.modules.customer.chatbots import engine as chatbots
    from app.modules.customer.team.assign import event

    if not message_ids or account.status != "connected":
        return 0
    owner = db.get(Customer, account.customer_id)
    client = WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "")
    sent = 0
    for message in db.query(WaMessage).filter(WaMessage.id.in_(message_ids)).order_by(WaMessage.id).all():
        if message.type in ("reaction", "unsupported") or message.created_at < now() - STALE:
            continue
        conversation = db.get(WaConversation, message.conversation_id)
        contact = conversation.contact
        if contact.blocked:
            continue
        first = not db.query(WaMessage.id).filter(WaMessage.conversation_id == conversation.id,
                                                  WaMessage.direction == "in", WaMessage.id < message.id).first()
        try:
            decisions = decide(db, owner, message.text or "", first, contact)
            fallback = None
            opting = any(d["kind"] in ("opt_out", "opt_in") for d in decisions)
            if opting:
                chatbots.stop_for(db, conversation, "opted_out")
            else:
                # a chatbot running in the chat, or one this message starts, answers instead
                welcome = next((d["rule"] for d in decisions if d["kind"] == "rule" and d["rule"].trigger == "welcome"),
                               None)
                greet = (lambda w=welcome: send(db, owner, client, conversation, w.reply, w.name, w)) if welcome else None
                if chatbots.on_message(db, owner, client, conversation, message, first, greet):
                    sent += 1
                    continue
                # an "any message" chatbot takes the place of the default reply (even while it rests)
                keyword = any(d["rule"] is not None and d["rule"].trigger == "keyword" for d in decisions)
                if not keyword and chatbots.has_fallback(db, owner.id):
                    fallback = chatbots.fallback_bot(db, owner.id, contact.id)
                    decisions = [d for d in decisions if d["rule"] is None or d["rule"].trigger != "default"]
            for decision in decisions:
                if decision["kind"] in ("opt_out", "opt_in"):
                    out = decision["kind"] == "opt_out"
                    contact.opted_out = out
                    event(db, conversation, "status", "Opted out of marketing" if out else "Opted back in",
                          contact.name or contact.profile_name or f"+{contact.wa_id}")
                    db.commit()
                    text = settings_of(owner)["opt_out_reply" if out else "opt_in_reply"]
                    if text:
                        send(db, owner, client, conversation, {"type": "text", "text": text},
                             "Opt-out" if out else "Opt-in")
                        sent += 1
                elif decision["kind"] == "rule":
                    send(db, owner, client, conversation, decision["rule"].reply, decision["rule"].name,
                         decision["rule"])
                    sent += 1
            if not opting and fallback is not None:
                chatbots.start(db, owner, client, conversation, fallback, "any", text=message.text or "")
                sent += 1
        except (WhatsAppError, OSError, KeyError) as exc:  # a broken reply must never break the webhook
            db.rollback()
            logger.warning("Auto-reply for message %s failed: %s", message.id, exc)
    return sent
