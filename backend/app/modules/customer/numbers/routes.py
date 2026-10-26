from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.numbers import service
from app.modules.customer.numbers.schemas import DeleteNumberSchema, NumberSchema
from app.modules.customer.team.access import require_admin, require_workspace

router = APIRouter(prefix="/numbers", tags=["Customer Numbers"])
_csrf = Depends(require_customer_csrf)


@router.get("")
def list_numbers(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_numbers(db, ws)


@router.post("/{number_id}/switch", dependencies=[_csrf])
def switch(number_id: int, response: Response, ws: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.switch(db, ws, number_id, response)


@router.post("", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def create(payload: NumberSchema, response: Response, ws: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.create(db, ws, payload, response)


@router.put("/{number_id}", dependencies=[_csrf])
def rename(number_id: int, payload: NumberSchema, ws: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.rename(db, ws, number_id, payload)


@router.post("/{number_id}/delete", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def delete(number_id: int, payload: DeleteNumberSchema, ws: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.delete(db, ws, number_id, payload)
