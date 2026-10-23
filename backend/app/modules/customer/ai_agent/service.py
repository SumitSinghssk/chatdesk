"""AI agents for the dashboard: connections (provider keys), agents, knowledge, training, the test chat,
conversations and usage. Answering itself lives in engine.py."""

import logging
import mimetypes
import secrets
import threading
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import SessionLocal
from app.modules.customer.account.models import Customer
from app.modules.customer.ai_agent import engine, knowledge, providers
from app.modules.customer.ai_agent.models import (
    AiAgent,
    AiAnswerCache,
    AiChunk,
    AiConnection,
    AiMessage,
    AiSource,
    AiThread,
)
from app.modules.customer.ai_agent.schemas import (
    AgentSchema,
    Behaviour,
    ChannelsSchema,
    ConnectionSchema,
    CreateSchema,
    FaqSchema,
    Limits,
    SourceUpdateSchema,
    TextSourceSchema,
    UrlSourceSchema,
    WhatsAppChannel,
    WidgetChannel,
)
from app.modules.customer.auth.service import field_error
from app.modules.customer.inbox.models import WaConversation
from app.modules.customer.team.access import actor_name
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

FILES_DIR = STORAGE_DIR / "ai-knowledge"
MAX_SOURCES = 300
MAX_AGENTS = 10


def _hint(key: str) -> str:
    return f"{key[:7]}…{key[-4:]}" if len(key) > 14 else "••••"


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} not found")


# Connections -----------------------------------------------------------------------------------

def _connection(db: Session, ws: Customer, connection_id: int) -> AiConnection:
    conn = db.query(AiConnection).filter(AiConnection.id == connection_id, AiConnection.customer_id == ws.id).first()
    if conn is None:
        raise _not_found("AI connection")
    return conn


def serialize_connection(conn: AiConnection, used_by: int = 0) -> dict:
    info = providers.PROVIDERS.get(conn.provider, {})
    return {"id": conn.id, "provider": conn.provider, "provider_label": info.get("label", conn.provider),
            "label": conn.label, "key_hint": conn.key_hint, "base_url": conn.base_url, "status": conn.status,
            "error": conn.error, "checked_at": iso(conn.checked_at), "models": conn.models or [],
            "prices": conn.prices or {}, "used_by": used_by, "created_at": iso(conn.created_at)}


def provider_list() -> dict:
    out = []
    for key, p in providers.PROVIDERS.items():
        out.append({"key": key, "label": p["label"], "company": p["company"], "keys_url": p["keys_url"],
                    "prefix": p["prefix"], "base_url": p["base_url"], "models": p["models"], "hint": p["hint"],
                    "prices": {m: list(v[:2]) for m, v in providers.CLAUDE_PRICES.items()} if key == "anthropic"
                    else {}})
    return {"status": True, "data": out}


def list_connections(db: Session, ws: Customer) -> dict:
    used = dict(db.query(AiAgent.connection_id, func.count(AiAgent.id)).filter(AiAgent.customer_id == ws.id)
                .group_by(AiAgent.connection_id).all())
    rows = db.query(AiConnection).filter(AiConnection.customer_id == ws.id).order_by(AiConnection.id).all()
    return {"status": True, "data": [serialize_connection(c, used.get(c.id, 0)) for c in rows]}


def _check(conn: AiConnection, key: str) -> None:
    try:
        conn.models = providers.list_models(conn.provider, key, conn.base_url)[:300]
        conn.status, conn.error = "ok", None
    except providers.ProviderError as exc:
        conn.status, conn.error = "failed", str(exc)[:300]
    conn.checked_at = now()


def save_connection(db: Session, ws: Customer, payload: ConnectionSchema, connection_id: int | None = None) -> dict:
    if payload.provider == "custom" and not payload.base_url:
        raise field_error(422, "base_url", "Enter the API address of the provider")
    if payload.base_url and not providers.address_allowed(payload.base_url):
        raise field_error(422, "base_url", "Use the provider's public internet address")
    if connection_id is None:
        if not payload.api_key:
            raise field_error(422, "api_key", "Paste the API key")
        conn = AiConnection(customer_id=ws.id, provider=payload.provider)
        db.add(conn)
    else:
        conn = _connection(db, ws, connection_id)
        if conn.provider != payload.provider and not payload.api_key:
            raise field_error(422, "api_key", "Paste the API key for the new provider")
        conn.provider = payload.provider
    if payload.api_key:
        conn.api_key, conn.key_hint = encrypt_secret(payload.api_key), _hint(payload.api_key)
    conn.label = payload.label or providers.PROVIDERS[payload.provider]["label"]
    conn.base_url = payload.base_url
    conn.prices = payload.prices
    _check(conn, payload.api_key or decrypt_secret(conn.api_key) or "")
    db.commit()
    message = "Connected — the key works" if conn.status == "ok" else f"Saved, but the key didn't work: {conn.error}"
    return {"status": True, "message": message, "data": serialize_connection(conn)}


def check_connection(db: Session, ws: Customer, connection_id: int) -> dict:
    conn = _connection(db, ws, connection_id)
    _check(conn, decrypt_secret(conn.api_key) or "")
    db.commit()
    return {"status": True, "message": "The key works" if conn.status == "ok" else conn.error,
            "data": serialize_connection(conn)}


def delete_connection(db: Session, ws: Customer, connection_id: int) -> dict:
    conn = _connection(db, ws, connection_id)
    db.query(AiAgent).filter(AiAgent.connection_id == conn.id).update({AiAgent.connection_id: None})
    db.delete(conn)
    db.commit()
    return {"status": True, "message": "AI connection removed", "data": None}


# Agents ---------------------------------------------------------------------------------------------

STARTERS = {
    "support": {
        "role": "customer support assistant",
        "instructions": "Help customers with their questions about our products, services, timings, prices and "
                        "policies. Be patient and clear. If they want to buy or book, tell them the next step.",
    },
    "sales": {
        "role": "sales assistant",
        "instructions": "Help customers find the right product or plan. Ask one short question at a time to "
                        "understand what they need, recommend the best fit with its key benefits and price, and "
                        "invite them to order. When someone is interested, ask for their name and phone number so "
                        "our team can follow up.",
    },
    "booking": {
        "role": "booking assistant",
        "instructions": "Help customers book an appointment or visit. Ask what they need, their preferred date "
                        "and time, their name and phone number. Never confirm a slot yourself: once you have the "
                        "details, start your reply with [HANDOVER] and tell them our team will confirm shortly.",
    },
    "blank": {"role": "assistant", "instructions": ""},
}


def _agent(db: Session, ws: Customer, agent_id: int) -> AiAgent:
    agent = db.query(AiAgent).filter(AiAgent.id == agent_id, AiAgent.customer_id == ws.id).first()
    if agent is None:
        raise _not_found("AI agent")
    return agent


def _source_counts(db: Session, agent_ids: list[int]) -> dict[int, dict]:
    out: dict[int, dict] = {i: {"file": 0, "url": 0, "text": 0, "faq": 0} for i in agent_ids}
    for agent_id, kind, n in (db.query(AiSource.agent_id, AiSource.kind, func.count(AiSource.id))
                              .filter(AiSource.agent_id.in_(agent_ids)).group_by(AiSource.agent_id, AiSource.kind)):
        out[agent_id][kind] = n
    return out


def _stats(db: Session, agent_ids: list[int], days: int = 30) -> dict[int, dict]:
    since = now() - timedelta(days=days)
    rows = (db.query(AiMessage.agent_id,
                     func.count(case((AiMessage.role == "assistant", 1))),
                     func.coalesce(func.sum(AiMessage.cost), 0.0),
                     func.count(case((AiMessage.outcome == "handover", 1))),
                     func.count(func.distinct(AiMessage.thread_id)))
            .filter(AiMessage.agent_id.in_(agent_ids), AiMessage.created_at >= since)
            .group_by(AiMessage.agent_id).all())
    out = {i: {"replies": 0, "cost": 0.0, "handovers": 0, "conversations": 0} for i in agent_ids}
    for agent_id, replies, spent, handovers, threads in rows:
        out[agent_id] = {"replies": replies, "cost": round(float(spent), 4), "handovers": handovers,
                         "conversations": threads}
    return out


def serialize_agent(db: Session, agent: AiAgent, counts: dict | None = None, stats: dict | None = None,
                    full: bool = False) -> dict:
    conn = engine.connection(db, agent)
    data = {
        "id": agent.id, "name": agent.name, "model": agent.model,
        "connection": serialize_connection(conn) if conn else None,
        "business_name": engine.behaviour(agent).business_name,
        "whatsapp_enabled": agent.whatsapp_enabled, "widget_enabled": agent.widget_enabled,
        "api_enabled": agent.api_enabled,
        "knowledge": {"version": agent.knowledge_version, "trained_at": iso(agent.trained_at),
                      "tokens": agent.knowledge_tokens, "needs_training": agent.needs_training,
                      "mode": engine.mode(agent), "sources": counts or {}},
        "problem": engine.ready(db, agent),
        "stats": stats or {},
        "created_at": iso(agent.created_at), "updated_at": iso(agent.updated_at),
    }
    if full:
        data |= {"behaviour": engine.behaviour(agent).model_dump(), "limits": engine.limits(agent).model_dump(),
                 "whatsapp": WhatsAppChannel(**(agent.whatsapp or {})).model_dump(),
                 "widget": WidgetChannel(**(agent.widget or {})).model_dump(),
                 "public_key": agent.public_key, "secret_hint": agent.secret_hint,
                 "month_cost": round(engine.month_cost(db, agent), 4)}
    return data


def list_agents(db: Session, ws: Customer) -> dict:
    agents = db.query(AiAgent).filter(AiAgent.customer_id == ws.id).order_by(AiAgent.id).all()
    ids = [a.id for a in agents]
    counts, stats = _source_counts(db, ids), _stats(db, ids)
    return {"status": True, "data": [serialize_agent(db, a, counts[a.id], stats[a.id]) for a in agents]}


def get_agent(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    return {"status": True, "data": serialize_agent(db, agent, _source_counts(db, [agent.id])[agent.id],
                                                    _stats(db, [agent.id])[agent.id], full=True)}


def _pick_model(conn: AiConnection | None, model: str | None) -> str | None:
    if model or conn is None:
        return model
    suggested = providers.PROVIDERS[conn.provider]["models"]
    if suggested:
        return suggested[0]
    available = conn.models or []
    for wanted in ("mini", "flash", "small", "haiku", "instant"):  # cheapest sensible chat model
        match = next((m for m in available if wanted in m.lower()), None)
        if match:
            return match
    return available[0] if available else None


def create_agent(db: Session, ws: Customer, payload: CreateSchema) -> dict:
    if db.query(AiAgent.id).filter(AiAgent.customer_id == ws.id).count() >= MAX_AGENTS:
        raise HTTPException(status_code=422, detail=f"You can have up to {MAX_AGENTS} AI agents.")
    conn = _connection(db, ws, payload.connection_id) if payload.connection_id else \
        db.query(AiConnection).filter(AiConnection.customer_id == ws.id).order_by(AiConnection.id).first()
    starter = STARTERS[payload.starter]
    business = payload.business_name or ws.business_name or ""
    behaviour = Behaviour(business_name=business, role=starter["role"], instructions=starter["instructions"])
    widget = WidgetChannel(title=f"Chat with {business}"[:60] if business else "Chat with us")
    agent = AiAgent(customer_id=ws.id, name=payload.name, connection_id=conn.id if conn else None,
                    model=_pick_model(conn, payload.model), behaviour=behaviour.model_dump(),
                    whatsapp=WhatsAppChannel().model_dump(), widget=widget.model_dump(), limits=Limits().model_dump(),
                    public_key="pk_" + secrets.token_urlsafe(18), created_by=actor_name(ws))
    db.add(agent)
    db.commit()
    return {"status": True, "message": "AI agent created", "data": serialize_agent(db, agent, full=True)}


def update_agent(db: Session, ws: Customer, agent_id: int, payload: AgentSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    if payload.connection_id is not None:
        _connection(db, ws, payload.connection_id)
    agent.name, agent.connection_id, agent.model = payload.name, payload.connection_id, payload.model
    agent.behaviour, agent.limits = payload.behaviour.model_dump(), payload.limits.model_dump()
    db.commit()
    return {"status": True, "message": "Saved", "data": serialize_agent(db, agent, full=True)}


def update_channels(db: Session, ws: Customer, agent_id: int, payload: ChannelsSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    if (payload.whatsapp_enabled or payload.widget_enabled or payload.api_enabled) and engine.ready(db, agent):
        raise HTTPException(status_code=422, detail=engine.ready(db, agent))
    if payload.whatsapp_enabled:
        # one agent answers the WhatsApp number
        db.query(AiAgent).filter(AiAgent.customer_id == ws.id, AiAgent.id != agent.id) \
            .update({AiAgent.whatsapp_enabled: False})
    agent.whatsapp_enabled, agent.whatsapp = payload.whatsapp_enabled, payload.whatsapp.model_dump()
    agent.widget_enabled, agent.widget = payload.widget_enabled, payload.widget.model_dump()
    if payload.api_enabled and not agent.secret_key:
        raise HTTPException(status_code=422, detail="Create an API key first.")
    agent.api_enabled = payload.api_enabled
    db.commit()
    return {"status": True, "message": "Saved", "data": serialize_agent(db, agent, full=True)}


def new_secret(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    secret = "sk_ai_" + secrets.token_urlsafe(30)
    agent.secret_key, agent.secret_hint = encrypt_secret(secret), _hint(secret)
    db.commit()
    return {"status": True, "message": "New API key created. Copy it now: it won't be shown again.",
            "data": {"secret": secret, "agent": serialize_agent(db, agent, full=True)}}


def new_public_key(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    agent.public_key = "pk_" + secrets.token_urlsafe(18)
    db.commit()
    return {"status": True, "message": "New website key: update the script on your website",
            "data": serialize_agent(db, agent, full=True)}


def duplicate_agent(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    copy = AiAgent(customer_id=ws.id, name=f"{agent.name} (copy)"[:80], connection_id=agent.connection_id,
                   model=agent.model, behaviour=agent.behaviour, whatsapp=agent.whatsapp, widget=agent.widget,
                   limits=agent.limits, public_key="pk_" + secrets.token_urlsafe(18), needs_training=True,
                   created_by=actor_name(ws))
    db.add(copy)
    db.flush()
    for src in db.query(AiSource).filter(AiSource.agent_id == agent.id).all():
        path = None
        if src.path and (FILES_DIR / src.path).exists():
            new_rel = f"{ws.id}/{uuid.uuid4().hex}{Path(src.path).suffix}"
            (FILES_DIR / new_rel).parent.mkdir(parents=True, exist_ok=True)
            (FILES_DIR / new_rel).write_bytes((FILES_DIR / src.path).read_bytes())
            path = new_rel
        db.add(AiSource(customer_id=ws.id, agent_id=copy.id, kind=src.kind, title=src.title, filename=src.filename,
                        mime=src.mime, size=src.size, path=path, url=src.url, content=src.content, pages=src.pages,
                        chars=src.chars, tokens=src.tokens, status=src.status, error=src.error, enabled=src.enabled,
                        created_by=src.created_by))
    db.commit()
    train(db, ws, copy.id)
    return {"status": True, "message": "AI agent duplicated", "data": serialize_agent(db, copy, full=True)}


def delete_agent(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    paths = [p for (p,) in db.query(AiSource.path).filter(AiSource.agent_id == agent.id, AiSource.path.is_not(None))]
    db.delete(agent)
    db.commit()
    for rel in paths:
        (FILES_DIR / rel).unlink(missing_ok=True)
    return {"status": True, "message": "AI agent deleted", "data": None}


# Knowledge ---------------------------------------------------------------------------------------

def serialize_source(src: AiSource, full: bool = False) -> dict:
    data = {"id": src.id, "kind": src.kind, "title": src.title, "filename": src.filename, "mime": src.mime,
            "size": src.size, "url": src.url, "pages": src.pages, "chars": src.chars, "tokens": src.tokens,
            "status": src.status, "error": src.error, "enabled": src.enabled, "trained": src.trained,
            "has_file": bool(src.path), "excerpt": (src.content or "")[:220], "created_by": src.created_by,
            "created_at": iso(src.created_at), "updated_at": iso(src.updated_at)}
    if full:
        data["content"] = src.content or ""
    return data


def _source(db: Session, agent: AiAgent, source_id: int) -> AiSource:
    src = db.query(AiSource).filter(AiSource.id == source_id, AiSource.agent_id == agent.id).first()
    if src is None:
        raise _not_found("Source")
    return src


def _room(db: Session, agent: AiAgent, more: int = 1) -> None:
    if db.query(AiSource.id).filter(AiSource.agent_id == agent.id).count() + more > MAX_SOURCES:
        raise HTTPException(status_code=422, detail=f"An agent can have up to {MAX_SOURCES} knowledge sources.")


def _changed(agent: AiAgent) -> None:
    agent.needs_training = True


def list_sources(db: Session, ws: Customer, agent_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    rows = db.query(AiSource).filter(AiSource.agent_id == agent.id).order_by(AiSource.id.desc()).all()
    return {"status": True, "data": [serialize_source(s) for s in rows]}


def get_source(db: Session, ws: Customer, agent_id: int, source_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    src = _source(db, agent, source_id)
    chunks = (db.query(AiChunk).filter(AiChunk.source_id == src.id).order_by(AiChunk.position).all()
              if src.trained else [])
    return {"status": True, "data": {**serialize_source(src, full=True),
                                     "chunks": [{"position": c.position, "heading": c.heading, "text": c.text,
                                                 "tokens": c.tokens} for c in chunks]}}


def source_file(db: Session, ws: Customer, agent_id: int, source_id: int):
    agent = _agent(db, ws, agent_id)
    src = _source(db, agent, source_id)
    path = FILES_DIR / (src.path or "")
    if not src.path or not path.is_file():
        raise _not_found("File")
    media = src.mime or mimetypes.guess_type(src.filename or "")[0] or "application/octet-stream"
    inline = media in ("application/pdf", "text/plain", "text/csv", "text/markdown")
    response = FileResponse(path, media_type=media, filename=src.filename,
                            content_disposition_type="inline" if inline else "attachment")
    response.headers["Cache-Control"] = "private, max-age=300"
    return response


def add_file(db: Session, ws: Customer, agent_id: int, file: UploadFile) -> dict:
    agent = _agent(db, ws, agent_id)
    _room(db, agent)
    name = Path(file.filename or "file").name[:200]
    content = file.file.read(knowledge.MAX_FILE_BYTES + 1)
    try:
        read = knowledge.read_file(name, content)
    except knowledge.ReadError as exc:
        raise field_error(422, "file", str(exc)) from exc
    ext = Path(name).suffix.lower()
    rel = f"{ws.id}/{uuid.uuid4().hex}{ext}"
    (FILES_DIR / rel).parent.mkdir(parents=True, exist_ok=True)
    (FILES_DIR / rel).write_bytes(content)
    src = AiSource(customer_id=ws.id, agent_id=agent.id, kind="file", title=Path(name).stem[:300] or name,
                   filename=name, mime=knowledge.FILE_TYPES.get(ext), size=len(content), path=rel,
                   content=read["text"], pages=read["pages"], chars=len(read["text"]),
                   tokens=knowledge.tokens(read["text"]), created_by=actor_name(ws))
    db.add(src)
    _changed(agent)
    db.commit()
    return {"status": True, "message": f"“{name}” added", "data": serialize_source(src)}


def add_text(db: Session, ws: Customer, agent_id: int, payload: TextSourceSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    _room(db, agent)
    src = AiSource(customer_id=ws.id, agent_id=agent.id, kind="text", title=payload.title, content=payload.content,
                   chars=len(payload.content), tokens=knowledge.tokens(payload.content), created_by=actor_name(ws))
    db.add(src)
    _changed(agent)
    db.commit()
    return {"status": True, "message": "Note added", "data": serialize_source(src)}


def _faq_text(question: str, answer: str) -> str:
    return f"Q: {question}\nA: {answer}"


def add_faq(db: Session, ws: Customer, agent_id: int, payload: FaqSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    _room(db, agent)
    src = AiSource(customer_id=ws.id, agent_id=agent.id, kind="faq", title=payload.question, content=payload.answer,
                   chars=len(payload.answer), tokens=knowledge.tokens(_faq_text(payload.question, payload.answer)),
                   created_by=actor_name(ws))
    db.add(src)
    _changed(agent)
    db.commit()
    return {"status": True, "message": "Question added", "data": serialize_source(src)}


def _fill_page(src: AiSource, page: dict) -> None:
    src.url, src.title = page["url"][:1000], (page["title"] or page["url"])[:300]
    src.content, src.chars, src.tokens = page["text"], len(page["text"]), knowledge.tokens(page["text"])
    src.status, src.error = "ready", None


def _crawl(agent_id: int, source_ids: list[int]) -> None:
    db = SessionLocal()
    try:
        for source_id in source_ids:
            src = db.get(AiSource, source_id)
            if src is None:
                continue
            try:
                _fill_page(src, knowledge.fetch_page(src.url))
            except knowledge.ReadError as exc:
                src.status, src.error = "failed", str(exc)[:300]
            db.commit()
    finally:
        db.close()


def add_url(db: Session, ws: Customer, agent_id: int, payload: UrlSourceSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    _room(db, agent)
    try:
        page = knowledge.fetch_page(payload.url)
    except knowledge.ReadError as exc:
        raise field_error(422, "url", str(exc)) from exc
    src = AiSource(customer_id=ws.id, agent_id=agent.id, kind="url", title="", created_by=actor_name(ws))
    _fill_page(src, page)
    db.add(src)
    queued = []
    if payload.crawl:
        known = {u for (u,) in db.query(AiSource.url).filter(AiSource.agent_id == agent.id, AiSource.url.is_not(None))}
        room = MAX_SOURCES - db.query(AiSource.id).filter(AiSource.agent_id == agent.id).count() - 1
        for link in knowledge.site_links(page["url"], page["links"], min(payload.max_pages - 1, max(room, 0))):
            if link in known:
                continue
            other = AiSource(customer_id=ws.id, agent_id=agent.id, kind="url", title=link[:300], url=link[:1000],
                             status="pending", created_by=actor_name(ws))
            db.add(other)
            queued.append(other)
    _changed(agent)
    db.commit()
    if queued:
        ids = [s.id for s in queued]
        if engine.worker_on():
            threading.Thread(target=_crawl, args=(agent.id, ids), name=f"ai-crawl-{agent.id}", daemon=True).start()
        else:
            _crawl(agent.id, ids)
    message = f"Page added; reading {len(queued)} more from the website" if queued else "Page added"
    return {"status": True, "message": message, "data": serialize_source(src)}


def refresh_source(db: Session, ws: Customer, agent_id: int, source_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    src = _source(db, agent, source_id)
    if src.kind != "url":
        raise HTTPException(status_code=422, detail="Only web pages can be read again.")
    try:
        _fill_page(src, knowledge.fetch_page(src.url))
    except knowledge.ReadError as exc:
        src.status, src.error = "failed", str(exc)[:300]
    src.trained = False
    _changed(agent)
    db.commit()
    return {"status": True, "message": "Page read again" if src.status == "ready" else src.error,
            "data": serialize_source(src)}


def update_source(db: Session, ws: Customer, agent_id: int, source_id: int, payload: SourceUpdateSchema) -> dict:
    agent = _agent(db, ws, agent_id)
    src = _source(db, agent, source_id)
    if payload.enabled is not None and payload.enabled != src.enabled:
        src.enabled = payload.enabled
        _changed(agent)
    if payload.title is not None and payload.title != src.title:
        src.title = payload.title
        _changed(agent)
    if payload.content is not None:
        if src.kind not in ("text", "faq"):
            raise HTTPException(status_code=422, detail="Only notes and questions can be edited.")
        if payload.content != src.content:
            src.content, src.chars = payload.content, len(payload.content)
            src.tokens = knowledge.tokens(_faq_text(src.title, src.content) if src.kind == "faq" else src.content)
            src.trained = False
            _changed(agent)
    db.commit()
    return {"status": True, "message": "Saved", "data": serialize_source(src)}


def delete_source(db: Session, ws: Customer, agent_id: int, source_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    src = _source(db, agent, source_id)
    rel = src.path
    db.delete(src)
    _changed(agent)
    db.commit()
    if rel:
        (FILES_DIR / rel).unlink(missing_ok=True)
    return {"status": True, "message": "Removed from the knowledge", "data": None}


def train(db: Session, ws: Customer, agent_id: int) -> dict:
    """Cuts every enabled source into passages and builds a new version of the knowledge.
    Answers cached for the old version stop being used."""
    agent = _agent(db, ws, agent_id)
    sources = db.query(AiSource).filter(AiSource.agent_id == agent.id).all()
    db.query(AiChunk).filter(AiChunk.agent_id == agent.id).delete(synchronize_session=False)
    total, passages = 0, 0
    for src in sources:
        usable = src.enabled and src.status == "ready" and (src.content or "").strip()
        src.trained = bool(usable)
        if not usable:
            continue
        if src.kind == "faq":
            pieces = [(None, _faq_text(src.title, src.content))]
        else:
            pieces = knowledge.chunk(src.content)
        for position, (heading, text) in enumerate(pieces):
            n = knowledge.tokens(text)
            db.add(AiChunk(agent_id=agent.id, source_id=src.id, position=position, heading=(heading or None) and
                           heading[:300], text=text, tokens=n))
            passages += 1
        total += src.tokens or 0
    agent.knowledge_version += 1
    agent.knowledge_tokens, agent.trained_at, agent.needs_training = total, now(), False
    db.query(AiAnswerCache).filter(AiAnswerCache.agent_id == agent.id).delete(synchronize_session=False)
    db.commit()
    used = sum(1 for s in sources if s.trained)
    how = ("all of it is sent with every question and cached by the AI provider"
           if engine.mode(agent) == "full" else "only the parts that match each question are sent")
    return {"status": True, "message": f"Trained on {used} source{'s' if used != 1 else ''} · {how}",
            "data": {"agent": serialize_agent(db, agent, _source_counts(db, [agent.id])[agent.id], full=True),
                     "passages": passages, "sources": used, "tokens": total}}


def search_preview(db: Session, ws: Customer, agent_id: int, q: str) -> dict:
    """What the agent would read for a question (the knowledge tab's "try a search")."""
    agent = _agent(db, ws, agent_id)
    hits = engine.search(db, agent, q) if q.strip() else []
    return {"status": True, "data": [{"source_id": h["source_id"], "title": h["title"], "kind": h["kind"],
                                      "heading": h["heading"], "text": h["text"], "score": h["score"]} for h in hits]}


# Test chat, conversations ------------------------------------------------------------------------

def _tz(ws: Customer) -> str:
    from app.modules.customer.automation import engine as auto

    return auto.settings_of(ws).get("timezone") or "Asia/Kolkata"


def test_thread(db: Session, ws: Customer, agent_id: int, thread_id: int | None) -> tuple[AiAgent, AiThread]:
    agent = _agent(db, ws, agent_id)
    thread = None
    if thread_id:
        thread = db.query(AiThread).filter(AiThread.id == thread_id, AiThread.agent_id == agent.id,
                                           AiThread.channel == "test").first()
    if thread is None:
        person = getattr(ws, "actor", ws)
        thread = engine.new_thread(db, agent, "test", visitor={"name": person.name or "You (test)"})
        db.commit()
    return agent, thread


def serialize_thread(db: Session, thread: AiThread, last: AiMessage | None = None) -> dict:
    return {"id": thread.id, "channel": thread.channel, "status": thread.status,
            "visitor": thread.visitor or {}, "conversation_id": thread.conversation_id,
            "handover_reason": thread.handover_reason, "handover_at": iso(thread.handover_at),
            "summary": thread.summary, "messages": thread.messages_count,
            "last_message_at": iso(thread.last_message_at), "created_at": iso(thread.created_at),
            "last": {"role": last.role, "text": last.text[:160], "outcome": last.outcome} if last else None}


def list_threads(db: Session, ws: Customer, agent_id: int, channel: str | None, status: str | None,
                 page: int = 1, per_page: int = 30) -> dict:
    agent = _agent(db, ws, agent_id)
    q = db.query(AiThread).filter(AiThread.agent_id == agent.id, AiThread.messages_count > 0)
    q = q.filter(AiThread.channel == channel) if channel else q.filter(AiThread.channel != "test")
    if status:
        q = q.filter(AiThread.status == status)
    total = q.count()
    threads = q.order_by(AiThread.last_message_at.desc().nullslast()).offset((page - 1) * per_page) \
        .limit(per_page).all()
    last_ids = dict(db.query(AiMessage.thread_id, func.max(AiMessage.id))
                    .filter(AiMessage.thread_id.in_([t.id for t in threads]), AiMessage.role.in_(("user", "assistant")))
                    .group_by(AiMessage.thread_id).all())
    lasts = {m.id: m for m in db.query(AiMessage).filter(AiMessage.id.in_(list(last_ids.values())))} if last_ids else {}
    return {"status": True, "data": [serialize_thread(db, t, lasts.get(last_ids.get(t.id))) for t in threads],
            "meta": {"total": total, "page": page, "per_page": per_page,
                     "last_page": max(1, -(-total // per_page))}}


def serialize_message(m: AiMessage) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text, "outcome": m.outcome, "sources": m.sources or [],
            "model": m.model, "tokens": {"input": m.input_tokens, "output": m.output_tokens, "cached": m.cached_tokens},
            "cost": round(m.cost or 0, 6), "saved": round(m.saved or 0, 6), "latency_ms": m.latency_ms,
            "feedback": m.feedback, "error": m.error, "created_at": iso(m.created_at)}


def get_thread(db: Session, ws: Customer, agent_id: int, thread_id: int) -> dict:
    agent = _agent(db, ws, agent_id)
    thread = db.query(AiThread).filter(AiThread.id == thread_id, AiThread.agent_id == agent.id).first()
    if thread is None:
        raise _not_found("Conversation")
    messages = (db.query(AiMessage).filter(AiMessage.thread_id == thread.id, AiMessage.role.in_(("user", "assistant")))
                .order_by(AiMessage.created_at, AiMessage.id).all())
    return {"status": True, "data": {**serialize_thread(db, thread), "items": [serialize_message(m) for m in messages]}}


def feedback(db: Session, ws: Customer, agent_id: int, message_id: int, value: str | None) -> dict:
    agent = _agent(db, ws, agent_id)
    msg = db.query(AiMessage).filter(AiMessage.id == message_id, AiMessage.agent_id == agent.id,
                                     AiMessage.role == "assistant").first()
    if msg is None:
        raise _not_found("Reply")
    msg.feedback = value
    db.commit()
    return {"status": True, "message": "Thanks for the feedback", "data": serialize_message(msg)}


def unanswered(db: Session, ws: Customer, agent_id: int, days: int = 30) -> dict:
    """Questions the agent couldn't answer: the place to add knowledge next."""
    agent = _agent(db, ws, agent_id)
    misses = (db.query(AiMessage).filter(AiMessage.agent_id == agent.id, AiMessage.role == "assistant",
                                         AiMessage.created_at >= now() - timedelta(days=days),
                                         (AiMessage.outcome.in_(("unknown", "handover"))) |
                                         (AiMessage.feedback == "down"))
              .order_by(AiMessage.id.desc()).limit(300).all())
    groups: dict[str, dict] = {}
    for miss in misses:
        q = (db.query(AiMessage).filter(AiMessage.thread_id == miss.thread_id, AiMessage.role == "user",
                                        AiMessage.created_at <= miss.created_at)
             .order_by(AiMessage.created_at.desc(), AiMessage.id.desc()).first())
        if q is None:
            continue
        key = knowledge.question_key(q.text)
        g = groups.setdefault(key, {"question": q.text[:300], "count": 0, "last_at": iso(miss.created_at),
                                    "thread_id": miss.thread_id, "reason": miss.outcome if miss.feedback != "down"
                                    else "disliked", "reply": miss.text[:300]})
        g["count"] += 1
    items = sorted(groups.values(), key=lambda g: (g["count"], g["last_at"] or ""), reverse=True)
    return {"status": True, "data": items[:50]}


def usage(db: Session, ws: Customer, agent_id: int, days: int = 30) -> dict:
    agent = _agent(db, ws, agent_id)
    since = (now() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    base = db.query(AiMessage).filter(AiMessage.agent_id == agent.id, AiMessage.created_at >= since)
    assistant = base.filter(AiMessage.role == "assistant")
    sums = base.with_entities(func.coalesce(func.sum(AiMessage.input_tokens), 0),
                              func.coalesce(func.sum(AiMessage.output_tokens), 0),
                              func.coalesce(func.sum(AiMessage.cached_tokens), 0),
                              func.coalesce(func.sum(AiMessage.cost), 0.0),
                              func.coalesce(func.sum(AiMessage.saved), 0.0)).one()
    outcomes = dict(assistant.with_entities(AiMessage.outcome, func.count(AiMessage.id))
                    .group_by(AiMessage.outcome).all())
    latency = assistant.filter(AiMessage.outcome.in_(("answered", "handover", "unknown"))) \
        .with_entities(func.avg(AiMessage.latency_ms)).scalar()
    fb = dict(assistant.filter(AiMessage.feedback.is_not(None)).with_entities(AiMessage.feedback,
                                                                             func.count(AiMessage.id))
              .group_by(AiMessage.feedback).all())
    cache_saved = float(db.query(func.coalesce(func.sum(AiAnswerCache.hits), 0))
                        .filter(AiAnswerCache.agent_id == agent.id).scalar() or 0)
    day = func.date(AiMessage.created_at)
    daily = {str(d): {"replies": r, "cost": float(c or 0), "handovers": h}
             for d, r, c, h in assistant.with_entities(day, func.count(AiMessage.id), func.sum(AiMessage.cost),
                                                       func.count(case((AiMessage.outcome == "handover", 1))))
             .group_by(day).all()}
    memory_cost = base.filter(AiMessage.role == "memory").with_entities(
        func.coalesce(func.sum(AiMessage.cost), 0.0)).scalar() or 0
    series = []
    for i in range(days):
        d = (since + timedelta(days=i)).date().isoformat()
        row = daily.get(d, {"replies": 0, "cost": 0.0, "handovers": 0})
        series.append({"date": d, **{k: (round(v, 5) if isinstance(v, float) else v) for k, v in row.items()}})
    channels = dict(db.query(AiThread.channel, func.count(func.distinct(AiThread.id)))
                    .join(AiMessage, AiMessage.thread_id == AiThread.id)
                    .filter(AiThread.agent_id == agent.id, AiMessage.created_at >= since)
                    .group_by(AiThread.channel).all())
    replies = sum(v for k, v in outcomes.items() if k != "failed")
    return {"status": True, "data": {
        "days": days, "replies": replies, "outcomes": {k or "none": v for k, v in outcomes.items()},
        "tokens": {"input": int(sums[0]), "output": int(sums[1]), "cached": int(sums[2])},
        "cost": round(float(sums[3]), 4), "saved": round(float(sums[4]), 4), "memory_cost": round(float(memory_cost), 4),
        "cache_hits": int(outcomes.get("cached", 0)), "cache_hits_total": int(cache_saved),
        "avg_latency_ms": int(latency) if latency else None, "feedback": {"up": fb.get("up", 0),
                                                                          "down": fb.get("down", 0)},
        "channels": channels, "daily": series, "month_cost": round(engine.month_cost(db, agent), 4),
        "budget": engine.limits(agent).monthly_budget,
    }}


# The inbox ----------------------------------------------------------------------------------------

def _conversation(db: Session, ws: Customer, conversation_id: int) -> WaConversation:
    conversation = db.query(WaConversation).filter(WaConversation.id == conversation_id,
                                                   WaConversation.customer_id == ws.id).first()
    if conversation is None:
        raise _not_found("Conversation")
    return conversation


def in_chat(db: Session, ws: Customer, conversation_id: int) -> dict:
    """Is the AI agent answering this WhatsApp chat? (the inbox banner)"""
    conversation = _conversation(db, ws, conversation_id)
    agent = engine.whatsapp_agent(db, ws.id)
    if agent is None:
        return {"status": True, "data": None}
    thread = db.query(AiThread).filter(AiThread.channel == "whatsapp",
                                       AiThread.conversation_id == conversation.id).first()
    reason = engine.paused_reason(db, agent, conversation, thread)
    db.commit()
    return {"status": True, "data": {"agent": {"id": agent.id, "name": agent.name}, "state": reason or "active",
                                     "thread_id": thread.id if thread else None,
                                     "handover_reason": thread.handover_reason if thread else None,
                                     "problem": engine.ready(db, agent)}}


def set_in_chat(db: Session, ws: Customer, conversation_id: int, active: bool) -> dict:
    conversation = _conversation(db, ws, conversation_id)
    agent = engine.whatsapp_agent(db, ws.id)
    if agent is None:
        raise HTTPException(status_code=422, detail="No AI agent answers on WhatsApp.")
    thread = engine.thread_for(db, agent, conversation)
    thread.status = "active" if active else "paused"
    if active:  # also overrides the pause after a team reply
        thread.handover_at, thread.resumed_at = None, now()
    from app.modules.customer.team.assign import event

    event(db, conversation, "ai", f"AI agent {'turned back on' if active else 'paused'} for this chat",
          actor_name(ws))
    db.commit()
    return {"status": True, "message": "AI agent is answering this chat again" if active
            else "AI agent paused for this chat", "data": None}

