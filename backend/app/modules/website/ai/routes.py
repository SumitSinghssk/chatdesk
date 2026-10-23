from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.ai_agent import engine, public
from app.modules.customer.ai_agent.routes import stream
from app.modules.customer.ai_agent.schemas import (
    ApiMessageSchema,
    PublicChatSchema,
    PublicFeedbackSchema,
    PublicLeadSchema,
)
from app.modules.customer.automation import engine as auto

router = APIRouter(prefix="/ai")


def _tz(db: Session, customer_id: int) -> str:
    owner = db.get(Customer, customer_id)
    return (auto.settings_of(owner).get("timezone") if owner else None) or "Asia/Kolkata"


@router.get("/{key}/config", dependencies=[Depends(RateLimit(120, 60))])
def config(key: str, host: str | None = Query(None, max_length=200), db: Session = Depends(get_db)):
    return public.config(db, key, host)


@router.get("/{key}/thread", dependencies=[Depends(RateLimit(60, 60))])
def thread(key: str, token: str = Query(..., max_length=64), host: str | None = Query(None, max_length=200),
           db: Session = Depends(get_db)):
    return public.history(db, key, token, host)


@router.post("/{key}/lead", dependencies=[Depends(RateLimit(10, 60))])
def lead(key: str, payload: PublicLeadSchema, db: Session = Depends(get_db)):
    return public.lead(db, key, payload)


@router.post("/{key}/chat", dependencies=[Depends(RateLimit(20, 60))])
def chat(key: str, payload: PublicChatSchema, db: Session = Depends(get_db)):
    agent, thread = public.start_chat(db, key, payload)
    first = {"token": thread.token}
    return stream(first, engine.chat_stream(agent.id, thread.id, payload.message, _tz(db, agent.customer_id)))


@router.post("/{key}/feedback", dependencies=[Depends(RateLimit(30, 60))])
def feedback(key: str, payload: PublicFeedbackSchema, db: Session = Depends(get_db)):
    return public.feedback(db, key, payload)


@router.post("/{key}/messages", dependencies=[Depends(RateLimit(60, 60))])
def api_message(key: str, payload: ApiMessageSchema, authorization: str | None = Header(None),
                db: Session = Depends(get_db)):
    agent = public._agent(db, key)
    return public.api_message(db, key, authorization, payload, _tz(db, agent.customer_id))
