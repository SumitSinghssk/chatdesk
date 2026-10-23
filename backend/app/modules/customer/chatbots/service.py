from collections import Counter
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.chatbots import engine
from app.modules.customer.chatbots.graph import Graph, clean, problems
from app.modules.customer.chatbots.models import WaChatbot, WaChatbotSession
from app.modules.customer.chatbots.schemas import (
    BotSettings,
    ChatbotSchema,
    CreateSchema,
    GraphSchema,
    ImportSchema,
    SimulateSchema,
)
from app.modules.customer.chatbots.starters import STARTERS, blank, starter_list
from app.modules.customer.inbox.models import WaContact, WaConversation
from app.modules.customer.team.access import actor_name
from app.shared.utils.datetime import iso, now

TRIGGER_NAMES = {"keyword": "keywords", "new_chat": "a new chat", "any": "any message", "ad": "an ad click"}


def _meta(bot: WaChatbot) -> dict:
    return {"name": bot.name, "description": bot.description, "trigger": bot.trigger, "match": bot.match,
            "keywords": bot.keywords or [], "restart_minutes": bot.restart_minutes,
            "settings": BotSettings(**(bot.settings or {})).model_dump()}


def serialize(bot: WaChatbot, stats: dict | None = None, full: bool = False) -> dict:
    graph = bot.graph or {}
    data = {
        "id": bot.id,
        **_meta(bot),
        "active": bot.active,
        "published": bot.published_graph is not None,
        "version": bot.version,
        "published_at": iso(bot.published_at),
        "has_changes": bot.published_graph is None or bot.published_graph != bot.graph
        or (bot.published_settings or {}) != (bot.settings or {}),
        "blocks": len(graph.get("nodes") or []),
        "created_by": bot.created_by,
        "created_at": iso(bot.created_at),
        "updated_at": iso(bot.updated_at),
        "stats": stats or {"started": 0, "completed": 0, "handover": 0, "active": 0, "completion_rate": None},
    }
    if full:
        data["graph"] = graph
    return data


def _bot(db: Session, ws: Customer, bot_id: int) -> WaChatbot:
    bot = db.query(WaChatbot).filter(WaChatbot.id == bot_id, WaChatbot.customer_id == ws.id).first()
    if bot is None:
        raise HTTPException(404, detail="Chatbot not found")
    return bot


def _stats(db: Session, ws: Customer, days: int = 30) -> dict[int, dict]:
    since = now() - timedelta(days=days)
    rows = (db.query(WaChatbotSession.chatbot_id, WaChatbotSession.status, WaChatbotSession.end_reason,
                     func.count(WaChatbotSession.id))
            .filter(WaChatbotSession.customer_id == ws.id, WaChatbotSession.started_at >= since)
            .group_by(WaChatbotSession.chatbot_id, WaChatbotSession.status, WaChatbotSession.end_reason).all())
    out: dict[int, dict] = {}
    for bot_id, status, reason, count in rows:
        s = out.setdefault(bot_id, {"started": 0, "completed": 0, "handover": 0, "active": 0})
        s["started"] += count
        if status == "active":
            s["active"] += count
        elif reason in ("completed", "handover"):
            s[reason] += count
    for s in out.values():
        done = s["started"] - s["active"]
        s["completion_rate"] = round(100 * (s["completed"] + s["handover"]) / done) if done else None
    return out


def list_bots(db: Session, ws: Customer) -> dict:
    bots = db.query(WaChatbot).filter(WaChatbot.customer_id == ws.id).order_by(WaChatbot.id.desc()).all()
    stats = _stats(db, ws)
    return {"status": True, "data": [serialize(b, stats.get(b.id)) for b in bots]}


def starters() -> dict:
    return {"status": True, "data": starter_list()}


def _problems(db: Session, ws: Customer, bot: WaChatbot) -> dict:
    ids = {i for (i,) in db.query(WaChatbot.id).filter(WaChatbot.customer_id == ws.id)}
    return problems(bot.graph, ids, bot.id)


def get_bot(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    others = (db.query(WaChatbot.id, WaChatbot.name).filter(WaChatbot.customer_id == ws.id, WaChatbot.id != bot.id)
              .order_by(WaChatbot.name).all())
    return {"status": True, "data": {**serialize(bot, _stats(db, ws).get(bot.id), full=True),
                                     "problems": _problems(db, ws, bot),
                                     "chatbots": [{"id": i, "name": n} for i, n in others]}}


def _conflicts(db: Session, ws: Customer, bot: WaChatbot) -> None:
    """Two live chatbots can't start from the same thing."""
    others = [b for b in engine.live_bots(db, ws.id) if b.id != bot.id]
    if bot.trigger == "keyword":
        for other in others:
            if other.trigger != "keyword":
                continue
            shared = sorted(set(bot.keywords or []) & set(other.keywords or []))
            if shared:
                raise HTTPException(422, detail=f"“{shared[0]}” already starts the chatbot “{other.name}”. "
                                                "Use another keyword or turn that one off.")
    elif bot.trigger in ("new_chat", "any", "ad"):
        clash = next((o for o in others if o.trigger == bot.trigger), None)
        if clash is not None:
            raise HTTPException(422, detail=f"“{clash.name}” already starts on {TRIGGER_NAMES[bot.trigger]}. "
                                            "Only one live chatbot can do that; turn it off first.")


def _apply_meta(bot: WaChatbot, payload: ChatbotSchema) -> None:
    bot.name, bot.description = payload.name, payload.description
    bot.trigger, bot.match = payload.trigger, payload.match
    bot.keywords = payload.keywords if payload.trigger == "keyword" else []
    bot.restart_minutes = payload.restart_minutes
    bot.settings = payload.settings.model_dump()


def create(db: Session, ws: Customer, payload: CreateSchema) -> dict:
    if payload.starter and payload.starter not in STARTERS:
        raise HTTPException(422, detail="Unknown starter")
    bot = WaChatbot(customer_id=ws.id, version=0, active=False, media_cache={}, created_by=actor_name(ws))
    if payload.trigger == "any" and "restart_minutes" not in payload.model_fields_set:
        payload.restart_minutes = 1440  # an "any message" bot at most once a day per person
    _apply_meta(bot, payload)
    bot.graph = STARTERS[payload.starter]["build"]() if payload.starter else blank()
    db.add(bot)
    db.commit()
    return {"status": True, "message": "Chatbot created", "data": serialize(bot, full=True)}


def update(db: Session, ws: Customer, bot_id: int, payload: ChatbotSchema) -> dict:
    bot = _bot(db, ws, bot_id)
    _apply_meta(bot, payload)
    if bot.active:
        _conflicts(db, ws, bot)
    db.commit()
    return {"status": True, "message": "Chatbot saved", "data": serialize(bot)}


def save_graph(db: Session, ws: Customer, bot_id: int, graph: GraphSchema) -> dict:
    bot = _bot(db, ws, bot_id)
    bot.graph = clean(graph.model_dump())
    db.commit()
    return {"status": True, "message": "Saved", "data": {**serialize(bot), "problems": _problems(db, ws, bot)}}


def publish(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    found = _problems(db, ws, bot)
    if found["errors"]:
        n = len(found["errors"])
        raise HTTPException(422, detail={"message": f"Fix {n} problem{'s' if n > 1 else ''} before publishing",
                                         "problems": found, "data": {"problems": found}})
    _conflicts(db, ws, bot)
    bot.published_graph, bot.published_settings = bot.graph, bot.settings or {}
    bot.version = (bot.version or 0) + 1
    bot.published_at, bot.active = now(), True
    db.commit()
    return {"status": True, "message": f"Published: “{bot.name}” is live",
            "data": {**serialize(bot), "problems": found}}


def set_active(db: Session, ws: Customer, bot_id: int, active: bool) -> dict:
    bot = _bot(db, ws, bot_id)
    if active and bot.published_graph is None:
        raise HTTPException(422, detail="Publish the chatbot first")
    if active:
        _conflicts(db, ws, bot)
    bot.active = active
    if not active:
        for st in db.query(WaChatbotSession).filter(WaChatbotSession.chatbot_id == bot.id,
                                                    WaChatbotSession.status == "active"):
            engine.end(db, st, "stopped")
    db.commit()
    return {"status": True, "message": f"{bot.name}: turned {'on' if active else 'off'}", "data": serialize(bot)}


def discard(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    if bot.published_graph is None:
        raise HTTPException(422, detail="Nothing has been published yet")
    bot.graph, bot.settings = bot.published_graph, bot.published_settings or {}
    db.commit()
    return {"status": True, "message": "Back to the published version", "data": serialize(bot, full=True)}


def duplicate(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    copy = WaChatbot(customer_id=ws.id, name=f"{bot.name} (copy)"[:120], description=bot.description,
                     trigger=bot.trigger, match=bot.match, keywords=list(bot.keywords or []),
                     restart_minutes=bot.restart_minutes, settings=dict(bot.settings or {}), graph=bot.graph,
                     version=0, active=False, media_cache={}, created_by=actor_name(ws))
    db.add(copy)
    db.commit()
    return {"status": True, "message": "Chatbot copied", "data": serialize(copy)}


def delete(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    db.delete(bot)
    db.commit()
    return {"status": True, "message": "Chatbot deleted", "data": None}


def export(db: Session, ws: Customer, bot_id: int) -> dict:
    bot = _bot(db, ws, bot_id)
    return {"status": True, "data": {"format": "chatdesk-chatbot", "version": 1, "name": bot.name,
                                     "bot": _meta(bot), "graph": bot.graph}}


def import_bot(db: Session, ws: Customer, payload: ImportSchema) -> dict:
    bot = WaChatbot(customer_id=ws.id, version=0, active=False, media_cache={}, created_by=actor_name(ws))
    _apply_meta(bot, payload.bot)
    bot.name = payload.name
    graph = payload.graph.model_dump()
    for node in graph["nodes"]:  # files and other chatbots belong to the account it came from
        if node["type"] == "goto":
            node["data"] = {}
        data = node.get("data") or {}
        if (data.get("reply") or {}).get("media_key"):
            data["reply"] = {**data["reply"], "media_key": None}
        if data.get("media_key"):
            data["media_key"] = None
    bot.graph = clean(graph)
    db.add(bot)
    db.commit()
    return {"status": True, "message": "Chatbot imported", "data": serialize(bot)}


def report(db: Session, ws: Customer, bot_id: int, days: int) -> dict:
    """How people went through the chatbot: totals, per block, per connection, and recent chats."""
    bot = _bot(db, ws, bot_id)
    since = now() - timedelta(days=days)
    sessions = (db.query(WaChatbotSession).filter(WaChatbotSession.chatbot_id == bot.id,
                                                  WaChatbotSession.started_at >= since)
                .order_by(WaChatbotSession.id.desc()).limit(5000).all())
    reasons = Counter(s.end_reason for s in sessions if s.status == "ended")
    reached, dropped, taken = Counter(), Counter(), Counter()
    for s in sessions:
        seen = set()
        for node_id, handle in s.trail or []:
            if node_id not in seen:
                reached[node_id] += 1
                seen.add(node_id)
            if handle:
                taken[f"{node_id}|{handle}"] += 1
        if s.status == "ended" and s.end_reason in ("timeout", "stopped", "agent", "invalid", "failed", "replaced") \
                and s.node_id:
            dropped[s.node_id] += 1
    active = sum(1 for s in sessions if s.status == "active")
    done = len(sessions) - active
    contacts = {c.id: c for c in db.query(WaContact).filter(
        WaContact.id.in_({s.contact_id for s in sessions[:50]}))} if sessions else {}
    g = Graph(bot.published_graph or bot.graph)
    recent = []
    for s in sessions[:50]:
        c = contacts.get(s.contact_id)
        recent.append({"id": s.id, "status": s.status, "end_reason": s.end_reason, "trigger": s.trigger,
                       "node_id": s.node_id, "node": g.label(s.node_id) if s.node_id else None,
                       "conversation_id": s.conversation_id, "variables": s.variables or {},
                       "contact": {"id": c.id, "name": c.name or c.profile_name, "phone": f"+{c.wa_id}"} if c else None,
                       "started_at": iso(s.started_at), "ended_at": iso(s.ended_at), "error": s.error})
    return {"status": True, "data": {
        "days": days, "started": len(sessions), "active": active,
        "completed": reasons["completed"], "handover": reasons["handover"],
        "dropped": sum(v for k, v in reasons.items() if k not in ("completed", "handover")),
        "reasons": dict(reasons),
        "completion_rate": round(100 * (reasons["completed"] + reasons["handover"]) / done) if done else None,
        "nodes": {k: {"reached": reached[k], "dropped": dropped[k]} for k in set(reached) | set(dropped)},
        "edges": dict(taken), "recent": recent}}


def simulate(db: Session, ws: Customer, bot_id: int, payload: SimulateSchema) -> dict:
    bot = _bot(db, ws, bot_id)
    graph = clean(payload.graph.model_dump()) if payload.graph else bot.graph
    settings = (payload.settings or BotSettings(**(bot.settings or {}))).model_dump()
    c = payload.contact
    contact = WaContact(name=c.name, wa_id=c.phone, email=c.email, tags=list(c.tags),
                        attributes=dict(c.attributes), opted_out=False)
    incoming = engine.Incoming(text=payload.input.text or "", reply_id=payload.input.reply_id,
                               media=payload.input.media) if payload.input else None
    result = engine.simulate(db, ws, bot, graph, settings, payload.state, incoming, contact)
    return {"status": True, "data": result}


# From the inbox -----------------------------------------------------------------------------

def _chat(db: Session, ws: Customer, conversation_id: int) -> WaConversation:
    from app.modules.customer.inbox.service import _conversation

    return _conversation(db, ws, conversation_id)


def start_in_chat(db: Session, ws: Customer, bot_id: int, conversation_id: int) -> dict:
    from app.modules.customer.inbox.service import _client, _guard_contact, window_open

    bot = _bot(db, ws, bot_id)
    if not bot.published_graph:
        raise HTTPException(422, detail="Publish the chatbot first")
    conversation = _chat(db, ws, conversation_id)
    _guard_contact(conversation)
    if not window_open(conversation):
        raise HTTPException(422, detail="The 24-hour reply window is closed, so a chatbot can't message them. "
                                        "Send a template first.")
    _, client = _client(db, ws)
    engine.stop_for(db, conversation, "replaced")
    st = engine.start(db, ws, client, conversation, bot, "manual")
    return {"status": True, "message": f"Chatbot “{bot.name}” started", "data": session_info(db, conversation.id)
            or {"id": st.id, "status": st.status, "end_reason": st.end_reason}}


def stop_in_chat(db: Session, ws: Customer, conversation_id: int) -> dict:
    conversation = _chat(db, ws, conversation_id)
    stopped = engine.stop_for(db, conversation, "stopped",
                              f"Chatbot stopped by {actor_name(ws)}")
    if not stopped:
        raise HTTPException(404, detail="No chatbot is running in this chat")
    return {"status": True, "message": "Chatbot stopped", "data": None}


def session_info(db: Session, conversation_id: int) -> dict | None:
    """The chatbot running in a chat, for the inbox header."""
    st = engine.active_session(db, conversation_id)
    if st is None:
        return None
    bot = db.get(WaChatbot, st.chatbot_id)
    if bot is None:
        return None
    return {"id": st.id, "chatbot_id": bot.id, "name": bot.name, "wait": st.wait,
            "node": Graph(bot.published_graph).label(st.node_id), "started_at": iso(st.started_at)}


def running_in(db: Session, conversation_ids: list[int]) -> dict[int, str]:
    """{conversation id: chatbot name} for chats a chatbot is talking in."""
    if not conversation_ids:
        return {}
    rows = (db.query(WaChatbotSession.conversation_id, WaChatbot.name)
            .join(WaChatbot, WaChatbot.id == WaChatbotSession.chatbot_id)
            .filter(WaChatbotSession.conversation_id.in_(conversation_ids), WaChatbotSession.status == "active")
            .all())
    return dict(rows)


def live_choices(db: Session, ws: Customer) -> dict:
    """Published chatbots an agent can start in a chat."""
    bots = (db.query(WaChatbot).filter(WaChatbot.customer_id == ws.id, WaChatbot.published_graph.is_not(None))
            .order_by(WaChatbot.name).all())
    return {"status": True, "data": [{"id": b.id, "name": b.name, "active": b.active, "description": b.description}
                                     for b in bots]}


