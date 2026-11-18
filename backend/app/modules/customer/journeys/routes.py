from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.modules.customer.account.models import Customer
from app.modules.customer.journeys import service
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/journeys", tags=["Customer journeys"])


class JourneySchema(BaseModel):
    enabled: bool = False
    template_id: Optional[int] = None
    delay_days: int = Field(3, ge=0, le=365)
    send_hour: int = Field(10, ge=0, le=23)


@router.get("")
def journeys(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_journeys(db, ws)


@router.put("/{kind}", dependencies=[Depends(require_customer_csrf)])
def save(kind: str, payload: JourneySchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save_journey(db, ws, kind, payload)
