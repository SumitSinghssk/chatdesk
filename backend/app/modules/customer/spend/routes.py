from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.modules.customer.account.models import Customer
from app.modules.customer.spend import service
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/spend", tags=["Customer WhatsApp spend"])


class SpendSchema(BaseModel):
    currency: str = Field("INR", min_length=3, max_length=3)
    rates: dict[str, float] = Field(default_factory=dict)
    monthly_budget: Optional[float] = Field(None, ge=0, le=100_000_000)


@router.get("")
def spend(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get(db, ws)


@router.put("", dependencies=[Depends(require_customer_csrf)])
def save(payload: SpendSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save(db, ws, payload)
