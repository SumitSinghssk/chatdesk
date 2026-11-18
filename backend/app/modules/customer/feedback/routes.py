from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.modules.customer.account.models import Customer
from app.modules.customer.feedback import service
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/feedback", tags=["Customer feedback"])


class FeedbackSettingsSchema(BaseModel):
    enabled: bool = False
    on_resolve: bool = True
    on_delivered: bool = True
    question: Optional[str] = Field(None, max_length=1000)
    thanks_text: Optional[str] = Field(None, max_length=1000)
    sorry_text: Optional[str] = Field(None, max_length=1000)
    review_url: Optional[str] = Field(None, max_length=500)
    gap_days: int = Field(7, ge=1, le=90)


@router.get("/settings")
def get_settings(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_settings(db, ws)


@router.put("/settings", dependencies=[Depends(require_customer_csrf)])
def save_settings(payload: FeedbackSettingsSchema, ws: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return service.save_settings(db, ws, payload)
