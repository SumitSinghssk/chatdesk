from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.calls import service
from app.modules.customer.calls.schemas import ConnectionSchema, SettingsSchema, StartCallSchema
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/calls", tags=["Customer calls"])
_csrf = Depends(require_customer_csrf)


@router.get("")
def index(page: int | None = None, per_page: int | None = None, search: str | None = None,
          outcome: Literal["pending", "answered", "missed", "not_connected", "unknown"] | None = None,
          direction: Literal["inbound", "outbound"] | None = None,
          customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_calls(db, customer, page, per_page, search, outcome, direction)


@router.post("", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def start_call(payload: StartCallSchema, customer: Customer = Depends(require_workspace),
               db: Session = Depends(get_db)):
    return service.start_call(db, customer, payload)


@router.get("/settings")
def get_settings(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_settings(db, customer)


@router.put("/settings", dependencies=[_csrf])
def save_settings(payload: SettingsSchema, customer: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return service.save_settings(db, customer, payload)


@router.put("/settings/connection", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def save_connection(payload: ConnectionSchema, customer: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.save_connection(db, customer, payload)


@router.delete("/settings/connection", dependencies=[_csrf])
def disconnect(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.disconnect(db, customer)


@router.get("/{call_id}/recording")
def recording(call_id: int, download: bool = False, customer: Customer = Depends(require_workspace),
              db: Session = Depends(get_db)):
    return service.recording(db, customer, call_id, download)
