from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.chatbots import service
from app.modules.customer.chatbots.schemas import (
    ChatbotSchema,
    CreateSchema,
    ImportSchema,
    SaveGraphSchema,
    SimulateSchema,
    StartInChatSchema,
)
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/chatbots", tags=["Customer Chatbots"])
_csrf = Depends(require_customer_csrf)


@router.get("")
def bots(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_bots(db, ws)


@router.post("", dependencies=[_csrf])
def create(payload: CreateSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create(db, ws, payload)


@router.get("/starters")
def starters(ws: Customer = Depends(require_admin)):
    return service.starters()


@router.post("/import", dependencies=[_csrf])
def import_bot(payload: ImportSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.import_bot(db, ws, payload)


# For the inbox: any member can start / stop a chatbot in a chat they can see
@router.get("/live")
def live(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.live_choices(db, ws)


@router.post("/{bot_id}/start", dependencies=[_csrf])
def start_in_chat(bot_id: int, payload: StartInChatSchema, ws: Customer = Depends(require_workspace),
                  db: Session = Depends(get_db)):
    return service.start_in_chat(db, ws, bot_id, payload.conversation_id)


@router.post("/stop", dependencies=[_csrf])
def stop_in_chat(conversation_id: int = Body(..., embed=True), ws: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return service.stop_in_chat(db, ws, conversation_id)


@router.get("/{bot_id}")
def get(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_bot(db, ws, bot_id)


@router.put("/{bot_id}", dependencies=[_csrf])
def update(bot_id: int, payload: ChatbotSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.update(db, ws, bot_id, payload)


@router.put("/{bot_id}/graph", dependencies=[_csrf])
def save_graph(bot_id: int, payload: SaveGraphSchema, ws: Customer = Depends(require_admin),
               db: Session = Depends(get_db)):
    return service.save_graph(db, ws, bot_id, payload.graph)


@router.post("/{bot_id}/publish", dependencies=[_csrf])
def publish(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.publish(db, ws, bot_id)


@router.post("/{bot_id}/discard", dependencies=[_csrf])
def discard(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.discard(db, ws, bot_id)


@router.put("/{bot_id}/active", dependencies=[_csrf])
def set_active(bot_id: int, active: bool = Body(..., embed=True), ws: Customer = Depends(require_admin),
               db: Session = Depends(get_db)):
    return service.set_active(db, ws, bot_id, active)


@router.post("/{bot_id}/duplicate", dependencies=[_csrf])
def duplicate(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.duplicate(db, ws, bot_id)


@router.get("/{bot_id}/export")
def export(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.export(db, ws, bot_id)


@router.delete("/{bot_id}", dependencies=[_csrf])
def delete(bot_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete(db, ws, bot_id)


@router.get("/{bot_id}/report")
def report(bot_id: int, days: int = Query(30, ge=1, le=365), ws: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.report(db, ws, bot_id, days)


@router.post("/{bot_id}/simulate", dependencies=[Depends(RateLimit(240, 60)), _csrf])
def simulate(bot_id: int, payload: SimulateSchema, ws: Customer = Depends(require_admin),
             db: Session = Depends(get_db)):
    return service.simulate(db, ws, bot_id, payload)
