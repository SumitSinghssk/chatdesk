from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.customer.account.models import Customer
from app.modules.customer.analytics import service
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/analytics", tags=["Customer Analytics"])


@router.get("")
def report(start: date | None = None, end: date | None = None, days: int | None = Query(None, ge=1, le=366),
           ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.report(db, ws, start, end, days)
