import json

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.ai_agent import engine, service
from app.modules.customer.ai_agent.schemas import (
    AgentSchema,
    ChannelsSchema,
    ConnectionSchema,
    CreateSchema,
    FaqSchema,
    FeedbackSchema,
    SourceUpdateSchema,
    TestSchema,
    TextSourceSchema,
    UrlSourceSchema,
)
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/ai-agent", tags=["Customer AI agent"])
_csrf = Depends(require_customer_csrf)


def sse(first: dict | None, events):
    """Server-sent events: `event: delta|done|error` with a JSON body."""
    if first is not None:
        yield f"event: thread\ndata: {json.dumps(first)}\n\n"
    for kind, data in events:
        body = {"text": data} if kind == "delta" else data
        yield f"event: {kind}\ndata: {json.dumps(body, default=str)}\n\n"


def stream(first: dict | None, events) -> StreamingResponse:
    return StreamingResponse(sse(first, events), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


# Providers and keys ---------------------------------------------------------------------------

@router.get("/providers")
def providers(ws: Customer = Depends(require_admin)):
    return service.provider_list()


@router.get("/connections")
def connections(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_connections(db, ws)


@router.post("/connections", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def add_connection(payload: ConnectionSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save_connection(db, ws, payload)


@router.put("/connections/{connection_id}", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def edit_connection(connection_id: int, payload: ConnectionSchema, ws: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.save_connection(db, ws, payload, connection_id)


@router.post("/connections/{connection_id}/check", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def check_connection(connection_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.check_connection(db, ws, connection_id)


@router.delete("/connections/{connection_id}", dependencies=[_csrf])
def delete_connection(connection_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_connection(db, ws, connection_id)


# Agents ---------------------------------------------------------------------------------------

@router.get("/agents")
def agents(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_agents(db, ws)


@router.post("/agents", dependencies=[_csrf])
def create(payload: CreateSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_agent(db, ws, payload)


@router.get("/agents/{agent_id}")
def get_agent(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_agent(db, ws, agent_id)


@router.put("/agents/{agent_id}", dependencies=[_csrf])
def update(agent_id: int, payload: AgentSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.update_agent(db, ws, agent_id, payload)


@router.put("/agents/{agent_id}/channels", dependencies=[_csrf])
def channels(agent_id: int, payload: ChannelsSchema, ws: Customer = Depends(require_admin),
             db: Session = Depends(get_db)):
    return service.update_channels(db, ws, agent_id, payload)


@router.post("/agents/{agent_id}/secret", dependencies=[_csrf])
def secret(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.new_secret(db, ws, agent_id)


@router.post("/agents/{agent_id}/public-key", dependencies=[_csrf])
def public_key(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.new_public_key(db, ws, agent_id)


@router.post("/agents/{agent_id}/duplicate", dependencies=[_csrf])
def duplicate(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.duplicate_agent(db, ws, agent_id)


@router.delete("/agents/{agent_id}", dependencies=[_csrf])
def delete(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_agent(db, ws, agent_id)


# Knowledge --------------------------------------------------------------------------------------

@router.get("/agents/{agent_id}/sources")
def sources(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_sources(db, ws, agent_id)


@router.post("/agents/{agent_id}/sources/file", dependencies=[_csrf, Depends(RateLimit(60, 60))])
def add_file(agent_id: int, file: UploadFile = File(...), ws: Customer = Depends(require_admin),
             db: Session = Depends(get_db)):
    return service.add_file(db, ws, agent_id, file)


@router.post("/agents/{agent_id}/sources/text", dependencies=[_csrf])
def add_text(agent_id: int, payload: TextSourceSchema, ws: Customer = Depends(require_admin),
             db: Session = Depends(get_db)):
    return service.add_text(db, ws, agent_id, payload)


@router.post("/agents/{agent_id}/sources/faq", dependencies=[_csrf])
def add_faq(agent_id: int, payload: FaqSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.add_faq(db, ws, agent_id, payload)


@router.post("/agents/{agent_id}/sources/url", dependencies=[_csrf, Depends(RateLimit(20, 60))])
def add_url(agent_id: int, payload: UrlSourceSchema, ws: Customer = Depends(require_admin),
            db: Session = Depends(get_db)):
    return service.add_url(db, ws, agent_id, payload)


@router.get("/agents/{agent_id}/sources/{source_id}")
def get_source(agent_id: int, source_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_source(db, ws, agent_id, source_id)


@router.get("/agents/{agent_id}/sources/{source_id}/file")
def source_file(agent_id: int, source_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.source_file(db, ws, agent_id, source_id)


@router.post("/agents/{agent_id}/sources/{source_id}/refresh", dependencies=[_csrf])
def refresh(agent_id: int, source_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.refresh_source(db, ws, agent_id, source_id)


@router.put("/agents/{agent_id}/sources/{source_id}", dependencies=[_csrf])
def update_source(agent_id: int, source_id: int, payload: SourceUpdateSchema, ws: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return service.update_source(db, ws, agent_id, source_id, payload)


@router.delete("/agents/{agent_id}/sources/{source_id}", dependencies=[_csrf])
def delete_source(agent_id: int, source_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_source(db, ws, agent_id, source_id)


@router.post("/agents/{agent_id}/train", dependencies=[_csrf])
def train(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.train(db, ws, agent_id)


@router.get("/agents/{agent_id}/search")
def search(agent_id: int, q: str = Query("", max_length=500), ws: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.search_preview(db, ws, agent_id, q)


# Test chat, conversations, usage ------------------------------------------------------------------

@router.post("/agents/{agent_id}/test", dependencies=[_csrf, Depends(RateLimit(40, 60))])
def test(agent_id: int, payload: TestSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    agent, thread = service.test_thread(db, ws, agent_id, payload.thread_id)
    if (thread.visitor or {}).get("format") != payload.channel:
        thread.visitor = {**(thread.visitor or {}), "format": payload.channel}
        db.commit()
    return stream({"id": thread.id}, engine.chat_stream(agent.id, thread.id, payload.message, service._tz(ws)))


@router.get("/agents/{agent_id}/threads")
def threads(agent_id: int, channel: str | None = Query(None, pattern="^(whatsapp|web|api|test)$"),
            status: str | None = Query(None, pattern="^(active|handover|paused)$"), page: int = Query(1, ge=1),
            ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_threads(db, ws, agent_id, channel, status, page)


@router.get("/agents/{agent_id}/threads/{thread_id}")
def thread(agent_id: int, thread_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_thread(db, ws, agent_id, thread_id)


@router.post("/agents/{agent_id}/messages/{message_id}/feedback", dependencies=[_csrf])
def feedback(agent_id: int, message_id: int, payload: FeedbackSchema, ws: Customer = Depends(require_admin),
             db: Session = Depends(get_db)):
    return service.feedback(db, ws, agent_id, message_id, payload.value)


@router.get("/agents/{agent_id}/usage")
def usage(agent_id: int, days: int = Query(30, ge=1, le=90), ws: Customer = Depends(require_admin),
          db: Session = Depends(get_db)):
    return service.usage(db, ws, agent_id, days)


@router.get("/agents/{agent_id}/unanswered")
def unanswered(agent_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.unanswered(db, ws, agent_id)


# The inbox ---------------------------------------------------------------------------------------

@router.get("/chat/{conversation_id}")
def in_chat(conversation_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.in_chat(db, ws, conversation_id)


@router.post("/chat/{conversation_id}/pause", dependencies=[_csrf])
def pause(conversation_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.set_in_chat(db, ws, conversation_id, False)


@router.post("/chat/{conversation_id}/resume", dependencies=[_csrf])
def resume(conversation_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.set_in_chat(db, ws, conversation_id, True)
