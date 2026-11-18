from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.team.access import require_admin, require_workspace
from app.modules.customer.wa_calls import service

router = APIRouter(prefix="/wa-calls", tags=["Customer WhatsApp calls"])
_csrf = Depends(require_customer_csrf)


class SdpSchema(BaseModel):
    sdp: str = Field(..., min_length=10, max_length=20_000)


class SettingsSchema(BaseModel):
    enabled: bool = False
    followup_on: bool = True
    followup_text: Optional[str] = Field(None, max_length=1000)
    permission_text: Optional[str] = Field(None, max_length=1024)


def _conversation(db: Session, ws: Customer, conversation_id: int):
    from app.modules.customer.inbox.service import _conversation as visible

    return visible(db, ws, conversation_id)  # the person may see this chat


@router.get("/settings")
def get_settings(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_settings(db, ws)


@router.put("/settings", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def save_settings(payload: SettingsSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save_settings(db, ws, payload)


@router.get("/ringing")
def ringing(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.ringing(db, ws)


@router.get("/{call_id}")
def get_call(call_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_call(db, ws, call_id)


@router.post("/{call_id}/claim", dependencies=[_csrf])
def claim(call_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.claim(db, ws, call_id)


@router.post("/{call_id}/answer", dependencies=[_csrf])
def answer(call_id: int, payload: SdpSchema, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.answer(db, ws, call_id, payload.sdp)


@router.post("/{call_id}/decline", dependencies=[_csrf])
def decline(call_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.decline(db, ws, call_id)


@router.post("/{call_id}/hangup", dependencies=[_csrf])
def hangup(call_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.hangup(db, ws, call_id)


@router.get("/conversations/{conversation_id}/permission")
def permission(conversation_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return {"status": True, "data": service.permission_state(db, ws, _conversation(db, ws, conversation_id))}


@router.post("/conversations/{conversation_id}/permission", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def request_permission(conversation_id: int, ws: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    data = service.request_permission(db, ws, _conversation(db, ws, conversation_id))
    return {"status": True, "message": "Permission request sent", "data": data}


@router.post("/conversations/{conversation_id}/call", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def start(conversation_id: int, payload: SdpSchema, ws: Customer = Depends(require_workspace),
          db: Session = Depends(get_db)):
    return service.start(db, ws, _conversation(db, ws, conversation_id), payload.sdp)
