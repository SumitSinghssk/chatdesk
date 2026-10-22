from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.team.access import require_admin, require_workspace
from app.modules.customer.whatsapp import service
from app.modules.customer.whatsapp.schemas import ConnectionSchema, TestMessageSchema

router = APIRouter(prefix="/whatsapp", tags=["Customer WhatsApp"])
_csrf = Depends(require_customer_csrf)


@router.get("/overview")
def overview(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.overview(db, customer)


@router.get("/connection")
def get_connection(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_connection(db, customer)


@router.put("/connection", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def save_connection(payload: ConnectionSchema, customer: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.save_connection(db, customer, payload)


@router.post("/connection/refresh", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def refresh(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.refresh(db, customer)


@router.post("/connection/test-message", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def send_test(payload: TestMessageSchema, customer: Customer = Depends(require_admin),
              db: Session = Depends(get_db)):
    return service.send_test(db, customer, payload)


@router.delete("/connection", dependencies=[_csrf])
def disconnect(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.disconnect(db, customer)
