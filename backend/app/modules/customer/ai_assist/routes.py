from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.ai_assist import service
from app.modules.customer.ai_assist.schemas import AssistSchema, AssistSettingsSchema
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/ai-assist", tags=["Customer AI assist"])
_csrf = Depends(require_customer_csrf)


@router.get("/settings")
def get_settings(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_settings(db, customer)


@router.put("/settings", dependencies=[_csrf])
def save_settings(payload: AssistSettingsSchema, customer: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return service.save_settings(db, customer, payload)


@router.get("/status")
def status(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.status(db, customer)


@router.post("/conversations/{conversation_id}/{action}", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def assist(conversation_id: int, action: Literal["suggest", "summarize", "translate", "rewrite"],
           payload: AssistSchema, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.assist(db, customer, conversation_id, action, payload)
