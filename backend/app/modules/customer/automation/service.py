from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.automation import engine
from app.modules.customer.automation.models import WaAutoReply
from app.modules.customer.automation.schemas import OrderSchema, RuleSchema, SettingsSchema, TryMessageSchema
from app.modules.customer.inbox.models import WaContact
from app.shared.utils.datetime import iso, now

DEFAULT_COOLDOWN = {"away": 240, "default": 1440}  # minutes: once per 4 hours / once a day per person


def serialize(rule: WaAutoReply) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "trigger": rule.trigger,
        "match": rule.match,
        "keywords": rule.keywords or [],
        "reply": rule.reply or {},
        "cooldown_minutes": rule.cooldown_minutes,
        "active": rule.active,
        "position": rule.position,
        "hits": rule.hits,
        "last_hit_at": iso(rule.last_hit_at),
        "created_at": iso(rule.created_at),
        "updated_at": iso(rule.updated_at),
    }


def _rule(db: Session, ws: Customer, rule_id: int) -> WaAutoReply:
    rule = db.query(WaAutoReply).filter(WaAutoReply.id == rule_id, WaAutoReply.customer_id == ws.id).first()
    if rule is None:
        raise HTTPException(404, detail="Automatic reply not found")
    return rule


def list_rules(db: Session, ws: Customer) -> dict:
    rules = (db.query(WaAutoReply).filter(WaAutoReply.customer_id == ws.id)
             .order_by(WaAutoReply.position, WaAutoReply.id).all())
    rules_cfg = engine.settings_of(ws)
    return {"status": True, "data": [serialize(r) for r in rules],
            "meta": {"open_now": engine.is_open(rules_cfg), "timezone": rules_cfg["timezone"]}}


def _check_media(ws: Customer, payload: RuleSchema) -> None:
    if payload.reply.type == "media":
        from app.modules.customer.templates.service import SAMPLE_KEY, _sample_path

        key = payload.reply.media_key or ""
        if not SAMPLE_KEY.match(key) or not _sample_path(ws.id, key).exists():
            raise HTTPException(422, detail={"message": "Upload the file again", "errors": {"reply": ["Upload the file again"]}})


def _apply(rule: WaAutoReply, payload: RuleSchema) -> None:
    if rule.reply and (rule.reply.get("media_key") != payload.reply.media_key):
        rule.media_id = rule.media_uploaded_at = None  # a new file: upload again next time
    rule.name, rule.trigger, rule.match = payload.name, payload.trigger, payload.match
    rule.keywords = payload.keywords if payload.trigger == "keyword" else []
    rule.reply = payload.reply.model_dump(exclude_none=True)
    rule.cooldown_minutes = payload.cooldown_minutes
    rule.active = payload.active


def create_rule(db: Session, ws: Customer, payload: RuleSchema) -> dict:
    _check_media(ws, payload)
    if payload.trigger != "keyword" and "cooldown_minutes" not in payload.model_fields_set:
        payload.cooldown_minutes = DEFAULT_COOLDOWN.get(payload.trigger, 0)
    last = db.query(func.max(WaAutoReply.position)).filter(WaAutoReply.customer_id == ws.id).scalar()
    rule = WaAutoReply(customer_id=ws.id, position=(last or 0) + 1, hits=0)
    _apply(rule, payload)
    db.add(rule)
    db.commit()
    return {"status": True, "message": "Automatic reply created", "data": serialize(rule)}


def update_rule(db: Session, ws: Customer, rule_id: int, payload: RuleSchema) -> dict:
    rule = _rule(db, ws, rule_id)
    _check_media(ws, payload)
    _apply(rule, payload)
    db.commit()
    return {"status": True, "message": "Automatic reply saved", "data": serialize(rule)}


def set_active(db: Session, ws: Customer, rule_id: int, active: bool) -> dict:
    rule = _rule(db, ws, rule_id)
    rule.active = active
    db.commit()
    return {"status": True, "message": "Turned on" if active else "Turned off", "data": serialize(rule)}


def delete_rule(db: Session, ws: Customer, rule_id: int) -> dict:
    db.delete(_rule(db, ws, rule_id))
    db.commit()
    return {"status": True, "message": "Automatic reply deleted", "data": None}


def reorder(db: Session, ws: Customer, payload: OrderSchema) -> dict:
    rules = {r.id: r for r in db.query(WaAutoReply).filter(WaAutoReply.customer_id == ws.id)}
    for i, rule_id in enumerate(payload.ids):
        if rule_id in rules:
            rules[rule_id].position = i + 1
    db.commit()
    return {"status": True, "message": "Order saved", "data": None}


def get_settings(db: Session, ws: Customer) -> dict:
    data = engine.settings_of(ws)
    return {"status": True, "data": {**data, "open_now": engine.is_open(data)}}


def save_settings(db: Session, ws: Customer, payload: SettingsSchema) -> dict:
    ws.automation_settings = payload.model_dump()
    db.commit()
    data = engine.settings_of(ws)
    return {"status": True, "message": "Settings saved", "data": {**data, "open_now": engine.is_open(data)}}


def try_message(db: Session, ws: Customer, payload: TryMessageSchema) -> dict:
    """What would answer `text` right now (no cooldowns, nothing is sent)."""
    from app.modules.customer.chatbots import engine as chatbots

    sample = WaContact(name="Asha Verma", wa_id="919800000000")
    out = []
    decisions = engine.decide(db, ws, payload.text, payload.first_message, None, now())
    if not any(d["kind"] in ("opt_out", "opt_in") for d in decisions):
        bot = chatbots.trigger_for(db, chatbots.live_bots(db, ws.id), None, payload.text, payload.first_message, None)
        if bot is not None:
            how = {"keyword": "a keyword", "new_chat": "a first message"}.get(bot.trigger, bot.trigger)
            welcome = [d for d in decisions if d["rule"] is not None and d["rule"].trigger == "welcome"]
            decisions = welcome if bot.trigger != "new_chat" else []
            out_bot = {"kind": "chatbot", "reason": f"Chatbot “{bot.name}” starts ({how})", "rule": None,
                       "reply": None, "chatbot": {"id": bot.id, "name": bot.name}}
        else:
            out_bot = None
    else:
        out_bot = None
    for d in decisions:
        rule = d["rule"]
        reply = rule.reply if rule is not None else None
        if d["kind"] in ("opt_out", "opt_in"):
            text = engine.settings_of(ws)["opt_out_reply" if d["kind"] == "opt_out" else "opt_in_reply"]
            reply = {"type": "text", "text": text} if text else None
        if reply:
            reply = {**reply, "text": engine.personalise(reply.get("text"), sample)}
        out.append({"kind": d["kind"], "reason": d["reason"], "rule": serialize(rule) if rule else None,
                    "reply": reply})
    if out_bot is not None:
        out.append(out_bot)
    return {"status": True, "data": {"matches": out, "open_now": engine.is_open(engine.settings_of(ws))}}
